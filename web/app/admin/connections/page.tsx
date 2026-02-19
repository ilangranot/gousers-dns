"use client";
import { useEffect, useState } from "react";
import { getGptConnections, upsertGptConnection, deleteGptConnection } from "@/lib/api";
import { GptConnection } from "@/lib/types";
import { Trash2, Plus } from "lucide-react";

const PROVIDERS = [
  { value: "openai", label: "OpenAI (ChatGPT)", defaultModel: "gpt-4o" },
  { value: "anthropic", label: "Anthropic (Claude)", defaultModel: "claude-3-5-sonnet-20241022" },
  { value: "gemini", label: "Google (Gemini)", defaultModel: "gemini-1.5-pro" },
];

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

  const connected = new Set(connections.map((c) => c.provider));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">GPT Connections</h1>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg transition-colors">
          <Plus size={16} /> Add Connection
        </button>
      </div>

      {adding && (
        <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white">Add / Update API Key</h2>
          <div className="grid grid-cols-1 gap-4 max-w-lg">
            <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
              {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <input required type="password" placeholder="API Key" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500" />
            <input placeholder={`Model (default: ${PROVIDERS.find(p => p.value === form.provider)?.defaultModel})`} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-4">
        {PROVIDERS.map((p) => {
          const conn = connections.find((c) => c.provider === p.value);
          return (
            <div key={p.value} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="font-medium text-white">{p.label}</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {conn ? `Model: ${conn.model ?? p.defaultModel}` : "Not configured"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${conn ? "bg-green-900/50 text-green-300" : "bg-gray-800 text-gray-500"}`}>
                  {conn ? "Connected" : "Not set"}
                </span>
                {conn && (
                  <button onClick={() => remove(p.value)} className="text-gray-600 hover:text-red-400 transition-colors">
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
