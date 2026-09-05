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
        borderRadius: 6,
        border: `1px solid ${isRime ? "var(--speaking)" : isKnown ? "var(--danger)" : "var(--line)"}`,
        background: isRime ? "rgba(79,182,168,0.08)" : isKnown ? "rgba(228,87,61,0.08)" : "transparent",
        fontSize: 13,
        color: isRime ? "var(--speaking)" : isKnown ? "var(--danger)" : "var(--text-dim)",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "currentColor",
        }}
      />
      {!isKnown ? "Provider unknown" : isRime ? "Rime" : "Fallback voice"}
    </div>
  );
}
