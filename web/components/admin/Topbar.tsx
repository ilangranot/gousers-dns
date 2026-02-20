"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Home, ChevronRight, MessageCircle } from "lucide-react";

const PAGE_LABELS: Record<string, string> = {
  "/admin":               "Dashboard",
  "/admin/conversations": "Conversations",
  "/admin/filtering":     "Filtering Rules",
  "/admin/connections":   "GPT Connections",
  "/admin/users":         "Users",
  "/admin/documents":     "Knowledge Base",
  "/admin/settings":      "Settings",
};

export default function AdminTopbar() {
  const path = usePathname();
  const label = PAGE_LABELS[path] ?? "Admin";

  return (
    <header style={{
      background: "#343a40",
      borderBottom: "1px solid rgba(0,0,0,0.3)",
      height: 57,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 20px",
      flexShrink: 0,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#adb5bd" }}>
          <ChevronRight size={12} />
          <Link href="/admin" style={{ color: "#adb5bd", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            <Home size={12} /> Home
          </Link>
          {path !== "/admin" && (
            <>
              <ChevronRight size={12} />
              <span style={{ color: "#6c757d" }}>{label}</span>
            </>
          )}
        </div>
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Link
          href="/chat"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            color: "#adb5bd", fontSize: 13, textDecoration: "none",
            padding: "4px 10px", borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.1)",
            transition: "all 0.15s",
          }}
        >
          <MessageCircle size={14} /> Chat
        </Link>
        <UserButton />
      </div>
    </header>
  );
}
