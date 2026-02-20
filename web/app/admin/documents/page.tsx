"use client";
import { useEffect, useState, useRef } from "react";
import { getDocuments, uploadDocument, deleteDocument } from "@/lib/api";
import { OrgDocument } from "@/lib/types";
import { Upload, Trash2, FileText } from "lucide-react";

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

export default function DocumentsPage() {
  const [docs, setDocs] = useState<OrgDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => getDocuments().then(setDocs).catch(() => setError("Failed to load documents"));
  useEffect(() => { load(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try { await uploadDocument(file); await load(); }
    catch (err: any) { setError(err.message ?? "Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this document from the knowledge base?")) return;
    await deleteDocument(id);
    setDocs((d) => d.filter((doc) => doc.id !== id));
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>Knowledge Base</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>
            Upload documents the AI uses as context — policies, FAQs, guidelines
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

      {/* Supported formats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["PDF", "TXT", "MD", "CSV", "DOCX"].map((f) => (
          <span key={f} style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#e8f0fe", color: "#4e73df" }}>
            {f}
          </span>
        ))}
        <span style={{ fontSize: 12, color: "#858796", alignSelf: "center" }}>· max 10 MB per file</span>
      </div>

      {error && (
        <div style={{ padding: "10px 16px", marginBottom: 16, background: "#fde8e8", border: "1px solid #f5c6cb", borderRadius: 4, color: "#c0392b", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{
        background: "#fff", borderRadius: 4,
        boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}>
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
