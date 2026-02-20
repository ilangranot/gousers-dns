"use client";
import { useEffect, useState } from "react";
import { getGptConnections, upsertGptConnection, deleteGptConnection } from "@/lib/api";
import { GptConnection } from "@/lib/types";
import { Trash2, Plus, CheckCircle, XCircle, Key } from "lucide-react";

const PROVIDERS = [
  { value: "openai",    label: "OpenAI",     subtitle: "ChatGPT / GPT-4o",           defaultModel: "gpt-4o",                       color: "#2da9e9" },
  { value: "anthropic", label: "Anthropic",  subtitle: "Claude 3.5 Sonnet",           defaultModel: "claude-3-5-sonnet-20241022",   color: "#0ec8a2" },
  { value: "gemini",    label: "Google",     subtitle: "Gemini 1.5 Pro",              defaultModel: "gemini-1.5-pro",               color: "#f6c23e" },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 13,
  border: "1px solid #d1d3e2", borderRadius: 4, color: "#3d4465",
  background: "#fff", outline: "none",
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<GptConnection[]>([]);
  const [form, setForm] = useState({ provider: "openai", api_key: "", model: "" });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => getGptConnections().then(setConnections).catch(console.error);
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertGptConnection(form);
      setForm({ provider: "openai", api_key: "", model: "" });
      setAdding(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(provider: string) {
    if (!confirm(`Remove ${provider} connection?`)) return;
    await deleteGptConnection(provider);
    load();
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>GPT Connections</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>Manage AI provider API keys</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", background: "#4e73df", color: "#fff",
            fontSize: 13, fontWeight: 600, borderRadius: 4, border: "none", cursor: "pointer",
          }}
        >
          <Plus size={15} /> Add Connection
        </button>
      </div>

      {adding && (
        <div style={{
          background: "#fff", borderRadius: 4, marginBottom: 20,
          boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", gap: 8 }}>
            <Key size={15} color="#4e73df" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>Add / Update API Key</h3>
          </div>
          <form onSubmit={submit} style={{ padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}
                style={inputStyle}>
                {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <input required type="password" placeholder="API Key" value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                style={inputStyle} />
              <input
                placeholder={`Model (default: ${PROVIDERS.find((p) => p.value === form.provider)?.defaultModel})`}
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={saving} style={{ padding: "8px 20px", background: "#4e73df", color: "#fff", fontSize: 13, fontWeight: 600, borderRadius: 4, border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={() => setAdding(false)} style={{ padding: "8px 16px", background: "#f8f9fc", color: "#6e707e", fontSize: 13, borderRadius: 4, border: "1px solid #d1d3e2", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {PROVIDERS.map((p) => {
          const conn = connections.find((c) => c.provider === p.value);
          return (
            <div key={p.value} style={{
              background: "#fff", borderRadius: 4,
              boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)",
              padding: "16px 20px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderLeft: `4px solid ${p.color}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 8,
                  background: `${p.color}18`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Key size={18} style={{ color: p.color }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: "#3d4465", fontSize: 15 }}>{p.label}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#858796" }}>
                    {conn ? `Model: ${conn.model ?? p.defaultModel}` : p.subtitle}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {conn
                    ? <CheckCircle size={16} color="#1cc88a" />
                    : <XCircle size={16} color="#d1d3e2" />
                  }
                  <span style={{ fontSize: 13, fontWeight: 600, color: conn ? "#1cc88a" : "#858796" }}>
                    {conn ? "Connected" : "Not set"}
                  </span>
                </div>
                {conn && (
                  <button onClick={() => remove(p.value)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d3e2", padding: 4 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#e74a3b")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#d1d3e2")}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
