"use client";
import { useState, useEffect } from "react";
import {
  Send,
  Plus,
  MessageSquare,
  Settings,
  ChevronDown,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  useMessage,
} from "@assistant-ui/react";
import SuggestionBar from "./SuggestionBar";
import OrgLogo from "@/components/ui/OrgLogo";
import { streamChat, getSessions, getMessages } from "@/lib/api";
import { Message, Session, GptTarget } from "@/lib/types";
import { convertMessage, extractText } from "@/lib/chat-runtime";
import type { AppendMessage } from "@assistant-ui/react";
import clsx from "clsx";

const PROVIDERS: { value: GptTarget; label: string }[] = [
  { value: "openai", label: "ChatGPT" },
  { value: "anthropic", label: "Claude" },
  { value: "gemini", label: "Gemini" },
];

// ── Message components ────────────────────────────────────────────────────────

function UserMsg() {
  return (
    <MessagePrimitive.Root className="flex justify-end gap-3 px-4 py-2">
      <div
        className="max-w-[75%] px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed"
        style={{ background: "rgb(var(--accent))", color: "white" }}
      >
        <MessagePrimitive.Content />
      </div>
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-1"
        style={{
          background: "rgb(var(--bg-elevated))",
          color: "rgb(var(--text-muted))",
        }}
      >
        You
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMsg() {
  const msg = useMessage();
  const custom = msg.metadata.custom as {
    was_blocked?: boolean;
    block_reason?: string | null;
    gpt_target?: string | null;
  };

  const providerLabel = custom.gpt_target
    ? (PROVIDERS.find((p) => p.value === custom.gpt_target)?.label ??
      custom.gpt_target)
    : null;

  return (
    <MessagePrimitive.Root className="flex gap-3 px-4 py-2">
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-1"
        style={{ background: "rgb(var(--accent))", color: "white" }}
      >
        AI
      </div>

      <div
        className={clsx(
          "flex flex-col gap-1",
          custom.was_blocked ? "max-w-[75%]" : "max-w-[75%]",
        )}
      >
        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {custom.was_blocked ? (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium border"
              style={{
                background: "rgb(var(--danger) / 0.15)",
                color: "rgb(var(--danger))",
                borderColor: "rgb(var(--danger) / 0.3)",
              }}
            >
              Blocked by AI Filter
            </span>
          ) : (
            <>
              {providerLabel && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium border"
                  style={{
                    background: "rgb(var(--accent) / 0.15)",
                    color: "rgb(var(--accent))",
                    borderColor: "rgb(var(--accent) / 0.3)",
                  }}
                >
                  {providerLabel}
                </span>
              )}
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium border"
                style={{
                  background: "rgb(var(--accent-2) / 0.12)",
                  color: "rgb(var(--text-muted))",
                  borderColor: "rgb(var(--accent-2) / 0.2)",
                }}
              >
                via Llama filter
              </span>
            </>
          )}
        </div>

        {/* Bubble */}
        {custom.was_blocked ? (
          <div
            className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed flex items-center gap-2"
            style={{
              background: "rgb(var(--danger) / 0.1)",
              border: "1px solid rgb(var(--danger) / 0.3)",
              color: "rgb(var(--danger))",
            }}
          >
            <ShieldAlert size={14} className="shrink-0" />
            <span className="italic">
              <MessagePrimitive.Content />
            </span>
          </div>
        ) : (
          <div
            className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "rgb(var(--bg-elevated))",
              color: "rgb(var(--text))",
            }}
          >
            <MessagePrimitive.Content
              components={{
                Text: ({ text }) => (
                  <pre className="whitespace-pre-wrap font-sans">{text}</pre>
                ),
              }}
            />
          </div>
        )}
      </div>
    </MessagePrimitive.Root>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatInterface() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [provider, setProvider] = useState<GptTarget>("openai");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    getSessions().then(setSessions).catch(console.error);
  }, []);

  async function loadSession(id: string) {
    setActiveSession(id);
    const msgs = await getMessages(id);
    setMessages(msgs);
    setSuggestions([]);
  }

  function newSession() {
    setActiveSession(null);
    setMessages([]);
    setSuggestions([]);
  }

  async function send(text: string) {
    if (!text || loading) return;
    setLoading(true);
    setSuggestions([]);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      session_id: activeSession ?? "",
      role: "user",
      content: text,
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
      text,
      provider,
      activeSession,
      (chunk) => {
        if (!assistantAdded) {
          addAssistant();
          assistantAdded = true;
        }
        assistantContent += chunk;
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: assistantContent }
              : msg,
          ),
        );
      },
      (sid) => {
        setActiveSession(sid);
        getSessions().then(setSessions);
        [3000, 6000, 12000].forEach((ms) =>
          setTimeout(() => getSessions().then(setSessions), ms),
        );
        setSuggestions([
          "Tell me more",
          "Can you elaborate?",
          "Give me an example",
        ]);
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
      },
    );

    setLoading(false);
  }

  const runtime = useExternalStoreRuntime<Message>({
    messages,
    isRunning: loading,
    onNew: async (msg: AppendMessage) => {
      await send(extractText(msg));
    },
    convertMessage: (msg, idx) => convertMessage(msg, idx, messages, loading),
  });

  const currentProvider = PROVIDERS.find((p) => p.value === provider)!;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
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

          {/* Thread */}
          <ThreadPrimitive.Root className="flex flex-col flex-1 min-h-0">
            <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto py-6">
              {/* Empty state */}
              <ThreadPrimitive.Empty>
                <div className="flex flex-col items-center justify-center h-full gap-3 min-h-[60vh]">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: "rgb(var(--accent) / 0.1)" }}
                  >
                    <Sparkles
                      size={32}
                      style={{ color: "rgb(var(--accent))" }}
                    />
                  </div>
                  <p
                    className="text-lg font-semibold"
                    style={{ color: "rgb(var(--text))" }}
                  >
                    Ask anything
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "rgb(var(--text-muted))" }}
                  >
                    Powered by{" "}
                    <span style={{ color: "rgb(var(--accent))" }}>
                      {currentProvider.label}
                    </span>{" "}
                    via GoUsers gateway
                  </p>
                </div>
              </ThreadPrimitive.Empty>

              <ThreadPrimitive.Messages
                components={{ UserMessage: UserMsg, AssistantMessage: AssistantMsg }}
              />
            </ThreadPrimitive.Viewport>

            <SuggestionBar suggestions={suggestions} onSelect={send} />

            {/* Composer */}
            <div
              className="px-4 py-4 border-t"
              style={{ borderColor: "rgb(var(--border))" }}
            >
              <ComposerPrimitive.Root
                className="flex gap-2 items-end rounded-2xl px-4 py-3 border transition-colors"
                style={{
                  background: "rgb(var(--bg-surface))",
                  borderColor: "rgb(var(--border))",
                }}
              >
                <ComposerPrimitive.Input
                  rows={1}
                  placeholder={`Message ${currentProvider.label}...`}
                  className="flex-1 bg-transparent text-sm resize-none focus:outline-none min-h-[24px] max-h-40"
                  style={{ color: "rgb(var(--text))" }}
                />
                <ComposerPrimitive.Send
                  disabled={loading}
                  className="p-2 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  style={{ background: "rgb(var(--accent))", color: "white" }}
                >
                  <Send size={16} />
                </ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
              <p
                className="text-xs text-center mt-2"
                style={{ color: "rgb(var(--text-subtle))" }}
              >
                Messages filtered through Llama · GoUsers AI Gateway
              </p>
            </div>
          </ThreadPrimitive.Root>
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
