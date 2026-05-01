"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getWhatsAppConversation, sendWhatsAppMessage } from "@/lib/api";
import { ArrowLeft, Send, Bot, User } from "lucide-react";

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  wa_message_id: string | null;
  status: string;
  was_filtered: boolean;
  filter_reason: string | null;
  ai_intervened: boolean;
  created_at: string;
};

type Conversation = {
  id: string;
  wa_contact_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  status: string;
  last_message_at: string;
};

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const data = await getWhatsAppConversation(id);
      setConversation(data.conversation);
      setMessages(data.messages);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
    const poll = setInterval(load, 15000); // poll every 15s for new messages
    return () => clearInterval(poll);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError("");
    try {
      await sendWhatsAppMessage(id, draft.trim());
      setDraft("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  const contactLabel = conversation
    ? conversation.contact_name || conversation.contact_phone || conversation.wa_contact_id
    : "Loading…";

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "#fff", borderRadius: "8px 8px 0 0",
        border: "1px solid #dee2e6", borderBottom: "none",
        padding: "14px 20px",
      }}>
        <button
          onClick={() => router.push("/admin/whatsapp?tab=conversations")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#6c757d", display: "flex", alignItems: "center" }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "#343a40" }}>{contactLabel}</div>
          {conversation?.contact_name && (
            <div style={{ fontSize: 12, color: "#6c757d" }}>{conversation.contact_phone}</div>
          )}
        </div>
        <button
          onClick={load}
          style={{
            marginLeft: "auto", background: "none", border: "1px solid #dee2e6",
            borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#6c757d",
          }}
        >
          Refresh
        </button>
      </div>

      {/* Message thread */}
      <div style={{
        flex: 1, overflowY: "auto",
        background: "#f0f2f5",
        border: "1px solid #dee2e6",
        padding: "16px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#6c757d", fontSize: 13, marginTop: 40 }}>
            No messages yet.
          </div>
        )}

        {messages.map(msg => {
          const isInbound = msg.direction === "inbound";
          return (
            <div key={msg.id} style={{
              display: "flex",
              flexDirection: isInbound ? "row" : "row-reverse",
              alignItems: "flex-end",
              gap: 8,
            }}>
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: isInbound ? "#dee2e6" : (msg.ai_intervened ? "#d1ecf1" : "#007bff"),
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {isInbound
                  ? <User size={14} color="#6c757d" />
                  : msg.ai_intervened
                    ? <Bot size={14} color="#0c5460" />
                    : <User size={14} color="#fff" />}
              </div>

              {/* Bubble */}
              <div style={{
                maxWidth: "70%",
                background: isInbound ? "#fff" : (msg.ai_intervened ? "#d1ecf1" : "#007bff"),
                color: isInbound ? "#343a40" : (msg.ai_intervened ? "#0c5460" : "#fff"),
                borderRadius: isInbound ? "12px 12px 12px 2px" : "12px 12px 2px 12px",
                padding: "10px 14px",
                fontSize: 14,
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                position: "relative",
              }}>
                {/* Filtered badge */}
                {msg.was_filtered && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, background: "#fde8e8",
                    color: "#c0392b", padding: "1px 6px", borderRadius: 8,
                    display: "inline-block", marginBottom: 4,
                  }}>
                    {msg.filter_reason || "Filtered"}
                  </div>
                )}

                <div style={{ lineHeight: 1.5 }}>{msg.content}</div>

                <div style={{
                  fontSize: 10, marginTop: 4, opacity: 0.7,
                  display: "flex", alignItems: "center", gap: 4,
                  justifyContent: isInbound ? "flex-start" : "flex-end",
                }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {msg.ai_intervened && <span>· AI</span>}
                  {!isInbound && msg.status === "failed" && <span style={{ color: "#dc3545" }}>· Failed</span>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#fde8e8", border: "1px solid #f5c6cb", borderTop: "none", padding: "8px 16px", fontSize: 13, color: "#721c24" }}>
          {error}
        </div>
      )}

      {/* Reply input */}
      <form
        onSubmit={handleSend}
        style={{
          display: "flex", gap: 8,
          background: "#fff",
          border: "1px solid #dee2e6", borderTop: "none",
          borderRadius: "0 0 8px 8px",
          padding: "12px 16px",
        }}
      >
        <input
          style={{
            flex: 1, padding: "10px 14px", fontSize: 14,
            border: "1px solid #d1d3e2", borderRadius: 20,
            outline: "none", color: "#343a40",
          }}
          placeholder="Type a message…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          style={{
            background: "#25D366", border: "none", borderRadius: "50%",
            width: 42, height: 42, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: (sending || !draft.trim()) ? 0.5 : 1,
          }}
        >
          <Send size={18} color="#fff" />
        </button>
      </form>
    </div>
  );
}
