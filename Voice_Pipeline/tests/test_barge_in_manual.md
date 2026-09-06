# Manual barge-in / interrupt latency test

This is your primary evidence artifact for the "interrupt-to-silence" claim.
Run this exact procedure at least 5 times and record results in the table
below. Copy the final table into `RIME_EVIDENCE.md`.

## Procedure

1. Start the agent (`bash scripts/run_agent.sh`) and join the test room.
2. Ask a question that produces a longer spoken response (e.g., "Give me a
   full status update on the payments service including recent deploys").
3. While Rime is actively speaking, start talking over it after ~1-2 seconds.
4. Watch `logs/voice_pipeline_events.jsonl` (or console output) for:
   - `barge_in_interrupt_detected` timestamp
   - the timestamp of the last audio chunk actually played/sent
5. Compute the delta: (last audio played) - (interrupt detected). This is
   your interrupt latency for that run.
6. Note whether playback stopped cleanly or you heard a trailing word/sound.

## Results

| Run | Interrupt detected (ts) | Audio stopped (ts) | Delta (ms) | Clean stop? (Y/N) | Notes |
|-----|--------------------------|----------------------|------------|--------------------|-------|
| 1   |                          |                      |            |                    |       |
| 2   |                          |                      |            |                    |       |
| 3   |                          |                      |            |                    |       |
| 4   |                          |                      |            |                    |       |
| 5   |                          |                      |            |                    |       |

## Known limitations to disclose

- (fill in once observed) e.g. "First ~150ms of trailing audio sometimes
  played after interrupt due to buffered chunk already sent to output
  device."
- (fill in) any input conditions that broke detection (background noise,
  very short interruptions, etc.)
