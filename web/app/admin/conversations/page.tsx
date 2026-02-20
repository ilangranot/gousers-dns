"use client";
import { useEffect, useState } from "react";
import { getConversations, getConversation } from "@/lib/api";
import { Message } from "@/lib/types";
import { MessageSquare, ShieldAlert } from "lucide-react";

interface ConvSummary {
  id: string;
  title: string | null;
  gpt_target: string;
  user_email: string;
  message_count: number;
  blocked_count: number;
  updated_at: string;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#4e73df", anthropic: "#1cc88a", gemini: "#f6c23e",
};

export default function ConversationsPage() {
  const [convs, setConvs] = useState<ConvSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => { getConversations().then(setConvs).catch(console.error); }, []);

  async function open(id: string) {
    setSelected(id);
    setMessages(await getConversation(id));
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>Conversations</h1>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>Review user AI sessions</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* List */}
        <div style={{
          background: "#fff", borderRadius: 4,
          boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>
              All Conversations
            </h3>
          </div>
          <div style={{ overflowY: "auto", height: "calc(100vh - 240px)" }}>
            {convs.length === 0 && (
              <p style={{ textAlign: "center", padding: "40px 0", color: "#858796", fontSize: 13 }}>
                No conversations yet
              </p>
            )}
            {convs.map((c) => (
              <button
                key={c.id}
                onClick={() => open(c.id)}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "12px 16px",
                  borderBottom: "1px solid #f0f0f5",
                  background: selected === c.id ? "#f0f4ff" : "transparent",
                  borderLeft: `3px solid ${selected === c.id ? (PROVIDER_COLORS[c.gpt_target] ?? "#4e73df") : "transparent"}`,
                  cursor: "pointer", transition: "background 0.1s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#3d4465", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.title ?? "Untitled"}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#858796" }}>
                      {c.user_email} · <span style={{ textTransform: "capitalize" }}>{c.gpt_target}</span>
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#858796" }}>{c.message_count} msgs</p>
                    {c.blocked_count > 0 && (
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#e74a3b", fontWeight: 600 }}>
                        {c.blocked_count} blocked
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div style={{
          background: "#fff", borderRadius: 4,
          boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)",
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>
              {selected ? "Conversation Detail" : "Select a conversation"}
            </h3>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, maxHeight: "calc(100vh - 220px)" }}>
            {!selected && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", color: "#858796" }}>
                <MessageSquare size={40} style={{ opacity: 0.2, marginBottom: 8 }} />
                <p style={{ fontSize: 13 }}>Click a conversation to view messages</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 10, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%",
                  background: m.was_blocked ? "#fde8e8" : m.role === "user" ? "#e8f0fe" : "#f8f9fa",
                  border: `1px solid ${m.was_blocked ? "#f5c6cb" : m.role === "user" ? "#c3d4fb" : "#e9ecef"}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  color: m.was_blocked ? "#c0392b" : "#3d4465",
                }}>
                  <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 600, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {m.was_blocked ? <ShieldAlert size={10} style={{ display: "inline", marginRight: 3 }} /> : null}
                    {m.role}
                  </p>
                  {m.was_blocked ? `[Blocked] ${m.block_reason}` : m.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
