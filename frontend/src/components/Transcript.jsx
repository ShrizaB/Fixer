import { MicOff } from "lucide-react";

export default function Transcript({ items }) {
  if (items.length === 0) {
    return (
      <div
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 10,
          padding: "36px 20px",
          flex: 1,
        }}
      >
        <MicOff size={22} style={{ color: "var(--text-faint)" }} />
        <div style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.5, maxWidth: 260 }}>
          Nothing yet. Try "status of checkout-api" or "runbook for auth-gateway".
        </div>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin" style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            alignSelf: item.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "80%",
            background: item.role === "user" ? "var(--panel-raised)" : "rgba(79,182,168,0.08)",
            border: `1px solid ${item.role === "user" ? "var(--line)" : "var(--speaking)"}`,
            borderRadius: 10,
            padding: "11px 15px",
            opacity: item.superseded ? 0.4 : 1,
            transition: "opacity 200ms ease",
          }}
        >
          <div style={{ fontSize: 14, lineHeight: 1.4 }}>{item.text}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {item.turnId}
            {item.superseded ? " · superseded" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}