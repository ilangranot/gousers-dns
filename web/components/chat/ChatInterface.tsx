"use client";
import {
  useState, useEffect, useRef, useCallback, KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send, Plus, MessageSquare, Settings, ShieldAlert, LogOut, Pencil, Check, X,
  EyeOff, Eye, CheckSquare, Users, User, Calendar, Bell, Briefcase, FileText,
  MoreVertical, Archive, Trash2, ArchiveRestore, RotateCcw, ChevronDown, ChevronRight,
  ArrowLeft, PlusCircle, Zap, Sun, Bot,
} from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import OrgLogo from "@/components/ui/OrgLogo";
import {
  streamChat, streamChatIncognito,
  getSessions, getArchivedSessions, getMessages,
  renameSession, archiveSession, deleteSession,
  getNotes, updateNote,
  getCards, createCard, updateCard, deleteCard, restoreCard, getCardSession,
  getAgentContext, getAgentStarters,
  getUserAgents, setActiveAgent, getAgentGoals, saveAgentGoals, getAgentQuickPrompts,
  deploySite, getSiteUrl,
} from "@/lib/api";
import { Message, Session, GptTarget, Note, Card, AgentContext, UserAgent, AgentGoals } from "@/lib/types";
import AgentsRail from "./AgentsRail";
import AgentOnboardingWizard from "./AgentOnboardingWizard";
import QuickPromptsPanel from "./QuickPromptsPanel";
import AgentTaskPanel from "@/components/agent/AgentTaskPanel";
import s from "./chat.module.css";

// ── Providers ─────────────────────────────────────────────────────────────────

const PROVIDERS: { value: GptTarget; label: string; color: string; bubbleClass: string }[] = [
  { value: "openai",    label: "ChatGPT",    color: "#2da9e9", bubbleClass: s.bubbleInfo    },
  { value: "anthropic", label: "Claude",     color: "#0ec8a2", bubbleClass: s.bubbleSuccess },
  { value: "gemini",    label: "Gemini",     color: "#ff9e2a", bubbleClass: s.bubbleWarning },
];

// ── Card config ───────────────────────────────────────────────────────────────

const CARD_CONFIGS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  task:     { label: "Task",     color: "#4e73df", bg: "#eef2ff", icon: <CheckSquare size={13} /> },
  customer: { label: "Customer", color: "#1cc88a", bg: "#e6fff5", icon: <Users size={13} /> },
  contact:  { label: "Contact",  color: "#36b9cc", bg: "#e6f9fc", icon: <User size={13} /> },
  event:    { label: "Event",    color: "#f6a623", bg: "#fff8e1", icon: <Calendar size={13} /> },
  reminder: { label: "Reminder", color: "#9b59b6", bg: "#f5eeff", icon: <Bell size={13} /> },
  project:  { label: "Project",  color: "#e83e8c", bg: "#ffe8f3", icon: <Briefcase size={13} /> },
  note:     { label: "Note",     color: "#fd7e14", bg: "#fff3e8", icon: <FileText size={13} /> },
};
function cardCfg(type: string) {
  return CARD_CONFIGS[type] ?? { label: type, color: "#6c757d", bg: "#f8f9fa", icon: <FileText size={13} /> };
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

interface ParsedCard { type: string; title: string; fields?: Record<string, string> }
interface ParsedPlan { title: string; steps: string[]; current: number }
interface ParsedSiteDeploy { title: string; html: string }

function parseMessageContent(content: string, isStreaming: boolean): {
  text: string; cards: ParsedCard[]; suggestions: string[]; retitle: string | null; plan: ParsedPlan | null; siteDeploy: ParsedSiteDeploy | null;
} {
  const cards: ParsedCard[] = [];
  let suggestions: string[] = [];
  let retitle: string | null = null;
  let plan: ParsedPlan | null = null;
  let siteDeploy: ParsedSiteDeploy | null = null;

  let text = content.replace(/<card>([\s\S]*?)<\/card>/g, (_m, json) => {
    try { const d = JSON.parse(json.trim()); if (d.type && d.title) cards.push(d); } catch {}
    return "";
  });
  text = text.replace(/<card-update>[\s\S]*?<\/card-update>/g, "");
  text = text.replace(/<plan>([\s\S]*?)<\/plan>/g, (_m, json) => {
    try { const d = JSON.parse(json.trim()); if (d.title && Array.isArray(d.steps)) plan = { title: d.title, steps: d.steps, current: d.current ?? 0 }; } catch {}
    return "";
  });
  text = text.replace(/<suggestions>([\s\S]*?)<\/suggestions>/g, (_m, json) => {
    try { const arr = JSON.parse(json.trim()); if (Array.isArray(arr)) suggestions = arr.map(String); } catch {}
    return "";
  });
  text = text.replace(/<retitle>([\s\S]*?)<\/retitle>/g, (_m, title) => {
    retitle = title.trim();
    return "";
  });
  // Extract <site-deploy title="...">html</site-deploy> — must find last closing tag
  // to handle nested HTML tags inside
  text = text.replace(/<site-deploy\s+title="([^"]*)">([\s\S]*?)<\/site-deploy>/g, (_m, title, html) => {
    siteDeploy = { title: title.trim() || "Generated Site", html: html.trim() };
    return "";
  });
  if (isStreaming) {
    // Strip incomplete special tags that appear during streaming
    text = text.replace(/<(?:card|card-update|plan|suggestions|retitle|site-deploy)[\s\S]*$/, "");
  }
  return { text: text.trim(), cards, suggestions, retitle, plan, siteDeploy };
}

function parseCardUpdate(content: string): Record<string, unknown> | null {
  const m = content.match(/<card-update>([\s\S]*?)<\/card-update>/);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}

// ── ObjectCard (in message bubble) ───────────────────────────────────────────

function ObjectCard({ card }: { card: ParsedCard }) {
  const cfg = cardCfg(card.type);
  const fields = Object.entries(card.fields ?? {}).filter(([, v]) => v);
  return (
    <div style={{ marginTop: 10, borderRadius: 8, border: `1px solid ${cfg.color}25`, borderLeft: `4px solid ${cfg.color}`, background: cfg.bg, padding: "10px 14px", maxWidth: 400 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ color: cfg.color, display: "flex" }}>{cfg.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.07em" }}>{cfg.label}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#27ae60", fontWeight: 600, background: "#d4edda", borderRadius: 10, padding: "1px 8px" }}>✓ Saved</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#2d3748", marginBottom: fields.length ? 8 : 0 }}>{card.title}</div>
      {fields.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {fields.map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 8, fontSize: 11 }}>
              <span style={{ color: "#718096", fontWeight: 600, textTransform: "capitalize", whiteSpace: "nowrap", minWidth: 60 }}>{k.replace(/_/g, " ")}:</span>
              <span style={{ color: "#4a5568" }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AgentPlan (step tracker rendered inside AI messages) ──────────────────────

function AgentPlan({ plan }: { plan: ParsedPlan }) {
  return (
    <div style={{ marginTop: 10, marginBottom: 4, borderRadius: 8, border: "1px solid rgba(45,169,233,0.2)", background: "rgba(45,169,233,0.06)", padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#2da9e9", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        📋 {plan.title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {plan.steps.map((step, i) => {
          const done = i < plan.current;
          const active = i === plan.current;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                background: done ? "#0ec8a2" : active ? "#2da9e9" : "rgba(0,0,0,0.07)",
                color: done || active ? "#fff" : "#a0aab4", marginTop: 1,
              }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{
                fontSize: 12, lineHeight: 1.5,
                color: done ? "#a0aab4" : active ? "#314557" : "#b0bec5",
                fontWeight: active ? 600 : 400,
                textDecoration: done ? "line-through" : "none",
              }}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── SidebarCard ───────────────────────────────────────────────────────────────

function SidebarCardRow({
  card, subtasks, onClick, onRemove, activeCardId,
}: {
  card: Card;
  subtasks: Card[];
  onClick: () => void;
  onRemove: () => void;
  activeCardId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const cfg = cardCfg(card.type);
  const isActive = activeCardId === card.id;
  const topFields = Object.entries(card.fields ?? {}).filter(([, v]) => v).slice(0, 1);

  return (
    <div>
      <div
        onClick={onClick}
        style={{
          display: "flex", alignItems: "flex-start", gap: 7, padding: "6px 8px", marginBottom: 2,
          borderRadius: 6, borderLeft: `3px solid ${isActive ? cfg.color : cfg.color + "90"}`,
          background: isActive ? cfg.bg : "#f8fafc",
          cursor: "pointer", transition: "background 0.1s",
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = cfg.bg; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
      >
        <span style={{ color: cfg.color, display: "flex", flexShrink: 0, marginTop: 2 }}>{cfg.icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>{cfg.label}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#314557", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.title}</div>
          {topFields.map(([k, v]) => (
            <div key={k} style={{ fontSize: 10, color: "#7a8fa6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}: </span>{String(v)}
            </div>
          ))}
          {subtasks.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setOpen(!open); }}
              style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2, fontSize: 9, color: "#a0aab4", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
              {subtasks.length} subtask{subtasks.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Remove"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#c5d0d8", padding: 0, flexShrink: 0, lineHeight: 1, marginTop: 2 }}
          onMouseEnter={e => (e.currentTarget.style.color = "#e74a3b")}
          onMouseLeave={e => (e.currentTarget.style.color = "#c5d0d8")}
        >
          <X size={10} />
        </button>
      </div>

      {/* Subtasks */}
      {open && subtasks.map(sub => (
        <div key={sub.id} style={{ marginLeft: 14, paddingLeft: 4, borderLeft: "1px dashed #d0dae5" }}>
          <SidebarCardRow
            card={sub}
            subtasks={[]}
            onClick={onClick}
            onRemove={onRemove}
            activeCardId={activeCardId}
          />
        </div>
      ))}
    </div>
  );
}

// ── DeletedCard ───────────────────────────────────────────────────────────────

function DeletedSidebarCard({ card, onRestore, onPermanentDelete }: { card: Card; onRestore: () => void; onPermanentDelete: () => void }) {
  const cfg = cardCfg(card.type);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", marginBottom: 2, borderRadius: 6, borderLeft: `3px solid ${cfg.color}50`, background: "#f8f9fa", opacity: 0.75 }}>
      <span style={{ color: `${cfg.color}70`, display: "flex", flexShrink: 0 }}>{cfg.icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: `${cfg.color}80`, textTransform: "uppercase" }}>{cfg.label}</div>
        <div style={{ fontSize: 11, color: "#8a95a0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "line-through" }}>{card.title}</div>
      </div>
      <button onClick={onRestore} title="Restore" style={{ background: "none", border: "none", cursor: "pointer", color: "#1cc88a", padding: 2, display: "flex" }}><RotateCcw size={11} /></button>
      <button onClick={onPermanentDelete} title="Delete permanently" style={{ background: "none", border: "none", cursor: "pointer", color: "#c5d0d8", padding: 2, display: "flex" }}
        onMouseEnter={e => (e.currentTarget.style.color = "#e74a3b")}
        onMouseLeave={e => (e.currentTarget.style.color = "#c5d0d8")}
      ><Trash2 size={11} /></button>
    </div>
  );
}

// ── NoteCard ──────────────────────────────────────────────────────────────────

function NoteCard({ content, onChange, saving }: { content: string; onChange: (v: string) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false);
  const cfg = CARD_CONFIGS.note;
  return (
    <div style={{ padding: "6px 8px", marginBottom: 3, borderRadius: 6, borderLeft: `3px solid ${cfg.color}`, background: cfg.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: editing ? 4 : 2 }}>
        <span style={{ color: cfg.color, display: "flex" }}><FileText size={11} /></span>
        <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>Note</span>
        {saving && <span style={{ fontSize: 9, color: "#b0bec5", marginLeft: "auto" }}>Saving…</span>}
      </div>
      {editing ? (
        <textarea autoFocus value={content} onChange={e => onChange(e.target.value)} onBlur={() => setEditing(false)} rows={4} placeholder="Write a note…"
          style={{ width: "100%", fontSize: 11, border: "none", background: "transparent", outline: "none", resize: "vertical", fontFamily: "inherit", color: "#4a5568", lineHeight: 1.5, boxSizing: "border-box" }} />
      ) : (
        <div onClick={() => setEditing(true)} style={{ fontSize: 11, color: content ? "#4a5568" : "#b0bec5", cursor: "text", minHeight: 18, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {content || "Click to add a note…"}
        </div>
      )}
    </div>
  );
}

// ── Format helpers ────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " at " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatMsgTimestamp(iso: string) {
  const d = new Date(iso), today = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === today.toDateString() ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}
function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date(), yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
function isoDay(iso: string) { return new Date(iso).toDateString(); }

// ── Message bubble ────────────────────────────────────────────────────────────

function AIMessage({
  msg, isStreaming, onSuggestion,
}: {
  msg: Message; isStreaming?: boolean; onSuggestion?: (s: string) => void;
}) {
  const provider = PROVIDERS.find(p => p.value === msg.gpt_target);
  const bubbleClass = msg.was_blocked ? s.bubbleDanger : (provider?.bubbleClass ?? s.bubbleInfo);
  const avatarBg = msg.was_blocked ? "#f95858" : (provider?.color ?? "#2da9e9");
  const label = msg.was_blocked ? "AI" : (provider?.label ?? "AI");
  const { text, cards, suggestions, plan } = parseMessageContent(msg.content, !!isStreaming);

  return (
    <div>
      <div className={`${s.message} ${bubbleClass}`}>
        <div className={s.messageAvatar} style={{ backgroundColor: avatarBg }}>{label.slice(0, 2).toUpperCase()}</div>
        <div className={s.messageBubble}>
          <div className={s.messageHeader}>
            <h4 className={s.messageName}>{label}</h4>
            <span className={s.messageTime}>{formatMsgTimestamp(msg.created_at)}</span>
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
                {text ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                ) : isStreaming ? (
                  <span className="inline-flex gap-1"><span className={s.typingDot} /><span className={s.typingDot} /><span className={s.typingDot} /></span>
                ) : null}
                {isStreaming && text && <span className={s.streamCursor} />}
                {plan && <AgentPlan plan={plan} />}
                {cards.map((card, i) => <ObjectCard key={i} card={card} />)}
              </>
            )}
          </div>
        </div>
      </div>
      {/* Suggestion buttons — shown after streaming completes */}
      {!isStreaming && !msg.was_blocked && suggestions.length > 0 && onSuggestion && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 10, paddingLeft: 48 }}>
          {suggestions.map((sug, i) => (
            <button
              key={i}
              onClick={() => onSuggestion(sug)}
              className={s.suggestionBtn}
              style={{
                border: `1.5px solid ${provider?.color ?? "#2da9e9"}50`,
                background: `${provider?.color ?? "#2da9e9"}08`,
                color: provider?.color ?? "#2da9e9",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${provider?.color ?? "#2da9e9"}18`;
                e.currentTarget.style.borderColor = `${provider?.color ?? "#2da9e9"}`;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = `${provider?.color ?? "#2da9e9"}08`;
                e.currentTarget.style.borderColor = `${provider?.color ?? "#2da9e9"}50`;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {sug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMessage({ msg }: { msg: Message }) {
  return (
    <div className={`${s.message} ${s.myMessage}`}>
      <div className={s.messageAvatar}>You</div>
      <div className={s.messageBubble}>
        <div className={s.messageHeader}>
          <h4 className={s.messageName} style={{ color: "#65addd" }}>You</h4>
          <span className={s.messageTime}>{formatMsgTimestamp(msg.created_at)}</span>
        </div>
        <hr className={s.messageDivider} />
        <div className={s.messageText} style={{ color: "#788288" }}>{msg.content}</div>
      </div>
    </div>
  );
}

function TypingIndicator({ color }: { color: string }) {
  const bubbleClass = PROVIDERS.find(p => p.color === color)?.bubbleClass ?? s.bubbleInfo;
  return (
    <div className={`${s.message} ${bubbleClass}`}>
      <div className={s.messageAvatar} style={{ backgroundColor: color }}>AI</div>
      <div className={s.messageBubble}>
        <div className={s.messageText}>
          <span className="inline-flex gap-1"><span className={s.typingDot} /><span className={s.typingDot} /><span className={s.typingDot} /></span>
        </div>
      </div>
    </div>
  );
}

// ── Card Detail View ──────────────────────────────────────────────────────────

function CardDetailView({
  card,
  subtasks,
  allCards,
  onBack,
  onUpdate,
  onOpenCard,
  provider,
  currentProvider,
}: {
  card: Card;
  subtasks: Card[];
  allCards: Card[];
  onBack: () => void;
  onUpdate: (updated: Card) => void;
  onOpenCard: (card: Card) => void;
  provider: GptTarget;
  currentProvider: { value: GptTarget; label: string; color: string; bubbleClass: string };
}) {
  const cfg = cardCfg(card.type);

  // Editable state
  const [title, setTitle] = useState(card.title);
  const [fields, setFields] = useState<Record<string, string>>(card.fields ?? {});
  const [notes, setNotes] = useState(card.notes ?? "");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldVal, setNewFieldVal] = useState("");
  const [addingField, setAddingField] = useState(false);
  const [saving, setSaving] = useState(false);

  // Chat for this card
  const [chatSessionId, setChatSessionId] = useState<string | null>(card.chat_session_id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Subtask modal
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskType, setSubtaskType] = useState("task");
  const [subtaskTitle, setSubtaskTitle] = useState("");

  // Notes save timer
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(card.title);
    setFields(card.fields ?? {});
    setNotes(card.notes ?? "");
    setChatSessionId(card.chat_session_id);
  }, [card.id]);

  // Load chat session + messages on mount / card change
  useEffect(() => {
    async function initChatSession() {
      let sid = card.chat_session_id;
      if (!sid) {
        const res = await getCardSession(card.id).catch(() => null);
        if (res?.session_id) {
          sid = res.session_id;
          setChatSessionId(sid);
          onUpdate({ ...card, chat_session_id: sid });
        }
      }
      if (sid) {
        const msgs = await getMessages(sid).catch(() => []);
        setMessages(msgs);
      }
    }
    initChatSession();
  }, [card.id]);

  useEffect(() => {
    if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  async function saveTitle() {
    if (title === card.title) return;
    setSaving(true);
    try {
      const updated = await updateCard(card.id, { title });
      onUpdate(updated as Card);
    } finally { setSaving(false); }
  }

  async function saveField(key: string, val: string) {
    const newFields = { ...fields, [key]: val };
    setFields(newFields);
    setEditingField(null);
    const updated = await updateCard(card.id, { fields: newFields }).catch(() => null);
    if (updated) onUpdate(updated as Card);
  }

  async function removeField(key: string) {
    const newFields = { ...fields };
    delete newFields[key];
    setFields(newFields);
    const updated = await updateCard(card.id, { fields: newFields }).catch(() => null);
    if (updated) onUpdate(updated as Card);
  }

  async function addField() {
    if (!newFieldKey.trim()) return;
    const newFields = { ...fields, [newFieldKey.trim().toLowerCase().replace(/\s+/g, "_")]: newFieldVal };
    setFields(newFields);
    setNewFieldKey(""); setNewFieldVal(""); setAddingField(false);
    const updated = await updateCard(card.id, { fields: newFields }).catch(() => null);
    if (updated) onUpdate(updated as Card);
  }

  function handleNotesChange(val: string) {
    setNotes(val);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(async () => {
      const updated = await updateCard(card.id, { notes: val }).catch(() => null);
      if (updated) onUpdate(updated as Card);
    }, 800);
  }

  async function addSubtask() {
    if (!subtaskTitle.trim()) return;
    const newCard = await createCard({
      type: subtaskType,
      title: subtaskTitle.trim(),
      parent_id: card.id,
      origin_session_id: null,
    }).catch(() => null);
    if (newCard) {
      onUpdate({ ...card }); // trigger refresh
    }
    setSubtaskTitle(""); setAddingSubtask(false);
  }

  // Send message to card chat
  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    setLoading(true);

    const userMsg: Message = {
      id: crypto.randomUUID(), session_id: chatSessionId ?? "", role: "user",
      content: trimmed, was_blocked: false, block_reason: null, gpt_target: null,
      created_at: new Date().toISOString(),
    };
    setMessages(m => [...m, userMsg]);

    let assistantContent = "";
    const assistantId = crypto.randomUUID();
    let assistantAdded = false;

    const onChunk = (chunk: string) => {
      if (!assistantAdded) {
        setMessages(m => [...m, {
          id: assistantId, session_id: chatSessionId ?? "", role: "assistant",
          content: "", was_blocked: false, block_reason: null, gpt_target: provider,
          created_at: new Date().toISOString(),
        }]);
        setStreamingId(assistantId);
        assistantAdded = true;
      }
      assistantContent += chunk;
      setMessages(m => m.map(msg => msg.id === assistantId ? { ...msg, content: assistantContent } : msg));
    };

    const onDone = async (sid: string) => {
      setStreamingId(null);
      setLoading(false);

      // Parse card-update and apply
      const updateData = parseCardUpdate(assistantContent);
      if (updateData) {
        const patch: Record<string, unknown> = {};
        if (updateData.title) patch.title = updateData.title;
        if (updateData.fields) patch.fields = { ...fields, ...(updateData.fields as Record<string, string>) };
        if (updateData.notes) patch.notes = updateData.notes;
        if (Object.keys(patch).length) {
          const updated = await updateCard(card.id, patch as Parameters<typeof updateCard>[1]).catch(() => null);
          if (updated) {
            onUpdate(updated as Card);
            if (patch.title) setTitle((updated as Card).title);
            if (patch.fields) setFields((updated as Card).fields ?? {});
            if (patch.notes) setNotes((updated as Card).notes ?? "");
          }
        }
      }

      // Parse <card> blocks as subtasks
      const { cards: newSubtasks } = parseMessageContent(assistantContent, false);
      for (const st of newSubtasks) {
        await createCard({ type: st.type, title: st.title, fields: st.fields, parent_id: card.id, origin_session_id: null }).catch(() => null);
      }
      if (newSubtasks.length > 0) onUpdate({ ...card }); // trigger refresh
    };

    const onBlocked = (reason: string) => {
      setMessages(m => [...m, {
        id: crypto.randomUUID(), session_id: chatSessionId ?? "", role: "assistant",
        content: "", was_blocked: true, block_reason: reason, gpt_target: provider,
        created_at: new Date().toISOString(),
      }]);
      setStreamingId(null); setLoading(false);
    };

    const onError = (error: string) => {
      setMessages(m => [...m, {
        id: crypto.randomUUID(), session_id: chatSessionId ?? "", role: "assistant",
        content: "", was_blocked: true, block_reason: error, gpt_target: provider,
        created_at: new Date().toISOString(),
      }]);
      setStreamingId(null); setLoading(false);
    };

    await streamChat(trimmed, provider, chatSessionId, onChunk, onDone, onBlocked, onError, card.id);
  }, [loading, chatSessionId, provider, card.id, fields]);

  const showTyping = loading && messages[messages.length - 1]?.role === "user";

  const CARD_TYPES = ["task", "customer", "contact", "event", "reminder", "project", "note"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: "1px solid #e8edf2", flexShrink: 0, background: cfg.bg }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: cfg.color, display: "flex", padding: 4 }}>
          <ArrowLeft size={16} />
        </button>
        <span style={{ background: cfg.color, color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{cfg.label}</span>
        {saving && <span style={{ fontSize: 11, color: "#b0bec5" }}>Saving…</span>}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#a0aab4" }}>
          {subtasks.length > 0 ? `${subtasks.length} subtask${subtasks.length !== 1 ? "s" : ""}` : ""}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Card form */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f0f4f8", flexShrink: 0 }}>
          {/* Title */}
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            style={{ width: "100%", fontSize: 20, fontWeight: 700, color: "#1e2b3a", border: "none", outline: "none", background: "transparent", marginBottom: 16, fontFamily: "inherit", boxSizing: "border-box" }}
            placeholder="Card title…"
          />

          {/* Fields */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#a0aab4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Fields</div>
            {Object.entries(fields).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#718096", textTransform: "capitalize", minWidth: 80, flexShrink: 0 }}>{k.replace(/_/g, " ")}</span>
                {editingField === k ? (
                  <input
                    autoFocus defaultValue={v}
                    onBlur={e => saveField(k, e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveField(k, e.currentTarget.value); if (e.key === "Escape") setEditingField(null); }}
                    style={{ flex: 1, fontSize: 12, padding: "3px 8px", border: `1px solid ${cfg.color}`, borderRadius: 4, outline: "none" }}
                  />
                ) : (
                  <span
                    onClick={() => setEditingField(k)}
                    style={{ flex: 1, fontSize: 12, color: "#4a5568", cursor: "text", padding: "3px 0", borderBottom: "1px dashed #e2e8f0" }}
                  >{v || <em style={{ color: "#c5d0d8" }}>empty</em>}</span>
                )}
                <button onClick={() => removeField(k)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c5d0d8", padding: 2 }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#e74a3b")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#c5d0d8")}
                ><X size={11} /></button>
              </div>
            ))}

            {/* Add field */}
            {addingField ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                <input value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)} placeholder="Field name" autoFocus
                  style={{ flex: 1, fontSize: 11, padding: "3px 8px", border: "1px solid #e2e8f0", borderRadius: 4, outline: "none" }} />
                <input value={newFieldVal} onChange={e => setNewFieldVal(e.target.value)} placeholder="Value"
                  onKeyDown={e => { if (e.key === "Enter") addField(); }}
                  style={{ flex: 2, fontSize: 11, padding: "3px 8px", border: "1px solid #e2e8f0", borderRadius: 4, outline: "none" }} />
                <button onClick={addField} style={{ background: cfg.color, border: "none", color: "#fff", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}>Add</button>
                <button onClick={() => setAddingField(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#a0aab4" }}><X size={12} /></button>
              </div>
            ) : (
              <button onClick={() => setAddingField(true)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: cfg.color, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}>
                <PlusCircle size={12} /> Add field
              </button>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#a0aab4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Notes</div>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="Add notes, context, or any details…"
              rows={3}
              style={{ width: "100%", fontSize: 12, padding: "8px 10px", border: "1px solid #e8edf2", borderRadius: 6, outline: "none", fontFamily: "inherit", color: "#4a5568", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box" }}
            />
          </div>

          {/* Subtasks */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#a0aab4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Subtasks {subtasks.length > 0 && `(${subtasks.length})`}
            </div>
            {subtasks.map(sub => {
              const scfg = cardCfg(sub.type);
              return (
                <div key={sub.id} onClick={() => onOpenCard(sub)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 4, borderRadius: 6, background: scfg.bg, borderLeft: `3px solid ${scfg.color}`, cursor: "pointer" }}>
                  <span style={{ color: scfg.color }}>{scfg.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#314557", flex: 1 }}>{sub.title}</span>
                  <span style={{ fontSize: 10, color: scfg.color, fontWeight: 700, textTransform: "uppercase" }}>{scfg.label}</span>
                </div>
              );
            })}

            {addingSubtask ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                <select value={subtaskType} onChange={e => setSubtaskType(e.target.value)}
                  style={{ fontSize: 11, padding: "4px 6px", border: "1px solid #e2e8f0", borderRadius: 4, outline: "none" }}>
                  {CARD_TYPES.map(t => <option key={t} value={t}>{CARD_CONFIGS[t]?.label ?? t}</option>)}
                </select>
                <input value={subtaskTitle} onChange={e => setSubtaskTitle(e.target.value)} placeholder="Subtask title" autoFocus
                  onKeyDown={e => { if (e.key === "Enter") addSubtask(); if (e.key === "Escape") setAddingSubtask(false); }}
                  style={{ flex: 1, fontSize: 11, padding: "4px 8px", border: `1px solid ${cfg.color}`, borderRadius: 4, outline: "none" }} />
                <button onClick={addSubtask} style={{ background: cfg.color, border: "none", color: "#fff", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>Add</button>
                <button onClick={() => setAddingSubtask(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#a0aab4" }}><X size={12} /></button>
              </div>
            ) : (
              <button onClick={() => setAddingSubtask(true)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: cfg.color, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}>
                <PlusCircle size={12} /> Add subtask
              </button>
            )}
          </div>
        </div>

        {/* Chat section */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "8px 20px", borderBottom: "1px solid #f0f4f8", background: "#f8fafc", flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#a0aab4", textTransform: "uppercase", letterSpacing: "0.06em" }}>Discuss with AI</span>
            <span style={{ fontSize: 10, color: "#c5d0d8", marginLeft: 8 }}>AI can update fields, add subtasks, and help you manage this card</span>
          </div>

          <div ref={chatBodyRef} className={s.chatBody} style={{ flex: 1 }}>
            {messages.length === 0 && !loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "#c5d0d8", textAlign: "center", padding: 20 }}>
                <span style={{ fontSize: 32 }}>{cfg.label === "Task" ? "✅" : cfg.label === "Customer" ? "🏢" : cfg.label === "Event" ? "📅" : "💬"}</span>
                <p style={{ margin: 0, fontSize: 13, color: "#a0aab4" }}>Ask AI to help with this {cfg.label.toLowerCase()}</p>
                <p style={{ margin: 0, fontSize: 11, color: "#c5d0d8" }}>Try: &quot;Add a due date&quot;, &quot;Break this into steps&quot;, &quot;Draft a description&quot;</p>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => {
                  const prevDay = i > 0 ? isoDay(messages[i - 1].created_at) : null;
                  const curDay = isoDay(msg.created_at);
                  return (
                    <div key={msg.id}>
                      {prevDay !== curDay && <div className={s.dateSeparator}><span className={s.dateSeparatorLabel}>{dayLabel(msg.created_at)}</span></div>}
                      {msg.role === "user" ? <UserMessage msg={msg} /> : <AIMessage msg={msg} isStreaming={streamingId === msg.id} onSuggestion={send} />}
                    </div>
                  );
                })}
                {showTyping && <TypingIndicator color={currentProvider.color} />}
              </>
            )}
          </div>

          {/* Composer */}
          <div className={s.composerArea}>
            <div className={s.chatFooter}>
              <textarea ref={textareaRef} rows={1} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder={`Ask AI about this ${cfg.label.toLowerCase()}…`}
                disabled={loading} className={s.sendTextarea} />
              <button onClick={() => send(input)} disabled={loading || !input.trim()} className={s.sendButton} style={{ background: cfg.color }}>
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ChatInterface() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<Session[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [provider, setProvider] = useState<GptTarget>("openai");
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [searchingQuery, setSearchingQuery] = useState<string | null>(null);
  const [thinkingMessage, setThinkingMessage] = useState<string | null>(null);
  const [incognito, setIncognito] = useState(false);

  // Notes
  const [note, setNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session editing
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Session context menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Cards (DB-backed)
  const [cards, setCards] = useState<Card[]>([]);
  // view mode: "chat" or "card"
  const [viewMode, setViewMode] = useState<"chat" | "card">("chat");
  const [openCard, setOpenCard] = useState<Card | null>(null);

  // Agent context + starters
  const [agentContext, setAgentContext] = useState<AgentContext | null>(null);
  const [agentStarters, setAgentStarters] = useState<string[]>([]);

  // Multi-agent rail
  const [userAgents, setUserAgents] = useState<UserAgent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentGoals, setAgentGoals] = useState<AgentGoals | null>(null);

  // Onboarding wizard
  const [showWizard, setShowWizard] = useState(false);
  const [wizardMode, setWizardMode] = useState<"onboarding" | "checkin">("onboarding");

  // Quick prompts
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
  const [loadingQuickPrompts, setLoadingQuickPrompts] = useState(false);

  // Sidebar mode
  const [sidebarMode, setSidebarMode] = useState<"sessions" | "tasks">("sessions");

  const chatBodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentProvider = PROVIDERS.find(p => p.value === provider)!;

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
    getNotes().then((n: Note) => { setNote(n); setNoteContent(n.content); }).catch(console.error);
    getCards().then(setCards).catch(console.error);
    getAgentContext().then(setAgentContext).catch(() => null);
    getAgentStarters().then(setAgentStarters).catch(() => null);

    // Load multi-agent rail, then load sessions for the active agent
    getUserAgents().then((agents: UserAgent[]) => {
      setUserAgents(agents);
      const active = agents.find(a => a.is_active);
      if (active) {
        setActiveAgentId(active.id);
        getSessions(active.id).then(setSessions).catch(console.error);
        getAgentGoals(active.id).then((goals: AgentGoals | null) => {
          setAgentGoals(goals);
        }).catch(() => null);
      } else {
        // No active agent — load general sessions
        getSessions("general").then(setSessions).catch(console.error);
      }
    }).catch(() => {
      getSessions().then(setSessions).catch(console.error);
    });
  }, []);

  async function handleAgentSwitch(agentId: string | null) {
    if (agentId === activeAgentId) return;
    if (agentId) {
      await setActiveAgent(agentId).catch(console.error);
    }
    setActiveAgentId(agentId);
    // Update is_active flags locally
    setUserAgents(prev => prev.map(a => ({ ...a, is_active: a.id === agentId })));
    // Refresh agent context and starters
    getAgentContext().then(setAgentContext).catch(() => null);
    getAgentStarters().then(setAgentStarters).catch(() => null);
    // Load goals for new agent
    if (agentId) {
      const goals = await getAgentGoals(agentId).catch(() => null) as AgentGoals | null;
      setAgentGoals(goals);
    } else {
      setAgentGoals(null);
    }
    // Clear quick prompts cache
    setQuickPrompts([]);
    setShowQuickPrompts(false);
    // Switch to this agent's sessions
    setActiveSession(null);
    setMessages([]);
    getSessions(agentId ?? "general").then(setSessions).catch(() => null);
  }

  async function handleWizardComplete(data: Partial<AgentGoals>) {
    if (!activeAgentId) return;
    await saveAgentGoals(activeAgentId, data).catch(console.error);
    const updated = await getAgentGoals(activeAgentId).catch(() => null) as AgentGoals | null;
    setAgentGoals(updated);
    setShowWizard(false);
  }

  async function handleDailyBriefing() {
    const goals = agentGoals?.goals ?? [];
    const goalsStr = goals.length > 0 ? goals.slice(0, 3).join(", ") : "my work";
    const briefingMsg = `Give me a daily briefing based on my goals: ${goalsStr}`;
    setActiveSession(null);
    setViewMode("chat");
    setOpenCard(null);
    setMessages([]);
    setInput(briefingMsg);
    // Auto-send after brief delay to allow state update
    setTimeout(() => send(briefingMsg), 100);
  }

  async function handleToggleQuickPrompts() {
    if (showQuickPrompts) {
      setShowQuickPrompts(false);
      return;
    }
    setShowQuickPrompts(true);
    if (activeAgentId && quickPrompts.length === 0) {
      setLoadingQuickPrompts(true);
      const prompts = await getAgentQuickPrompts(activeAgentId).catch(() => []) as string[];
      setQuickPrompts(prompts);
      setLoadingQuickPrompts(false);
    }
  }

  useEffect(() => {
    if (showArchived) getArchivedSessions().then(setArchivedSessions).catch(console.error);
  }, [showArchived]);

  function handleNoteChange(val: string) {
    setNoteContent(val);
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = setTimeout(async () => {
      if (!note) return;
      setNoteSaving(true);
      try { const updated = await updateNote(note.id, val); setNote(updated as Note); }
      finally { setNoteSaving(false); }
    }, 800);
  }

  // Card helpers
  function handleCardUpdate(updated: Card) {
    setCards(prev => {
      if (prev.find(c => c.id === updated.id)) {
        return prev.map(c => c.id === updated.id ? updated : c);
      }
      return prev;
    });
    if (openCard?.id === updated.id) setOpenCard(updated);
    // Always refetch to pick up new subtasks or cards added by AI
    getCards().then(setCards).catch(console.error);
  }

  function handleOpenCard(card: Card) {
    setOpenCard(card);
    setViewMode("card");
    setOpenMenuId(null);
  }

  async function handleRemoveCard(card: Card) {
    await deleteCard(card.id).catch(console.error);
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, is_deleted: true } : c));
    if (openCard?.id === card.id) { setViewMode("chat"); setOpenCard(null); }
  }

  async function handleRestoreCard(card: Card) {
    await restoreCard(card.id).catch(console.error);
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, is_deleted: false } : c));
  }

  async function handlePermanentDeleteCard(card: Card) {
    // Already soft-deleted; just remove from local state (backend already has is_deleted=true)
    setCards(prev => prev.filter(c => c.id !== card.id));
  }

  async function loadSession(id: string) {
    setActiveSession(id);
    setViewMode("chat");
    setOpenCard(null);
    setOpenMenuId(null);
    const msgs = await getMessages(id);
    setMessages(msgs);
  }

  function newSession() {
    setActiveSession(null);
    setViewMode("chat");
    setOpenCard(null);
    setMessages([]);
    setInput("");
    setOpenMenuId(null);
  }

  // Title editing
  function startEditTitle(sess: Session, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingSessionId(sess.id);
    setEditingTitle(sess.title ?? "");
    setOpenMenuId(null);
  }

  async function commitEditTitle(sessId: string) {
    if (!editingTitle.trim()) { setEditingSessionId(null); return; }
    try {
      await renameSession(sessId, editingTitle.trim());
      setSessions(prev => prev.map(ss => ss.id === sessId ? { ...ss, title: editingTitle.trim() } : ss));
    } catch {}
    setEditingSessionId(null);
  }

  async function handleArchive(sessId: string) {
    setOpenMenuId(null);
    await archiveSession(sessId).catch(console.error);
    setSessions(prev => prev.filter(ss => ss.id !== sessId));
    if (activeSession === sessId) newSession();
    if (showArchived) getArchivedSessions().then(setArchivedSessions);
  }

  async function handleUnarchive(sessId: string) {
    await archiveSession(sessId, false).catch(console.error);
    setArchivedSessions(prev => prev.filter(ss => ss.id !== sessId));
    getSessions(activeAgentId ?? "general").then(setSessions);
  }

  async function handleDeleteSession(sessId: string) {
    setOpenMenuId(null);
    if (!confirm("Permanently delete this conversation and all its messages?")) return;
    await deleteSession(sessId).catch(console.error);
    setSessions(prev => prev.filter(ss => ss.id !== sessId));
    setArchivedSessions(prev => prev.filter(ss => ss.id !== sessId));
    if (activeSession === sessId) newSession();
  }

  // Send message (regular chat)
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput("");
      setLoading(true);

      const userMsg: Message = {
        id: crypto.randomUUID(), session_id: activeSession ?? "", role: "user",
        content: trimmed, was_blocked: false, block_reason: null, gpt_target: null,
        created_at: new Date().toISOString(),
      };
      setMessages(m => [...m, userMsg]);

      let assistantContent = "";
      const assistantId = crypto.randomUUID();
      let assistantAdded = false;

      const onSearching = (query: string) => setSearchingQuery(query);
      const onThinking = (msg: string) => setThinkingMessage(msg);

      const onChunk = (chunk: string) => {
        setSearchingQuery(null);
        setThinkingMessage(null);
        if (!assistantAdded) {
          setMessages(m => [...m, {
            id: assistantId, session_id: activeSession ?? "", role: "assistant",
            content: "", was_blocked: false, block_reason: null, gpt_target: provider,
            created_at: new Date().toISOString(),
          }]);
          setStreamingId(assistantId);
          assistantAdded = true;
        }
        assistantContent += chunk;
        setMessages(m => m.map(msg => msg.id === assistantId ? { ...msg, content: assistantContent } : msg));
      };

      const onDone = async (sid: string) => {
        setActiveSession(sid);
        setStreamingId(null);
        setSearchingQuery(null);
        setThinkingMessage(null);
        setLoading(false);

        // Persist AI-created cards to DB
        const { cards: newCards, retitle, siteDeploy } = parseMessageContent(assistantContent, false);
        for (const nc of newCards) {
          const saved = await createCard({ type: nc.type, title: nc.title, fields: nc.fields, origin_session_id: sid }).catch(() => null);
          if (saved) setCards(prev => [saved as Card, ...prev]);
        }

        // Deploy generated website if present
        if (siteDeploy) {
          setMessages(m => m.map(msg => msg.id === assistantId
            ? { ...msg, content: msg.content + "\n\n⏳ *Deploying your website...*" }
            : msg));
          try {
            const result = await deploySite(siteDeploy.html, siteDeploy.title);
            const siteUrl = getSiteUrl(result.id);
            setMessages(m => m.map(msg => msg.id === assistantId
              ? { ...msg, content: msg.content.replace("\n\n⏳ *Deploying your website...*", `\n\n---\n🌐 **Your website is live!** [Open Site](${siteUrl})\n\n> The site is hosted and ready to share. Copy the link above.`) }
              : msg));
          } catch {
            setMessages(m => m.map(msg => msg.id === assistantId
              ? { ...msg, content: msg.content.replace("\n\n⏳ *Deploying your website...*", "\n\n> ⚠️ Could not deploy automatically. The HTML code above is ready to copy.") }
              : msg));
          }
        }

        if (!incognito) {
          // Apply retitle if AI suggested one
          if (retitle) {
            renameSession(sid, retitle).catch(() => null);
            setSessions(prev => prev.map(ss => ss.id === sid ? { ...ss, title: retitle } : ss));
          }
          getSessions(activeAgentId ?? "general").then(setSessions);
          [3000, 6000, 12000].forEach(ms => setTimeout(() => getSessions(activeAgentId ?? "general").then(setSessions), ms));
        }
      };

      const onBlocked = (reason: string) => {
        setThinkingMessage(null);
        setSearchingQuery(null);
        setMessages(m => [...m, {
          id: crypto.randomUUID(), session_id: activeSession ?? "", role: "assistant",
          content: "", was_blocked: true, block_reason: reason, gpt_target: provider,
          created_at: new Date().toISOString(),
        }]);
      };

      const onError = (error: string) => {
        setThinkingMessage(null);
        setSearchingQuery(null);
        setMessages(m => [...m, {
          id: crypto.randomUUID(), session_id: activeSession ?? "", role: "assistant",
          content: "", was_blocked: true, block_reason: error, gpt_target: provider,
          created_at: new Date().toISOString(),
        }]);
      };

      if (incognito) await streamChatIncognito(trimmed, provider, activeSession, onChunk, onDone as (sid: string) => void, onError);
      else await streamChat(trimmed, provider, activeSession, onChunk, onDone as (sid: string) => void, onBlocked, onError, undefined, onSearching, onThinking);

      setStreamingId(null);
      setLoading(false);
    },
    [loading, activeSession, provider, incognito, activeAgentId],
  );

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  const showTyping = loading && messages[messages.length - 1]?.role === "user";

  // Cards for the active session (top-level only)
  const sessionCards = cards.filter(c => !c.is_deleted && !c.parent_id && c.origin_session_id === activeSession);
  const deletedCards = cards.filter(c => c.is_deleted && !c.parent_id && c.origin_session_id === activeSession);
  function getSubtasks(parentId: string) {
    return cards.filter(c => !c.is_deleted && c.parent_id === parentId);
  }

  // ── Inline items panel ────────────────────────────────────────────────────

  function InlineItems() {
    return (
      <div style={{ background: "#f5f7fb", borderBottom: "1px solid rgba(205,211,237,0.4)", padding: "6px 10px 8px 22px" }}>
        <NoteCard content={noteContent} onChange={handleNoteChange} saving={noteSaving} />

        {sessionCards.map(card => (
          <SidebarCardRow
            key={card.id}
            card={card}
            subtasks={getSubtasks(card.id)}
            onClick={() => handleOpenCard(card)}
            onRemove={() => handleRemoveCard(card)}
            activeCardId={openCard?.id ?? null}
          />
        ))}

        {deletedCards.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
              <Trash2 size={9} color="#a0aab4" />
              <span style={{ fontSize: 9, fontWeight: 700, color: "#a0aab4", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Deleted ({deletedCards.length})
              </span>
            </div>
            {deletedCards.map(card => (
              <DeletedSidebarCard
                key={card.id}
                card={card}
                onRestore={() => handleRestoreCard(card)}
                onPermanentDelete={() => handlePermanentDeleteCard(card)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Session row ────────────────────────────────────────────────────────────

  const menuItemSt: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, width: "100%",
    padding: "8px 14px", fontSize: 12, fontWeight: 500, color: "#3d4465",
    background: "none", border: "none", cursor: "pointer", textAlign: "left",
  };

  function renderSessionRow(sess: Session, archived = false) {
    const isActive = activeSession === sess.id;
    const menuOpen = openMenuId === sess.id;

    return (
      <div key={sess.id}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
            borderBottom: "1px solid rgba(205,211,237,0.2)",
            borderLeft: isActive ? `4px solid ${currentProvider.color}` : "4px solid transparent",
            background: isActive ? "#fbfcff" : "transparent",
            cursor: "pointer", transition: "background 0.1s", position: "relative",
          }}
          onClick={() => loadSession(sess.id)}
        >
          <MessageSquare size={15} style={{ color: isActive ? currentProvider.color : "#b0bec5", flexShrink: 0 }} />

          <div style={{ minWidth: 0, flex: 1 }}>
            {editingSessionId === sess.id ? (
              <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                <input autoFocus value={editingTitle} onChange={e => setEditingTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") commitEditTitle(sess.id); if (e.key === "Escape") setEditingSessionId(null); }}
                  style={{ flex: 1, fontSize: 12, padding: "2px 6px", border: "1px solid #4e73df", borderRadius: 3, outline: "none" }} />
                <button onClick={() => commitEditTitle(sess.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#1cc88a", padding: 2 }}><Check size={12} /></button>
                <button onClick={() => setEditingSessionId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e74a3b", padding: 2 }}><X size={12} /></button>
              </div>
            ) : (
              <>
                <span style={{ display: "block", fontSize: 13, color: isActive ? "#314557" : "#7a8fa6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sess.title ?? "New conversation"}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "#b0bec5" }}>
                  {formatDateTime(sess.updated_at ?? sess.created_at)}
                </span>
              </>
            )}
          </div>

          {editingSessionId !== sess.id && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : sess.id); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#c5d0d8", padding: "2px 3px", borderRadius: 3, lineHeight: 1, display: "flex" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#4e73df")}
                onMouseLeave={e => (e.currentTarget.style.color = "#c5d0d8")}
              >
                <MoreVertical size={13} />
              </button>

              {menuOpen && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 2px)", zIndex: 200, background: "#fff", border: "1px solid #e8edf2", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 148, overflow: "hidden" }}
                  onClick={e => e.stopPropagation()}>
                  {!archived && (
                    <button onClick={e => { e.stopPropagation(); startEditTitle(sess, e); }} style={menuItemSt}>
                      <Pencil size={12} /> Rename
                    </button>
                  )}
                  {!archived ? (
                    <button onClick={e => { e.stopPropagation(); handleArchive(sess.id); }} style={menuItemSt}>
                      <Archive size={12} /> Archive
                    </button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); handleUnarchive(sess.id); }} style={menuItemSt}>
                      <ArchiveRestore size={12} /> Unarchive
                    </button>
                  )}
                  <div style={{ height: 1, background: "#f0f0f5", margin: "2px 0" }} />
                  <button onClick={e => { e.stopPropagation(); handleDeleteSession(sess.id); }} style={{ ...menuItemSt, color: "#e74a3b" }}>
                    <Trash2 size={12} /> Delete permanently
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {isActive && <InlineItems />}
      </div>
    );
  }

  return (
    <div className={s.messagesPanel}>
      {openMenuId && <div style={{ position: "fixed", inset: 0, zIndex: 100 }} onClick={() => setOpenMenuId(null)} />}

      {/* ── Agents Rail ──────────────────────────────────────────── */}
      {userAgents.length > 0 && (
        <AgentsRail
          agents={userAgents}
          activeId={activeAgentId}
          onSwitch={handleAgentSwitch}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <div className={s.contactsList}>
        <div style={{ padding: "16px", borderBottom: "1px solid #cfdbe2", flexShrink: 0 }}>
          <OrgLogo size="md" />
        </div>

        {/* Sidebar mode tabs */}
        <div style={{ display: "flex", width: "100%", borderBottom: "1px solid #cfdbe2", flexShrink: 0 }}>
          <button
            onClick={() => setSidebarMode("sessions")}
            style={{ flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer", border: "none", transition: "all 0.15s", color: sidebarMode === "sessions" ? currentProvider.color : "#a0aab4", background: sidebarMode === "sessions" ? `${currentProvider.color}10` : "transparent", borderBottom: `2px solid ${sidebarMode === "sessions" ? currentProvider.color : "transparent"}` }}
          >
            <MessageSquare size={12} /> Chats
          </button>
          <button
            onClick={() => setSidebarMode("tasks")}
            style={{ flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer", border: "none", transition: "all 0.15s", color: sidebarMode === "tasks" ? "#2da9e9" : "#a0aab4", background: sidebarMode === "tasks" ? "#2da9e910" : "transparent", borderBottom: `2px solid ${sidebarMode === "tasks" ? "#2da9e9" : "transparent"}`, borderLeft: "1px solid rgba(0,0,0,0.05)" }}
          >
            <Bot size={12} /> Tasks
          </button>
        </div>

        {/* Provider tabs — only in sessions mode */}
        {sidebarMode === "sessions" && (
        <div style={{ display: "flex", width: "100%", borderBottom: "1px solid #cfdbe2", flexShrink: 0 }}>
          {PROVIDERS.map((p, i) => (
            <button key={p.value} onClick={() => setProvider(p.value)}
              style={{ flex: 1, padding: "10px 0", fontSize: 11, fontWeight: 700, textAlign: "center", cursor: "pointer", border: "none", transition: "all 0.15s", color: provider === p.value ? "#fff" : p.color, background: provider === p.value ? p.color : "rgba(255,255,255,0.75)", borderBottom: `3px solid ${provider === p.value ? "rgba(0,0,0,0.15)" : p.color}`, borderRight: i < PROVIDERS.length - 1 ? "1px solid rgba(0,0,0,0.07)" : "none" }}>
              {p.label}
            </button>
          ))}
        </div>
        )}

        {sidebarMode === "tasks" && (
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <AgentTaskPanel agentId={activeAgentId} />
          </div>
        )}

        {/* Goal chips */}
        {sidebarMode === "sessions" && agentGoals && agentGoals.goals.length > 0 && (
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #e8edf2", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#b0bec5", textTransform: "uppercase", letterSpacing: "0.06em" }}>Active Goals</span>
              <button
                onClick={() => { setWizardMode("checkin"); setShowWizard(true); }}
                title="Edit goals"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#c5d0d8", padding: 0, display: "flex", lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#65addd")}
                onMouseLeave={e => (e.currentTarget.style.color = "#c5d0d8")}
              >
                <Pencil size={10} />
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {agentGoals.goals.slice(0, 4).map((goal, i) => (
                <button
                  key={i}
                  onClick={() => { setWizardMode("checkin"); setShowWizard(true); }}
                  style={{
                    padding: "3px 8px", fontSize: 10, borderRadius: 10, fontWeight: 500,
                    border: `1px solid ${currentProvider.color}30`,
                    background: `${currentProvider.color}0d`,
                    color: currentProvider.color, cursor: "pointer",
                    maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                  title={goal}
                >
                  {goal.length > 22 ? goal.slice(0, 22) + "…" : goal}
                </button>
              ))}
            </div>
          </div>
        )}

        {sidebarMode === "sessions" && (
          <>
            <div style={{ padding: 12, borderBottom: "1px solid #e8edf2", flexShrink: 0 }}>
              <button onClick={newSession}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "8px 0", borderRadius: 4, border: "none", background: currentProvider.color, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <Plus size={15} /> New Chat
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {sessions.length === 0 ? (
                <p style={{ fontSize: 12, textAlign: "center", padding: "24px 0", color: "#b0bec5" }}>No conversations yet</p>
              ) : (
                sessions.map(sess => renderSessionRow(sess, false))
              )}

              <div style={{ borderTop: "1px solid #e8edf2" }}>
                <button onClick={() => setShowArchived(!showArchived)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#a0aab4", background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <Archive size={11} />
                  Archived {!showArchived && archivedSessions.length > 0 ? `(${archivedSessions.length})` : ""}
                </button>
                {showArchived && archivedSessions.map(sess => renderSessionRow(sess, true))}
              </div>
            </div>

            {/* Daily Briefing button */}
            {agentGoals && agentGoals.goals.length > 0 && (
              <div style={{ padding: "10px 12px", borderTop: "1px solid #e8edf2", flexShrink: 0 }}>
                <button
                  onClick={handleDailyBriefing}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    width: "100%", padding: "7px 0", borderRadius: 4,
                    border: `1px solid ${currentProvider.color}30`,
                    background: `${currentProvider.color}0d`,
                    color: currentProvider.color, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Sun size={13} /> Daily Briefing
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Main panel ───────────────────────────────────────────── */}
      <div className={s.mainPanel}>
        {viewMode === "card" && openCard ? (
          <CardDetailView
            card={openCard}
            subtasks={getSubtasks(openCard.id)}
            allCards={cards}
            onBack={() => { setViewMode("chat"); setOpenCard(null); }}
            onUpdate={handleCardUpdate}
            onOpenCard={handleOpenCard}
            provider={provider}
            currentProvider={currentProvider}
          />
        ) : (
          <>
            {/* Chat header */}
            <div style={{ display: "flex", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.12)", flexShrink: 0, background: incognito ? "linear-gradient(135deg,#1a1a2e,#16213e)" : "linear-gradient(135deg,#1e3a5f,#2d6a9f)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)", flexShrink: 0, background: incognito ? "#9b59b6" : currentProvider.color }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {incognito ? "Incognito Chat" : (activeSession ? (sessions.find(ss => ss.id === activeSession)?.title ?? "Conversation") : "New conversation")}
                  </div>
                  {!incognito && activeSession && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      Started {formatDateTime(sessions.find(ss => ss.id === activeSession)?.created_at ?? new Date().toISOString())}
                    </div>
                  )}
                  {incognito && <div style={{ fontSize: 11, color: "rgba(155,89,182,0.8)" }}>Not filtered · Not monitored · Not saved</div>}
                </div>
                {!incognito && (
                  <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 10px", borderRadius: 10, fontWeight: 600, flexShrink: 0, background: `${currentProvider.color}30`, color: currentProvider.color, border: `1px solid ${currentProvider.color}50` }}>
                    {currentProvider.label}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setIncognito(!incognito)} title={incognito ? "Exit incognito" : "Incognito mode"}
                  style={{ width: 32, height: 32, borderRadius: "50%", border: incognito ? "1px solid rgba(155,89,182,0.4)" : "none", background: incognito ? "rgba(155,89,182,0.2)" : "rgba(255,255,255,0.08)", color: incognito ? "#9b59b6" : "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {incognito ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <Link href="/admin" title="Admin Panel"
                  style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Settings size={16} />
                </Link>
                <button onClick={() => signOut({ callbackUrl: "/sign-in" })} title="Sign out"
                  style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <LogOut size={16} />
                </button>
              </div>
            </div>

            {incognito && (
              <div style={{ background: "rgba(155,89,182,0.08)", borderBottom: "1px solid rgba(155,89,182,0.2)", padding: "6px 20px", display: "flex", alignItems: "center", gap: 8 }}>
                <EyeOff size={13} style={{ color: "#9b59b6", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "#9b59b6" }}>Incognito mode: messages go directly to {currentProvider.label} without filtering, monitoring, or saving.</span>
              </div>
            )}

            {/* Chat body */}
            <div ref={chatBodyRef} className={s.chatBody}>
              {messages.length === 0 && !loading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, minHeight: 256 }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff", border: `2px solid ${incognito ? "#9b59b620" : currentProvider.color + "50"}`, background: incognito ? "#9b59b6" : currentProvider.color }}>
                    {incognito ? <EyeOff size={24} /> : "AI"}
                  </div>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#314557" }}>
                    {incognito ? "Incognito Chat" : (agentContext ? `${agentContext.name}` : "How can I help you today?")}
                  </p>
                  <p style={{ margin: 0, fontSize: 14, color: "#a2b8c5" }}>{incognito ? `Direct to ${currentProvider.label} · No filtering · Not monitored` : `Powered by ${currentProvider.label} · GoUsers AI Gateway`}</p>
                  {!incognito && agentStarters.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 480, marginTop: 8 }}>
                      {agentStarters.map((starter, i) => (
                        <button
                          key={i}
                          onClick={() => send(starter)}
                          style={{
                            padding: "8px 16px", fontSize: 13, borderRadius: 20,
                            border: `1px solid ${currentProvider.color}40`,
                            background: `${currentProvider.color}0d`,
                            color: currentProvider.color,
                            cursor: "pointer", fontWeight: 500, transition: "all 0.15s",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = `${currentProvider.color}20`;
                            e.currentTarget.style.borderColor = `${currentProvider.color}80`;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = `${currentProvider.color}0d`;
                            e.currentTarget.style.borderColor = `${currentProvider.color}40`;
                          }}
                        >
                          {starter}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 14, color: "#b8c8d4", marginTop: 8 }}>Type a message below to get started ↓</p>
                  )}
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => {
                    const prevDay = i > 0 ? isoDay(messages[i - 1].created_at) : null;
                    const curDay = isoDay(msg.created_at);
                    return (
                      <div key={msg.id}>
                        {prevDay !== curDay && <div className={s.dateSeparator}><span className={s.dateSeparatorLabel}>{dayLabel(msg.created_at)}</span></div>}
                        {msg.role === "user" ? <UserMessage msg={msg} /> : <AIMessage msg={msg} isStreaming={streamingId === msg.id} onSuggestion={send} />}
                      </div>
                    );
                  })}
                  {thinkingMessage && (
                    <div className={`${s.message} ${currentProvider.bubbleClass}`}>
                      <div className={s.messageAvatar} style={{ backgroundColor: incognito ? "#9b59b6" : currentProvider.color }}>AI</div>
                      <div className={s.messageBubble}>
                        <div className={s.messageText} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgb(var(--text-muted))", fontSize: 13, fontStyle: "italic" }}>
                          <span className="inline-flex gap-1" style={{ marginRight: 4 }}><span className={s.typingDot} /><span className={s.typingDot} /><span className={s.typingDot} /></span>
                          {thinkingMessage}
                        </div>
                      </div>
                    </div>
                  )}
                  {!thinkingMessage && searchingQuery && (
                    <div className={`${s.message} ${currentProvider.bubbleClass}`}>
                      <div className={s.messageAvatar} style={{ backgroundColor: incognito ? "#9b59b6" : currentProvider.color }}>AI</div>
                      <div className={s.messageBubble}>
                        <div className={s.messageText} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgb(var(--text-muted))", fontSize: 13 }}>
                          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>🔍</span>
                          Searching the web for <em>&ldquo;{searchingQuery}&rdquo;</em>&hellip;
                        </div>
                      </div>
                    </div>
                  )}
                  {!thinkingMessage && !searchingQuery && showTyping && <TypingIndicator color={incognito ? "#9b59b6" : currentProvider.color} />}
                </>
              )}
            </div>

            {/* Composer */}
            <div className={s.composerArea}>
              {showQuickPrompts && activeAgentId && (
                <QuickPromptsPanel
                  prompts={quickPrompts}
                  loading={loadingQuickPrompts}
                  onSelect={prompt => { setInput(prompt); setShowQuickPrompts(false); setTimeout(() => textareaRef.current?.focus(), 50); }}
                  accentColor={incognito ? "#9b59b6" : currentProvider.color}
                />
              )}
              <div className={s.chatFooter}>
                <textarea ref={textareaRef} rows={1} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={incognito ? `Incognito message to ${currentProvider.label}…` : `Message ${currentProvider.label}…`}
                  disabled={loading} className={s.sendTextarea}
                  style={{ paddingRight: activeAgentId ? "80px" : "52px" }} />
                {activeAgentId && (
                  <button
                    onClick={handleToggleQuickPrompts}
                    title="Quick prompts"
                    className={s.quickPromptButton}
                    style={{ color: showQuickPrompts ? (incognito ? "#9b59b6" : currentProvider.color) : "#b0bec5" }}
                  >
                    <Zap size={14} />
                  </button>
                )}
                <button onClick={() => send(input)} disabled={loading || !input.trim()} className={s.sendButton} style={{ background: incognito ? "#9b59b6" : currentProvider.color }}>
                  <Send size={15} />
                </button>
              </div>
              <p style={{ fontSize: 12, textAlign: "center", paddingBottom: 12, color: "#c5d0d8", margin: 0 }}>
                {incognito ? "Incognito · Bypasses filtering · Not saved" : "Messages filtered through Llama · GoUsers AI Gateway"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Onboarding / Check-in Wizard ─────────────────────────── */}
      {showWizard && activeAgentId && (() => {
        const agent = userAgents.find(a => a.id === activeAgentId);
        return agent ? (
          <AgentOnboardingWizard
            agent={agent}
            initialGoals={agentGoals}
            mode={wizardMode}
            onComplete={handleWizardComplete}
            onSkip={() => setShowWizard(false)}
          />
        ) : null;
      })()}
    </div>
  );
}
