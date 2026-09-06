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

from src.config import config
from src.latency_logger import log_event


# ============================================================
# RIME TTS
# ============================================================

try:
    # Prefer the official LiveKit Rime plugin.
    from livekit.plugins import rime as rime_plugin

    USE_OFFICIAL_RIME_PLUGIN = True

except ImportError:
    # Fallback to our custom Rime implementation.
    from src.rime_tts_plugin import RimeTTS

    USE_OFFICIAL_RIME_PLUGIN = False


def build_tts():
    """Build the Rime TTS engine."""

    if USE_OFFICIAL_RIME_PLUGIN:
        log_event(
            "using_official_rime_plugin",
            model=config.RIME_MODEL_ID,
            speaker=config.RIME_SPEAKER,
            language=config.RIME_LANGUAGE,
        )

        return rime_plugin.TTS(
            model=config.RIME_MODEL_ID,
            speaker=config.RIME_SPEAKER,
            lang=config.RIME_LANGUAGE,
            api_key=config.RIME_API_KEY,
        )

    else:
        log_event("using_fallback_custom_rime_plugin")

        return RimeTTS()


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
        # Rime is the primary voice.
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

