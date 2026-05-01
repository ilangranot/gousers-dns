"use client";
import { useState } from "react";
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always show success — don't reveal whether email exists
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

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
          Reset your password
        </h1>

        {status === "sent" ? (
          <>
            <p style={{ color: "#8b92a5", fontSize: 14, marginBottom: 24 }}>
              If that email is registered you&apos;ll receive a reset link shortly. Check your inbox.
            </p>
            <Link href="/sign-in" style={{ color: "#5865f2", fontSize: 14, textDecoration: "none" }}>
              ← Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p style={{ color: "#8b92a5", fontSize: 14, marginBottom: 28 }}>
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 24 }}>
                <label htmlFor="email" style={{ display: "block", color: "#c9d1d9", fontSize: 13, marginBottom: 6 }}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {status === "error" && (
                <p style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>
                  Something went wrong. Please try again.
                </p>
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
                {status === "loading" ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p style={{ color: "#8b92a5", fontSize: 13, marginTop: 20, textAlign: "center" }}>
              <Link href="/sign-in" style={{ color: "#5865f2", textDecoration: "none" }}>
                ← Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
