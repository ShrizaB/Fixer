// Thin client for the protocol defined in /PROTOCOL.md at the repo root.
// Person 1's real audio pipeline will call sendUtterance/sendInterrupt from
// STT + barge-in detection instead of the text box in TextFallbackInput.

export function createFixerClient(url, handlers) {
  let ws = null;
  let turnCounter = 0;
  let reconnectTimer = null;
  let closedByUser = false;

  const nextTurnId = () => {
    turnCounter += 1;
    return `t${turnCounter}-${Date.now()}`;
  };

  const connect = () => {
    ws = new WebSocket(url);

    ws.onopen = () => handlers.onConnectionChange?.("connected");
    ws.onclose = () => {
      handlers.onConnectionChange?.("disconnected");
      if (!closedByUser) {
        reconnectTimer = setTimeout(connect, 1500);
      }
    };
    ws.onerror = () => handlers.onConnectionChange?.("error");

    ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      handlers.onMessage?.(msg);
    };
  };

  connect();

  const sendRaw = (payload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  return {
    // Full utterance completed (from STT, or typed text in demo mode).
    sendUtterance(text) {
      const turnId = nextTurnId();
      sendRaw({ type: "user_utterance", turnId, text });
      return turnId;
    },
    // Barge-in: user started talking again. Returns the new turnId that
    // supersedes whatever was in flight.
    sendInterrupt() {
      const turnId = nextTurnId();
      sendRaw({ type: "interrupt", turnId });
      return turnId;
    },
    close() {
      closedByUser = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}
