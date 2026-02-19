"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Filter,
  Key,
  Users,
  MessageSquare,
  ArrowLeft,
  Settings,
  BookOpen,
} from "lucide-react";
import OrgLogo from "@/components/ui/OrgLogo";

const links = [
  { href: "/admin",               label: "Overview",      icon: BarChart2,    exact: true },
  { href: "/admin/conversations", label: "Conversations", icon: MessageSquare             },
  { href: "/admin/filtering",     label: "Filtering",     icon: Filter                    },
  { href: "/admin/connections",   label: "GPT Keys",      icon: Key                       },
  { href: "/admin/users",         label: "Users",         icon: Users                     },
  { href: "/admin/documents",     label: "Knowledge Base",icon: BookOpen                  },
  { href: "/admin/settings",      label: "Settings",      icon: Settings                  },
];

export default function AdminSidebar() {
  const path = usePathname();
  return (
    <aside
      className="w-56 flex flex-col border-r"
      style={{
        background: "rgb(var(--bg-surface))",
        borderColor: "rgb(var(--border))",
      }}
    >
      <div
        className="px-4 py-4 border-b"
        style={{ borderColor: "rgb(var(--border))" }}
      >
        <OrgLogo size="sm" />
        <p
          className="text-xs mt-1.5 font-medium"
          style={{ color: "rgb(var(--text-subtle))" }}
        >
          Admin Panel
        </p>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-100"
              style={{
                background: active ? "rgb(var(--bg-elevated))" : "transparent",
                color: active ? "rgb(var(--text))" : "rgb(var(--text-muted))",
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon
                size={16}
                style={{ color: active ? "rgb(var(--accent))" : "inherit" }}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div
        className="p-3 border-t"
        style={{ borderColor: "rgb(var(--border))" }}
      >
        <Link
          href="/chat"
          className="flex items-center gap-2 text-xs transition-colors hover:opacity-80"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          <ArrowLeft size={13} /> Back to chat
        </Link>
      </div>
    </aside>
  );
}
