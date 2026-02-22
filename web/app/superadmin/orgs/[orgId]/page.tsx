"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getOrgMembers, getOrgUsage } from "@/lib/api";
import type { SuperAdminMember, SuperAdminUsageDay } from "@/lib/types";

export default function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [members, setMembers] = useState<SuperAdminMember[]>([]);
  const [usage, setUsage] = useState<SuperAdminUsageDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([getOrgMembers(orgId), getOrgUsage(orgId, 30)])
      .then(([m, u]) => {
        setMembers(m);
        setUsage(u);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <p style={{ color: "rgb(var(--text-muted))" }}>Loading…</p>;
  if (error) return <p style={{ color: "rgb(var(--danger))" }}>Error: {error}</p>;

  const maxTotal = Math.max(...usage.map((d) => d.total), 1);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "rgb(var(--text))", marginBottom: 8 }}>
        Organization Detail
      </h1>
      <p style={{ color: "rgb(var(--text-muted))", fontSize: 13, marginBottom: 32 }}>
        ID: <code style={{ fontFamily: "monospace" }}>{orgId}</code>
      </p>

      {/* Usage chart (last 30 days) */}
      <div
        style={{
          background: "rgb(var(--bg-surface))",
          border: "1px solid rgb(var(--border))",
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgb(var(--text))", marginBottom: 16 }}>
          Usage — last 30 days
        </h2>
        {usage.length === 0 ? (
          <p style={{ color: "rgb(var(--text-muted))", fontSize: 14 }}>No messages in this period.</p>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
            {usage.map((day) => (
              <div key={day.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div
                  title={`${day.day}: ${day.total} msgs, ${day.blocked} blocked`}
                  style={{
                    width: "100%",
                    height: `${Math.round((day.total / maxTotal) * 64)}px`,
                    background: "rgb(var(--accent))",
                    borderRadius: 2,
                    minHeight: 2,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Members table */}
      <div style={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border))", borderRadius: 8 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgb(var(--border))" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgb(var(--text))", margin: 0 }}>
            Members ({members.length})
          </h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgb(var(--border))" }}>
              {["Email", "Role", "Joined"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 20px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "rgb(var(--text-muted))",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid rgb(var(--border))" }}>
                <td style={{ padding: "12px 20px", color: "rgb(var(--text))" }}>{m.email}</td>
                <td style={{ padding: "12px 20px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      background: m.role === "admin" ? "rgba(var(--accent), 0.15)" : "rgba(var(--border), 0.5)",
                      color: m.role === "admin" ? "rgb(var(--accent))" : "rgb(var(--text-muted))",
                    }}
                  >
                    {m.role}
                  </span>
                </td>
                <td style={{ padding: "12px 20px", color: "rgb(var(--text-muted))", fontSize: 13 }}>
                  {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: "24px 20px", textAlign: "center", color: "rgb(var(--text-muted))" }}>
                  No members
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
