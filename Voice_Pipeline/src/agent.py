"""
Main LiveKit Agent entrypoint.

Person 1 — Voice Pipeline & Rime Integration

Pipeline:
    Mic -> Silero VAD -> Deepgram STT -> Agent -> Rime TTS -> Speaker

Voice engineering focus:
    - Rime TTS integration
    - VAD-based barge-in / interruption
    - User and agent speech-state logging
    - Overlapping speech detection
    - False-interruption detection
    - Latency instrumentation

Run:
    python src/agent.py dev
"""

from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
)

from livekit.plugins import deepgram, silero

from config import config
from latency_logger import log_event

import aiohttp
import asyncio
import json
import time

class FixerClient:
    def __init__(self):
        self.ws = None
        self.turn_counter = 0

    def next_turn_id(self):
        self.turn_counter += 1
        return f"t{self.turn_counter}-{int(time.time() * 1000)}"

    async def connect(self, session, agent_session):
        # Timeout for each connection attempt: 100000 ms (100 s), up from the
        # previous default of a few seconds. This alone doesn't help if the
        # backend is briefly unavailable, so it's paired with the retry loop
        # below: as long as the mic/agent session is on, we keep trying to
        # reach the AI backend instead of crashing the whole pipeline after
        # a single failed attempt.
        timeout = aiohttp.ClientTimeout(total=100000 / 1000)  # 100000ms -> 100s

        while True:
            try:
                self.ws = await session.ws_connect("ws://localhost:8787", timeout=timeout)
                print("Connected to AI backend.")
                break
            except Exception as e:
                print(f"Could not connect to AI backend, retrying in 1s: {e}")
                await asyncio.sleep(1)

        asyncio.create_task(self.listen(agent_session))

    async def listen(self, agent_session):
        print("Listening for messages from backend...")
        try:
            async for msg in self.ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    print(f"Backend message received: {msg.data}")
                    data = json.loads(msg.data)
                    if data.get("type") == "response" and data.get("final"):
                        text = data.get("text")
                        if text:
                            try:
                                print(f"Calling agent_session.say() with text: {text}")
                                # Use agent_session.say() to trigger TTS playback
                                agent_session.say(text)
                                print("Successfully called agent_session.say()")
                            except Exception as e:
                                print(f"Error speaking text: {e}")
        except Exception as e:
            print(f"WebSocket listener crashed: {e}")

    async def send_utterance(self, text):
        turn_id = self.next_turn_id()
        if self.ws:
            await self.ws.send_json({"type": "user_utterance", "turnId": turn_id, "text": text})
        return turn_id

    async def send_interrupt(self):
        turn_id = self.next_turn_id()
        if self.ws:
            await self.ws.send_json({"type": "interrupt", "turnId": turn_id})
        return turn_id

fixer_client = FixerClient()


# ============================================================
# RIME TTS
# ============================================================
#
# Rime is the primary, required spoken-output provider for this challenge
# (see README.md / RIME_EVIDENCE.md). Model/speaker/language must match
# RIME_MODEL_ID / RIME_SPEAKER / RIME_LANGUAGE in .env, which are the same
# values scripts/preflight_check.js validates against Rime's live catalog
# before every demo -- if you change one, change it in both places.
#
# use_websocket=False (the default) uses Rime's HTTP chunked-synthesis
# endpoint, which is simpler and enough for the solo-demoable deliverable.
# Set use_websocket=True later if you need lower time-to-first-audio-byte
# for the latency-instrumentation deliverable -- that path streams token
# by token over a websocket instead of waiting for the full utterance.

from livekit.plugins import rime as rime_plugin


def build_tts():
    """Build the Rime TTS engine using this project's agreed configuration."""
    log_event(
        "using_rime_tts",
        model=config.RIME_MODEL_ID,
        speaker=config.RIME_SPEAKER,
        lang=config.RIME_LANGUAGE,
    )
    return rime_plugin.TTS(
        model=config.RIME_MODEL_ID,
        speaker=config.RIME_SPEAKER,
        lang=config.RIME_LANGUAGE,
        api_key=config.RIME_API_KEY,
    )


# ============================================================
# AGENT
# ============================================================

class IncidentVoiceAgent(Agent):

    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are a calm, concise on-call incident assistant. "
                "Keep spoken responses short -- one or two sentences. "
                "When reading service names, error codes, or numbers, "
                "speak them clearly and slowly. "
                "If you are not sure, say so plainly instead of guessing."
            ),
        )

    async def on_enter(self):
        log_event("agent_entered_session")


# ============================================================
# LIVEKIT ENTRYPOINT
# ============================================================

async def entrypoint(ctx: JobContext):

    # --------------------------------------------------------
    # Connect to LiveKit room
    # --------------------------------------------------------

    await ctx.connect()

    log_event(
        "room_connected",
        room=ctx.room.name,
    )

    # --------------------------------------------------------
    # Create voice session
    # --------------------------------------------------------

    session = AgentSession(

        # -------------------------
        # Voice Activity Detection
        #
        # min_silence_duration is raised from Silero's default (0.55s) to
        # give the user more room to pause naturally mid-phrase (e.g.
        # "checkout... api") without the turn being cut off and sent as
        # multiple separate, fragmented utterances. If this feels too
        # slow to respond, lower it back down, but re-test with real
        # multi-word service names before doing so, per the "pronunciation
        # and controlled delivery" testing guidance.
        # -------------------------

        vad=silero.VAD.load(min_silence_duration=1.0),

        # -------------------------
        # Speech-to-Text
        #
        # keyterm: biases Deepgram's Nova-3 model toward this project's
        # known domain vocabulary (service names, plus the intents from
        # tools.js), which are compound/hyphenated terms a general model
        # is prone to mishear (e.g. "checkout-api" -> "check out the api").
        # Per the "pronunciation and controlled delivery" testing guidance,
        # keep this list in sync with backend/mockData.js service names.
        #
        # endpointing_ms is raised from Deepgram's default (25ms, very
        # aggressive) to reduce Deepgram's OWN end-of-speech cutoff firing
        # mid-phrase, independent of the Silero VAD silence duration set
        # above -- both can fragment an utterance, so both need tuning.
        # -------------------------

        stt=deepgram.STT(
            api_key=config.DEEPGRAM_API_KEY,
            keyterm=[
                "checkout-api",
                "payments-worker",
                "auth-gateway",
                "runbook",
                "deploy history",
            ],
            endpointing_ms=300,
        ),

        # -------------------------
        # Text-to-Speech
        # Rime is the required primary speech provider for this challenge.
        # -------------------------

        tts=build_tts(),

        # ====================================================
        # PERSON 1 — BARGE-IN / INTERRUPTION CONFIGURATION
        # ====================================================

        turn_handling={
            "interruption": {

                # Enable user interruption while agent speaks.
                "enabled": True,

                # Use VAD-based interruption detection.
                "mode": "vad",

                # Drop queued audio when interruption occurs.
                "discard_audio_if_uninterruptible": True,

                # Minimum speech duration required for interruption.
                "min_duration": 0.5,

                # No minimum word requirement.
                "min_words": 0,

                # Resume if interruption was a false interruption.
                "resume_false_interruption": True,

                # Time before an interruption is classified as false.
                "false_interruption_timeout": 2.0,

                # Avoid treating short backchannels as interruptions
                # around the beginning/end of agent speech.
                "backchannel_boundary": (1.0, 1.0),
            }
        },
    )

    # ============================================================
    # EVENT LOGGING
    # ============================================================
    
    aio_session = aiohttp.ClientSession()
    await fixer_client.connect(aio_session, session)

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event):
        """
        Logs final Deepgram transcription results.

        Intermediate STT results are ignored.
        """

        if event.is_final:

            log_event(
                "user_transcript_final",
                transcript=event.transcript,
                item_id=event.item_id,
                language=(
                    str(event.language)
                    if event.language
                    else None
                ),
            )
            asyncio.create_task(fixer_client.send_utterance(event.transcript))

    # ------------------------------------------------------------
    # USER SPEECH STATE
    # ------------------------------------------------------------

    # Tracks whether the agent is CURRENTLY speaking, so we can tell the
    # difference between:
    #   (a) normal turn-taking -- user starts speaking while agent is idle
    #       or listening -- NOT an interrupt, must not supersede anything.
    #   (b) a real barge-in -- user starts speaking WHILE Rime audio is
    #       still playing -- this IS an interrupt and should supersede
    #       the in-flight turn.
    # Without this guard, every utterance sent an interrupt for itself
    # (since "user starts speaking" fires on every turn, not just
    # barge-ins), which is why every turn showed up as "superseded" even
    # with no real interruption happening.
    agent_is_speaking = {"value": False}

    @session.on("user_state_changed")
    def on_user_state_changed(event):
        """
        Tracks user speech-state transitions.

        Only sends an interrupt to the backend if the user starts
        speaking WHILE the agent is actively speaking (real barge-in).
        Normal turn-taking (user speaks while agent is idle/listening)
        must NOT be treated as an interrupt.
        """

        log_event(
            "user_state_changed",
            old_state=str(event.old_state),
            new_state=str(event.new_state),
        )
        if event.new_state == "speaking" and agent_is_speaking["value"]:
            log_event("barge_in_interrupt_sent")
            asyncio.create_task(fixer_client.send_interrupt())

    # ------------------------------------------------------------
    # AGENT SPEECH STATE
    # ------------------------------------------------------------

    @session.on("agent_state_changed")
    def on_agent_state_changed(event):
        """
        Tracks agent state transitions.

        Also updates agent_is_speaking, which on_user_state_changed above
        uses to distinguish real barge-in from normal turn-taking.
        """

        log_event(
            "agent_state_changed",
            old_state=str(event.old_state),
            new_state=str(event.new_state),
        )
        agent_is_speaking["value"] = (event.new_state == "speaking")

    # ------------------------------------------------------------
    # OVERLAPPING SPEECH
    # ------------------------------------------------------------

    @session.on("overlapping_speech")
    def on_overlapping_speech(event):
        """
        Fired when user speech overlaps with agent speech.

        This is LiveKit's own, more precise overlap signal -- it only
        fires during genuine overlap, so it does not need the
        agent_is_speaking guard used above. This is one of our strongest
        signals for the barge-in acceptance test.

        NOTE: this can fire close together with on_user_state_changed's
        interrupt above for the same real barge-in. fixer_client assigns
        a fresh turnId to every interrupt sent, and the backend's
        SessionManager treats the LATEST turnId as current -- so a
        duplicate interrupt for the same barge-in is harmless (it just
        supersedes-and-replaces itself), not a correctness bug. If the
        duplicate log noise becomes annoying during evidence collection,
        consider removing the interrupt call from on_user_state_changed
        and relying on this event alone, since it's the more precise signal.
        """

        log_event(
            "overlapping_speech_detected",
        )
        asyncio.create_task(fixer_client.send_interrupt())

    # ------------------------------------------------------------
    # FALSE INTERRUPTION
    # ------------------------------------------------------------

    @session.on("agent_false_interruption")
    def on_false_interruption(event):
        """
        Fired when LiveKit determines that an apparent
        interruption was actually a false interruption.
        """

        log_event(
            "false_interruption_detected",
        )

    # ============================================================
    # START SESSION
    # ============================================================

    await session.start(
        agent=IncidentVoiceAgent(),
        room=ctx.room,
    )

    log_event("session_started")


# ============================================================
# APPLICATION ENTRYPOINT
# ============================================================

if __name__ == "__main__":

    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )