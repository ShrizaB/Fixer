// backend-stub/server.js
//
// STUB — stands in for Person 2's real orchestration backend so the frontend
// and stress-test harness have something to run against before it's built.
// Implements PROTOCOL.md exactly: turn versioning, tool-call tagging,
// cancellation of superseded turns, and full event logging.
//
// Run: node server.js  (listens on ws://localhost:8787)
// Env: TOOL_DELAY_MS (default 1500) — artificial delay before a tool result
//      lands, so interruption-during-tool-work is actually testable.
//      RIME_DOWN=1 — simulate the speech provider being unreachable, to
//      exercise the fallback-visibility requirement.

const { WebSocketServer } = require("ws");
const { runTool } = require("./mock-data");

const PORT = process.env.PORT || 8787;
const DEFAULT_TOOL_DELAY_MS = Number(process.env.TOOL_DELAY_MS || 1500);
const RIME_DOWN = process.env.RIME_DOWN === "1";

const wss = new WebSocketServer({ port: PORT });
console.log(`[backend-stub] listening on ws://localhost:${PORT}`);
console.log(`[backend-stub] tool delay: ${DEFAULT_TOOL_DELAY_MS}ms, rime down: ${RIME_DOWN}`);

function parseIntent(text) {
  const lower = text.toLowerCase();
  const serviceMatch = lower.match(/(checkout-api|payments-worker|auth-gateway)/);
  const service = serviceMatch ? serviceMatch[1] : null;
  if (!service) return null;
  if (lower.includes("runbook")) return { tool: "get_runbook", args: { service } };
  if (lower.includes("deploy")) return { tool: "get_deploy_history", args: { service } };
  return { tool: "get_status", args: { service } };
}

wss.on("connection", (ws) => {
  let currentTurnId = null;
  let toolDelayMs = DEFAULT_TOOL_DELAY_MS;
  const pendingTimers = new Map(); // turnId -> Timeout

  const send = (msg) => {
    const ts = Date.now();
    const payload = { ...msg, ts };
    ws.send(JSON.stringify(payload));
  };

  const log = (event, turnId, detail) => send({ type: "log", event, turnId, detail });

  // Announce active speech provider on connect (per eligibility rules: must be observable)
  send({ type: "provider", active: RIME_DOWN ? "fallback" : "rime" });
  send({ type: "state", state: "idle", turnId: null });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Test hook: allow the stress-test harness to control delay per-connection.
    if (msg.type === "_set_delay") {
      toolDelayMs = Number(msg.ms) || DEFAULT_TOOL_DELAY_MS;
      return;
    }

    if (msg.type === "interrupt") {
      const staleTurn = currentTurnId;
      log("interrupt_received", msg.turnId, { superseded: staleTurn });
      if (staleTurn && pendingTimers.has(staleTurn)) {
        log("turn_superseded", staleTurn, { by: msg.turnId });
        // Do not clear the timer — let it fire so we can prove the stale
        // result is discarded (see tool_result stale flag below), matching
        // "reconciliation logic for stale results that land late anyway".
      }
      currentTurnId = msg.turnId;
      send({ type: "state", state: "listening", turnId: currentTurnId });
      return;
    }

    if (msg.type === "cancel") {
      log("cancel_received", msg.turnId);
      if (currentTurnId === msg.turnId) currentTurnId = null;
      send({ type: "state", state: "idle", turnId: null });
      return;
    }

    if (msg.type === "user_utterance") {
      const turnId = msg.turnId;
      const staleTurn = currentTurnId && currentTurnId !== turnId ? currentTurnId : null;
      if (staleTurn) log("turn_superseded", staleTurn, { by: turnId });
      currentTurnId = turnId;
      log("turn_started", turnId, { text: msg.text });
      send({ type: "state", state: "thinking", turnId });

      const intent = parseIntent(msg.text || "");
      if (!intent) {
        send({ type: "state", state: "speaking", turnId });
        send({
          type: "response",
          turnId,
          final: true,
          text: "I didn't catch a service name — try 'status of checkout-api'.",
        });
        send({ type: "state", state: "idle", turnId: null });
        return;
      }

      send({ type: "state", state: "tool_running", turnId });
      log("tool_call_dispatched", turnId, intent);
      send({ type: "tool_call", turnId, tool: intent.tool, args: intent.args });

      const timer = setTimeout(() => {
        pendingTimers.delete(turnId);
        const result = runTool(intent.tool, intent.args);
        const isStale = currentTurnId !== turnId;
        log(isStale ? "tool_result_discarded" : "tool_result_applied", turnId, { result, stale: isStale });
        send({ type: "tool_result", turnId, tool: intent.tool, result, stale: isStale });

        if (isStale) return; // never speak/apply a result for a superseded turn

        send({ type: "state", state: "speaking", turnId });
        send({
          type: "response",
          turnId,
          final: true,
          text: summarize(intent, result),
        });
        send({ type: "state", state: "idle", turnId: null });
      }, toolDelayMs);

      pendingTimers.set(turnId, timer);
      return;
    }
  });

  ws.on("close", () => {
    for (const t of pendingTimers.values()) clearTimeout(t);
  });
});

function summarize(intent, result) {
  const { service } = intent.args;
  if (intent.tool === "get_status") {
    return `${service} is ${result.status}, error rate ${result.errorRate ?? "unknown"}, region ${result.region ?? "unknown"}.`;
  }
  if (intent.tool === "get_runbook") return result.text;
  if (intent.tool === "get_deploy_history") {
    const last = result.deploys?.[0];
    return last
      ? `Last deploy of ${service} was ${last.version}, ${last.status}, at ${last.deployedAt}.`
      : `No deploy history found for ${service}.`;
  }
  return "Done.";
}
