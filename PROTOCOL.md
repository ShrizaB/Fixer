# Fixer wire protocol (v0)

This is the contract between the voice/frontend layer (Person 1 + Person 3) and
backend orchestration (Person 2). Everyone can build against this independently.
It's a plain JSON-over-WebSocket protocol, one connection per session.

Person 2's real orchestrator should implement the server side of this exactly —
`backend-stub/server.js` in this repo is a **stand-in** that implements the same
contract with fake data and an artificial tool-call delay, so the frontend and
stress-test harness have something real to run against today. Swap the URL in
`.env` when the real backend is ready; nothing else should need to change.

## Client → Server

| type | fields | meaning |
|---|---|---|
| `user_utterance` | `turnId, text, ts` | A completed user turn (from STT, or typed in text-only mode). Starts a new turn; any prior turn is implicitly superseded. |
| `interrupt` | `turnId, ts` | Barge-in: the user started speaking again before the agent finished. `turnId` is the new turn taking over. |
| `cancel` | `turnId, ts` | Explicit "stop" with no follow-up utterance yet. |

## Server → Client

| type | fields | meaning |
|---|---|---|
| `state` | `state, turnId, ts` | One of `listening \| thinking \| tool_running \| speaking \| idle`. Drives the state display. |
| `tool_call` | `turnId, tool, args, ts` | A tool dispatch started for this turn. |
| `tool_result` | `turnId, tool, result, ts, stale` | A tool result landed. `stale: true` means it belongs to a superseded turn and must NOT be spoken/applied — sent only so the debug panel can prove it was discarded. |
| `response` | `turnId, text, ts, final` | Spoken/displayed agent response for a turn. Only ever sent for the current (non-superseded) turn. |
| `provider` | `active, ts` | Which speech provider is live: `rime \| fallback`. |
| `log` | `event, turnId, ts, detail` | Raw event for the judge/debug panel and for RIME_EVIDENCE.md — every state transition gets one. |

## Turn versioning rule (the thing being proven)

Every inbound utterance/interrupt gets a monotonically increasing `turnId`.
The server must:
1. Tag every tool call and tool result with the `turnId` it belongs to.
2. On `interrupt` or a new `user_utterance`, mark the previous `turnId` superseded.
3. Never emit a `response` for a superseded `turnId`.
4. Still emit `tool_result` for superseded calls (marked `stale: true`) so the
   discard is observable/provable, rather than silently dropping evidence.

This is exactly what `stress-test/run_stress_test.js` asserts.
