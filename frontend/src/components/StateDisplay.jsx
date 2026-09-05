const STATE_META = {
  idle: { label: "Idle", color: "var(--idle)" },
  listening: { label: "Listening", color: "var(--listening)" },
  thinking: { label: "Thinking", color: "var(--thinking)" },
  tool_running: { label: "Running tool", color: "var(--tool-running)" },
  speaking: { label: "Speaking", color: "var(--speaking)" },
};

export default function StateDisplay({ state, activeTool }) {
  const meta = STATE_META[state] || STATE_META.idle;
  const pulsing = state === "listening" || state === "speaking";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: meta.color,
          boxShadow: pulsing ? `0 0 0 6px ${meta.color}22` : "none",
          transition: "box-shadow 200ms ease, background 200ms ease",
          animation: pulsing ? "fixer-pulse 1.4s ease-in-out infinite" : "none",
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
          {meta.label}
          {state === "tool_running" && activeTool ? (
            <span style={{ color: "var(--text-dim)", fontWeight: 400 }}> · {activeTool}</span>
          ) : null}
        </div>
      </div>
      <style>{`
        @keyframes fixer-pulse {
          0%, 100% { box-shadow: 0 0 0 4px ${meta.color}22; }
          50% { box-shadow: 0 0 0 10px ${meta.color}11; }
        }
      `}</style>
    </div>
  );
}
