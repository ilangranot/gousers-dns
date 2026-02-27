"use client";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const cardStyle: React.CSSProperties = {
  width: 400,
  background: "#1a1d27",
  borderRadius: 12,
  padding: 40,
  border: "1px solid rgba(255,255,255,0.08)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0f1117",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  padding: "10px 12px",
  color: "#fff",
  fontSize: 14,
  outline: "none",
};

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  if (!token) {
    return (
      <p style={{ color: "#f87171", fontSize: 14 }}>
        Invalid reset link.{" "}
        <Link href="/forgot-password" style={{ color: "#5865f2", textDecoration: "none" }}>
          Request a new one
        </Link>
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Reset failed. The link may have expired.");
        setStatus("idle");
        return;
      }
      setStatus("done");
      setTimeout(() => router.push("/sign-in"), 2000);
    } catch {
      setError("Network error. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <p style={{ color: "#34d399", fontSize: 14 }}>
        Password updated! Redirecting to sign in…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="new-password" style={{ display: "block", color: "#c9d1d9", fontSize: 13, marginBottom: 6 }}>
          New password
        </label>
        <input
          id="new-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label htmlFor="confirm-password" style={{ display: "block", color: "#c9d1d9", fontSize: 13, marginBottom: 6 }}>
          Confirm password
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={inputStyle}
        />
      </div>

      {error && (
        <p style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        style={{
          width: "100%",
          padding: "11px 0",
          background: "#5865f2",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          cursor: status === "loading" ? "not-allowed" : "pointer",
          opacity: status === "loading" ? 0.7 : 1,
        }}
      >
        {status === "loading" ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0f1117",
    }}>
      <div style={cardStyle}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Set a new password
        </h1>
        <p style={{ color: "#8b92a5", fontSize: 14, marginBottom: 28 }}>
          Choose a new password for your account.
        </p>
        <Suspense fallback={<p style={{ color: "#8b92a5" }}>Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
