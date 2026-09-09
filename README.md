# Fixer

Voice-native ops agent for on-call incident triage. An engineer in the middle
of an incident — hands-busy, unable to type — can ask for service status,
runbooks, and deploy history by voice. Fixer speaks the answer back through
[Rime TTS](https://rime.ai) and handles barge-in (interruption) cleanly:
if the user changes their question while a tool call is still in flight, the
stale result is never spoken and the response reflects only the latest request.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Voice Pipeline  (Python / LiveKit Agents)                          │
│                                                                      │
│  Mic → Silero VAD → Deepgram STT → transcript ─────────┐            │
│                                                          │            │
│                        Rime TTS ← response text ←───────┼──┐        │
│                            ↓                             │  │        │
│                      LiveKit room → speaker              │  │        │
└──────────────────────────────────────────────────────────┼──┼────────┘
                                                           │  │
                                                      WS   │  │ WS
                                                           ↓  │
┌──────────────────────────────────────────────────────────────┼────────┐
│  Backend  (Node.js)                                         │        │
│                                                              │        │
│  WebSocket server (:8787)                                    │        │
│  SessionManager  — turn versioning, interrupt/cancel         │        │
│  LLMClient       — Gemini 2.5 Flash for intent + summary    │        │
│  mockData        — simulated incident services               │        │
│  LiveKit token    — GET /token endpoint                      │        │
└──────────────────────────────────────────────────────────────┼────────┘
                                                               │
                                                          WS + HTTP
                                                               │
┌──────────────────────────────────────────────────────────────────────┐
│  Frontend  (React / Vite)                                            │
│                                                                      │
│  LiveKitRoom + RoomAudioRenderer — real-time audio transport         │
│  StateDisplay / Transcript / MicToggle — operator UI                 │
│  DebugPanel (Judge Panel) — live event log proving turn versioning   │
│  ProviderIndicator — shows Rime vs fallback speech provider          │
│  ThemeToggle — light/dark mode                                       │
└──────────────────────────────────────────────────────────────────────┘
```

Communication between all three components uses the JSON-over-WebSocket
protocol defined in [`PROTOCOL.md`](PROTOCOL.md).

## Repo layout

```
Voice_Pipeline/            Python voice agent — Silero VAD, Deepgram STT,
                            Rime TTS, barge-in handling, latency logging
  src/
    agent.py               LiveKit Agents entrypoint
    config.py              centralised env-var config
    latency_logger.py      monotonic-timestamp event logger (JSONL)
    rime_tts_test.py       standalone Rime TTS smoke test
  tests/
    test_barge_in_manual.md manual barge-in test procedure
  scripts/
    run_agent.sh           shell helper to launch the agent

backend/                   Node.js orchestration server
  server.js                HTTP + WS server (port 8787)
  SessionManager.js        turn versioning, interrupt, cancel, stale detection
  LLMClient.js             Gemini 2.5 Flash — intent extraction + result summary
  tools.js                 function-calling tool declarations (get_status,
                            get_runbook, get_deploy_history)
  mockData.js              simulated service data (checkout-api, payments-worker,
                            auth-gateway)

backend-stub/              lightweight STUB of the backend (no LLM, no LiveKit
                            token endpoint) — implements PROTOCOL.md with
                            regex intent parsing and mock data for stress testing

frontend/                  React 19 / Vite 8 client
  src/
    App.jsx                main shell — LiveKitRoom, layout, state wiring
    components/            StateDisplay, Transcript, MicToggle, DebugPanel,
                            ProviderIndicator, ThemeToggle, Toast, NotFound
    lib/wsClient.js        protocol client (sendUtterance / sendInterrupt)

stress-test/               repeatable acceptance test for the "hard voice problem"
  run_stress_test.js       automated interrupt-during-tool-work test harness

scripts/
  preflight_check.js       validates Rime model/speaker/language against the
                            live Rime catalog before every demo

PROTOCOL.md                wire protocol contract (client ↔ server)
RIME_EVIDENCE.md           claim, acceptance test, procedure, results
.env.example               config template (placeholders only)
```

## Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- API keys for: **LiveKit Cloud**, **Deepgram**, **Rime**, **Google Gemini**

## Setup

### 1. Environment variables

```bash
cp .env.example .env
# Fill in all keys — see the template for descriptions.
# This single .env at the repo root is read by all components.
```

Required variables:

| Variable | Used by |
|---|---|
| `LIVEKIT_URL` | Voice Pipeline, Backend |
| `LIVEKIT_API_KEY` | Voice Pipeline, Backend |
| `LIVEKIT_API_SECRET` | Voice Pipeline, Backend |
| `DEEPGRAM_API_KEY` | Voice Pipeline |
| `RIME_API_KEY` | Voice Pipeline |
| `RIME_MODEL_ID` | Voice Pipeline (default: `coda`) |
| `RIME_SPEAKER` | Voice Pipeline (default: `clementine`) |
| `RIME_LANGUAGE` | Voice Pipeline (default: `eng`) |
| `GEMINI_API_KEY` | Backend |
| `ENABLE_FALLBACK_TTS` | Voice Pipeline (default: `true`) |
| `TOOL_DELAY_MS` | Backend / Backend-stub (default: `1500`) |
| `RIME_DOWN` | Backend / Backend-stub (set to `1` to simulate Rime outage) |

### 2. Install dependencies

```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && npm install

# Voice Pipeline
cd Voice_Pipeline
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows:     .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Rime preflight check

```bash
node scripts/preflight_check.js
```

Validates your `RIME_MODEL_ID` / `RIME_SPEAKER` / `RIME_LANGUAGE` combo against
Rime's live public catalog. Run before every demo.

## Running

### All-in-one (requires `concurrently`)

```bash
npm install          # root package.json — installs concurrently
npm run start:all    # launches frontend + backend + voice agent
```

### Manual (three terminals)

```bash
# Terminal 1 — Backend
cd backend && node server.js

# Terminal 2 — Frontend
cd frontend && npm run dev

# Terminal 3 — Voice Pipeline
cd Voice_Pipeline && .venv/bin/python src/agent.py dev
# Windows: .venv\Scripts\python src\agent.py dev
```

The frontend opens at `http://localhost:5173` (Vite default).
The backend listens on `ws://localhost:8787` (WebSocket) and `http://localhost:8787/token` (LiveKit token).

### Text-only mode (no audio)

If you don't have LiveKit/Deepgram/Rime keys yet, you can run the backend +
frontend without the voice pipeline. The frontend's `MicToggle` component
provides a text input that exercises the same `sendUtterance` / `sendInterrupt`
protocol calls that real STT + barge-in detection will call.

```bash
cd backend && node server.js     # terminal 1
cd frontend && npm run dev       # terminal 2
```

### Using the backend-stub (no LLM required)

The `backend-stub/` is a minimal standalone server implementing `PROTOCOL.md`
with regex-based intent parsing and no external API calls. Useful for frontend
development and stress testing without a Gemini key.

```bash
cd backend-stub && npm install && npm start
```

## Usage

Once running, open the frontend and either speak into the mic or type in the
text box:

- `status of checkout-api` — returns health status, error rate, region
- `runbook for auth-gateway` — returns incident runbook steps
- `deploy history for payments-worker` — returns recent deploy info

**To test barge-in:** ask about one service, then — while the tool call is
still in progress — ask about a different one. The Judge Panel on the right
shows the first turn being superseded and its stale tool result discarded live.

Available mock services: `checkout-api`, `payments-worker`, `auth-gateway`.

## Stress test

The automated acceptance test proves the "hard voice problem" — conversation
continuity during tool work:

```bash
# Start backend or backend-stub first, then:
cd stress-test && npm install
node run_stress_test.js --runs 20 --delay 1500
```

The test:
1. Sends utterance A ("status of checkout-api") → triggers a tool call
2. While the tool call is in flight, interrupts and sends utterance B ("status of auth-gateway")
3. Asserts: no response for A, stale tool_result tagged `stale: true`, final response reflects B
4. Reports pass rate and interrupt-to-correct-response latency percentiles

Results are written to `stress-test/stress_test_results.json`.
See [`RIME_EVIDENCE.md`](RIME_EVIDENCE.md) for full acceptance test details and results.

## Voice pipeline details

The voice pipeline (`Voice_Pipeline/src/agent.py`) is a LiveKit Agents application
that handles the full audio path:

- **VAD:** Silero VAD with `min_silence_duration=1.0s` — tuned to avoid
  fragmenting multi-word service names like "checkout-api"
- **STT:** Deepgram Nova with domain keyterms (`checkout-api`, `payments-worker`,
  `auth-gateway`, `runbook`, `deploy history`) and `endpointing_ms=300`
- **TTS:** Rime (model/speaker/language from `.env`) — primary speech output
- **Barge-in:** VAD-based interruption with `min_duration=0.5s`, false-interruption
  detection (`resume_false_interruption=true`, `false_interruption_timeout=2.0s`),
  and backchannel boundary filtering
- **Backend bridge:** `FixerClient` connects to the backend's WebSocket, forwards
  transcripts as `user_utterance`, and speaks backend responses via `agent_session.say()`

### Standalone Rime test

Confirm your Rime API key and config work before involving LiveKit:

```bash
cd Voice_Pipeline
python src/rime_tts_test.py "Hello, this is a test."
# Outputs raw PCM to Voice_Pipeline/src/output/
# Play with: ffplay -f s16le -ar 22050 -ac 1 src/output/output_test.pcm
```

## Backend details

The backend (`backend/server.js`) serves two roles:

1. **LiveKit token endpoint** — `GET /token` returns a JWT for the frontend
   to join a LiveKit room
2. **Orchestration server** — WebSocket server implementing `PROTOCOL.md`

Intent extraction and result summarisation use **Gemini 2.5 Flash** via
`@google/genai`. If the Gemini API is unreachable or no key is configured,
`LLMClient.js` falls back to regex-based intent parsing and template
summarisation — the same logic used in `backend-stub/`.

### Turn versioning

The `SessionManager` tracks the current turn ID. Every inbound utterance or
interrupt supersedes the previous turn. Tool results that land for a superseded
turn are emitted with `stale: true` (provably discarded, not silently dropped)
and never generate a spoken response. See [`PROTOCOL.md`](PROTOCOL.md) for
the full contract.

## Frontend details

The frontend is a React 19 + Vite 8 single-page application using
`@livekit/components-react` for real-time audio transport.

Key components:
- **`MicToggle`** — mic button + text input, calls `sendUtterance` / `sendInterrupt`
- **`StateDisplay`** — shows current agent state (`idle`, `listening`, `thinking`, `tool_running`, `speaking`)
- **`Transcript`** — scrolling conversation log, marks superseded turns
- **`DebugPanel`** (Judge Panel) — raw event log proving turn versioning works
- **`ProviderIndicator`** — shows whether Rime or fallback TTS is active
- **`ThemeToggle`** — light / dark mode with system preference detection

## Third-party services

| Service | Purpose | Configured via |
|---|---|---|
| [LiveKit Cloud](https://livekit.io) | Real-time audio transport, VAD, turn management | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| [Deepgram](https://deepgram.com) | Speech-to-text (Nova model) | `DEEPGRAM_API_KEY` |
| [Rime](https://rime.ai) | Text-to-speech (primary) | `RIME_API_KEY`, `RIME_MODEL_ID`, `RIME_SPEAKER`, `RIME_LANGUAGE` |
| [Google Gemini](https://ai.google.dev) | LLM for intent extraction + summarisation | `GEMINI_API_KEY` |

## Configuration hygiene

- The single `.env` file at the repo root is shared by all components and
  is gitignored.
- `.env.example` contains placeholders only — never commit real credentials.
- Rime API keys are only used server-side (Voice Pipeline and Backend), never
  in frontend code shipped to the browser.

## Known limitations

- **Mock incident data** — `mockData.js` contains static data for three
  services. In production this would be replaced with real incident service
  integrations.
- **No persistent conversation history** — each WebSocket session is stateless.
  A production system would store conversation context.
- **Single concurrent session** — the backend broadcasts messages to all
  connected WebSocket clients. A production deployment would scope sessions.
- **Rime preflight check** — validates against Rime's public catalog endpoint
  but requires outbound network access to `rime.ai`.

## License

ISC
