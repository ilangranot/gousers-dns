"use client";
import { useEffect, useState } from "react";
import { getAnalyticsSummary } from "@/lib/api";
import { AnalyticsSummary } from "@/lib/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export default function AdminOverview() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    getAnalyticsSummary(days).then(setData).catch(console.error);
  }, [days]);

  if (!data) return <div className="text-gray-400">Loading analytics...</div>;

  const blockRate = data.total_messages
    ? ((data.blocked_messages / data.total_messages) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Messages", value: data.total_messages },
          { label: "Blocked", value: `${data.blocked_messages} (${blockRate}%)` },
          { label: "Active Sessions", value: data.active_sessions },
          { label: "Active Users", value: data.active_users },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{s.label}</p>
            <p className="text-3xl font-bold text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Messages over time */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Messages per day
        </h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.messages_by_day}>
            <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 12 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
            <Tooltip contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8 }} />
            <Legend />
            <Bar dataKey="total" name="Total" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            <Bar dataKey="blocked" name="Blocked" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By provider */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            By Provider
          </h2>
          <div className="space-y-3">
            {Object.entries(data.messages_by_provider).map(([provider, count]) => (
              <div key={provider} className="flex items-center justify-between">
                <span className="text-sm text-gray-300 capitalize">{provider}</span>
                <span className="text-sm font-semibold text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top blocked */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Top Block Reasons
          </h2>
          <div className="space-y-2">
            {data.top_blocked_rules.length === 0 && (
              <p className="text-sm text-gray-500">No blocked messages</p>
            )}
            {data.top_blocked_rules.map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-300 truncate max-w-[80%]">{r.reason}</span>
                <span className="text-sm font-semibold text-red-400">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
