"use client";
import { useEffect, useState } from "react";
import { getUsers, updateUserRole } from "@/lib/api";
import { User } from "@/lib/types";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);

  const load = () => getUsers().then(setUsers).catch(console.error);
  useEffect(() => { load(); }, []);

  async function toggleRole(user: User) {
    const newRole = user.role === "admin" ? "member" : "admin";
    await updateUserRole(user.id, newRole);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Users</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
              <th className="text-left px-6 py-3">Email</th>
              <th className="text-left px-6 py-3">Role</th>
              <th className="text-left px-6 py-3">Joined</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                <td className="px-6 py-3 text-white">{u.email}</td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === "admin" ? "bg-brand-600/30 text-brand-400" : "bg-gray-800 text-gray-400"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-3 text-right">
                  <button onClick={() => toggleRole(u)} className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-2 py-1 transition-colors">
                    Make {u.role === "admin" ? "member" : "admin"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
