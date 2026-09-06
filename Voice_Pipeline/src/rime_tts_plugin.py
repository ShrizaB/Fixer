"""
Rime TTS wrapper for LiveKit Agents.

IMPORTANT: Check first whether LiveKit's plugin registry / Rime's own docs
already ship an official `livekit-plugins-rime` package (the problem
statement references an "official Rime integration"). If it exists, use
it instead of this file -- it will be more robust (proper streaming,
correct chunking, maintained alongside LiveKit's SDK changes).

This file is a fallback: a minimal custom TTS class that satisfies
LiveKit Agents' TTS interface by calling Rime's HTTP API directly and
streaming the response back in chunks. Use this only if no official
plugin is available in time.

You WILL need to adjust:
  - the exact Rime endpoint URL (check current docs)
  - the exact audio format Rime returns vs. what LiveKit expects
    (LiveKit typically wants raw PCM frames at a known sample rate;
    if Rime returns WAV/MP3 you may need a decode step, e.g. via
    `soundfile` or `pydub`, before wrapping frames)
"""

import aiohttp
from livekit.agents import tts
from src.config import config
from src.latency_logger import log_event

RIME_TTS_URL = "https://users.rime.ai/v1/rime-tts"

# Confirm against Rime's docs: sample rate of the audio format you request.
# This MUST match what you tell LiveKit's AudioFrame to expect, or you'll
# get garbled/no audio.
SAMPLE_RATE = 22050
NUM_CHANNELS = 1


class RimeTTS(tts.TTS):
    def __init__(self):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
        )

    def synthesize(self, text: str) -> "RimeTTSStream":
        return RimeTTSStream(text)


class RimeTTSStream(tts.ChunkedStream):
    def __init__(self, text: str):
        super().__init__()
        self._text = text

    async def _run(self):
        headers = {
            "Authorization": f"Bearer {config.RIME_API_KEY}",
            "Accept": "audio/wav",
            "Content-Type": "application/json",
        }
        payload = {
            "speaker": config.RIME_SPEAKER,
            "text": self._text,
            "modelId": config.RIME_MODEL_ID,
            "lang": config.RIME_LANGUAGE,
        }

        log_event("rime_request_sent", text_len=len(self._text))

        async with aiohttp.ClientSession() as session:
            async with session.post(RIME_TTS_URL, headers=headers, json=payload) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    log_event("rime_request_failed", status=resp.status, body=body[:200])
                    raise RuntimeError(f"Rime TTS failed: {resp.status} {body[:200]}")

                first_chunk = True
                async for chunk in resp.content.iter_chunked(4096):
                    if first_chunk:
                        log_event("rime_first_audio_byte")
                        first_chunk = False
                    # NOTE: if Rime returns a WAV container (not raw PCM),
                    # you need to strip the WAV header on the first chunk
                    # and/or decode before pushing frames. Verify this by
                    # inspecting output from rime_tts_test.py first.
                    self._event_ch.send_nowait(
                        tts.SynthesizedAudio(
                            text=self._text,
                            data=chunk,
                        )
                    )
        log_event("rime_synthesis_complete")
