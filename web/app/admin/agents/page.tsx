"use client";
import { useEffect, useState } from "react";
import {
  getAgents, createAgent, updateAgent, deleteAgent,
  getAssignments, upsertAssignment, removeAssignment,
  getUsers,
} from "@/lib/api";
import { Agent, AgentAssignment, User } from "@/lib/types";
import { Bot, Plus, Trash2, Edit2, Check, X } from "lucide-react";

interface AgentFormState {
  name: string;
  description: string;
  system_prompt: string;
  provider: string;
  model: string;
}

const emptyForm: AgentFormState = {
  name: "",
  description: "",
  system_prompt: "",
  provider: "openai",
  model: "",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignments, setAssignments] = useState<AgentAssignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Agent form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Assignment form
  const [assignUserId, setAssignUserId] = useState("");
  const [assignAgentId, setAssignAgentId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const loadAgents = () => getAgents().then(setAgents).catch(console.error);
  const loadAssignments = () => getAssignments().then(setAssignments).catch(console.error);
  const loadUsers = () => getUsers().then(setUsers).catch(console.error);

  useEffect(() => {
    loadAgents();
    loadAssignments();
    loadUsers();
  }, []);

  function startEdit(agent: Agent) {
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      description: agent.description ?? "",
      system_prompt: agent.system_prompt,
      provider: agent.provider,
      model: agent.model ?? "",
    });
    setShowForm(true);
    setFormError("");
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        description: form.description || null,
        model: form.model || null,
      };
      if (editingId) {
        await updateAgent(editingId, payload);
      } else {
        await createAgent(payload);
      }
      cancelForm();
      loadAgents();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(agent: Agent) {
    if (!confirm(`Delete agent "${agent.name}"? All assignments will be removed.`)) return;
    await deleteAgent(agent.id).catch(console.error);
    loadAgents();
    loadAssignments();
  }

  async function toggleActive(agent: Agent) {
    await updateAgent(agent.id, { is_active: !agent.is_active }).catch(console.error);
    loadAgents();
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignUserId || !assignAgentId) return;
    setAssigning(true);
    try {
      await upsertAssignment({ user_id: assignUserId, agent_id: assignAgentId });
      setAssignUserId("");
      setAssignAgentId("");
      loadAssignments();
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassign(userId: string) {
    await removeAssignment(userId).catch(console.error);
    loadAssignments();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 13,
    border: "1px solid #d1d3e2", borderRadius: 4, outline: "none", boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: "#858796", display: "block", marginBottom: 4,
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>Agents</h1>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>
          Define AI personas with custom system prompts and assign them to users
        </p>
      </div>

      {/* ── Agents section ─────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", marginBottom: 24, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={15} color="#4e73df" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>
              Agents <span style={{ fontSize: 12, fontWeight: 400, color: "#858796" }}>({agents.length})</span>
            </h3>
          </div>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 13, borderRadius: 4, border: "none", background: "#4e73df", color: "#fff", cursor: "pointer", fontWeight: 600 }}
            >
              <Plus size={14} /> Add Agent
            </button>
          )}
        </div>

        {/* Inline form */}
        {showForm && (
          <form onSubmit={handleSave} style={{ padding: "16px 20px", borderBottom: "1px solid #e9ecef", background: "#f8f9fc" }}>
            <h4 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#495057" }}>
              {editingId ? "Edit Agent" : "New Agent"}
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input style={inputStyle} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer Support Bot" />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional short description" />
              </div>
              <div>
                <label style={labelStyle}>Provider</label>
                <select style={inputStyle} value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Gemini</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Model (optional)</label>
                <input style={inputStyle} value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. gpt-4o" />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>System Prompt *</label>
              <textarea
                required value={form.system_prompt}
                onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                rows={5}
                placeholder="You are a helpful customer support agent for Acme Corp…"
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            {formError && <p style={{ color: "#e74c3c", fontSize: 12, margin: "0 0 10px" }}>{formError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", fontSize: 13, borderRadius: 4, border: "none", background: "#4e73df", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                <Check size={13} /> {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={cancelForm} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", fontSize: 13, borderRadius: 4, border: "1px solid #d1d3e2", background: "#fff", color: "#6e707e", cursor: "pointer" }}>
                <X size={13} /> Cancel
              </button>
            </div>
          </form>
        )}

        {/* Agents table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
              {["Name", "Description", "Provider", "Active", ""].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a, i) => (
              <tr key={a.id} style={{ borderBottom: i < agents.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontWeight: 600, color: "#3d4465" }}>{a.name}</span>
                </td>
                <td style={{ padding: "12px 16px", color: "#858796", maxWidth: 240 }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                    {a.description || <em>—</em>}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#f0f0f5", color: "#495057" }}>{a.provider}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <button
                    onClick={() => toggleActive(a)}
                    style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: a.is_active ? "#d4edda" : "#f8d7da", color: a.is_active ? "#155724" : "#721c24" }}
                  >
                    {a.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => startEdit(a)} style={{ padding: "5px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d3e2", background: "#fff", color: "#6e707e", cursor: "pointer" }}>
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(a)} style={{ padding: "5px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #e74c3c40", background: "#fff", color: "#e74c3c", cursor: "pointer" }}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "40px 0", textAlign: "center", color: "#858796" }}>No agents yet — create one above</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Assignments section ─────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>User Assignments</h3>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#858796" }}>Each user can be assigned one active agent (replaces any existing assignment)</p>
        </div>

        {/* Assignment form */}
        <form onSubmit={handleAssign} style={{ padding: "14px 16px", borderBottom: "1px solid #e9ecef", background: "#f8f9fc", display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>User</label>
            <select style={inputStyle} value={assignUserId} onChange={e => setAssignUserId(e.target.value)} required>
              <option value="">Select user…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>Agent</label>
            <select style={inputStyle} value={assignAgentId} onChange={e => setAssignAgentId(e.target.value)} required>
              <option value="">Select agent…</option>
              {agents.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={assigning} style={{ padding: "8px 18px", fontSize: 13, borderRadius: 4, border: "none", background: "#1cc88a", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
            {assigning ? "Assigning…" : "Assign"}
          </button>
        </form>

        {/* Assignments table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
              {["User", "Agent", "Assigned", ""].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a, i) => (
              <tr key={a.id} style={{ borderBottom: i < assignments.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                <td style={{ padding: "12px 16px", color: "#3d4465" }}>{a.user_email}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#e8f4fd", color: "#1a6896" }}>{a.agent_name}</span>
                </td>
                <td style={{ padding: "12px 16px", color: "#858796" }}>
                  {new Date(a.assigned_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <button onClick={() => handleUnassign(a.user_id)} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 4, border: "1px solid #e74c3c40", background: "#fff", color: "#e74c3c", cursor: "pointer" }}>
                    Unassign
                  </button>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr><td colSpan={4} style={{ padding: "40px 0", textAlign: "center", color: "#858796" }}>No assignments yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
