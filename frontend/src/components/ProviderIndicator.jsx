export default function ProviderIndicator({ provider }) {
  const isRime = provider === "rime";
  const isKnown = provider === "rime" || provider === "fallback";

  return (
    <div
      title={isRime ? "Rime is providing spoken output" : "Fallback speech provider is active — Rime is unreachable"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${isRime ? "var(--speaking)" : isKnown ? "var(--danger)" : "var(--line)"}`,
        background: isRime ? "rgba(79,182,168,0.08)" : isKnown ? "rgba(228,87,61,0.08)" : "transparent",
        fontSize: 13,
        fontWeight: !isRime && isKnown ? 600 : 400,
        color: isRime ? "var(--speaking)" : isKnown ? "var(--danger)" : "var(--text-dim)",
        transition: "color 200ms ease, border-color 200ms ease, background 200ms ease",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "currentColor",
          animation: !isRime && isKnown ? "fixer-fallback-pulse 1.2s ease-in-out infinite" : "none",
        }}
      />
      {!isKnown ? "Provider unknown" : isRime ? "Rime" : "Fallback voice"}
      <style>{`
        @keyframes fixer-fallback-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}