"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, ArrowLeft, Loader2, CheckCircle2, AlertCircle, XCircle, Clock, Search, Save, User, ChevronDown, ChevronRight } from "lucide-react";
import { createAgentTask, getAgentTasks, getAgentTask, confirmAgentTask, cancelAgentTask, deleteAgentTask, getAgentToken } from "@/lib/api";
import { AgentTask, AgentTaskStep } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentTask["status"] }) {
  const map: Record<AgentTask["status"], { label: string; color: string; bg: string }> = {
    pending:       { label: "Pending",       color: "#7a8fa6", bg: "#f0f4f8" },
    running:       { label: "Running",       color: "#2da9e9", bg: "#e8f6fd" },
    waiting_human: { label: "Your turn",     color: "#f6a623", bg: "#fff8e1" },
    completed:     { label: "Completed",     color: "#1cc88a", bg: "#e6fff5" },
    failed:        { label: "Failed",        color: "#e74a3b", bg: "#fdf0f0" },
    cancelled:     { label: "Cancelled",     color: "#b0bec5", bg: "#f5f7fa" },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
      color: cfg.color, background: cfg.bg, textTransform: "uppercase", letterSpacing: "0.06em",
    }}>{cfg.label}</span>
  );
}

// ── Step row ──────────────────────────────────────────────────────────────────

function StepRow({ step, onConfirm }: { step: AgentTaskStep; onConfirm?: (note: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const isRunning = step.status === "running";
  const isWaiting = step.type === "human_action" && step.status === "waiting";
  const isConfirmed = step.type === "human_action" && step.status === "confirmed";
  const isFinal = step.type === "final";

  // Icon
  let icon: React.ReactNode;
  let label: string;
  let accent = "#7a8fa6";

  if (isFinal) {
    icon = <CheckCircle2 size={16} />;
    label = "Completed";
    accent = "#1cc88a";
  } else if (step.type === "human_action") {
    icon = isConfirmed ? <CheckCircle2 size={16} /> : <User size={16} />;
    label = isConfirmed ? "You confirmed" : "Your turn";
    accent = isConfirmed ? "#1cc88a" : "#f6a623";
  } else if (step.tool === "web_search") {
    icon = isRunning ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />;
    label = isRunning ? `Searching: "${String(step.input?.query ?? "")}"…` : `Searched: "${String(step.input?.query ?? "")}"`;
    accent = "#2da9e9";
  } else if (step.tool === "store_artifact") {
    icon = <Save size={16} />;
    label = `Saved: ${String(step.input?.key ?? "")}${step.input?.description ? ` — ${String(step.input.description)}` : ""}`;
    accent = "#1cc88a";
  } else {
    icon = isRunning ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />;
    label = `${step.tool || step.type}`;
    accent = "#7a8fa6";
  }

  const hasOutput = !!step.output && step.tool !== "human_action";

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Main row */}
      <div
        style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 14px", borderRadius: 8,
          background: isWaiting ? "#fffbf0" : isFinal ? "#f0fdf8" : "#f8fafc",
          border: isWaiting ? "1px solid #f6a62330" : isFinal ? "1px solid #1cc88a30" : "1px solid #f0f4f8",
          cursor: hasOutput ? "pointer" : "default",
        }}
        onClick={() => hasOutput && setExpanded(e => !e)}
      >
        <span style={{ color: accent, display: "flex", flexShrink: 0, marginTop: 2 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: isFinal ? "#1e2b3a" : "#314557", fontWeight: isWaiting || isFinal ? 600 : 400 }}>
            {isFinal ? (step.output || "Task completed") : label}
          </div>
          {isFinal && step.output && step.output.length > 120 && !expanded && (
            <div style={{ fontSize: 11, color: "#a0aab4", marginTop: 2 }}>
              {step.output.slice(0, 120)}…
              <button onClick={e => { e.stopPropagation(); setExpanded(true); }} style={{ background: "none", border: "none", color: "#2da9e9", cursor: "pointer", fontSize: 11, padding: "0 4px" }}>show more</button>
            </div>
          )}
          {isConfirmed && (
            <div style={{ fontSize: 11, color: "#7a8fa6", marginTop: 2 }}>{step.output}</div>
          )}
        </div>
        {hasOutput && (
          <span style={{ color: "#c5d0d8", flexShrink: 0 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </div>

      {/* Expanded output */}
      {expanded && hasOutput && (
        <div style={{
          margin: "4px 0 0 26px", padding: "10px 14px", borderRadius: 6,
          background: "#fff", border: "1px solid #e8edf2",
          fontSize: 12, color: "#4a5568", lineHeight: 1.6,
          maxHeight: 300, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {step.output}
        </div>
      )}

      {/* Human action block */}
      {isWaiting && onConfirm && (
        <div style={{ margin: "8px 0 0 26px", padding: "14px 16px", borderRadius: 8, background: "#fff8e8", border: "1px solid #f6a62340" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#b8760a", marginBottom: 8 }}>
            Action required
          </div>
          <div style={{ fontSize: 12, color: "#4a5568", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 12 }}>
            {step.input?.instruction as string}
          </div>
          {!!step.input?.expected_result && (
            <div style={{ fontSize: 11, color: "#7a8fa6", marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>Expected: </span>{String(step.input.expected_result)}
            </div>
          )}
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={step.input?.confirmation_prompt as string || "Add a note (optional)…"}
            rows={2}
            style={{ width: "100%", fontSize: 12, padding: "8px 10px", border: "1px solid #e8edf2", borderRadius: 6, outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }}
          />
          <button
            disabled={confirming}
            onClick={async () => {
              setConfirming(true);
              try { await onConfirm(note); } finally { setConfirming(false); }
            }}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 6,
              background: "#f6a623", color: "#fff", border: "none", cursor: "pointer",
              opacity: confirming ? 0.7 : 1,
            }}
          >
            {confirming ? "Confirming…" : "Confirm Done"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Task detail view ──────────────────────────────────────────────────────────

function TaskDetail({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const [task, setTask] = useState<AgentTask | null>(null);
  const [loading, setLoading] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const t = await getAgentTask(taskId);
        if (!cancelled) setTask(t);
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Start SSE stream
      const token = await getAgentToken();
      const url = `${API}/agent-tasks/${taskId}/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (ev) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "done") {
            setTask(prev => prev ? { ...prev, status: data.status, result: data.result, error: data.error, artifacts: data.artifacts || prev.artifacts } : prev);
            es.close();
            return;
          }
          // It's a step update
          setTask(prev => {
            if (!prev) return prev;
            const existing = prev.steps.find(s => s.id === data.id);
            if (existing) {
              return { ...prev, steps: prev.steps.map(s => s.id === data.id ? { ...s, ...data } : s) };
            }
            return { ...prev, steps: [...prev.steps, data] };
          });
        } catch {}
      };

      es.onerror = () => {
        // Silently ignore; step data is already stored in DB on reload
      };
    }

    init();
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [taskId]);

  // Auto-scroll feed on new steps
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [task?.steps?.length]);

  async function handleConfirm(note: string) {
    await confirmAgentTask(taskId, note);
    // Refresh task
    const updated = await getAgentTask(taskId);
    setTask(updated);
  }

  async function handleCancel() {
    if (!confirm("Cancel this task?")) return;
    await cancelAgentTask(taskId);
    const updated = await getAgentTask(taskId);
    setTask(updated);
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#b0bec5" }}>
      <Loader2 size={24} className="animate-spin" />
    </div>
  );

  if (!task) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#e74a3b" }}>
      Task not found
    </div>
  );

  const canCancel = task.status === "running" || task.status === "waiting_human" || task.status === "pending";
  const artifactKeys = Object.keys(task.artifacts || {});

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid #e8edf2", flexShrink: 0, background: "#fff" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#7a8fa6", display: "flex", padding: 4 }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1e2b3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.goal}
          </div>
        </div>
        <StatusBadge status={task.status} />
        {canCancel && (
          <button
            onClick={handleCancel}
            style={{ background: "none", border: "1px solid #e8edf2", borderRadius: 6, cursor: "pointer", color: "#e74a3b", padding: "4px 10px", fontSize: 11, fontWeight: 600 }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Step feed */}
      <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px", minHeight: 0 }}>
        {task.steps.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#c5d0d8", gap: 8 }}>
            <Loader2 size={18} className="animate-spin" />
            <span style={{ fontSize: 13 }}>Starting…</span>
          </div>
        ) : (
          task.steps.map(step => (
            <StepRow
              key={step.id}
              step={step}
              onConfirm={step.type === "human_action" && step.status === "waiting" ? handleConfirm : undefined}
            />
          ))
        )}

        {task.status === "failed" && (
          <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 8, background: "#fdf0f0", border: "1px solid #e74a3b30" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e74a3b", marginBottom: 4 }}>Task failed</div>
            <div style={{ fontSize: 12, color: "#7a8fa6" }}>{task.error || "An unknown error occurred"}</div>
          </div>
        )}
      </div>

      {/* Artifacts panel */}
      {artifactKeys.length > 0 && (
        <div style={{ borderTop: "1px solid #e8edf2", padding: "12px 20px", flexShrink: 0, background: "#f8fafc", maxHeight: 200, overflowY: "auto" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#a0aab4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Saved artifacts ({artifactKeys.length})
          </div>
          {artifactKeys.map(key => (
            <ArtifactRow key={key} artifactKey={key} content={task.artifacts[key]} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactRow({ artifactKey, content }: { artifactKey: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          padding: "6px 10px", borderRadius: 6, background: "#fff", border: "1px solid #e8edf2",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <Save size={12} style={{ color: "#1cc88a", flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#314557", flex: 1 }}>{artifactKey}</span>
        <span style={{ fontSize: 10, color: "#b0bec5" }}>{content.length} chars</span>
        {expanded ? <ChevronDown size={12} style={{ color: "#c5d0d8" }} /> : <ChevronRight size={12} style={{ color: "#c5d0d8" }} />}
      </button>
      {expanded && (
        <div style={{
          margin: "4px 0 0 0", padding: "10px 12px", borderRadius: 6,
          background: "#fff", border: "1px solid #e8edf2",
          fontSize: 11, color: "#4a5568", lineHeight: 1.6,
          maxHeight: 240, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {content}
        </div>
      )}
    </div>
  );
}

// ── Task list view ────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentTaskPanel({ agentId }: { agentId?: string | null }) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);

  const loadTasks = useCallback(async () => {
    try {
      const result = await getAgentTasks();
      setTasks(result);
    } catch {}
    finally { setLoadingTasks(false); }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Periodically refresh list to pick up status changes
  useEffect(() => {
    const id = setInterval(loadTasks, 5000);
    return () => clearInterval(id);
  }, [loadTasks]);

  async function handleCreate() {
    if (!newGoal.trim()) return;
    setCreating(true);
    try {
      const task = await createAgentTask(newGoal.trim(), agentId ?? undefined) as AgentTask;
      setTasks(prev => [task, ...prev]);
      setSelectedId(task.id);
      setShowNew(false);
      setNewGoal("");
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this task?")) return;
    try {
      await deleteAgentTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err: unknown) {
      alert((err as Error).message || "Cannot delete task");
    }
  }

  if (selectedId) {
    return (
      <TaskDetail
        taskId={selectedId}
        onBack={() => { setSelectedId(null); loadTasks(); }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #e8edf2", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showNew ? 10 : 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#7a8fa6", textTransform: "uppercase", letterSpacing: "0.06em" }}>Agent Tasks</span>
          <button
            onClick={() => setShowNew(s => !s)}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6,
              background: "#2da9e9", color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
            }}
          >
            <Plus size={12} /> New Task
          </button>
        </div>

        {showNew && (
          <div style={{ marginTop: 10 }}>
            <textarea
              autoFocus
              value={newGoal}
              onChange={e => setNewGoal(e.target.value)}
              placeholder="What do you want the agent to accomplish?"
              rows={3}
              onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleCreate(); }}
              style={{ width: "100%", fontSize: 12, padding: "8px 10px", border: "1px solid #2da9e9", borderRadius: 6, outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleCreate}
                disabled={creating || !newGoal.trim()}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 6, background: "#2da9e9", color: "#fff",
                  border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  opacity: creating || !newGoal.trim() ? 0.6 : 1,
                }}
              >
                {creating ? "Starting…" : "Start Task"}
              </button>
              <button
                onClick={() => { setShowNew(false); setNewGoal(""); }}
                style={{ padding: "7px 12px", borderRadius: 6, background: "none", color: "#7a8fa6", border: "1px solid #e8edf2", cursor: "pointer", fontSize: 12 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {loadingTasks ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24, color: "#c5d0d8" }}>
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "#c5d0d8" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
            <p style={{ margin: 0, fontSize: 13, color: "#a0aab4" }}>No tasks yet</p>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "#c5d0d8" }}>Click &ldquo;New Task&rdquo; to start the agent</p>
          </div>
        ) : (
          tasks.map(task => {
            const isActive = task.status === "running" || task.status === "waiting_human" || task.status === "pending";
            return (
              <div
                key={task.id}
                onClick={() => setSelectedId(task.id)}
                style={{
                  padding: "10px 14px", borderBottom: "1px solid #f0f4f8", cursor: "pointer",
                  background: isActive ? "#fafcff" : "#fff", transition: "background 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f5f8fc")}
                onMouseLeave={e => (e.currentTarget.style.background = isActive ? "#fafcff" : "#fff")}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#314557", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                      {task.goal}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <StatusBadge status={task.status} />
                      <span style={{ fontSize: 10, color: "#c5d0d8" }}>{timeAgo(task.updated_at)}</span>
                    </div>
                  </div>
                  {!isActive && (
                    <button
                      onClick={e => handleDelete(task.id, e)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#d5dce5", padding: 4, display: "flex", flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#e74a3b")}
                      onMouseLeave={e => (e.currentTarget.style.color = "#d5dce5")}
                      title="Delete"
                    >
                      <XCircle size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
