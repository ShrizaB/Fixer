import { Download } from "lucide-react";

const EVENT_COLOR = {
  turn_started: "var(--listening)",
  turn_superseded: "var(--danger)",
  interrupt_received: "var(--danger)",
  tool_call_dispatched: "var(--tool-running)",
  tool_result_applied: "var(--speaking)",
  tool_result_discarded: "var(--danger)",
  cancel_received: "var(--idle)",
};

export default function DebugPanel({ log }) {
  const download = () => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fixer-event-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
          {log.length} event{log.length === 1 ? "" : "s"}
        </div>
        <button
          onClick={download}
          disabled={log.length === 0}
          className="btn"
          style={{ height: 30, fontSize: 12, padding: "0 12px", display: "flex", alignItems: "center", gap: 6, color: "var(--text-dim)" }}
        >
          <Download size={13} /> Export
        </button>
      </div>

      <div className="scrollbar-thin" style={{ flex: 1, overflowY: "auto", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        {log.length === 0 && (
          <div style={{ color: "var(--text-faint)" }}>Event log will stream here as turns happen.</div>
        )}
        {[...log].reverse().map((e, i) => (
          <div
            key={i}
            className="log-row"
            style={{
              display: "grid",
              gridTemplateColumns: "70px 1fr",
              gap: 8,
              padding: "5px 4px",
              borderBottom: "1px solid var(--line)",
              color: "var(--text-dim)",
              borderRadius: 4,
              transition: "background 100ms ease",
            }}
          >
            <span style={{ color: "var(--text-faint)" }}>{formatTs(e.ts)}</span>
            <span>
              <span style={{ color: EVENT_COLOR[e.event] || "var(--text)" }}>{e.event}</span>
              {e.turnId ? <span style={{ color: "var(--text-faint)" }}> · {e.turnId}</span> : null}
              {e.detail ? <span style={{ color: "var(--text-faint)" }}> · {summarizeDetail(e.detail)}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTs(ts) {
  if (!ts) return "--:--:--";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function summarizeDetail(detail) {
  try {
    return JSON.stringify(detail);
  } catch {
    return "";
  }
}
