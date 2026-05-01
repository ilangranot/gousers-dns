import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AgentTaskPanel from "@/components/agent/AgentTaskPanel";

export default async function TasksPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#fbfcff" }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #e8edf2", background: "#fff", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#1e2b3a" }}>Agent Tasks</span>
        <span style={{ fontSize: 12, color: "#a0aab4" }}>Autonomous agent task runner</span>
        <Link href="/" style={{ marginLeft: "auto", fontSize: 12, color: "#2da9e9", textDecoration: "none", fontWeight: 600 }}>← Back to Chat</Link>
      </div>
      <div style={{ flex: 1, overflowY: "auto", maxWidth: 760, width: "100%", margin: "0 auto", padding: "24px 16px", boxSizing: "border-box" }}>
        <AgentTaskPanel />
      </div>
    </div>
  );
}
