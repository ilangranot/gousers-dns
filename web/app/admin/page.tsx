"use client";
import { useEffect, useState } from "react";
import { getAnalyticsSummary } from "@/lib/api";
import { AnalyticsSummary } from "@/lib/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  MessageSquare, ShieldAlert, Activity, Users,
  TrendingDown,
} from "lucide-react";

// AdminLTE "small-box" stat card
function SmallBox({
  label, value, sub, icon: Icon, bg,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  bg: string;
}) {
  return (
    <div style={{
      background: bg,
      borderRadius: 4,
      position: "relative",
      overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
    }}>
      <div style={{ padding: "18px 20px 24px" }}>
        <h3 style={{ fontSize: 38, fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1 }}>
          {value}
        </h3>
        <p style={{ color: "rgba(255,255,255,0.9)", margin: "6px 0 0", fontSize: 15 }}>{label}</p>
        {sub && <p style={{ color: "rgba(255,255,255,0.65)", margin: "2px 0 0", fontSize: 12 }}>{sub}</p>}
      </div>
      <div style={{
        position: "absolute", top: 12, right: 14, opacity: 0.25,
      }}>
        <Icon size={64} color="white" />
      </div>
      <div style={{
        background: "rgba(0,0,0,0.12)",
        padding: "4px 16px",
        fontSize: 12,
        color: "rgba(255,255,255,0.8)",
      }}>
        <Activity size={11} style={{ display: "inline", marginRight: 4 }} />
        Last {30} days
      </div>
    </div>
  );
}

// AdminLTE card wrapper
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 4,
      boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)",
    }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid #e9ecef",
        display: "flex", alignItems: "center",
      }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>{title}</h3>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    getAnalyticsSummary(days).then(setData).catch(console.error);
  }, [days]);

  if (!data) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#858796" }}>
        Loading analytics...
      </div>
    );
  }

  const blockRate = data.total_messages
    ? ((data.blocked_messages / data.total_messages) * 100).toFixed(1)
    : "0";

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>Dashboard</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>
            AI gateway activity overview
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{
            background: "#fff", border: "1px solid #d1d3e2", color: "#6e707e",
            fontSize: 13, borderRadius: 4, padding: "6px 12px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Small-box stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <SmallBox
          label="Total Messages"
          value={data.total_messages}
          icon={MessageSquare}
          bg="#4e73df"
        />
        <SmallBox
          label="Blocked Messages"
          value={data.blocked_messages}
          sub={`${blockRate}% block rate`}
          icon={ShieldAlert}
          bg="#e74a3b"
        />
        <SmallBox
          label="Active Sessions"
          value={data.active_sessions}
          icon={Activity}
          bg="#1cc88a"
        />
        <SmallBox
          label="Active Users"
          value={data.active_users}
          icon={Users}
          bg="#f6c23e"
        />
      </div>

      {/* Chart row */}
      <div style={{ marginBottom: 24 }}>
        <Card title="Messages per Day">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.messages_by_day}>
              <XAxis dataKey="day" tick={{ fill: "#858796", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#858796", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #e3e6f0", borderRadius: 4, fontSize: 12 }}
                cursor={{ fill: "rgba(78,115,223,0.05)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#6c757d" }} />
              <Bar dataKey="total" name="Total" fill="#4e73df" radius={[2, 2, 0, 0]} />
              <Bar dataKey="blocked" name="Blocked" fill="#e74a3b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Two-column row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* By provider */}
        <Card title="Messages by Provider">
          <div>
            {Object.entries(data.messages_by_provider).map(([provider, count]) => {
              const total = data.total_messages || 1;
              const pct = Math.round((count / total) * 100);
              const colors: Record<string, string> = {
                openai: "#4e73df", anthropic: "#1cc88a", gemini: "#f6c23e",
              };
              const color = colors[provider] ?? "#858796";
              return (
                <div key={provider} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#495057", textTransform: "capitalize" }}>{provider}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#3d4465" }}>{count} <span style={{ color: "#858796", fontWeight: 400 }}>({pct}%)</span></span>
                  </div>
                  <div style={{ height: 6, background: "#e9ecef", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.5s" }} />
                  </div>
                </div>
              );
            })}
            {Object.keys(data.messages_by_provider).length === 0 && (
              <p style={{ color: "#858796", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No data yet</p>
            )}
          </div>
        </Card>

        {/* Top block reasons */}
        <Card title="Top Block Reasons">
          <div>
            {data.top_blocked_rules.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0", color: "#858796" }}>
                <TrendingDown size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p style={{ fontSize: 13 }}>No blocked messages</p>
              </div>
            )}
            {data.top_blocked_rules.map((r, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: i < data.top_blocked_rules.length - 1 ? "1px solid #f0f0f0" : "none",
              }}>
                <span style={{ fontSize: 13, color: "#495057", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                  {r.reason}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  background: "#fde8e8", color: "#c0392b",
                  padding: "2px 8px", borderRadius: 10,
                }}>
                  {r.count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
