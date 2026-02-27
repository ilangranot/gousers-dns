"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password.");
    } else {
      window.location.href = "/chat";
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
      <div style={{
        width: 400,
        background: "#1a1d27",
        borderRadius: 12,
        padding: 40,
        border: "1px solid rgba(255,255,255,0.08)",
      }}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Sign in to GoUsers
        </h1>
        <p style={{ color: "#8b92a5", fontSize: 14, marginBottom: 28 }}>
          Enter your email and password to continue.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="email" style={{ display: "block", color: "#c9d1d9", fontSize: 13, marginBottom: 6 }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#0f1117", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6, padding: "10px 12px",
                color: "#fff", fontSize: 14, outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="password" style={{ display: "block", color: "#c9d1d9", fontSize: 13, marginBottom: 6 }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#0f1117", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6, padding: "10px 12px",
                color: "#fff", fontSize: 14, outline: "none",
              }}
            />
          </div>

          {error && (
            <p style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "11px 0",
              background: "#5865f2", color: "#fff",
              border: "none", borderRadius: 6,
              fontSize: 14, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={{ color: "#8b92a5", fontSize: 13, marginTop: 16, textAlign: "center" }}>
          <Link href="/forgot-password" style={{ color: "#5865f2", textDecoration: "none" }}>
            Forgot password?
          </Link>
        </p>

        <p style={{ color: "#8b92a5", fontSize: 13, marginTop: 8, textAlign: "center" }}>
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" style={{ color: "#5865f2", textDecoration: "none" }}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
