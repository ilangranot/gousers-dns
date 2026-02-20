"use client";
import { useEffect, useState } from "react";
import { getFilteringRules, createFilteringRule, updateFilteringRule, deleteFilteringRule } from "@/lib/api";
import { FilteringRule } from "@/lib/types";
import { Trash2, Plus, ToggleLeft, ToggleRight, Filter } from "lucide-react";

type RuleType = "keyword" | "regex" | "pii" | "semantic";
type RuleAction = "block" | "allow" | "modify";
const EMPTY: { name: string; type: RuleType; pattern: string; action: RuleAction; priority: number } =
  { name: "", type: "keyword", pattern: "", action: "block", priority: 0 };

const ACTION_STYLES: Record<string, { bg: string; color: string }> = {
  block:  { bg: "#fde8e8", color: "#c0392b" },
  allow:  { bg: "#d4edda", color: "#155724" },
  modify: { bg: "#fff3cd", color: "#856404" },
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 13,
  border: "1px solid #d1d3e2", borderRadius: 4, color: "#3d4465",
  background: "#fff", outline: "none",
};

export default function FilteringPage() {
  const [rules, setRules] = useState<FilteringRule[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);

  const load = () => getFilteringRules().then(setRules).catch(console.error);
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await createFilteringRule(form);
    setForm(EMPTY);
    setAdding(false);
    load();
  }

  async function toggle(rule: FilteringRule) {
    await updateFilteringRule(rule.id, { is_active: !rule.is_active });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this rule?")) return;
    await deleteFilteringRule(id);
    load();
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>Filtering Rules</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>Control what messages are blocked or allowed</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", background: "#4e73df", color: "#fff",
            fontSize: 13, fontWeight: 600, borderRadius: 4, border: "none",
            cursor: "pointer",
          }}
        >
          <Plus size={15} /> Add Rule
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{
          background: "#fff", borderRadius: 4, marginBottom: 20,
          boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", gap: 8 }}>
            <Filter size={15} color="#4e73df" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>New Rule</h3>
          </div>
          <form onSubmit={submit} style={{ padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <input required placeholder="Rule name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={inputStyle} />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as RuleType })}
                style={inputStyle}>
                <option value="keyword">Keyword</option>
                <option value="regex">Regex</option>
                <option value="pii">PII Detection</option>
                <option value="semantic">Semantic (Llama)</option>
              </select>
              <input
                placeholder={
                  form.type === "pii" ? 'PII types: ALL or "email address,phone number"' :
                  form.type === "semantic" ? "Describe what to block" : "Pattern / keyword"
                }
                value={form.pattern}
                onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                style={{ ...inputStyle, gridColumn: "1 / -1" }}
              />
              <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as RuleAction })}
                style={inputStyle}>
                <option value="block">Block</option>
                <option value="allow">Allow</option>
                <option value="modify">Modify</option>
              </select>
              <input type="number" placeholder="Priority (higher = first)" value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={{ padding: "8px 20px", background: "#4e73df", color: "#fff", fontSize: 13, fontWeight: 600, borderRadius: 4, border: "none", cursor: "pointer" }}>
                Save Rule
              </button>
              <button type="button" onClick={() => setAdding(false)} style={{ padding: "8px 16px", background: "#f8f9fc", color: "#6e707e", fontSize: 13, borderRadius: 4, border: "1px solid #d1d3e2", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rules table */}
      <div style={{
        background: "#fff", borderRadius: 4,
        boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>
            Active Rules <span style={{ fontSize: 12, fontWeight: 400, color: "#858796" }}>({rules.length})</span>
          </h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
              {["Name", "Type", "Pattern", "Action", "Priority", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: i < rules.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                <td style={{ padding: "12px 16px", color: "#3d4465", fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: "12px 16px", color: "#858796", textTransform: "capitalize" }}>{r.type}</td>
                <td style={{ padding: "12px 16px", color: "#858796", fontFamily: "monospace", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.pattern}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{
                    padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                    ...ACTION_STYLES[r.action],
                  }}>
                    {r.action}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "#858796" }}>{r.priority}</td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
                    <button onClick={() => toggle(r)} style={{ background: "none", border: "none", cursor: "pointer", color: r.is_active ? "#4e73df" : "#adb5bd" }}>
                      {r.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                    <button onClick={() => remove(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d3e2" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#e74a3b")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#d1d3e2")}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "40px 0", textAlign: "center", color: "#858796", fontSize: 13 }}>
                  No rules yet — add one above
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
