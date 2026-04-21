"use client";
import { UserAgent } from "@/lib/types";

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#2da9e9",
  anthropic: "#0ec8a2",
  gemini: "#ff9e2a",
  ollama: "#9b59b6",
};

// Provider → emoji icon
const PROVIDER_ICONS: Record<string, string> = {
  openai: "⚡",
  anthropic: "💡",
  gemini: "✨",
  ollama: "🧠",
};

function getAgentColor(provider: string): string {
  return PROVIDER_COLORS[provider] ?? "#6c757d";
}

function getAgentIcon(agent: { provider: string; name: string }): string {
  // Check name for common keywords first for a more personalised icon
  const n = agent.name.toLowerCase();
  if (n.includes("sales") || n.includes("crm")) return "💼";
  if (n.includes("market") || n.includes("seo") || n.includes("content")) return "📣";
  if (n.includes("code") || n.includes("dev") || n.includes("engineer")) return "💻";
  if (n.includes("support") || n.includes("help") || n.includes("assist")) return "🎯";
  if (n.includes("data") || n.includes("analyt") || n.includes("report")) return "📊";
  if (n.includes("write") || n.includes("copy") || n.includes("blog")) return "✍️";
  if (n.includes("finance") || n.includes("account")) return "💰";
  if (n.includes("hr") || n.includes("recruit") || n.includes("people")) return "👥";
  if (n.includes("legal") || n.includes("compli")) return "⚖️";
  if (n.includes("design") || n.includes("creative") || n.includes("brand")) return "🎨";
  return PROVIDER_ICONS[agent.provider] ?? "🤖";
}

export default function AgentsRail({
  agents,
  activeId,
  onSwitch,
}: {
  agents: UserAgent[];
  activeId: string | null;
  onSwitch: (agentId: string | null) => void;
}) {
  const generalActive = activeId === null;

  return (
    <div
      style={{
        width: 64,
        minWidth: 64,
        background: "#1e2535",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 0",
        gap: 8,
        height: "100%",
        overflowY: "auto",
      }}
    >
      {/* General tab */}
      <button
        onClick={() => onSwitch(null)}
        title="General — chat without an agent"
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: generalActive ? "#4a5568" : "rgba(255,255,255,0.08)",
          border: generalActive ? "2px solid rgba(255,255,255,0.9)" : "2px solid transparent",
          boxShadow: generalActive ? "0 0 0 2px #4a5568" : "none",
          color: "#fff",
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
          outline: "none",
          flexShrink: 0,
        }}
        onMouseEnter={e => { if (!generalActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)"; }}
        onMouseLeave={e => { if (!generalActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
      >
        💬
      </button>

      {/* Divider */}
      {agents.length > 0 && (
        <div style={{ width: 28, height: 1, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
      )}

      {/* Agent buttons */}
      {agents.map(agent => {
        const color = getAgentColor(agent.provider);
        const icon = getAgentIcon(agent);
        const isActive = activeId === agent.id;
        return (
          <button
            key={agent.id}
            onClick={() => onSwitch(agent.id)}
            title={`${agent.name}${agent.description ? ` — ${agent.description}` : ""}`}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: isActive ? color : `${color}40`,
              border: isActive ? `2px solid rgba(255,255,255,0.9)` : "2px solid transparent",
              boxShadow: isActive ? `0 0 0 2px ${color}` : "none",
              color: "#fff",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              outline: "none",
              flexShrink: 0,
            }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = `${color}70`; }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = `${color}40`; }}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
