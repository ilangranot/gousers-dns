"use client";

import { useEffect, useState } from "react";
import { getSuperAdminOrgs } from "@/lib/api";
import type { SuperAdminOrg } from "@/lib/types";
import Link from "next/link";

export default function SuperAdminOrgsPage() {
  const [orgs, setOrgs] = useState<SuperAdminOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSuperAdminOrgs()
      .then(setOrgs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "rgb(var(--text-muted))" }}>Loading…</p>;
  if (error) return <p style={{ color: "rgb(var(--danger))" }}>Error: {error}</p>;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "rgb(var(--text))", marginBottom: 24 }}>
        All Organizations
      </h1>

      <div style={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border))", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgb(var(--border))" }}>
              {["Name", "Schema", "Members", "Messages", "Blocked", "Last Active", "Created"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 16px",
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
            {orgs.map((org) => (
              <tr key={org.id} style={{ borderBottom: "1px solid rgb(var(--border))" }}>
                <td style={{ padding: "12px 16px" }}>
                  <Link
                    href={`/superadmin/orgs/${org.id}`}
                    style={{ color: "rgb(var(--accent))", textDecoration: "none", fontWeight: 500 }}
                  >
                    {org.name}
                  </Link>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "rgb(var(--text-muted))", fontFamily: "monospace" }}>
                  {org.schema_name}
                </td>
                <td style={{ padding: "12px 16px", color: "rgb(var(--text))" }}>{org.member_count}</td>
                <td style={{ padding: "12px 16px", color: "rgb(var(--text))" }}>{org.message_count}</td>
                <td style={{ padding: "12px 16px", color: org.blocked_count > 0 ? "rgb(var(--danger))" : "rgb(var(--text))" }}>
                  {org.blocked_count}
                </td>
                <td style={{ padding: "12px 16px", color: "rgb(var(--text-muted))", fontSize: 13 }}>
                  {org.last_active ? new Date(org.last_active).toLocaleDateString() : "—"}
                </td>
                <td style={{ padding: "12px 16px", color: "rgb(var(--text-muted))", fontSize: 13 }}>
                  {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "24px 16px", textAlign: "center", color: "rgb(var(--text-muted))" }}>
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
