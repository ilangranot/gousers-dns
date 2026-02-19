import AdminSidebar from "@/components/admin/Sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen" style={{ background: "rgb(var(--bg-base))" }}>
      <AdminSidebar />
      <main
        className="flex-1 overflow-y-auto p-8"
        style={{ color: "rgb(var(--text))" }}
      >
        {children}
      </main>
    </div>
  );
}
