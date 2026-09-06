# Voice Pipeline & Rime Integration

Owns everything between raw audio and text, and text and audio: LiveKit
Agents setup, STT (Deepgram), Rime TTS integration, barge-in/interrupt
handling, latency instrumentation, and fallback behavior.

## Solo-demoable deliverable

Mic in -> transcript -> Rime speaks response -> barge-in cuts off playback
instantly.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Fill in .env with real keys -- never commit this file
```

## Run order (do not skip steps)

1. `python src/rime_tts_test.py "your test sentence"` -- confirms Rime API
   key, model/speaker/language combo, and lets you hear real output before
   any LiveKit complexity is involved.
2. `python src/agent.py dev` -- starts the full agent (STT + VAD + Rime TTS)
   connected to your LiveKit project. Join the room via LiveKit Cloud's
   hosted test frontend.
3. Run the manual barge-in test in `tests/test_barge_in_manual.md` and
   record results.

## Architecture

```
Mic audio -> LiveKit room -> Silero VAD (speech detection, barge-in trigger)
                           -> Deepgram STT (transcript)
                           -> [handoff to Person 2's backend/LLM]
                           -> Rime TTS (spoken response, streamed)
                           -> LiveKit playback -> speaker
```

Barge-in path: Silero VAD detects user speech while Rime audio is playing
-> LiveKit AgentSession interrupts current turn -> queued/playing audio is
cleared -> event logged with timestamp for latency measurement.

## Third-party services

- **LiveKit Cloud** -- realtime transport, VAD, turn/interrupt handling
- **Deepgram** -- speech-to-text
- **Rime** -- text-to-speech (model/speaker/language configured via `.env`,
  see `RIME_MODEL_ID`, `RIME_SPEAKER`, `RIME_LANGUAGE`)

## Exact Rime configuration used

- Model ID: *(fill in from your `.env` once finalized)*
- Speaker: *(fill in)*
- Language: *(fill in)*
- Endpoint: *(fill in exact URL used)*
- Audio format: *(fill in -- confirm from `rime_tts_test.py` output headers)*
- Transport: LiveKit Cloud (WebRTC)

## Known limitations

- *(fill in after testing -- e.g. behavior on very short interruptions,
  background noise sensitivity, non-English pronunciation edge cases)*

## Fallback behavior

If Rime is unreachable, `ENABLE_FALLBACK_TTS=true` in `.env` triggers
*(describe your actual fallback here once implemented -- e.g. a cached
default TTS voice, or a visible text-only degraded mode)*. The active
speech provider is logged via `latency_logger` and should be surfaced in
Person 3's UI indicator.
