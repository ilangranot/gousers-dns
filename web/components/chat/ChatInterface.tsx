"use client";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  KeyboardEvent,
} from "react";
import { Send, Plus, MessageSquare, Settings, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import OrgLogo from "@/components/ui/OrgLogo";
import SuggestionBar from "./SuggestionBar";
import { streamChat, getSessions, getMessages } from "@/lib/api";
import { Message, Session, GptTarget } from "@/lib/types";
import s from "./chat.module.css";

const PROVIDERS: { value: GptTarget; label: string; color: string; bubbleClass: string }[] = [
  { value: "openai",    label: "ChatGPT",    color: "#2da9e9", bubbleClass: s.bubbleInfo    },
  { value: "anthropic", label: "Claude",     color: "#0ec8a2", bubbleClass: s.bubbleSuccess },
  { value: "gemini",    label: "Gemini",     color: "#ff9e2a", bubbleClass: s.bubbleWarning },
];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── AI message ───────────────────────────────────────────────────────────────

function AIMessage({
  msg,
  isStreaming,
}: {
  msg: Message;
  isStreaming?: boolean;
}) {
  const provider = PROVIDERS.find((p) => p.value === msg.gpt_target);
  const bubbleClass = msg.was_blocked
    ? s.bubbleDanger
    : (provider?.bubbleClass ?? s.bubbleInfo);
  const avatarBg = msg.was_blocked
    ? "#f95858"
    : (provider?.color ?? "#2da9e9");
  const label = msg.was_blocked ? "AI" : (provider?.label ?? "AI");

  return (
    <div className={`${s.message} ${bubbleClass}`}>
      <div className={s.messageAvatar} style={{ backgroundColor: avatarBg }}>
        {label.slice(0, 2).toUpperCase()}
      </div>
      <div className={s.messageBubble}>
        <div className={s.messageHeader}>
          <h4 className={s.messageName}>{label}</h4>
          <span className={s.messageTime}>{formatTime(msg.created_at)}</span>
        </div>
        <hr className={s.messageDivider} />
        <div className={s.messageText}>
          {msg.was_blocked ? (
            <span className="flex items-center gap-1.5">
              <ShieldAlert size={14} className="shrink-0" />
              {msg.block_reason ?? "Message blocked by organization policy"}
            </span>
          ) : (
            <>
              {msg.content}
              {isStreaming && !msg.content && (
                <span className="inline-flex gap-1 ml-1">
                  <span className={s.typingDot} />
                  <span className={s.typingDot} />
                  <span className={s.typingDot} />
                </span>
              )}
              {isStreaming && msg.content && (
                <span className={s.streamCursor} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── User message ─────────────────────────────────────────────────────────────

function UserMessage({ msg }: { msg: Message }) {
  return (
    <div className={`${s.message} ${s.myMessage}`}>
      <div className={s.messageAvatar}>You</div>
      <div className={s.messageBubble}>
        <div className={s.messageHeader}>
          <h4 className={s.messageName} style={{ color: "#65addd" }}>You</h4>
          <span className={s.messageTime}>{formatTime(msg.created_at)}</span>
        </div>
        <hr className={s.messageDivider} />
        <div className={s.messageText} style={{ color: "#788288" }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator({ color }: { color: string }) {
  const bubbleClass = PROVIDERS.find((p) => p.color === color)?.bubbleClass ?? s.bubbleInfo;
  return (
    <div className={`${s.message} ${bubbleClass}`}>
      <div className={s.messageAvatar} style={{ backgroundColor: color }}>
        AI
      </div>
      <div className={s.messageBubble}>
        <div className={s.messageText}>
          <span className="inline-flex gap-1">
            <span className={s.typingDot} />
            <span className={s.typingDot} />
            <span className={s.typingDot} />
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ChatInterface() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [provider, setProvider] = useState<GptTarget>("openai");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const chatBodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentProvider = PROVIDERS.find((p) => p.value === provider)!;

  useEffect(() => {
    const el = chatBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  useEffect(() => {
    getSessions().then(setSessions).catch(console.error);
  }, []);

  async function loadSession(id: string) {
    setActiveSession(id);
    setMessages(await getMessages(id));
    setSuggestions([]);
  }

  function newSession() {
    setActiveSession(null);
    setMessages([]);
    setSuggestions([]);
    setInput("");
  }

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput("");
      setLoading(true);
      setSuggestions([]);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        session_id: activeSession ?? "",
        role: "user",
        content: trimmed,
        was_blocked: false,
        block_reason: null,
        gpt_target: null,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, userMsg]);

      let assistantContent = "";
      const assistantId = crypto.randomUUID();
      let assistantAdded = false;

      await streamChat(
        trimmed,
        provider,
        activeSession,
        (chunk) => {
          if (!assistantAdded) {
            setMessages((m) => [
              ...m,
              {
                id: assistantId,
                session_id: activeSession ?? "",
                role: "assistant",
                content: "",
                was_blocked: false,
                block_reason: null,
                gpt_target: provider,
                created_at: new Date().toISOString(),
              },
            ]);
            setStreamingId(assistantId);
            assistantAdded = true;
          }
          assistantContent += chunk;
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, content: assistantContent } : msg,
            ),
          );
        },
        (sid) => {
          setActiveSession(sid);
          getSessions().then(setSessions);
          [3000, 6000, 12000].forEach((ms) =>
            setTimeout(() => getSessions().then(setSessions), ms),
          );
          setSuggestions(["Tell me more", "Can you elaborate?", "Give me an example"]);
        },
        (reason) => {
          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              session_id: activeSession ?? "",
              role: "assistant",
              content: "",
              was_blocked: true,
              block_reason: reason,
              gpt_target: provider,
              created_at: new Date().toISOString(),
            },
          ]);
        },
      );

      setStreamingId(null);
      setLoading(false);
    },
    [loading, activeSession, provider],
  );

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const showTyping = loading && messages[messages.length - 1]?.role === "user";

  return (
    <div className={s.messagesPanel}>

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <div className={s.contactsList}>

        {/* Logo */}
        <div className="px-4 py-4 border-b" style={{ borderColor: "#cfdbe2" }}>
          <OrgLogo size="md" />
        </div>

        {/* Provider tabs */}
        <div className="flex w-full border-b" style={{ borderColor: "#cfdbe2" }}>
          {PROVIDERS.map((p, i) => (
            <button
              key={p.value}
              onClick={() => setProvider(p.value)}
              className="flex-1 py-3 text-xs font-bold text-center transition-colors"
              style={{
                color: provider === p.value ? "#fff" : p.color,
                background: provider === p.value ? p.color : "rgba(255,255,255,0.75)",
                borderBottom: `3px solid ${provider === p.value ? "rgba(0,0,0,0.15)" : p.color}`,
                borderRight: i < PROVIDERS.length - 1 ? "1px solid rgba(0,0,0,0.07)" : "none",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* New chat */}
        <div className="p-3 border-b" style={{ borderColor: "#e8edf2" }}>
          <button
            onClick={newSession}
            className="w-full flex items-center justify-center gap-2 py-2 rounded text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: currentProvider.color, color: "#fff" }}
          >
            <Plus size={15} /> New Chat
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {sessions.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: "#b0bec5" }}>
              No conversations yet
            </p>
          ) : (
            sessions.map((sess) => (
              <button
                key={sess.id}
                onClick={() => loadSession(sess.id)}
                className={`${s.contactItem} w-full text-left`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderBottom: "1px solid rgba(205,211,237,0.2)",
                  borderLeft: activeSession === sess.id ? `4px solid ${currentProvider.color}` : "4px solid transparent",
                  background: activeSession === sess.id ? "#fbfcff" : "transparent",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
              >
                <MessageSquare
                  size={16}
                  style={{ color: activeSession === sess.id ? currentProvider.color : "#b0bec5", flexShrink: 0 }}
                />
                <span
                  className="truncate text-sm"
                  style={{ color: activeSession === sess.id ? "#314557" : "#7a8fa6" }}
                >
                  {sess.title ?? "New conversation"}
                </span>
              </button>
            ))
          )}
        </div>

      </div>

      {/* ── Main panel ────────────────────────────────────────────── */}
      <div className={s.mainPanel}>

        {/* Header */}
        <div
          className="flex items-center px-6 py-3 border-b"
          style={{
            background: "linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%)",
            borderColor: "rgba(255,255,255,0.12)",
            flexShrink: 0,
          }}
        >
          <div className="flex items-center gap-2 flex-1">
            <div
              className="w-3 h-3 rounded-full border border-white/30"
              style={{ background: currentProvider.color }}
            />
            <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>
              {activeSession ? "Conversation" : "New conversation"}
            </span>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-semibold ml-2"
              style={{ background: `${currentProvider.color}30`, color: currentProvider.color, border: `1px solid ${currentProvider.color}50` }}
            >
              {currentProvider.label}
            </span>
          </div>
          {/* Icons pinned to far right */}
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              title="Admin Panel"
              className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
              style={{ color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.08)" }}
            >
              <Settings size={16} />
            </Link>
            <UserButton />
          </div>
        </div>

        {/* Chat body */}
        <div ref={chatBodyRef} className={s.chatBody}>
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 min-h-64">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-lg font-bold border-2"
                style={{ background: currentProvider.color, borderColor: `${currentProvider.color}50` }}
              >
                AI
              </div>
              <p className="text-lg font-semibold" style={{ color: "#314557" }}>
                How can I help you today?
              </p>
              <p className="text-sm" style={{ color: "#a2b8c5" }}>
                Powered by {currentProvider.label} · GoUsers AI Gateway
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <UserMessage key={msg.id} msg={msg} />
                ) : (
                  <AIMessage
                    key={msg.id}
                    msg={msg}
                    isStreaming={streamingId === msg.id}
                  />
                ),
              )}
              {showTyping && <TypingIndicator color={currentProvider.color} />}
            </>
          )}
        </div>

        {/* Composer — always pinned at bottom */}
        <div className={s.composerArea}>
          {suggestions.length > 0 && (
            <div className="px-20">
              <SuggestionBar suggestions={suggestions} onSelect={send} />
            </div>
          )}
          <div className={s.chatFooter}>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${currentProvider.label}…`}
              disabled={loading}
              className={s.sendTextarea}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className={s.sendButton}
              style={{ background: currentProvider.color }}
            >
              <Send size={15} />
            </button>
          </div>
          <p className="text-xs text-center pb-3" style={{ color: "#c5d0d8" }}>
            Messages filtered through Llama · GoUsers AI Gateway
          </p>
        </div>
      </div>
    </div>
  );
}
