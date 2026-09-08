export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-ui)",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div>
        <div style={{ fontSize: 40, fontWeight: 600, color: "var(--line)", marginBottom: 8 }}>404</div>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>This screen doesn't exist</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18, maxWidth: 320, lineHeight: 1.5 }}>
          Fixer is a single-screen console — there's no separate page at this address.
        </div>
        <a href="/" style={{ fontSize: 13, color: "var(--listening)", textDecoration: "none" }}>
          Back to the console
        </a>
      </div>
    </div>
  );
}