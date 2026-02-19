"use client";
import { useEffect, useState } from "react";
import { getConversations, getConversation } from "@/lib/api";
import { Message } from "@/lib/types";

interface ConvSummary {
  id: string;
  title: string | null;
  gpt_target: string;
  user_email: string;
  message_count: number;
  blocked_count: number;
  updated_at: string;
}

export default function ConversationsPage() {
  const [convs, setConvs] = useState<ConvSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => { getConversations().then(setConvs).catch(console.error); }, []);

  async function open(id: string) {
    setSelected(id);
    const msgs = await getConversation(id);
    setMessages(msgs);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Conversations</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="divide-y divide-gray-800">
            {convs.map((c) => (
              <button key={c.id} onClick={() => open(c.id)}
                className={`w-full text-left px-5 py-4 hover:bg-gray-800/50 transition-colors ${selected === c.id ? "bg-gray-800" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.title ?? "Untitled"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{c.user_email} · {c.gpt_target}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">{c.message_count} msgs</p>
                    {c.blocked_count > 0 && <p className="text-xs text-red-400">{c.blocked_count} blocked</p>}
                  </div>
                </div>
              </button>
            ))}
            {convs.length === 0 && <p className="px-5 py-8 text-center text-gray-500 text-sm">No conversations yet</p>}
          </div>
        </div>

        {/* Detail */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-y-auto max-h-[70vh]">
          {!selected && <p className="text-gray-500 text-sm text-center pt-8">Select a conversation</p>}
          {messages.map((m) => (
            <div key={m.id} className={`mb-3 ${m.role === "user" ? "text-right" : "text-left"}`}>
              <span className="text-xs text-gray-500 block mb-1">{m.role}</span>
              <div className={`inline-block max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                m.was_blocked ? "bg-red-900/40 text-red-300 border border-red-800" :
                m.role === "user" ? "bg-brand-600/30 text-white" : "bg-gray-800 text-gray-200"}`}>
                {m.was_blocked ? `[BLOCKED] ${m.block_reason}` : m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
