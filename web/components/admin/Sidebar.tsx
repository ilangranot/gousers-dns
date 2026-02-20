"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2, Filter, Key, MessageSquare, Settings, BookOpen, Network, UserPlus, Bot,
} from "lucide-react";
import OrgLogo from "@/components/ui/OrgLogo";

const links = [
  { href: "/admin",               label: "Dashboard",     icon: BarChart2,    exact: true },
  { href: "/admin/conversations", label: "Conversations", icon: MessageSquare             },
  { href: "/admin/filtering",     label: "Filtering",     icon: Filter                    },
  { href: "/admin/connections",   label: "GPT Keys",      icon: Key                       },
  { href: "/admin/team",          label: "Team",          icon: UserPlus                  },
  { href: "/admin/agents",        label: "Agents",        icon: Bot                       },
  { href: "/admin/documents",     label: "Knowledge Base",icon: BookOpen                  },
  { href: "/admin/dns",           label: "DNS Setup",     icon: Network                   },
  { href: "/admin/settings",      label: "Settings",      icon: Settings                  },
];

export default function AdminSidebar() {
  const path = usePathname();
  return (
    <aside style={{
      width: 240, minWidth: 240,
      background: "#343a40",
      display: "flex", flexDirection: "column",
      height: "100vh",
      borderRight: "1px solid rgba(0,0,0,0.2)",
    }}>
      {/* Brand */}
      <div style={{
        padding: "16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.15)",
      }}>
        <OrgLogo size="md" />
        <p style={{ color: "#6c757d", fontSize: 11, margin: "4px 0 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Admin Panel
        </p>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        <p style={{ color: "#6c757d", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "12px 16px 4px" }}>
          Main Navigation
        </p>
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px",
                color: active ? "#fff" : "#adb5bd",
                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                borderLeft: `3px solid ${active ? "#007bff" : "transparent"}`,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                transition: "all 0.15s",
              }}
            >
              <Icon size={16} style={{ color: active ? "#007bff" : "#6c757d", flexShrink: 0 }} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Version footer */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        fontSize: 11, color: "#6c757d",
      }}>
        GoUsers AI Gateway v1.0
      </div>
    </aside>
  );
}
