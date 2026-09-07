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
        self.ws = await session.ws_connect("ws://localhost:8787")
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
# ELEVENLABS TTS
# ============================================================

import os
try:
    from livekit.plugins import elevenlabs
    USE_ELEVENLABS = True
except ImportError:
    USE_ELEVENLABS = False

def build_tts():
    """Build the ElevenLabs TTS engine."""
    if USE_ELEVENLABS:
        log_event("using_elevenlabs_tts")
        return elevenlabs.TTS(
            api_key=os.environ.get("ELEVENLABS_API_KEY")
        )
    else:
        log_event("using_fallback_tts")
        # Return a fallback or raise error
        raise RuntimeError("livekit-plugins-elevenlabs is not installed.")


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
        # -------------------------

        vad=silero.VAD.load(),

        # -------------------------
        # Speech-to-Text
        # -------------------------

        stt=deepgram.STT(
            api_key=config.DEEPGRAM_API_KEY,
        ),

        # -------------------------
        # Text-to-Speech
        # ElevenLabs is the primary voice.
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

    @session.on("user_state_changed")
    def on_user_state_changed(event):
        """
        Tracks user speech-state transitions.

        Useful for identifying when the user begins speaking
        during an active Rime response.
        """

        log_event(
            "user_state_changed",
            old_state=str(event.old_state),
            new_state=str(event.new_state),
        )
        if "SPEAKING" in str(event.new_state):
            asyncio.create_task(fixer_client.send_interrupt())

    # ------------------------------------------------------------
    # AGENT SPEECH STATE
    # ------------------------------------------------------------

    @session.on("agent_state_changed")
    def on_agent_state_changed(event):
        """
        Tracks agent state transitions.

        These timestamps can later be used for latency analysis.
        """

        log_event(
            "agent_state_changed",
            old_state=str(event.old_state),
            new_state=str(event.new_state),
        )

    # ------------------------------------------------------------
    # OVERLAPPING SPEECH
    # ------------------------------------------------------------

    @session.on("overlapping_speech")
    def on_overlapping_speech(event):
        """
        Fired when user speech overlaps with agent speech.

        This is one of our strongest signals for the barge-in
        acceptance test.
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

