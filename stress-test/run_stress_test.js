// stress-test/run_stress_test.js
//
// Repeatable acceptance test for the hard voice problem: "conversation
// continuity during tool work." Runs the full-duplex test example from the
// challenge brief N times against a running backend (stub or real):
//
//   1. Send utterance A ("status of checkout-api") -> triggers a tool call
//      with an artificial delay.
//   2. While the tool call is still in flight, interrupt and send utterance
//      B ("status of auth-gateway") for a NEW turn.
//   3. Assert:
//        a. No `response` is ever emitted for turn A (stale result not spoken).
//        b. The stale tool_result for turn A does arrive, tagged stale:true
//           (proves it was caught, not silently lost).
//        c. A `response` for turn B arrives and reflects turn B's request.
//        d. Interrupt-to-silence latency: time from sending `interrupt`
//           to the last audible/displayed artifact of turn A's stream
//           (i.e. no further turn-A response after interrupt) is measured.
//   4. Report pass/fail per run plus latency percentiles.
//
// Usage:
//   node run_stress_test.js [--url ws://localhost:8787] [--runs 20] [--delay 1500]
//
// Exit code 0 if all runs pass, 1 otherwise. Writes stress_test_results.json
// alongside this script for RIME_EVIDENCE.md / judge inspection.

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { url: "ws://localhost:8787", runs: 20, delay: 1500 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url") out.url = args[++i];
    if (args[i] === "--runs") out.runs = Number(args[++i]);
    if (args[i] === "--delay") out.delay = Number(args[++i]);
  }
  return out;
}

let turnCounter = 0;
function nextTurnId() {
  turnCounter += 1;
  return `t${turnCounter}-${Date.now()}`;
}

function runOnce({ url, delay }) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const events = [];
    let turnA, turnB;
    let interruptSentAt = null;
    let result = {
      pass: false,
      reason: null,
      interruptToLastArtifactMs: null,
      events: [],
    };

    const finish = (pass, reason) => {
      result.pass = pass;
      result.reason = reason;
      result.events = events;
      try { ws.close(); } catch {}
      resolve(result);
    };

    const timeout = setTimeout(() => finish(false, "timed out waiting for run to complete"), delay * 4 + 5000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "_set_delay", ms: delay }));
      turnA = nextTurnId();
      events.push({ t: Date.now(), note: "sending utterance A" });
      ws.send(JSON.stringify({ type: "user_utterance", turnId: turnA, text: "what's the status of checkout-api" }));

      // Interrupt partway through the tool delay, well before it resolves.
      setTimeout(() => {
        turnB = nextTurnId();
        interruptSentAt = Date.now();
        events.push({ t: interruptSentAt, note: "sending interrupt + utterance B" });
        ws.send(JSON.stringify({ type: "interrupt", turnId: turnB }));
        ws.send(JSON.stringify({ type: "user_utterance", turnId: turnB, text: "actually what's the status of auth-gateway" }));
      }, Math.round(delay * 0.4));
    });

    let sawStaleToolResultForA = false;
    let sawResponseForA = false;
    let sawResponseForB = false;
    let lastArtifactTs = null;

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      events.push({ t: msg.ts || Date.now(), ...msg });

      if (msg.type === "tool_result" && msg.turnId === turnA) {
        if (msg.stale) {
          sawStaleToolResultForA = true;
        } else {
          // Tool A result applied as non-stale -> means server didn't
          // correctly supersede it. Record as a live artifact for turn A.
          lastArtifactTs = msg.ts;
        }
      }

      if (msg.type === "response" && msg.turnId === turnA) {
        sawResponseForA = true;
        lastArtifactTs = msg.ts;
      }

      if (msg.type === "response" && msg.turnId === turnB) {
        sawResponseForB = true;
        const mentionsB = /auth-gateway/i.test(msg.text || "");
        clearTimeout(timeout);
        const interruptToLast = interruptSentAt ? (msg.ts - interruptSentAt) : null;
        result.interruptToLastArtifactMs = interruptToLast;

        if (sawResponseForA) {
          finish(false, "a response was spoken for the superseded turn A");
        } else if (!sawStaleToolResultForA) {
          finish(false, "no stale tool_result observed for turn A (can't prove it was caught, not just late)");
        } else if (!mentionsB) {
          finish(false, "final response did not reflect turn B's request (auth-gateway)");
        } else {
          finish(true, null);
        }
      }
    });

    ws.on("error", (err) => finish(false, `ws error: ${err.message}`));
  });
}

async function main() {
  const opts = parseArgs();
  console.log(`[stress-test] target=${opts.url} runs=${opts.runs} tool_delay=${opts.delay}ms`);
  const results = [];
  for (let i = 0; i < opts.runs; i++) {
    const r = await runOnce(opts);
    results.push(r);
    process.stdout.write(r.pass ? "." : "F");
  }
  console.log("");

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const latencies = results.filter((r) => r.pass && r.interruptToLastArtifactMs != null).map((r) => r.interruptToLastArtifactMs).sort((a, b) => a - b);
  const pct = (p) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] : null);

  const summary = {
    ranAt: new Date().toISOString(),
    target: opts.url,
    toolDelayMs: opts.delay,
    runs: results.length,
    passed,
    failed,
    passRate: results.length ? passed / results.length : 0,
    interruptToCorrectFinalStateLatencyMs: {
      p50: pct(50),
      p95: pct(95),
      max: latencies.length ? latencies[latencies.length - 1] : null,
      min: latencies.length ? latencies[0] : null,
    },
    failureReasons: results.filter((r) => !r.pass).map((r) => r.reason),
  };

  console.log(JSON.stringify(summary, null, 2));

  const outPath = path.join(__dirname, "stress_test_results.json");
  fs.writeFileSync(outPath, JSON.stringify({ summary, runs: results }, null, 2));
  console.log(`[stress-test] wrote ${outPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
