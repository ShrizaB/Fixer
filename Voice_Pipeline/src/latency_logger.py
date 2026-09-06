"""
Timestamp logging for the voice pipeline. Every important event gets a
monotonic timestamp so we can compute:
  - STT latency (user stops speaking -> transcript ready)
  - Time-to-first-audio-byte (Rime request sent -> first byte received)
  - Playback start latency
  - Interrupt latency (barge-in detected -> audio actually stopped)

This is the raw material Person 3 needs for RIME_EVIDENCE.md and the
judge debug panel, so keep it simple, append-only, and easy to parse.
"""

import time
import json
import os

LOG_PATH = os.path.join("logs", "voice_pipeline_events.jsonl")


def log_event(event: str, **fields) -> float:
    """
    Log an event with a monotonic timestamp. Returns the timestamp so
    callers can compute deltas inline if needed.
    """
    os.makedirs("logs", exist_ok=True)
    ts = time.monotonic()
    record = {"ts": ts, "wall_time": time.time(), "event": event, **fields}
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(record) + "\n")
    print(f"[latency] {event} @ {ts:.4f} {fields if fields else ''}")
    return ts
