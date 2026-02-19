"use client";
import { useEffect, useState } from "react";
import { getFilteringRules, createFilteringRule, updateFilteringRule, deleteFilteringRule } from "@/lib/api";
import { FilteringRule } from "@/lib/types";
import { Trash2, Plus, ToggleLeft, ToggleRight } from "lucide-react";

type RuleType = "keyword" | "regex" | "pii" | "semantic"
type RuleAction = "block" | "allow" | "modify"
const EMPTY: { name: string; type: RuleType; pattern: string; action: RuleAction; priority: number } =
  { name: "", type: "keyword", pattern: "", action: "block", priority: 0 };

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Filtering Rules</h1>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={16} /> Add Rule
        </button>
      </div>

      {adding && (
        <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white">New Rule</h2>
          <div className="grid grid-cols-2 gap-4">
            <input required placeholder="Rule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
              <option value="keyword">Keyword</option>
              <option value="regex">Regex</option>
              <option value="pii">PII Detection</option>
              <option value="semantic">Semantic (Llama)</option>
            </select>
            <input
              placeholder={
                form.type === "pii"
                  ? 'PII types to block: ALL  or e.g. "email address,phone number,US SSN"'
                  : form.type === "semantic"
                  ? "Describe what to block, e.g. 'messages containing personal information'"
                  : "Pattern / keyword to match"
              }
              value={form.pattern}
              onChange={(e) => setForm({ ...form, pattern: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 col-span-2"
            />
            <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as any })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
              <option value="block">Block</option>
              <option value="allow">Allow</option>
              <option value="modify">Modify</option>
            </select>
            <input type="number" placeholder="Priority (higher = first)" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div className="flex gap-3">
            <button type="submit" className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg transition-colors">Save</button>
            <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
              <th className="text-left px-6 py-3">Name</th>
              <th className="text-left px-6 py-3">Type</th>
              <th className="text-left px-6 py-3">Pattern</th>
              <th className="text-left px-6 py-3">Action</th>
              <th className="text-left px-6 py-3">Priority</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                <td className="px-6 py-3 text-white font-medium">{r.name}</td>
                <td className="px-6 py-3 text-gray-400 capitalize">{r.type}</td>
                <td className="px-6 py-3 text-gray-400 font-mono text-xs max-w-[200px] truncate">{r.pattern}</td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.action === "block" ? "bg-red-900/50 text-red-300" : r.action === "modify" ? "bg-yellow-900/50 text-yellow-300" : "bg-green-900/50 text-green-300"}`}>
                    {r.action}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-400">{r.priority}</td>
                <td className="px-6 py-3 flex items-center gap-3 justify-end">
                  <button onClick={() => toggle(r)} className="text-gray-400 hover:text-white transition-colors">
                    {r.is_active ? <ToggleRight size={20} className="text-brand-500" /> : <ToggleLeft size={20} />}
                  </button>
                  <button onClick={() => remove(r.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No rules yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
