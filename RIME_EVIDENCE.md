# RIME_EVIDENCE.md

## Claim

Fixer keeps the conversation state correct when a tool call is interrupted
mid-flight: if the user changes their request while a status/runbook/deploy
lookup is in progress, the stale result is never spoken and the agent's final
response reflects only the user's latest request.

## Acceptance test

Defined before integrating real audio (per the challenge rule to define the
test before the demo):

1. Send an utterance that triggers a tool call with an artificial delay
   (e.g. "status of checkout-api").
2. While the tool call is still in flight, interrupt and send a new utterance
   for a different service (e.g. "actually what's the status of
   auth-gateway").
3. Pass requires all of:
   - No response is ever produced for the superseded (first) turn.
   - The stale tool result for the superseded turn does arrive but is
     explicitly tagged discarded — proving it was caught, not just silently
     lost or racily avoided.
   - The final response corresponds to the second request.
4. Repeat N times and report the interrupt→correct-final-response latency
   distribution, not just pass/fail, since a single lucky run proves nothing
   about a race condition.

## Procedure

```bash
cd backend-stub && npm install && npm start
cd stress-test && npm install && node run_stress_test.js --runs 20 --delay 1500
```

`run_stress_test.js` automates exactly the steps above over a real WebSocket
connection (see `PROTOCOL.md`), against whatever backend is listening on
`--url` (defaults to the local stub). It writes a machine-readable
`stress_test_results.json` next to itself with every run's raw event trace.

## Result (against `backend-stub`, this pass)

Run at development time in this environment, 15 runs, 800ms artificial tool
delay:

```json
{
  "runs": 15,
  "passed": 15,
  "failed": 0,
  "passRate": 1,
  "interruptToCorrectFinalStateLatencyMs": { "p50": 802, "p95": 805, "min": 801, "max": 805 }
}
```

Full trace: `stress-test/stress_test_results.json`.

This validates the **orchestration contract** (turn versioning, cancellation,
reconciliation of late results) that Person 2's real backend must also
satisfy — the harness runs unmodified against any backend that speaks
`PROTOCOL.md`, so re-run it against the real orchestrator once it's ready and
paste the new numbers here.

## Limitations / what's not yet proven

- **This result is against the mock backend stub, not Person 2's real
  orchestrator or a real LLM tool-calling loop.** It proves the wire
  contract and reconciliation logic are correct; it does not yet prove the
  real backend implements them the same way. Re-run before submission.
- **No real audio latency is included yet.** The "interrupt-to-silence"
  half of this claim — how fast queued Rime audio actually stops playing,
  not just how fast the backend reconciles state — depends on Person 1's
  LiveKit/Rime integration and is not measured here. That number belongs in
  this section once real TTS is wired in; it should be measured the same
  way (repeatable script, N runs, percentiles, not a single anecdote).
- **Rime model/voice/language preflight** (`scripts/preflight_check.js`) is
  implemented against Rime's documented public catalog endpoint but has not
  been run against the live network in this development environment (see
  README for why). Run it for real and paste the pass output here before
  submission.
- Tool delay in the stub is synthetic (a fixed timeout), not a real
  downstream service call; real network/LLM latency will have more variance
  than shown above.
