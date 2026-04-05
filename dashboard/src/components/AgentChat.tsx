// Agent Chat — multi-agent collaboration channel
// Visible on dashboard so User can observe and intervene
import { useState, useRef, useEffect, useMemo } from "react";
import { useTheme } from "../theme";
import { registerSkill, type ViewProps } from "../skills-registry";

interface WsMessage {
  type: string;
  payload: unknown;
}

interface AgentMessage {
  id: string;
  from: string;
  text: string;
  timestamp: number;
  replyTo?: string;
}

interface Props {
  messages: WsMessage[];
  send: (type: string, payload: unknown) => void;
}

const AGENT_COLORS: Record<string, string> = {
  agent: "#6366f1",   // indigo
  remote: "#f59e0b",  // amber
  user: "#10b981",    // emerald
};

function getAgentColor(name: string): string {
  return AGENT_COLORS[name.toLowerCase()] ?? "#8b5cf6";
}

export function AgentChat({ messages, send }: Props) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  // Load history on mount
  useEffect(() => {
    fetch("/api/agent-chat?limit=100")
      .then(r => r.json())
      .then((msgs: AgentMessage[]) => {
        setHistory(msgs);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Append new agent-chat messages from WebSocket
  const wsMessages = useMemo(() => {
    return messages
      .filter(m => m.type === "agent-chat")
      .map(m => m.payload as AgentMessage);
  }, [messages]);

  // Merge history + live messages, dedupe by id
  const allMessages = useMemo(() => {
    const seen = new Set<string>();
    const merged: AgentMessage[] = [];
    for (const msg of [...history, ...wsMessages]) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id);
        merged.push(msg);
      }
    }
    return merged.sort((a, b) => a.timestamp - b.timestamp);
  }, [history, wsMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages]);

  const handleSend = () => {
    if (!input.trim()) return;
    send("agent-chat", { from: "user", text: input });
    setInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, height: "100%" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${theme.border}` }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: theme.text }}>Agent Collab</h2>
        <span style={{ fontSize: 11, color: theme.textFaint, marginTop: 2, display: "block" }}>
          Agent collaboration — you can observe and jump in
        </span>
      </div>

      <div style={{
        flex: 1,
        overflow: "auto",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column" as const,
        gap: 10,
      }}>
        {!loaded && (
          <div style={{ color: theme.textFaint, fontSize: 13, textAlign: "center" as const, marginTop: 40 }}>
            Loading...
          </div>
        )}
        {loaded && allMessages.length === 0 && (
          <div style={{ color: theme.textFaint, fontSize: 13, textAlign: "center" as const, marginTop: 40 }}>
            No agent messages yet. Agents can collaborate here.
          </div>
        )}
        {allMessages.map((msg) => {
          const isUser = msg.from.toLowerCase() === "user";
          const agentColor = getAgentColor(msg.from);
          return (
            <div key={msg.id} style={{
              maxWidth: "85%",
              alignSelf: isUser ? "flex-end" : "flex-start",
            }}>
              <div style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${isUser ? theme.userBubbleBorder : agentColor}40`,
                fontSize: 13,
                lineHeight: 1.5,
                background: isUser ? theme.userBubbleBg : `${agentColor}10`,
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: agentColor,
                  marginBottom: 2,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}>
                  {msg.from}
                </div>
                <div style={{ color: theme.text, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const }}>
                  {msg.text}
                </div>
                <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 4, textAlign: "right" as const }}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{
        display: "flex",
        gap: 8,
        padding: "12px 20px",
        borderTop: `1px solid ${theme.border}`,
        background: theme.bg,
      }}>
        <input
          style={{
            flex: 1,
            padding: "10px 14px",
            background: theme.inputBg,
            border: `1px solid ${theme.inputBorder}`,
            borderRadius: 8,
            color: theme.text,
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
          }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Jump in..."
        />
        <button style={{
          padding: "10px 20px",
          background: theme.buttonBg,
          color: theme.buttonText,
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 13,
          fontFamily: "inherit",
        }} onClick={handleSend}>
          Send
        </button>
      </div>
    </div>
  );
}

// Register as sidebar skill
registerSkill({
  id: "agent-chat",
  name: "Collab",
  icon: "⇄",
  surface: "sidebar",
  component: AgentChat as React.ComponentType<ViewProps>,
  order: 15,  // After Chat (10), before Events (20)
  core: true,
});
