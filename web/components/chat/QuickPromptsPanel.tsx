"use client";
import { Zap } from "lucide-react";

export default function QuickPromptsPanel({
  prompts,
  loading,
  onSelect,
  accentColor,
}: {
  prompts: string[];
  loading: boolean;
  onSelect: (prompt: string) => void;
  accentColor: string;
}) {
  return (
    <div style={{
      padding: "10px 20px 8px",
      borderTop: "1px solid #e8edf2",
      background: "#f8fafc",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Zap size={12} color={accentColor} />
        <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Quick Prompts
        </span>
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: "#b0bec5", padding: "4px 0" }}>Generating prompts…</div>
      ) : prompts.length === 0 ? (
        <div style={{ fontSize: 12, color: "#b0bec5" }}>No prompts available</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {prompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => onSelect(prompt)}
              style={{
                padding: "5px 12px", fontSize: 12, borderRadius: 14,
                border: `1px solid ${accentColor}30`,
                background: `${accentColor}0a`,
                color: accentColor,
                cursor: "pointer", fontWeight: 500, transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = `${accentColor}18`;
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${accentColor}60`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = `${accentColor}0a`;
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${accentColor}30`;
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
