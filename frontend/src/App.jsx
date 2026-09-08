import { useEffect, useRef, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { Menu, X } from "lucide-react";
import { createFixerClient } from "./lib/wsClient";
import StateDisplay from "./components/StateDisplay";
import ProviderIndicator from "./components/ProviderIndicator";
import MicToggle from "./components/MicToggle";
import Transcript from "./components/Transcript";
import DebugPanel from "./components/DebugPanel";
import ThemeToggle from "./components/ThemeToggle";
import Toast from "./components/Toast";
import NotFound from "./components/NotFound";

const WS_URL = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8787";
const HTTP_URL = WS_URL.replace("ws://", "http://").replace("wss://", "https://");
const THEME_KEY = "fixer-theme";

export default function App() {
  const [notFound] = useState(
    () => typeof window !== "undefined" && window.location.pathname !== "/" && window.location.pathname !== ""
  );

  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  const [token, setToken] = useState(null);
  const [liveKitUrl, setLiveKitUrl] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const [agentState, setAgentState] = useState("idle");
  const [activeTool, setActiveTool] = useState(null);
  const [provider, setProvider] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [log, setLog] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const clientRef = useRef(null);
  const knownTurnIds = useRef(new Set());
  const prevConnection = useRef("connecting");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const pushToast = (type, message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  useEffect(() => {
    if (notFound) return;

    fetch(`${HTTP_URL}/token`)
      .then((res) => {
        if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setToken(data.token);
        setLiveKitUrl(data.url);
      })
      .catch((err) => {
        console.error("Failed to fetch token:", err);
        setTokenError(err.message);
      });

    const client = createFixerClient(WS_URL, {
      onConnectionChange: (status) => {
        setConnection(status);
        if (status === "connected" && prevConnection.current !== "connected") {
          pushToast("success", "Connected to backend");
        } else if (status !== "connected" && prevConnection.current === "connected") {
          pushToast("error", "Lost connection to backend. Reconnecting…");
        }
        prevConnection.current = status;
      },
      onMessage: (msg) => {
        switch (msg.type) {
          case "state":
            setAgentState(msg.state);
            if (msg.state !== "tool_running") setActiveTool(null);
            break;
          case "provider":
            setProvider(msg.active);
            break;
          case "tool_call":
            setActiveTool(msg.tool);
            break;
          case "response":
            setTranscript((prev) => [
              ...prev,
              { id: `${msg.turnId}-r`, role: "agent", turnId: msg.turnId, text: msg.text },
            ]);
            break;
          case "log":
            setLog((prev) => [...prev, msg]);
            if (msg.event === "turn_started" && !knownTurnIds.current.has(msg.turnId)) {
              // Reflects a turn that started from ANY source — including real
              // speech transcribed by the voice pipeline, which never goes
              // through this tab's own handleUtterance. Without this, only
              // typed utterances would ever show up in the transcript.
              knownTurnIds.current.add(msg.turnId);
              const spokenText = msg.detail?.text;
              if (spokenText) {
                setTranscript((prev) => [
                  ...prev,
                  { id: `${msg.turnId}-u`, role: "user", turnId: msg.turnId, text: spokenText },
                ]);
              }
            }
            if (msg.event === "turn_superseded") {
              setTranscript((prev) =>
                prev.map((item) => (item.turnId === msg.turnId ? { ...item, superseded: true } : item))
              );
            }
            break;
          default:
            break;
        }
      },
    });
    clientRef.current = client;
    return () => client.close();
  }, [notFound]);

  const handleUtterance = (text) => {
    const turnId = clientRef.current.sendUtterance(text);
    knownTurnIds.current.add(turnId);
    setTranscript((prev) => [...prev, { id: `${turnId}-u`, role: "user", turnId, text }]);
    pushToast("success", "Message sent");
  };

  const handleBargeIn = () => {
    clientRef.current.sendInterrupt();
  };

  if (notFound) {
    return <NotFound />;
  }

  if (tokenError) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-ui)" }}>
        <div className="card" style={{ padding: "24px 28px", maxWidth: 420, textAlign: "center" }}>
          <div style={{ color: "var(--danger)", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Couldn't reach the backend</div>
          <div style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.5 }}>
            {tokenError}. Make sure the backend is running on <code style={{ fontFamily: "var(--font-mono)" }}>{HTTP_URL}</code>.
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-ui)", gap: 12 }}>
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid var(--line)",
            borderTopColor: "var(--listening)",
            animation: "fixer-spin 0.8s linear infinite",
          }}
        />
        <span style={{ fontSize: 14 }}>Connecting to LiveKit…</span>
        <style>{`@keyframes fixer-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={liveKitUrl}
      connect={true}
      audio={true}
      video={false}
      style={{ display: "grid", gridTemplateColumns: "1fr 380px", height: "100vh", minHeight: 0 }}
      className="app-shell"
    >
      <div style={{ display: "flex", flexDirection: "column", padding: "28px 32px", minWidth: 0, overflowX: "hidden" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 36, gap: 12 }}>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--text)",
                marginBottom: 6,
              }}
            >
              Fixer
            </div>
            <div style={{ fontSize: 14, color: "var(--text-dim)" }}>Voice-native incident triage</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
            <ConnectionDot status={connection} />
            <ProviderIndicator provider={provider} />
            <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === "light" ? "dark" : "light"))} />
            <button
              className="btn-icon mobile-menu-btn"
              style={{ width: 36, height: 36 }}
              onClick={() => setDrawerOpen(true)}
              aria-label="Open judge panel"
            >
              <Menu size={17} />
            </button>
          </div>
        </header>

        <div className="card" style={{ padding: "22px 24px", marginBottom: 24 }}>
          <StateDisplay state={agentState} activeTool={activeTool} />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", marginBottom: 20 }}>
          <Transcript items={transcript} />
        </div>

        <MicToggle onUtterance={handleUtterance} onBargeIn={handleBargeIn} agentState={agentState} />
      </div>

      <div className={`drawer-backdrop${drawerOpen ? " open" : ""}`} onClick={() => setDrawerOpen(false)} />

      <aside
        className={`app-aside${drawerOpen ? " open" : ""}`}
        style={{
          borderLeft: "1px solid var(--line)",
          background: "var(--panel)",
          padding: "28px 22px",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)" }}>
            Judge panel
          </div>
          <button
            className="btn-icon mobile-menu-btn"
            style={{ width: 28, height: 28 }}
            onClick={() => setDrawerOpen(false)}
            aria-label="Close judge panel"
          >
            <X size={15} />
          </button>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18, lineHeight: 1.5 }}>
          Live event log — proves turn versioning and stale-result discard as they happen.
        </div>
        <DebugPanel log={log} />
      </aside>
      <RoomAudioRenderer />
      <Toast toasts={toasts} />
    </LiveKitRoom>
  );
}

function ConnectionDot({ status }) {
  const color = status === "connected" ? "var(--speaking)" : status === "connecting" ? "var(--listening)" : "var(--danger)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-dim)" }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          boxShadow: status === "connected" ? `0 0 0 3px ${color}22` : "none",
          transition: "box-shadow 200ms ease",
        }}
      />
      backend: {status}
    </div>
  );
}