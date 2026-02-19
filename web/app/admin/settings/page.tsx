"use client";
import { useEffect, useState, useRef } from "react";
import { getOrgSettings, updateOrgSettings, uploadLogo, deleteLogo, getOrgLogo } from "@/lib/api";
import { THEMES } from "@/lib/themes";
import { useTheme } from "@/components/ui/ThemeProvider";
import GoUsersLogo from "@/components/ui/GoUsersLogo";
import { Upload, Trash2, Check } from "lucide-react";

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
    try {
      const res = await uploadLogo(file);
      setLogo(res.logo_base64);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDeleteLogo() {
    await deleteLogo();
    setLogo(null);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold" style={{ color: "rgb(var(--text))" }}>
        Settings
      </h1>

      {/* ── Theme picker ─────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-6 space-y-4"
        style={{
          background: "rgb(var(--bg-surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        <h2 className="font-semibold" style={{ color: "rgb(var(--text))" }}>
          Theme
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id as any)}
              className="relative rounded-xl p-4 border-2 text-left transition-all"
              style={{
                borderColor:
                  theme === t.id ? "rgb(var(--accent))" : "rgb(var(--border))",
                background: "rgb(var(--bg-elevated))",
              }}
            >
              {theme === t.id && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "rgb(var(--accent))" }}
                >
                  <Check size={11} color="white" />
                </div>
              )}
              <div className="flex gap-1.5 mb-2">
                {t.preview.map((c, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full border border-white/10"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <p
                className="text-sm font-semibold"
                style={{ color: "rgb(var(--text))" }}
              >
                {t.label}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                {t.description}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Logo ─────────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-6 space-y-4"
        style={{
          background: "rgb(var(--bg-surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        <h2 className="font-semibold" style={{ color: "rgb(var(--text))" }}>
          Organization Logo
        </h2>
        <div className="flex items-center gap-6 flex-wrap">
          <div
            className="w-36 h-16 rounded-xl border flex items-center justify-center overflow-hidden"
            style={{
              background: "rgb(var(--bg-elevated))",
              borderColor: "rgb(var(--border))",
            }}
          >
            {logo ? (
              <img
                src={logo}
                alt="Org logo"
                className="max-h-12 max-w-full object-contain"
              />
            ) : (
              <GoUsersLogo size="sm" />
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50"
              style={{
                borderColor: "rgb(var(--border))",
                color: "rgb(var(--text-muted))",
                background: "rgb(var(--bg-elevated))",
              }}
            >
              <Upload size={14} />
              {uploading ? "Uploading..." : "Upload logo"}
            </button>
            {logo && (
              <button
                onClick={handleDeleteLogo}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-colors"
                style={{
                  borderColor: "rgb(var(--danger) / 0.3)",
                  color: "rgb(var(--danger))",
                  background: "rgb(var(--danger) / 0.05)",
                }}
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
            <p className="text-xs" style={{ color: "rgb(var(--text-subtle))" }}>
              PNG, JPG, SVG · Max 2 MB · Shown in sidebars
            </p>
          </div>
        </div>
      </section>

      {/* ── Display name ─────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-6 space-y-4"
        style={{
          background: "rgb(var(--bg-surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        <h2 className="font-semibold" style={{ color: "rgb(var(--text))" }}>
          Display Name
        </h2>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your organization name"
          className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none"
          style={{
            background: "rgb(var(--bg-elevated))",
            borderColor: "rgb(var(--border))",
            color: "rgb(var(--text))",
          }}
        />
      </section>

      {/* ── Industry Vertical ────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-6 space-y-4"
        style={{
          background: "rgb(var(--bg-surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        <div>
          <h2 className="font-semibold" style={{ color: "rgb(var(--text))" }}>
            Industry Vertical
          </h2>
          <p className="text-sm mt-1" style={{ color: "rgb(var(--text-muted))" }}>
            Sets the AI's domain expertise and system context for all conversations.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {VERTICALS.map((v) => (
            <button
              key={v.id}
              onClick={() => setVertical(v.id)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-all"
              style={{
                borderColor:
                  vertical === v.id ? "rgb(var(--accent))" : "rgb(var(--border))",
                background:
                  vertical === v.id ? "rgb(var(--accent) / 0.1)" : "rgb(var(--bg-elevated))",
                color:
                  vertical === v.id ? "rgb(var(--accent))" : "rgb(var(--text-muted))",
                fontWeight: vertical === v.id ? 600 : 400,
              }}
            >
              <span>{v.icon}</span>
              <span>{v.label}</span>
              {vertical === v.id && <Check size={13} className="ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      </section>

      <button
        onClick={save}
        disabled={saving}
        className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
        style={{ background: "rgb(var(--accent))", color: "white" }}
      >
        {saved ? "Saved!" : saving ? "Saving..." : "Save changes"}
      </button>
    </div>
  );
}
