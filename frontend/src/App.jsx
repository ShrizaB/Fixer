import { useEffect, useRef, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { createFixerClient } from "./lib/wsClient";
import StateDisplay from "./components/StateDisplay";
import ProviderIndicator from "./components/ProviderIndicator";
import MicToggle from "./components/MicToggle";
import Transcript from "./components/Transcript";
import DebugPanel from "./components/DebugPanel";

const WS_URL = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8787";
const HTTP_URL = WS_URL.replace("ws://", "http://").replace("wss://", "https://");

export default function App() {
  const [token, setToken] = useState(null);
  const [liveKitUrl, setLiveKitUrl] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const [agentState, setAgentState] = useState("idle");
  const [activeTool, setActiveTool] = useState(null);
  const [provider, setProvider] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [log, setLog] = useState([]);
  const clientRef = useRef(null);

  useEffect(() => {
    // Fetch LiveKit token
    fetch(`${HTTP_URL}/token`)
      .then(res => res.json())
      .then(data => {
        setToken(data.token);
        setLiveKitUrl(data.url);
      })
      .catch(err => console.error("Failed to fetch token:", err));

    const client = createFixerClient(WS_URL, {
      onConnectionChange: setConnection,
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
  }, []);

  const handleUtterance = (text) => {
    const turnId = clientRef.current.sendUtterance(text);
    setTranscript((prev) => [...prev, { id: `${turnId}-u`, role: "user", turnId, text }]);
  };

  const handleBargeIn = () => {
    clientRef.current.sendInterrupt();
  };

  if (!token) return <div>Connecting to LiveKit...</div>;

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
      <div style={{ display: "flex", flexDirection: "column", padding: "28px 32px", minWidth: 0 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 36 }}>
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
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <ConnectionDot status={connection} />
            <ProviderIndicator provider={provider} />
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

      <aside
        className="app-aside"
        style={{
          borderLeft: "1px solid var(--line)",
          background: "var(--panel)",
          padding: "28px 22px",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
          Judge panel
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18, lineHeight: 1.5 }}>
          Live event log — proves turn versioning and stale-result discard as they happen.
        </div>
        <DebugPanel log={log} />
      </aside>
      <RoomAudioRenderer />
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
