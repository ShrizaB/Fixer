import { TrackToggle, useLocalParticipant, BarVisualizer } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useState } from "react";
import { ArrowUp } from "lucide-react";

export default function MicToggle({ onUtterance, onBargeIn, agentState }) {
  const [draft, setDraft] = useState("");
  const { localParticipant } = useLocalParticipant();

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    if (agentState === "speaking" || agentState === "tool_running" || agentState === "thinking") {
      onBargeIn();
    }
    onUtterance(text);
    setDraft("");
  };

  const micTrack = localParticipant?.getTrackPublication(Track.Source.Microphone);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", position: "relative" }}>
        <TrackToggle source={Track.Source.Microphone} className="btn-icon" />
        
        {micTrack?.isMuted === false && (
          <div style={{ position: "absolute", bottom: "100%", left: 0, paddingBottom: 10 }}>
            <BarVisualizer 
              trackRef={{ participant: localParticipant, source: Track.Source.Microphone }} 
              barCount={5} 
              options={{ minHeight: 4 }} 
              style={{ height: 30, width: 50, color: "var(--danger)" }} 
            />
          </div>
        )}

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
        LiveKit Voice integrated. Click the mic to speak! Sending text
        while the agent is thinking, running a tool, or speaking simulates a barge-in.
      </div>
    </div>
  );
}
