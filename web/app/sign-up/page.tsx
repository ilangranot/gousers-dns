"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function SignUpForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Step 1: Register
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Registration failed.");
        setLoading(false);
        return;
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
      return;
    }

    // Step 2: Accept invitation if token present
    if (inviteToken) {
      try {
        await fetch(`${API}/auth/accept-invitation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: inviteToken, email }),
        });
        // Continue even if this fails — user is registered, can be added to org later
      } catch {
        // Non-fatal — continue to sign in
      }
    }

    // Step 3: Auto sign-in after registration
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Account created but sign-in failed. Try signing in manually.");
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
          Create your account
        </h1>
        <p style={{ color: "#8b92a5", fontSize: 14, marginBottom: 28 }}>
          {inviteToken
            ? "You've been invited! Create an account to join your team."
            : "Get started with GoUsers AI Gateway."}
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
              minLength={8}
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
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p style={{ color: "#8b92a5", fontSize: 13, marginTop: 20, textAlign: "center" }}>
          Already have an account?{" "}
          <Link href="/sign-in" style={{ color: "#5865f2", textDecoration: "none" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
