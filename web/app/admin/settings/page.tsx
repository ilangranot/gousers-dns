"use client";
import { useEffect, useState, useRef } from "react";
import { getOrgSettings, updateOrgSettings, uploadLogo, deleteLogo, getOrgLogo } from "@/lib/api";
import { THEMES } from "@/lib/themes";
import { useTheme } from "@/components/ui/ThemeProvider";
import GoUsersLogo from "@/components/ui/GoUsersLogo";
import { Upload, Trash2, Check, Settings } from "lucide-react";

const VERTICALS = [
  { id: "general",   label: "General",        icon: "🌐" },
  { id: "health",    label: "Healthcare",      icon: "🏥" },
  { id: "insurance", label: "Insurance",       icon: "🛡️" },
  { id: "legal",     label: "Legal / Law",     icon: "⚖️" },
  { id: "finance",   label: "Finance",         icon: "📈" },
  { id: "education", label: "Education",       icon: "🎓" },
  { id: "hr",        label: "HR / People Ops", icon: "👥" },
  { id: "tech",      label: "Technology",      icon: "💻" },
  { id: "retail",    label: "Retail",          icon: "🛍️" },
];

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", marginBottom: 20 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", gap: 8 }}>
        {icon}
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>{title}</h3>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState("");
  const [vertical, setVertical] = useState("general");
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getOrgSettings()
      .then((d: any) => {
        if (d.theme) setTheme(d.theme);
        if (d.org_display_name) setDisplayName(d.org_display_name);
        if (d.vertical) setVertical(d.vertical);
      })
      .catch(console.error);
    getOrgLogo()
      .then((d: any) => { if (d.logo_base64) setLogo(d.logo_base64); })
      .catch(console.error);
  }, []);

  async function save() {
    setSaving(true);
    try {
      await updateOrgSettings({ theme, org_display_name: displayName || undefined, vertical });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { const res = await uploadLogo(file); setLogo(res.logo_base64); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handleDeleteLogo() {
    await deleteLogo();
    setLogo(null);
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>Settings</h1>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>Configure your organization preferences</p>
      </div>

      {/* Chat Theme */}
      <Card title="Chat Interface Theme" icon={<Settings size={15} color="#4e73df" />}>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#858796" }}>
          Applies to the chat interface only — the admin panel stays light.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id as any)}
              style={{
                padding: "12px", borderRadius: 6, textAlign: "left", cursor: "pointer",
                border: `2px solid ${theme === t.id ? "#4e73df" : "#e3e6f0"}`,
                background: theme === t.id ? "#f0f4ff" : "#fff",
                transition: "all 0.15s", position: "relative",
              }}
            >
              {theme === t.id && (
                <div style={{
                  position: "absolute", top: 8, right: 8,
                  width: 18, height: 18, borderRadius: "50%", background: "#4e73df",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Check size={10} color="white" />
                </div>
              )}
              <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                {t.preview.map((c, i) => (
                  <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: c, border: "1px solid rgba(0,0,0,0.1)" }} />
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#3d4465" }}>{t.label}</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#858796" }}>{t.description}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Logo */}
      <Card title="Organization Logo">
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{
            width: 140, height: 60, borderRadius: 6, border: "1px solid #e3e6f0",
            background: "#f8f9fc", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}>
            {logo
              ? <img src={logo} alt="Org logo" style={{ maxHeight: 44, maxWidth: "100%", objectFit: "contain" }} />
              : <GoUsersLogo size="sm" />
            }
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 4, fontSize: 13,
                border: "1px solid #d1d3e2", background: "#fff", color: "#6e707e",
                cursor: "pointer", opacity: uploading ? 0.6 : 1,
              }}
            >
              <Upload size={13} /> {uploading ? "Uploading..." : "Upload logo"}
            </button>
            {logo && (
              <button
                onClick={handleDeleteLogo}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 4, fontSize: 13,
                  border: "1px solid #f5c6cb", background: "#fde8e8", color: "#c0392b",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={13} /> Remove
              </button>
            )}
            <p style={{ fontSize: 11, color: "#858796", margin: 0 }}>PNG, JPG, SVG · Max 2 MB</p>
          </div>
        </div>
      </Card>

      {/* Display name */}
      <Card title="Display Name">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your organization name"
          style={{
            width: "100%", padding: "8px 12px", fontSize: 13,
            border: "1px solid #d1d3e2", borderRadius: 4, color: "#3d4465",
            background: "#fff", outline: "none", boxSizing: "border-box",
          }}
        />
      </Card>

      {/* Industry vertical */}
      <Card title="Industry Vertical">
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#858796" }}>
          Sets the AI&apos;s domain expertise and system context for all conversations.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {VERTICALS.map((v) => (
            <button
              key={v.id}
              onClick={() => setVertical(v.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 4, fontSize: 13, textAlign: "left",
                border: `1px solid ${vertical === v.id ? "#4e73df" : "#e3e6f0"}`,
                background: vertical === v.id ? "#f0f4ff" : "#fff",
                color: vertical === v.id ? "#4e73df" : "#6e707e",
                fontWeight: vertical === v.id ? 600 : 400,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <span>{v.icon}</span>
              <span style={{ flex: 1 }}>{v.label}</span>
              {vertical === v.id && <Check size={12} />}
            </button>
          ))}
        </div>
      </Card>

      <button
        onClick={save}
        disabled={saving}
        style={{
          padding: "10px 28px", background: "#4e73df", color: "#fff",
          fontSize: 14, fontWeight: 600, borderRadius: 4, border: "none",
          cursor: "pointer", opacity: saving ? 0.7 : 1, transition: "opacity 0.15s",
        }}
      >
        {saved ? "✓ Saved!" : saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
