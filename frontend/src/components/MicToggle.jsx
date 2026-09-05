// Visual mic control + text-only fallback input.
//
// HOOK POINT for Person 1: replace `onMicToggle` / wire real STT output into
// `onUtterance`, and call `onBargeIn` the instant voice-activity detection
// fires while the agent is speaking. Everything downstream (turn versioning,
// state display, debug log) already reacts to those two calls correctly —
// this component is deliberately audio-agnostic so it doesn't need to change
// when real capture lands.

import { useState } from "react";
import { Mic, MicOff, ArrowUp } from "lucide-react";

export default function MicToggle({ onUtterance, onBargeIn, agentState }) {
  const [micOn, setMicOn] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    if (agentState === "speaking" || agentState === "tool_running" || agentState === "thinking") {
      onBargeIn();
    }
    onUtterance(text);
    setDraft("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => setMicOn((v) => !v)}
          aria-pressed={micOn}
          title="Mic capture not yet wired — placeholder for Person 1's voice pipeline"
          className={`btn-icon${micOn ? " active" : ""}`}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder='Text-only mode — try "status of checkout-api"'
          className="input-field"
        />
        <button onClick={submit} disabled={!draft.trim()} className="btn" style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px" }}>
          Send <ArrowUp size={15} />
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
        Mic capture is a placeholder pending Person 1's LiveKit/STT integration. Sending
        while the agent is thinking, running a tool, or speaking simulates a barge-in.
      </div>
    </div>
  );
}
