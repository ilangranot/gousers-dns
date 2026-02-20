import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/chat");

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: "#1a1a2e", background: "#fff" }}>

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 48px", height: 64,
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,0,0,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#1e3a5f,#2d6a9f)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>G</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, color: "#1e3a5f" }}>GoUsers</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 32, fontSize: 14 }}>
          <a href="#features" style={{ color: "#555", textDecoration: "none" }}>Features</a>
          <a href="#how-it-works" style={{ color: "#555", textDecoration: "none" }}>How it works</a>
          <a href="#dns" style={{ color: "#555", textDecoration: "none" }}>DNS Setup</a>
          <Link href="/sign-in" style={{ color: "#1e3a5f", textDecoration: "none", fontWeight: 600 }}>Sign in</Link>
          <Link href="/sign-up" style={{
            background: "linear-gradient(135deg,#1e3a5f,#2d6a9f)", color: "#fff",
            padding: "8px 20px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 14,
          }}>
            Get started free →
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{
        paddingTop: 140, paddingBottom: 100, textAlign: "center",
        background: "linear-gradient(180deg, #f0f4ff 0%, #fff 100%)",
        borderBottom: "1px solid #e8edf5",
      }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#e8f0fe", borderRadius: 20, padding: "6px 14px", marginBottom: 24 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4e73df", display: "inline-block" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#4e73df" }}>Enterprise AI Gateway — Now Available</span>
        </div>

        <h1 style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.1, margin: "0 0 20px", color: "#1e3a5f", letterSpacing: "-0.02em" }}>
          Control every AI request<br />
          <span style={{ background: "linear-gradient(135deg,#1e3a5f,#2d6a9f)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            across your organization
          </span>
        </h1>
        <p style={{ fontSize: 20, color: "#5a7a9a", maxWidth: 600, margin: "0 auto 40px", lineHeight: 1.6 }}>
          GoUsers sits between your team and every AI provider — via DNS — so you can filter, log, and manage all AI traffic without changing a single line of code.
        </p>

        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/sign-up" style={{
            background: "linear-gradient(135deg,#1e3a5f,#2d6a9f)", color: "#fff",
            padding: "14px 32px", borderRadius: 10, textDecoration: "none", fontWeight: 700, fontSize: 16,
            boxShadow: "0 4px 20px rgba(30,58,95,0.35)",
          }}>
            Start for free →
          </Link>
          <a href="#how-it-works" style={{
            color: "#1e3a5f", padding: "14px 32px", borderRadius: 10, textDecoration: "none",
            fontWeight: 600, fontSize: 16, border: "2px solid #d0ddf0",
          }}>
            See how it works
          </a>
        </div>

        {/* Trust badges */}
        <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 56, flexWrap: "wrap" }}>
          {[
            { label: "OpenAI", color: "#2da9e9" },
            { label: "Claude", color: "#0ec8a2" },
            { label: "Gemini", color: "#f6c23e" },
          ].map((p) => (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#888" }}>{p.label} supported</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, color: "#1e3a5f", margin: "0 0 12px" }}>Everything you need to govern AI</h2>
          <p style={{ fontSize: 16, color: "#6b84a0", maxWidth: 520, margin: "0 auto" }}>One platform to intercept, filter, audit, and control every AI call in your organization.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {[
            {
              icon: "🌐", title: "DNS-Based Interception",
              desc: "No SDK changes, no proxies. Just point your DNS to GoUsers and every AI API call routes through the gateway automatically.",
              color: "#4e73df",
            },
            {
              icon: "🛡️", title: "Multi-Layer Filtering",
              desc: "Block sensitive content with keyword rules, regex patterns, PII detection (names, SSNs, emails), and semantic AI filtering via Llama.",
              color: "#e74a3b",
            },
            {
              icon: "📊", title: "Full Audit Trail",
              desc: "Every request, every response, every block — logged and searchable. Know exactly who sent what to which AI model.",
              color: "#1cc88a",
            },
            {
              icon: "🤖", title: "Multi-Provider Support",
              desc: "Manage OpenAI, Anthropic Claude, and Google Gemini from one dashboard. Switch models without touching your codebase.",
              color: "#f6c23e",
            },
            {
              icon: "📚", title: "Knowledge Base RAG",
              desc: "Upload company documents — policies, FAQs, procedures — and the AI will use them as context for every conversation.",
              color: "#6f42c1",
            },
            {
              icon: "🔑", title: "Centralized API Keys",
              desc: "Store provider keys once in GoUsers. Employees never see the real keys. Revoke access instantly without changing credentials.",
              color: "#20c9a6",
            },
          ].map((f) => (
            <div key={f.title} style={{
              padding: 28, borderRadius: 12, border: "1px solid #e8edf5",
              background: "#fff", transition: "box-shadow 0.2s",
            }}>
              <div style={{ fontSize: 32, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1e3a5f", margin: "0 0 8px" }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "#6b84a0", lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: "80px 48px", background: "#f8fafd" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: "#1e3a5f", margin: "0 0 12px" }}>Up and running in 5 minutes</h2>
            <p style={{ fontSize: 16, color: "#6b84a0" }}>No code changes. No SDK installs. Just DNS.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {[
              {
                step: "01", title: "Sign up & get your gateway IP",
                desc: "Create a GoUsers account. You'll get a dedicated gateway IP address for your organization.",
              },
              {
                step: "02", title: "Point your DNS to GoUsers",
                desc: "Update your DNS resolver (device, router, Docker, or Kubernetes) to use your gateway IP. AI API domains are intercepted automatically.",
              },
              {
                step: "03", title: "Add your AI provider keys",
                desc: "Enter your OpenAI, Anthropic, and Gemini API keys in the dashboard. GoUsers uses them to forward requests after filtering.",
              },
              {
                step: "04", title: "Set your rules & go",
                desc: "Configure keyword blocks, PII detection, semantic filters. Every AI request now flows through your rules — fully logged.",
              },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg,#1e3a5f,#2d6a9f)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 800, fontSize: 15,
                }}>
                  {s.step}
                </div>
                <div style={{ paddingTop: 8 }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#1e3a5f" }}>{s.title}</h3>
                  <p style={{ margin: 0, fontSize: 14, color: "#6b84a0", lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DNS Setup Preview ────────────────────────────────────────────── */}
      <section id="dns" style={{ padding: "80px 48px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, color: "#1e3a5f", margin: "0 0 12px" }}>One DNS change. Total control.</h2>
          <p style={{ fontSize: 16, color: "#6b84a0" }}>Works with any environment — Docker, Kubernetes, bare metal, or your laptop.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {[
            {
              label: "Docker Compose",
              code: `services:
  your-app:
    dns:
      - YOUR_GATEWAY_IP
      - 8.8.8.8`,
            },
            {
              label: "Linux / macOS",
              code: `# /etc/resolv.conf
nameserver YOUR_GATEWAY_IP
nameserver 8.8.8.8`,
            },
            {
              label: "Kubernetes CoreDNS",
              code: `forward . YOUR_GATEWAY_IP {
  prefer_udp
}`,
            },
            {
              label: "Windows PowerShell",
              code: `Set-DnsClientServerAddress \`
  -InterfaceAlias "Ethernet" \`
  -ServerAddresses ("YOUR_GATEWAY_IP")`,
            },
          ].map((e) => (
            <div key={e.label} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e0e8f0" }}>
              <div style={{ background: "#1e3a5f", padding: "10px 16px" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#90b4d4" }}>{e.label}</span>
              </div>
              <pre style={{ margin: 0, padding: 16, background: "#2d3748", color: "#e2e8f0", fontSize: 13, fontFamily: "monospace", overflowX: "auto" }}>
                {e.code}
              </pre>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section style={{
        padding: "80px 48px", textAlign: "center",
        background: "linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%)",
      }}>
        <h2 style={{ fontSize: 40, fontWeight: 900, color: "#fff", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
          Ready to take control of AI in your org?
        </h2>
        <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", marginBottom: 40 }}>
          Free to start. No credit card required.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <Link href="/sign-up" style={{
            background: "#fff", color: "#1e3a5f",
            padding: "14px 36px", borderRadius: 10, textDecoration: "none",
            fontWeight: 800, fontSize: 16,
          }}>
            Get started free →
          </Link>
          <Link href="/sign-in" style={{
            color: "rgba(255,255,255,0.85)", padding: "14px 28px",
            borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: 16,
            border: "2px solid rgba(255,255,255,0.3)",
          }}>
            Sign in
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ padding: "32px 48px", borderTop: "1px solid #e8edf5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, background: "linear-gradient(135deg,#1e3a5f,#2d6a9f)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 12 }}>G</span>
          </div>
          <span style={{ fontWeight: 700, color: "#1e3a5f" }}>GoUsers</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#9aacbe" }}>
          © {new Date().getFullYear()} GoUsers. Enterprise AI Gateway.
        </p>
        <div style={{ display: "flex", gap: 24, fontSize: 13 }}>
          <Link href="/sign-in" style={{ color: "#6b84a0", textDecoration: "none" }}>Sign in</Link>
          <Link href="/sign-up" style={{ color: "#6b84a0", textDecoration: "none" }}>Sign up</Link>
        </div>
      </footer>
    </div>
  );
}
