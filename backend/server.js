require("dotenv").config({ path: "../.env" });
const http = require("http");
const { WebSocketServer } = require("ws");
const { AccessToken } = require("livekit-server-sdk");
const SessionManager = require("./SessionManager");
const LLMClient = require("./LLMClient");
const { runTool } = require("./mockData");

const PORT = process.env.PORT || 8787;
const DEFAULT_TOOL_DELAY_MS = Number(process.env.TOOL_DELAY_MS || 1500);
const RIME_DOWN = process.env.RIME_DOWN === "1";

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (req.url === "/token" && req.method === "GET") {
    try {
      const roomName = "console-" + Math.floor(Math.random() * 10000000);
      const participantName = "user-" + Math.floor(Math.random() * 1000);
      
      const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity: participantName,
      });
      at.addGrant({ roomJoin: true, room: roomName });
      
      const token = await at.toJwt();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ token, url: process.env.LIVEKIT_URL }));
    } catch (e) {
      console.error("Token error:", e);
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });
const llmClient = new LLMClient();

server.listen(PORT, () => {
  console.log(`[backend] HTTP and WS listening on port ${PORT}`);
});


wss.on("connection", (ws) => {
  const session = new SessionManager(ws, wss);
  let toolDelayMs = DEFAULT_TOOL_DELAY_MS;
  const pendingTimers = new Map();

  session.send({ type: "provider", active: RIME_DOWN ? "fallback" : "rime" });
  session.setState("idle", null);

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "_set_delay") {
      toolDelayMs = Number(msg.ms) || DEFAULT_TOOL_DELAY_MS;
      return;
    }

    if (msg.type === "interrupt") {
      session.interrupt(msg.turnId);
      return;
    }

    if (msg.type === "cancel") {
      session.cancel(msg.turnId);
      return;
    }

    if (msg.type === "user_utterance") {
      const turnId = msg.turnId;
      session.startTurn(turnId, msg.text);

      const { intent, text } = await llmClient.processUtterance(msg.text);
      
      if (session.isStale(turnId)) {
        session.log("tool_result_discarded", turnId, { result: { error: "Cancelled before dispatch" }, stale: true });
        session.send({ type: "tool_result", turnId, tool: "unknown", result: { error: "Cancelled before dispatch" }, stale: true });
        session.finishTurn(turnId);
        return;
      }

      if (!intent) {
        session.setState("speaking", turnId);
        session.send({
          type: "response",
          turnId,
          final: true,
          text: text || "I didn't catch a service name.",
        });
        session.setState("idle", null);
        session.finishTurn(turnId);
        return;
      }

      session.setState("tool_running", turnId);
      session.log("tool_call_dispatched", turnId, intent);
      session.send({ type: "tool_call", turnId, tool: intent.tool, args: intent.args });

      // Simulate tool delay for stress testing
      const timer = setTimeout(async () => {
        pendingTimers.delete(turnId);
        const result = runTool(intent.tool, intent.args);
        
        let isStale = session.isStale(turnId);
        session.log(isStale ? "tool_result_discarded" : "tool_result_applied", turnId, { result, stale: isStale });
        session.send({ type: "tool_result", turnId, tool: intent.tool, result, stale: isStale });

        if (isStale) {
          session.finishTurn(turnId);
          return;
        }

        session.setState("thinking", turnId);
        const summary = await llmClient.summarizeResult(intent, result);
        
        // Check stale again after summary generation
        isStale = session.isStale(turnId);
        if (isStale) {
          session.finishTurn(turnId);
          return;
        }

        session.setState("speaking", turnId);
        session.send({
          type: "response",
          turnId,
          final: true,
          text: summary,
        });
        session.setState("idle", null);
        session.finishTurn(turnId);
      }, toolDelayMs);
      
      pendingTimers.set(turnId, timer);
    }
  });

  ws.on("close", () => {
    for (const t of pendingTimers.values()) clearTimeout(t);
  });
});
