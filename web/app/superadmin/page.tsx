"use client";

import { useEffect, useState } from "react";
import { getSuperAdminOverview, getSuperAdminOrgs } from "@/lib/api";
import type { SuperAdminOverview, SuperAdminOrg } from "@/lib/types";
import Link from "next/link";

export default function SuperAdminPage() {
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null);
  const [topOrgs, setTopOrgs] = useState<SuperAdminOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSuperAdminOverview(), getSuperAdminOrgs()])
      .then(([ov, orgs]) => {
        setOverview(ov);
        const sorted = [...orgs].sort((a, b) => b.message_count - a.message_count).slice(0, 5);
        setTopOrgs(sorted);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "rgb(var(--text-muted))" }}>Loading…</p>;
  if (error) return <p style={{ color: "rgb(var(--danger))" }}>Error: {error}</p>;

  const cards = [
    { label: "Organizations", value: overview?.total_orgs ?? 0 },
    { label: "Total Users", value: overview?.total_users ?? 0 },
    { label: "Total Messages", value: overview?.total_messages ?? 0 },
    { label: "Blocked Messages", value: overview?.total_blocked ?? 0 },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "rgb(var(--text))", marginBottom: 24 }}>
        Platform Overview
      </h1>

      {/* Overview cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              background: "rgb(var(--bg-surface))",
              border: "1px solid rgb(var(--border))",
              borderRadius: 8,
              padding: "20px 24px",
            }}
          >
            <div style={{ fontSize: 13, color: "rgb(var(--text-muted))", marginBottom: 8 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "rgb(var(--text))" }}>{card.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Top orgs table */}
      <div style={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border))", borderRadius: 8 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgb(var(--border))" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgb(var(--text))", margin: 0 }}>
            Top Organizations (by messages)
          </h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgb(var(--border))" }}>
              {["Name", "Members", "Messages", "Blocked", "Last Active"].map((h) => (
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
            {topOrgs.map((org) => (
              <tr key={org.id} style={{ borderBottom: "1px solid rgb(var(--border))" }}>
                <td style={{ padding: "12px 20px" }}>
                  <Link
                    href={`/superadmin/orgs/${org.id}`}
                    style={{ color: "rgb(var(--accent))", textDecoration: "none", fontWeight: 500 }}
                  >
                    {org.name}
                  </Link>
                </td>
                <td style={{ padding: "12px 20px", color: "rgb(var(--text))" }}>{org.member_count}</td>
                <td style={{ padding: "12px 20px", color: "rgb(var(--text))" }}>{org.message_count}</td>
                <td style={{ padding: "12px 20px", color: org.blocked_count > 0 ? "rgb(var(--danger))" : "rgb(var(--text))" }}>
                  {org.blocked_count}
                </td>
                <td style={{ padding: "12px 20px", color: "rgb(var(--text-muted))", fontSize: 13 }}>
                  {org.last_active ? new Date(org.last_active).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {topOrgs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "24px 20px", textAlign: "center", color: "rgb(var(--text-muted))" }}>
                  No organizations yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
