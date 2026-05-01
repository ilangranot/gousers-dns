"use client";
import { useEffect, useState, useRef } from "react";
import { getDocuments, uploadDocument, deleteDocument, getUserConnections, addUserConnection, deleteUserConnection } from "@/lib/api";
import { OrgDocument, UserConnection } from "@/lib/types";
import { Upload, Trash2, FileText, Link2, Plus, X, Mail, Calendar, HardDrive, Globe } from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const EXT_ICONS: Record<string, string> = { pdf: "📄", txt: "📝", md: "📝", csv: "📊", docx: "📄" };
function fileIcon(filename: string) {
  return EXT_ICONS[filename.split(".").pop()?.toLowerCase() ?? ""] ?? "📁";
}

const GOOGLE_SERVICES = [
  { id: "gmail",            label: "Gmail",           icon: <Mail size={16} />,      color: "#ea4335", description: "Access your emails as context" },
  { id: "google_calendar",  label: "Google Calendar", icon: <Calendar size={16} />,  color: "#4285f4", description: "Add calendar events as context" },
  { id: "google_drive",     label: "Google Drive",    icon: <HardDrive size={16} />, color: "#34a853", description: "Use Drive files as knowledge base" },
];

export default function DocumentsPage() {
  const [docs, setDocs] = useState<OrgDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Connections
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  const loadDocs = () => getDocuments().then(setDocs).catch(() => setError("Failed to load documents"));
  const loadConnections = () => getUserConnections().then(setConnections).catch(console.error);

  useEffect(() => { loadDocs(); loadConnections(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try { await uploadDocument(file); await loadDocs(); }
    catch (err: any) { setError(err.message ?? "Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this document from the knowledge base?")) return;
    await deleteDocument(id);
    setDocs((d) => d.filter((doc) => doc.id !== id));
  }

  async function handleConnectGoogle(serviceId: string, label: string) {
    // Check if already connected
    const existing = connections.find((c) => c.service_type === serviceId);
    if (existing) {
      if (!confirm(`Disconnect ${label}?`)) return;
      await deleteUserConnection(existing.id).catch(console.error);
    } else {
      // In a real implementation this would initiate OAuth; for now mark as connected
      await addUserConnection({ service_type: serviceId, label, config: { connected_at: new Date().toISOString() } }).catch(console.error);
    }
    loadConnections();
  }

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!newLinkUrl.trim()) return;
    setAddingLink(true);
    try {
      await addUserConnection({
        service_type: "custom_link",
        label: newLinkLabel.trim() || newLinkUrl.trim(),
        config: { url: newLinkUrl.trim() },
      });
      setNewLinkUrl("");
      setNewLinkLabel("");
      setShowAddLink(false);
      loadConnections();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingLink(false);
    }
  }

  async function handleRemoveConnection(id: string) {
    await deleteUserConnection(id).catch(console.error);
    loadConnections();
  }

  const googleConnections = connections.filter((c) => c.service_type !== "custom_link");
  const linkConnections = connections.filter((c) => c.service_type === "custom_link");

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>Knowledge Base</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>
            Upload documents, connect services, and add links the AI uses as context
          </p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".txt,.md,.csv,.pdf,.docx" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", background: "#4e73df", color: "#fff",
              fontSize: 13, fontWeight: 600, borderRadius: 4, border: "none",
              cursor: "pointer", opacity: uploading ? 0.6 : 1,
            }}
          >
            <Upload size={15} /> {uploading ? "Uploading..." : "Upload Document"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 16px", marginBottom: 16, background: "#fde8e8", border: "1px solid #f5c6cb", borderRadius: 4, color: "#c0392b", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Google Services ──────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", marginBottom: 20 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", gap: 8 }}>
          <Globe size={15} color="#4e73df" />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>My Connections</h3>
          <span style={{ fontSize: 12, color: "#858796", marginLeft: 4 }}>— personal, only visible to you</span>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "#858796" }}>
            Connect services to let the AI use them as context. Your organization admin can see which services you have connected, but not the data.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {GOOGLE_SERVICES.map((svc) => {
              const conn = googleConnections.find((c) => c.service_type === svc.id);
              return (
                <div key={svc.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", border: "1px solid #e9ecef", borderRadius: 6, background: conn ? "#f8fff9" : "#fff" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${svc.color}15`, display: "flex", alignItems: "center", justifyContent: "center", color: svc.color, flexShrink: 0 }}>
                    {svc.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#3d4465" }}>{svc.label}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#858796" }}>{svc.description}</p>
                  </div>
                  <button
                    onClick={() => handleConnectGoogle(svc.id, svc.label)}
                    style={{
                      padding: "6px 16px", fontSize: 12, fontWeight: 600, borderRadius: 4, cursor: "pointer",
                      border: conn ? "1px solid #e9ecef" : `1px solid ${svc.color}`,
                      background: conn ? "#f0f0f5" : `${svc.color}15`,
                      color: conn ? "#858796" : svc.color,
                    }}
                  >
                    {conn ? "Disconnect" : "Connect"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Custom Links ─────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", marginBottom: 20 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={15} color="#4e73df" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>Links</h3>
          </div>
          <button
            onClick={() => setShowAddLink(!showAddLink)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 4, border: "1px solid #d1d3e2", background: "#fff", color: "#4e73df", cursor: "pointer" }}
          >
            <Plus size={13} /> Add Link
          </button>
        </div>

        {showAddLink && (
          <form onSubmit={handleAddLink} style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", background: "#f8f9fc", display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={{ fontSize: 11, color: "#858796", display: "block", marginBottom: 3 }}>URL *</label>
              <input
                type="url" required value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://example.com"
                style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #d1d3e2", borderRadius: 4, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 11, color: "#858796", display: "block", marginBottom: 3 }}>Label</label>
              <input
                type="text" value={newLinkLabel}
                onChange={(e) => setNewLinkLabel(e.target.value)}
                placeholder="Company website"
                style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #d1d3e2", borderRadius: 4, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="submit" disabled={addingLink} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 600, borderRadius: 4, border: "none", background: "#4e73df", color: "#fff", cursor: "pointer" }}>
                {addingLink ? "Adding…" : "Add"}
              </button>
              <button type="button" onClick={() => setShowAddLink(false)} style={{ padding: "7px 10px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d3e2", background: "#fff", color: "#858796", cursor: "pointer" }}>
                <X size={13} />
              </button>
            </div>
          </form>
        )}

        <div style={{ padding: linkConnections.length ? 0 : "20px 16px" }}>
          {linkConnections.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#858796", textAlign: "center" }}>No links added yet</p>
          ) : (
            linkConnections.map((lc, i) => {
              const url = (lc.config as any)?.url ?? "";
              return (
                <div key={lc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: i < linkConnections.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                  <Link2 size={14} color="#4e73df" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#3d4465" }}>{lc.label}</p>
                    <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#4e73df", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                      {url}
                    </a>
                  </div>
                  <button
                    onClick={() => handleRemoveConnection(lc.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d3e2", padding: 4 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#e74a3b")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#d1d3e2")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Documents ────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["PDF", "TXT", "MD", "CSV", "DOCX"].map((f) => (
          <span key={f} style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#e8f0fe", color: "#4e73df" }}>
            {f}
          </span>
        ))}
        <span style={{ fontSize: 12, color: "#858796", alignSelf: "center" }}>· max 10 MB per file</span>
      </div>

      <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={15} color="#4e73df" />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>
            Documents <span style={{ fontSize: 12, fontWeight: 400, color: "#858796" }}>({docs.length})</span>
          </h3>
        </div>

        {docs.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0", color: "#858796" }}>
            <FileText size={44} style={{ opacity: 0.2, marginBottom: 12 }} />
            <p style={{ fontSize: 14, margin: 0 }}>No documents yet</p>
            <p style={{ fontSize: 12, margin: "4px 0 0" }}>Upload a PDF, TXT, or DOCX to build your knowledge base</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
                {["File", "Size", "Added", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc, i) => (
                <tr key={doc.id} style={{ borderBottom: i < docs.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{fileIcon(doc.filename)}</span>
                      <span style={{ color: "#3d4465", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
                        {doc.filename}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#858796" }}>{formatBytes(doc.file_size)}</td>
                  <td style={{ padding: "12px 16px", color: "#858796" }}>{formatDate(doc.created_at)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d3e2", padding: 4 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#e74a3b")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#d1d3e2")}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
