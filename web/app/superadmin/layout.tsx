"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const STAFF_EMAILS = (process.env.NEXT_PUBLIC_STAFF_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoaded) return;
    const email = user?.primaryEmailAddress?.emailAddress ?? "";
    if (!STAFF_EMAILS.includes(email)) {
      router.replace("/");
    }
  }, [isLoaded, user, router]);

  if (!isLoaded) return null;

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  if (!STAFF_EMAILS.includes(email)) return null;

  const navItems = [
    { label: "Overview", href: "/superadmin" },
    { label: "Organizations", href: "/superadmin/orgs" },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "rgb(var(--bg-base))" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: "rgb(var(--bg-surface))",
        borderRight: "1px solid rgb(var(--border))",
        display: "flex",
        flexDirection: "column",
        padding: "24px 0",
      }}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid rgb(var(--border))" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgb(var(--text-muted))", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Staff Admin
          </div>
        </div>
        <nav style={{ padding: "16px 0" }}>
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/superadmin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "block",
                  padding: "8px 20px",
                  color: active ? "rgb(var(--accent))" : "rgb(var(--text))",
                  background: active ? "rgba(var(--accent), 0.1)" : "transparent",
                  textDecoration: "none",
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid rgb(var(--border))" }}>
          <Link href="/admin" style={{ fontSize: 13, color: "rgb(var(--text-muted))", textDecoration: "none" }}>
            ← Back to App
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
        {children}
      </div>
    </div>
  );
}
