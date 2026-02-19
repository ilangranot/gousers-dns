"use client";
import { useEffect, useState, useRef } from "react";
import { getDocuments, uploadDocument, deleteDocument } from "@/lib/api";
import { OrgDocument } from "@/lib/types";
import { Upload, Trash2, FileText, FileIcon } from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

const EXT_ICONS: Record<string, string> = {
  pdf: "📄",
  txt: "📝",
  md: "📝",
  csv: "📊",
  docx: "📄",
};

function fileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_ICONS[ext] ?? "📁";
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<OrgDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    getDocuments()
      .then(setDocs)
      .catch(() => setError("Failed to load documents"));

  useEffect(() => { load(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDocument(file);
      await load();
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this document from the knowledge base?")) return;
    await deleteDocument(id);
    setDocs((d) => d.filter((doc) => doc.id !== id));
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "rgb(var(--text))" }}>
            Knowledge Base
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgb(var(--text-muted))" }}>
            Upload documents that the AI will use as context — policies, FAQs, guidelines, etc.
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.csv,.pdf,.docx"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "rgb(var(--accent))", color: "white" }}
          >
            <Upload size={15} />
            {uploading ? "Uploading..." : "Upload document"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="px-4 py-3 rounded-xl text-sm border"
          style={{
            background: "rgb(var(--danger) / 0.1)",
            borderColor: "rgb(var(--danger) / 0.3)",
            color: "rgb(var(--danger))",
          }}
        >
          {error}
        </div>
      )}

      {/* Supported formats */}
      <div
        className="flex gap-3 flex-wrap text-xs"
        style={{ color: "rgb(var(--text-subtle))" }}
      >
        {["PDF", "TXT", "MD", "CSV", "DOCX"].map((f) => (
          <span
            key={f}
            className="px-2 py-0.5 rounded-full border"
            style={{ borderColor: "rgb(var(--border))" }}
          >
            {f}
          </span>
        ))}
        <span>· max 10 MB per file</span>
      </div>

      {/* Document list */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: "rgb(var(--bg-surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        {docs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 gap-3"
            style={{ color: "rgb(var(--text-subtle))" }}
          >
            <FileText size={40} className="opacity-30" />
            <p className="text-sm">No documents yet</p>
            <p className="text-xs">Upload a PDF, TXT, or DOCX to build your knowledge base</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-xs uppercase tracking-wider"
                style={{
                  borderColor: "rgb(var(--border))",
                  color: "rgb(var(--text-subtle))",
                }}
              >
                <th className="text-left px-6 py-3">File</th>
                <th className="text-left px-6 py-3">Size</th>
                <th className="text-left px-6 py-3">Added</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr
                  key={doc.id}
                  className="border-b last:border-0"
                  style={{ borderColor: "rgb(var(--border))" }}
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span>{fileIcon(doc.filename)}</span>
                      <span
                        className="font-medium truncate max-w-[240px]"
                        style={{ color: "rgb(var(--text))" }}
                      >
                        {doc.filename}
                      </span>
                    </div>
                  </td>
                  <td
                    className="px-6 py-3"
                    style={{ color: "rgb(var(--text-muted))" }}
                  >
                    {formatBytes(doc.file_size)}
                  </td>
                  <td
                    className="px-6 py-3"
                    style={{ color: "rgb(var(--text-muted))" }}
                  >
                    {formatDate(doc.created_at)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                      style={{ color: "rgb(var(--danger))" }}
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
