"use client";
import { useEffect, useState } from "react";
import { getUsers, updateUserRole } from "@/lib/api";
import { User } from "@/lib/types";
import { Users, Shield, UserCheck } from "lucide-react";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);

  const load = () => getUsers().then(setUsers).catch(console.error);
  useEffect(() => { load(); }, []);

  async function toggleRole(user: User) {
    await updateUserRole(user.id, user.role === "admin" ? "member" : "admin");
    load();
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>Users</h1>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>Manage organization members and roles</p>
      </div>

      <div style={{
        background: "#fff", borderRadius: 4,
        boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={15} color="#4e73df" />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>
            All Members <span style={{ fontSize: 12, fontWeight: 400, color: "#858796" }}>({users.length})</span>
          </h3>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
              {["Email", "Role", "Joined", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: u.role === "admin" ? "#4e73df18" : "#f0f0f5",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      {u.role === "admin"
                        ? <Shield size={14} color="#4e73df" />
                        : <UserCheck size={14} color="#858796" />
                      }
                    </div>
                    <span style={{ color: "#3d4465", fontWeight: 500 }}>{u.email}</span>
                  </div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                    background: u.role === "admin" ? "#4e73df18" : "#f0f0f5",
                    color: u.role === "admin" ? "#4e73df" : "#858796",
                  }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "#858796" }}>
                  {new Date(u.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <button
                    onClick={() => toggleRole(u)}
                    style={{
                      padding: "5px 12px", fontSize: 12, borderRadius: 4,
                      border: "1px solid #d1d3e2", background: "#fff",
                      color: "#6e707e", cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f8f9fc"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                  >
                    Make {u.role === "admin" ? "member" : "admin"}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "40px 0", textAlign: "center", color: "#858796", fontSize: 13 }}>
                  No users yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
