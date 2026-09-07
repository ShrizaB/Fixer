class SessionManager {
  constructor(ws, wss) {
    this.ws = ws;
    this.wss = wss;
    this.currentTurnId = null;
    this.pendingTurns = new Set();
  }

  send(msg) {
    const payload = { ...msg, ts: Date.now() };
    const data = JSON.stringify(payload);
    if (this.wss) {
      for (const client of this.wss.clients) {
        if (client.readyState === 1) client.send(data);
      }
    } else if (this.ws.readyState === 1) {
      this.ws.send(data);
    }
  }

  log(event, turnId, detail) {
    this.send({ type: "log", event, turnId, detail });
  }

  setState(state, turnId) {
    this.send({ type: "state", state, turnId });
  }

  interrupt(turnId) {
    const staleTurn = this.currentTurnId;
    this.log("interrupt_received", turnId, { superseded: staleTurn });
    
    if (staleTurn && this.pendingTurns.has(staleTurn)) {
      this.log("turn_superseded", staleTurn, { by: turnId });
    }
    
    this.currentTurnId = turnId;
    this.setState("listening", turnId);
  }

  cancel(turnId) {
    this.log("cancel_received", turnId);
    if (this.currentTurnId === turnId) {
      this.currentTurnId = null;
    }
    this.setState("idle", null);
  }

  startTurn(turnId, text) {
    const staleTurn = this.currentTurnId && this.currentTurnId !== turnId ? this.currentTurnId : null;
    if (staleTurn) {
      this.log("turn_superseded", staleTurn, { by: turnId });
    }
    this.currentTurnId = turnId;
    this.pendingTurns.add(turnId);
    this.log("turn_started", turnId, { text });
    this.setState("thinking", turnId);
  }

  isStale(turnId) {
    return this.currentTurnId !== turnId;
  }
  
  finishTurn(turnId) {
    this.pendingTurns.delete(turnId);
  }
}

module.exports = SessionManager;
