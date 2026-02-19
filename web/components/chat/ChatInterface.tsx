"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Plus, MessageSquare, Settings, ChevronDown, Sparkles } from "lucide-react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import MessageBubble from "./MessageBubble";
import SuggestionBar from "./SuggestionBar";
import OrgLogo from "@/components/ui/OrgLogo";
import { streamChat, getSessions, getMessages } from "@/lib/api";
import { Message, Session, GptTarget } from "@/lib/types";
import clsx from "clsx";

const PROVIDERS: { value: GptTarget; label: string; color: string }[] = [
  { value: "openai",    label: "ChatGPT", color: "text-emerald-400" },
  { value: "anthropic", label: "Claude",  color: "text-orange-400"  },
  { value: "gemini",    label: "Gemini",  color: "text-blue-400"    },
];

export default function ChatInterface() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<GptTarget>("openai");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getSessions().then(setSessions).catch(console.error);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  async function loadSession(id: string) {
    setActiveSession(id);
    const msgs = await getMessages(id);
    setMessages(msgs);
    setSuggestions([]);
  }

  async function newSession() {
    setActiveSession(null);
    setMessages([]);
    setSuggestions([]);
  }

  async function send(text?: string) {
    const content = text ?? input.trim();
    if (!content || loading) return;
    setInput("");
    setLoading(true);
    setSuggestions([]);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      session_id: activeSession ?? "",
      role: "user",
      content,
      was_blocked: false,
      block_reason: null,
      gpt_target: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);

    let assistantContent = "";
    const assistantId = crypto.randomUUID();
    let assistantAdded = false;

    const addAssistant = () => {
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
    };

    await streamChat(
      content,
      provider,
      activeSession,
      (chunk) => {
        if (!assistantAdded) { addAssistant(); assistantAdded = true; }
        assistantContent += chunk;
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId ? { ...msg, content: assistantContent } : msg
          )
        );
      },
      (sid) => {
        setActiveSession(sid);
        getSessions().then(setSessions);
        // Re-poll at 3s, 6s, 12s — Llama title generation can take a few seconds
        [3000, 6000, 12000].forEach((ms) =>
          setTimeout(() => getSessions().then(setSessions), ms)
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
            gpt_target: null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    );

    setLoading(false);
  }

  const currentProvider = PROVIDERS.find((p) => p.value === provider)!;
  // Show dots when waiting for AI — derived from messages so it's immune to batching
  const showTyping = loading && messages[messages.length - 1]?.role === "user";

  return (
    <div className="flex h-screen" style={{ background: "rgb(var(--bg-base))" }}>
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className="w-64 flex flex-col border-r"
        style={{
          background: "rgb(var(--bg-surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        {/* Logo */}
        <div
          className="px-4 py-4 border-b"
          style={{ borderColor: "rgb(var(--border))" }}
        >
          <OrgLogo size="md" />
        </div>

        {/* New chat */}
        <div className="p-3">
          <button
            onClick={newSession}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
            style={{ background: "rgb(var(--accent))", color: "white" }}
          >
            <Plus size={16} /> New Chat
          </button>
        </div>

        {/* Session list */}
        <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
          {sessions.length === 0 && (
            <p
              className="text-xs px-3 py-4 text-center"
              style={{ color: "rgb(var(--text-subtle))" }}
            >
              No conversations yet
            </p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm truncate transition-all duration-100 flex items-center gap-2"
              style={{
                background:
                  activeSession === s.id
                    ? "rgb(var(--bg-elevated))"
                    : "transparent",
                color:
                  activeSession === s.id
                    ? "rgb(var(--text))"
                    : "rgb(var(--text-muted))",
              }}
            >
              <MessageSquare size={14} className="shrink-0 opacity-60" />
              <span className="truncate">{s.title ?? "New conversation"}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div
          className="p-3 border-t flex items-center justify-between"
          style={{ borderColor: "rgb(var(--border))" }}
        >
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            <Settings size={13} /> Admin
          </Link>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="flex items-center justify-between px-6 py-3 border-b"
          style={{
            background: "rgb(var(--bg-surface))",
            borderColor: "rgb(var(--border))",
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: "rgb(var(--accent))" }} />
            <span
              className="text-sm font-medium"
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {activeSession ? "Conversation" : "New conversation"}
            </span>
          </div>

          <div className="relative">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as GptTarget)}
              className="appearance-none text-sm rounded-xl px-3 py-1.5 pr-8 cursor-pointer focus:outline-none border transition-colors"
              style={{
                background: "rgb(var(--bg-elevated))",
                color: "rgb(var(--text))",
                borderColor: "rgb(var(--border))",
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="absolute right-2.5 top-2.5 pointer-events-none"
              style={{ color: "rgb(var(--text-muted))" }}
            />
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "rgb(var(--accent) / 0.1)" }}
              >
                <Sparkles size={32} style={{ color: "rgb(var(--accent))" }} />
              </div>
              <p
                className="text-lg font-semibold"
                style={{ color: "rgb(var(--text))" }}
              >
                Ask anything
              </p>
              <p className="text-sm" style={{ color: "rgb(var(--text-muted))" }}>
                Powered by{" "}
                <span className={currentProvider.color}>
                  {currentProvider.label}
                </span>{" "}
                via GoUsers gateway
              </p>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {/* Typing indicator — derived from messages, immune to React batching */}
          {showTyping && (
            <div className="flex gap-3 px-4 py-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: "rgb(var(--accent))", color: "white" }}
              >
                AI
              </div>
              <div
                className="flex items-center gap-1 px-4 py-3 rounded-2xl rounded-bl-sm"
                style={{ background: "rgb(var(--bg-elevated))" }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{
                      background: "rgb(var(--text-muted))",
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <SuggestionBar suggestions={suggestions} onSelect={send} />

        {/* Input */}
        <div
          className="px-4 py-4 border-t"
          style={{ borderColor: "rgb(var(--border))" }}
        >
          <div
            className="flex gap-2 items-end rounded-2xl px-4 py-3 border transition-colors"
            style={{
              background: "rgb(var(--bg-surface))",
              borderColor: "rgb(var(--border))",
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Message ${currentProvider.label}...`}
              rows={1}
              className="flex-1 bg-transparent text-sm resize-none focus:outline-none"
              style={{
                color: "rgb(var(--text))",
              }}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="p-2 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              style={{ background: "rgb(var(--accent))", color: "white" }}
            >
              <Send size={16} />
            </button>
          </div>
          <p
            className="text-xs text-center mt-2"
            style={{ color: "rgb(var(--text-subtle))" }}
          >
            Messages filtered through Llama · GoUsers AI Gateway
          </p>
        </div>
      </main>
    </div>
  );
}
