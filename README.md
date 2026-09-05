# Fixer

Voice-native ops agent for the Rime Hackathon Challenge. An on-call engineer,
hands-busy and unable to type, can ask for service status, runbooks, and
deploy history by voice mid-incident.

**Hard voice problem:** conversation continuity during tool work — the
session must stay responsive while status/runbook lookups are in flight, and
a stale tool result must never get spoken once the user has interrupted or
changed the request. See `PROTOCOL.md` for the exact contract this is built
against, and `RIME_EVIDENCE.md` for the claim, acceptance test, and results.

This README covers the whole repo. Team split (see `Fixer_Project_Plan.pdf`):
Person 1 owns the voice pipeline and Rime integration, Person 2 owns backend
orchestration, Person 3 owns frontend/infra/evidence — **this pass builds
Person 3's slice**, plus a protocol-compliant backend stub so it's runnable
end-to-end today.

## Repo layout

```
PROTOCOL.md            wire protocol both frontend and backend build against
frontend/              React/Vite client — state display, transcript,
                        mic control (stub), judge/debug panel
backend-stub/          STUB in place of Person 2's real orchestrator —
                        implements the protocol with mock incident data
stress-test/           repeatable acceptance test for the hard voice problem
scripts/                preflight_check.js — validates the Rime model/voice/
                        language combo against the live catalog
RIME_EVIDENCE.md       claim / acceptance test / procedure / result
.env.example           config template (placeholders only)
```

## Quick start (text-only, no audio yet)

Three terminals:

```bash
# 1. backend (stub today, swap for Person 2's real orchestrator later)
cd backend-stub && npm install && npm start

# 2. frontend
cd frontend && npm install && cp .env.example .env && npm run dev

# 3. stress test, against whichever backend is running on :8787
cd stress-test && npm install && node run_stress_test.js --runs 20
```

Open the frontend, type `status of checkout-api` in the text box, then — while
it's still "running tool" — type `actually what's the status of auth-gateway`.
The judge panel on the right shows the first turn getting superseded and its
late tool result discarded, live.

Try also: `runbook for auth-gateway`, `deploy history for checkout-api`.

## Swapping in the real backend

The frontend only knows about `VITE_BACKEND_WS_URL` and the message shapes in
`PROTOCOL.md`. Point it at Person 2's real orchestrator once it speaks the
same protocol — no frontend code changes should be needed. `backend-stub/`
can then be deleted or kept around as a fixture for the stress test.

## Voice pipeline (Person 1's slice — not yet wired here)

`MicToggle.jsx` in the frontend is a deliberate placeholder: a visual mic
button and a text input that exercises the exact same `sendUtterance` /
`sendInterrupt` calls real STT + barge-in detection will call. It's built so
LiveKit audio can be dropped in without touching state management, the debug
panel, or the protocol client.

## Rime configuration

Set in `.env` (see `.env.example`):

```
RIME_MODEL_ID=coda
RIME_SPEAKER=astra
RIME_LANGUAGE=eng
```

Run `node scripts/preflight_check.js` before every demo — it fetches Rime's
live public catalog (`https://users.rime.ai/data/voices/all-v2.json`, no API
key required) and fails loudly if the configured model/speaker/language combo
isn't currently valid, per the challenge's "use a current production
configuration" rule.

> Note: this combo was not verified live in this development environment — the
> sandbox used to build this slice only allows outbound network access to
> package registries, not `rime.ai`. The script is written against Rime's
> documented public endpoint and should be run for real before submission.

## Configuration hygiene

`.env.example` contains placeholders only. Real credentials (Rime API key,
etc.) belong in server-side secrets once Person 1's TTS integration needs
them — never in frontend code, since anything shipped to the browser is
public. Nothing in this slice currently requires a live Rime API key (the
preflight check hits a public, unauthenticated endpoint).

## Known limitations (this slice)

- No real audio yet — text-in/text-out only, matching the "solo-demoable
  deliverable" for this role.
- `backend-stub` is intentionally simple mock data, not real incident
  services; it exists to make the frontend and stress test runnable before
  Person 2's backend lands, and implements the same turn-versioning contract
  it will need to.
- The active-speech-provider indicator currently reflects whatever the
  connected backend reports (`rime` or `fallback`) rather than a real Rime
  connection, since TTS isn't wired into this slice.
- Preflight check is written but not run against the live network in this
  environment (see note above).
