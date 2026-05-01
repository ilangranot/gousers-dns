"use client";
import { useEffect, useState } from "react";
import { useSession, signOut, getSession } from "next-auth/react";
import {
  getUsers, updateUserRole, removeUser,
  getInvitations, createInvitation, revokeInvitation,
  getTeamAnalytics, triggerUsageAssessment,
  createOrganization, getTeamConnections,
} from "@/lib/api";
import { User, Invitation, TeamUserStats, TeamConnection } from "@/lib/types";
import { Shield, UserCheck, UserPlus, Mail, BarChart2, Trash2, Building2, Wifi } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

type Tab = "members" | "invitations" | "analytics" | "connections";

export default function TeamPage() {
  const { data: session, update } = useSession();
  const orgKey = (session as { orgKey?: string } | null)?.orgKey ?? "";
  const isPersonalWorkspace = !orgKey || orgKey.startsWith("personal_");
  const [tab, setTab] = useState<Tab>("members");
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [stats, setStats] = useState<TeamUserStats[]>([]);
  const [days, setDays] = useState(30);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  // Create org state
  const [orgName, setOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState("");

  // Connections
  const [teamConnections, setTeamConnections] = useState<TeamConnection[]>([]);

  // Usage assessment state
  const [assessing, setAssessing] = useState(false);
  const [assessMsg, setAssessMsg] = useState("");

  const loadUsers = () => getUsers().then(setUsers).catch(console.error);
  const loadInvitations = () => getInvitations().then(setInvitations).catch(console.error);
  const loadStats = () => getTeamAnalytics(days).then(setStats).catch(console.error);
  const loadTeamConnections = () => getTeamConnections().then(setTeamConnections).catch(console.error);

  useEffect(() => { loadUsers(); loadInvitations(); }, []);
  useEffect(() => { if (tab === "analytics") loadStats(); }, [tab, days]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "connections") loadTeamConnections(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const myId = session?.user?.id ?? "";

  async function toggleRole(user: User) {
    if (user.provider_user_id === myId && user.role === "admin") {
      alert("You cannot demote yourself. Ask another admin to change your role.");
      return;
    }
    await updateUserRole(user.id, user.role === "admin" ? "member" : "admin");
    loadUsers();
  }

  async function handleRemoveUser(user: User) {
    if (!confirm(`Remove ${user.email}?`)) return;
    await removeUser(user.id).catch(console.error);
    loadUsers();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviteLink("");
    setInviting(true);
    try {
      const result = await createInvitation({ email: inviteEmail, role: inviteRole }) as { invite_url?: string };
      setInviteEmail("");
      setInviteLink(result.invite_url ?? "");
      loadInvitations();
    } catch (err: any) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(inv: Invitation) {
    if (!confirm(`Revoke invitation for ${inv.email}?`)) return;
    await revokeInvitation(inv.id).catch(console.error);
    loadInvitations();
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setCreateOrgError("");
    setCreatingOrg(true);
    try {
      const result = await createOrganization(orgName) as { org_key: string };
      // Update the session JWT with the new org key (no signOut needed)
      await update({ orgKey: result.org_key, orgRole: "admin" });
      // Reload to pick up new org context
      window.location.href = "/admin";
    } catch (err: any) {
      setCreateOrgError(err.message);
      setCreatingOrg(false);
    }
  }

  async function handleAssessLevels() {
    setAssessing(true);
    setAssessMsg("");
    try {
      await triggerUsageAssessment();
      setAssessMsg("Usage assessment queued. Results will update shortly.");
    } catch (err: any) {
      setAssessMsg(`Error: ${err.message}`);
    } finally {
      setAssessing(false);
      setTimeout(() => setAssessMsg(""), 5000);
    }
  }

  const totalMessages = stats.reduce((s, u) => s + u.message_count, 0);
  const totalBlocked = stats.reduce((s, u) => s + u.blocked_count, 0);
  const avgBlockRate = stats.length
    ? (stats.reduce((s, u) => s + (u.block_rate_pct ?? 0), 0) / stats.length).toFixed(1)
    : "0";

  function usageLevelBadge(level: string) {
    const map: Record<string, { bg: string; color: string }> = {
      beginner:     { bg: "#f0f0f5",   color: "#858796" },
      intermediate: { bg: "#dbeafe",   color: "#1d4ed8" },
      advanced:     { bg: "#dcfce7",   color: "#15803d" },
      power_user:   { bg: "#fef9c3",   color: "#a16207" },
    };
    const style = map[level] ?? { bg: "#f0f0f5", color: "#858796" };
    return (
      <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: style.bg, color: style.color }}>
        {level.replace("_", " ")}
      </span>
    );
  }

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: "10px 20px",
    border: "none",
    borderBottom: tab === t ? "2px solid #4e73df" : "2px solid transparent",
    background: "transparent",
    color: tab === t ? "#4e73df" : "#858796",
    fontWeight: tab === t ? 600 : 400,
    fontSize: 14,
    cursor: "pointer",
  });

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 4,
    boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)",
    padding: "20px 24px",
    flex: 1,
    minWidth: 160,
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>Team</h1>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>
          Manage members, send invitations, and view team analytics
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ borderBottom: "1px solid #e9ecef", marginBottom: 24, display: "flex" }}>
        <button style={tabStyle("members")} onClick={() => setTab("members")}>
          <UserCheck size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Members ({users.length})
        </button>
        <button style={tabStyle("invitations")} onClick={() => setTab("invitations")}>
          <Mail size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Invitations ({invitations.filter(i => i.status === "pending").length})
        </button>
        <button style={tabStyle("analytics")} onClick={() => setTab("analytics")}>
          <BarChart2 size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Analytics
        </button>
        <button style={tabStyle("connections")} onClick={() => setTab("connections")}>
          <Wifi size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Connections
        </button>
      </div>

      {/* Members tab */}
      {tab === "members" && (
        <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", gap: 8 }}>
            <UserPlus size={15} color="#4e73df" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>
              All Members <span style={{ fontSize: 12, fontWeight: 400, color: "#858796" }}>({users.length})</span>
            </h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
                {["Email", "Role", "Joined", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.role === "admin" ? "#4e73df18" : "#f0f0f5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {u.role === "admin" ? <Shield size={14} color="#4e73df" /> : <UserCheck size={14} color="#858796" />}
                      </div>
                      <span style={{ color: "#3d4465", fontWeight: 500 }}>{u.email}</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: u.role === "admin" ? "#4e73df18" : "#f0f0f5", color: u.role === "admin" ? "#4e73df" : "#858796" }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#858796" }}>
                    {new Date(u.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => toggleRole(u)} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d3e2", background: "#fff", color: "#6e707e", cursor: "pointer" }}>
                      Make {u.role === "admin" ? "member" : "admin"}
                    </button>
                    <button onClick={() => handleRemoveUser(u)} style={{ padding: "5px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #e74c3c40", background: "#fff", color: "#e74c3c", cursor: "pointer" }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} style={{ padding: "40px 0", textAlign: "center", color: "#858796" }}>No users yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Invitations tab */}
      {tab === "invitations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Personal workspace → create org */}
          {isPersonalWorkspace && (
            <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Building2 size={18} color="#4e73df" />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#3d4465" }}>Switch to an Organization</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#858796" }}>Create an organization to invite team members and collaborate.</p>
                </div>
              </div>
              <form onSubmit={handleCreateOrg} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#858796", display: "block", marginBottom: 4 }}>Organization name</label>
                  <input
                    type="text" required value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Acme Corp"
                    style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid #d1d3e2", borderRadius: 4, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <button
                  type="submit" disabled={creatingOrg}
                  style={{ padding: "8px 20px", fontSize: 13, borderRadius: 4, border: "none", background: "#4e73df", color: "#fff", cursor: "pointer", fontWeight: 600, flexShrink: 0 }}
                >
                  {creatingOrg ? "Creating…" : "Create Organization"}
                </button>
              </form>
              {createOrgError && <p style={{ color: "#e74c3c", fontSize: 12, margin: "8px 0 0" }}>{createOrgError}</p>}
              <p style={{ fontSize: 11, color: "#858796", margin: "8px 0 0" }}>
                You&apos;ll be signed out briefly to activate your new organization.
              </p>
            </div>
          )}
          {/* Invite form */}
          {!isPersonalWorkspace && (
          <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", padding: "16px 20px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600, color: "#495057" }}>Invite a Team Member</h3>
            <form onSubmit={handleInvite} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={{ fontSize: 12, color: "#858796", display: "block", marginBottom: 4 }}>Email address</label>
                <input
                  type="email" required value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid #d1d3e2", borderRadius: 4, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#858796", display: "block", marginBottom: 4 }}>Role</label>
                <select
                  value={inviteRole} onChange={e => setInviteRole(e.target.value as "member" | "admin")}
                  style={{ padding: "8px 12px", fontSize: 13, border: "1px solid #d1d3e2", borderRadius: 4, outline: "none" }}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                type="submit" disabled={inviting}
                style={{ padding: "8px 20px", fontSize: 13, borderRadius: 4, border: "none", background: "#4e73df", color: "#fff", cursor: "pointer", fontWeight: 600 }}
              >
                {inviting ? "Sending…" : "Send Invite"}
              </button>
            </form>
            {inviteError && <p style={{ color: "#e74c3c", fontSize: 12, margin: "8px 0 0" }}>{inviteError}</p>}
            {inviteLink && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6 }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "#0369a1" }}>
                  Invite link (share this if email does not arrive):
                </p>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    readOnly value={inviteLink}
                    style={{ flex: 1, fontSize: 12, padding: "6px 10px", border: "1px solid #bae6fd", borderRadius: 4, background: "#fff", color: "#0c4a6e", outline: "none", fontFamily: "monospace" }}
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={() => { navigator.clipboard.writeText(inviteLink); }}
                    style={{ padding: "6px 14px", fontSize: 12, borderRadius: 4, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Pending invitations table */}
          {!isPersonalWorkspace && <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", gap: 8 }}>
              <Mail size={15} color="#4e73df" />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>
                Pending Invitations <span style={{ fontSize: 12, fontWeight: 400, color: "#858796" }}>({invitations.length})</span>
              </h3>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
                  {["Email", "Role", "Status", "Sent", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv, i) => (
                  <tr key={inv.id} style={{ borderBottom: i < invitations.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                    <td style={{ padding: "12px 16px", color: "#3d4465" }}>{inv.email}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: inv.role === "admin" ? "#4e73df18" : "#f0f0f5", color: inv.role === "admin" ? "#4e73df" : "#858796" }}>
                        {inv.role}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#fff3cd", color: "#856404" }}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#858796" }}>
                      {new Date(inv.invited_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button onClick={() => handleRevoke(inv)} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 4, border: "1px solid #e74c3c40", background: "#fff", color: "#e74c3c", cursor: "pointer" }}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
                {invitations.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "40px 0", textAlign: "center", color: "#858796" }}>No pending invitations</td></tr>
                )}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* Connections tab */}
      {tab === "connections" && (
        <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", gap: 8 }}>
            <Wifi size={15} color="#4e73df" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>Team Member Connections</h3>
            <span style={{ fontSize: 12, color: "#858796", marginLeft: 4 }}>— you can see which services are connected, not the data</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
                {["Member", "Connected Services"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamConnections.map((tc, i) => (
                <tr key={tc.user_id} style={{ borderBottom: i < teamConnections.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                  <td style={{ padding: "12px 16px", color: "#3d4465", fontWeight: 500 }}>{tc.email}</td>
                  <td style={{ padding: "12px 16px" }}>
                    {tc.connections.length === 0 ? (
                      <span style={{ color: "#d1d3e2", fontSize: 12 }}>No connections</span>
                    ) : (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {tc.connections.map((c, j) => (
                          <span key={j} style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.is_active ? "#eff6ff" : "#f0f0f5", color: c.is_active ? "#4e73df" : "#858796" }}>
                            {c.label || c.service_type}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {teamConnections.length === 0 && (
                <tr><td colSpan={2} style={{ padding: "40px 0", textAlign: "center", color: "#858796" }}>No team data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Analytics tab */}
      {tab === "analytics" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Days selector + Assess Levels button */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#858796" }}>Time range:</span>
            {[7, 30, 90].map(d => (
              <button
                key={d} onClick={() => setDays(d)}
                style={{ padding: "5px 14px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d3e2", background: days === d ? "#4e73df" : "#fff", color: days === d ? "#fff" : "#6e707e", cursor: "pointer", fontWeight: days === d ? 600 : 400 }}
              >
                {d}d
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              {assessMsg && (
                <span style={{ fontSize: 12, color: assessMsg.startsWith("Error") ? "#e74c3c" : "#1cc88a" }}>
                  {assessMsg}
                </span>
              )}
              <button
                onClick={handleAssessLevels}
                disabled={assessing}
                style={{ padding: "5px 14px", fontSize: 12, borderRadius: 4, border: "1px solid #1cc88a", background: "#fff", color: "#1cc88a", cursor: assessing ? "not-allowed" : "pointer", fontWeight: 600 }}
              >
                {assessing ? "Queuing…" : "Assess Levels"}
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { label: "Total Users", value: stats.length, color: "#4e73df" },
              { label: "Total Messages", value: totalMessages, color: "#1cc88a" },
              { label: "Blocked", value: totalBlocked, color: "#e74a3b" },
              { label: "Avg Block Rate", value: `${avgBlockRate}%`, color: "#f6c23e" },
            ].map(c => (
              <div key={c.label} style={{ ...cardStyle, borderLeft: `4px solid ${c.color}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#3d4465" }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          {stats.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", padding: "16px 20px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "#495057" }}>Messages per User</h3>
              <ResponsiveContainer width="100%" height={Math.max(180, stats.length * 36)}>
                <BarChart data={stats} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="email" width={180} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v, "Messages"]} />
                  <Bar dataKey="message_count" fill="#4e73df" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detail table */}
          <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>User Breakdown</h3>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
                  {["Email", "Role", "Usage Level", "Messages", "Blocked", "Sessions", "Block Rate"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: i < stats.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                    <td style={{ padding: "10px 16px", color: "#3d4465", fontWeight: 500 }}>{u.email}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: u.role === "admin" ? "#4e73df18" : "#f0f0f5", color: u.role === "admin" ? "#4e73df" : "#858796" }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {usageLevelBadge(u.usage_level ?? "beginner")}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#495057" }}>{u.message_count}</td>
                    <td style={{ padding: "10px 16px", color: u.blocked_count > 0 ? "#e74c3c" : "#495057" }}>{u.blocked_count}</td>
                    <td style={{ padding: "10px 16px", color: "#495057" }}>{u.session_count}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ color: (u.block_rate_pct ?? 0) > 10 ? "#e74c3c" : "#495057" }}>
                        {u.block_rate_pct != null ? `${u.block_rate_pct}%` : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
                {stats.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: "40px 0", textAlign: "center", color: "#858796" }}>No data for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
