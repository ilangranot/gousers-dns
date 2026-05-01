"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getOrgMembers, getOrgUsage, getOrgSessionLog,
  deleteOrgMember, deleteOrgMemberAccount, toggleMemberDisabled, sendMemberResetPassword,
} from "@/lib/api";
import type { SuperAdminMember, SuperAdminUsageDay, SuperAdminSessionLog } from "@/lib/types";
import { Trash2, Ban, CheckCircle, Mail, Clock, UserX } from "lucide-react";

type Tab = "members" | "usage" | "session-log";

export default function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState<SuperAdminMember[]>([]);
  const [usage, setUsage] = useState<SuperAdminUsageDay[]>([]);
  const [sessionLog, setSessionLog] = useState<SuperAdminSessionLog[]>([]);
  const [logDays, setLogDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [resetLink, setResetLink] = useState<{ email: string; url: string } | null>(null);

  const loadMembers = () => getOrgMembers(orgId).then(setMembers).catch((e) => setError(e.message));
  const loadUsage = () => getOrgUsage(orgId, 30).then(setUsage).catch((e) => setError(e.message));
  const loadSessionLog = () => getOrgSessionLog(orgId, logDays).then(setSessionLog).catch((e) => setError(e.message));

  useEffect(() => {
    if (!orgId) return;
    Promise.all([loadMembers(), loadUsage()])
      .finally(() => setLoading(false));
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "session-log") loadSessionLog();
  }, [tab, logDays]); // eslint-disable-line react-hooks/exhaustive-deps

  function flash(msg: string) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(""), 3000);
  }

  async function handleDeleteMember(m: SuperAdminMember) {
    if (!confirm(`Remove ${m.email} from this organization?`)) return;
    await deleteOrgMember(orgId, m.id).catch((e) => alert(e.message));
    flash(`${m.email} removed`);
    loadMembers();
  }

  async function handleToggleDisabled(m: SuperAdminMember) {
    const newDisabled = !m.is_disabled;
    await toggleMemberDisabled(orgId, m.id, newDisabled).catch((e) => alert(e.message));
    flash(`${m.email} ${newDisabled ? "disabled" : "re-enabled"}`);
    loadMembers();
  }

  async function handleResetPassword(m: SuperAdminMember) {
    if (!confirm(`Send password reset email to ${m.email}?`)) return;
    const result = await sendMemberResetPassword(orgId, m.id).catch((e: Error) => { alert(e.message); return null; }) as { reset_url?: string } | null;
    if (result) {
      flash(`Reset email sent to ${m.email}`);
      if (result.reset_url) setResetLink({ email: m.email, url: result.reset_url });
    }
  }

  async function handleDeleteAccount(m: SuperAdminMember) {
    if (!confirm(`PERMANENTLY DELETE account for ${m.email}?\n\nThis will remove their ability to log in.`)) return;
    await deleteOrgMemberAccount(orgId, m.id).catch((e: Error) => alert(e.message));
    flash(`Account for ${m.email} permanently deleted`);
    loadMembers();
  }

  const tabStyle = (t: Tab) => ({
    padding: "10px 18px",
    border: "none",
    borderBottom: tab === t ? "2px solid rgb(var(--accent))" : "2px solid transparent",
    background: "transparent",
    color: tab === t ? "rgb(var(--accent))" : "rgb(var(--text-muted))",
    fontWeight: tab === t ? 600 : 400,
    fontSize: 13,
    cursor: "pointer",
  } as React.CSSProperties);

  const maxTotal = Math.max(...usage.map((d) => d.total), 1);

  if (loading) return <p style={{ color: "rgb(var(--text-muted))" }}>Loading…</p>;
  if (error) return <p style={{ color: "rgb(var(--danger))" }}>Error: {error}</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgb(var(--text))", marginBottom: 4 }}>
        Organization Detail
      </h1>
      <p style={{ color: "rgb(var(--text-muted))", fontSize: 13, marginBottom: 20 }}>
        ID: <code style={{ fontFamily: "monospace" }}>{orgId}</code>
      </p>

      {actionMsg && (
        <div style={{ background: "rgba(var(--success),0.12)", border: "1px solid rgba(var(--success),0.3)", borderRadius: 6, padding: "8px 14px", marginBottom: 16, fontSize: 13, color: "rgb(var(--success))" }}>
          {actionMsg}
        </div>
      )}

      {resetLink && (
        <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 6, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: "rgb(var(--text))" }}>
              Reset link for {resetLink.email} (share if email did not arrive)
            </span>
            <button onClick={() => setResetLink(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgb(var(--text-muted))", fontSize: 16 }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              readOnly
              value={resetLink.url}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{ flex: 1, padding: "6px 10px", borderRadius: 4, border: "1px solid rgb(var(--border))", background: "rgb(var(--bg-elevated))", color: "rgb(var(--text))", fontSize: 12, fontFamily: "monospace" }}
            />
            <button
              onClick={() => navigator.clipboard.writeText(resetLink.url)}
              style={{ padding: "6px 14px", borderRadius: 4, border: "1px solid rgb(var(--border))", background: "rgb(var(--bg-elevated))", color: "rgb(var(--text-muted))", fontSize: 12, cursor: "pointer" }}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ borderBottom: "1px solid rgb(var(--border))", marginBottom: 24, display: "flex" }}>
        <button style={tabStyle("members")} onClick={() => setTab("members")}>Members ({members.length})</button>
        <button style={tabStyle("usage")} onClick={() => setTab("usage")}>Usage (30d)</button>
        <button style={tabStyle("session-log")} onClick={() => setTab("session-log")}>
          <Clock size={12} style={{ marginRight: 5, verticalAlign: "middle" }} />
          Session Log
        </button>
      </div>

      {/* Members tab */}
      {tab === "members" && (
        <div style={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border))", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgb(var(--border))" }}>
                {["Email", "Role", "Status", "Joined", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "rgb(var(--text-muted))", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid rgb(var(--border))", opacity: m.is_disabled ? 0.6 : 1 }}>
                  <td style={{ padding: "12px 20px", color: "rgb(var(--text))" }}>{m.email}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500,
                      background: m.role === "admin" ? "rgba(var(--accent),0.15)" : "rgba(var(--border),0.5)",
                      color: m.role === "admin" ? "rgb(var(--accent))" : "rgb(var(--text-muted))" }}>
                      {m.role}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    {m.is_disabled ? (
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "rgba(var(--danger),0.12)", color: "rgb(var(--danger))" }}>Disabled</span>
                    ) : (
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "rgba(var(--success),0.12)", color: "rgb(var(--success))" }}>Active</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 20px", color: "rgb(var(--text-muted))", fontSize: 13 }}>
                    {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleToggleDisabled(m)}
                        title={m.is_disabled ? "Re-enable account" : "Disable account"}
                        style={{ padding: "4px 10px", fontSize: 11, borderRadius: 4, border: "1px solid rgb(var(--border))", background: "rgb(var(--bg-elevated))", color: "rgb(var(--text-muted))", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        {m.is_disabled ? <CheckCircle size={12} /> : <Ban size={12} />}
                        {m.is_disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        onClick={() => handleResetPassword(m)}
                        title="Send password reset"
                        style={{ padding: "4px 10px", fontSize: 11, borderRadius: 4, border: "1px solid rgb(var(--border))", background: "rgb(var(--bg-elevated))", color: "rgb(var(--text-muted))", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <Mail size={12} /> Reset pwd
                      </button>
                      <button
                        onClick={() => handleDeleteMember(m)}
                        title="Remove from org (keeps account)"
                        style={{ padding: "4px 8px", fontSize: 11, borderRadius: 4, border: "1px solid rgba(var(--danger),0.3)", background: "rgba(var(--danger),0.05)", color: "rgb(var(--danger))", cursor: "pointer" }}
                      >
                        <Trash2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(m)}
                        title="Delete account permanently"
                        style={{ padding: "4px 10px", fontSize: 11, borderRadius: 4, border: "1px solid rgba(var(--danger),0.5)", background: "rgba(var(--danger),0.12)", color: "rgb(var(--danger))", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <UserX size={12} /> Delete acct
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={5} style={{ padding: "24px 20px", textAlign: "center", color: "rgb(var(--text-muted))" }}>No members</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Usage tab */}
      {tab === "usage" && (
        <div style={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border))", borderRadius: 8, padding: "20px 24px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "rgb(var(--text))", marginBottom: 16 }}>Usage — last 30 days</h2>
          {usage.length === 0 ? (
            <p style={{ color: "rgb(var(--text-muted))", fontSize: 14 }}>No messages in this period.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
              {usage.map((day) => (
                <div key={day.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div
                    title={`${day.day}: ${day.total} msgs, ${day.blocked} blocked`}
                    style={{ width: "100%", height: `${Math.round((day.total / maxTotal) * 64)}px`, background: "rgb(var(--accent))", borderRadius: 2, minHeight: 2 }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Session Log tab */}
      {tab === "session-log" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "rgb(var(--text-muted))" }}>Time range:</span>
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setLogDays(d)}
                style={{ padding: "5px 14px", fontSize: 12, borderRadius: 4, border: "1px solid rgb(var(--border))",
                  background: logDays === d ? "rgb(var(--accent))" : "rgb(var(--bg-surface))",
                  color: logDays === d ? "#fff" : "rgb(var(--text-muted))", cursor: "pointer" }}>
                {d}d
              </button>
            ))}
          </div>
          <div style={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border))", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgb(var(--border))" }}>
                  {["User", "Title", "Provider", "Start Time", "End Time", "Messages", "Blocked"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "rgb(var(--text-muted))", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessionLog.map((s) => (
                  <tr key={s.session_id} style={{ borderBottom: "1px solid rgb(var(--border))" }}>
                    <td style={{ padding: "10px 16px", color: "rgb(var(--text))" }}>{s.email}</td>
                    <td style={{ padding: "10px 16px", color: "rgb(var(--text-muted))", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.title ?? "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: "rgba(var(--accent),0.12)", color: "rgb(var(--accent))" }}>
                        {s.gpt_target}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", color: "rgb(var(--text-muted))" }}>
                      {new Date(s.start_time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "10px 16px", color: "rgb(var(--text-muted))" }}>
                      {new Date(s.end_time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "10px 16px", color: "rgb(var(--text))" }}>{s.message_count}</td>
                    <td style={{ padding: "10px 16px", color: s.blocked_count > 0 ? "rgb(var(--danger))" : "rgb(var(--text-muted))" }}>{s.blocked_count}</td>
                  </tr>
                ))}
                {sessionLog.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: "24px 16px", textAlign: "center", color: "rgb(var(--text-muted))" }}>No sessions in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
