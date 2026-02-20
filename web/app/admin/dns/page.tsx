"use client";
import { useState } from "react";
import { Network, Copy, Check, Terminal, Globe, Shield, Zap } from "lucide-react";

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <p style={{ fontSize: 12, fontWeight: 600, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</p>}
      <div style={{ position: "relative", background: "#2d3748", borderRadius: 6, overflow: "hidden" }}>
        <button
          onClick={copy}
          style={{
            position: "absolute", top: 10, right: 12, background: "rgba(255,255,255,0.1)",
            border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer",
            color: "#fff", fontSize: 11, display: "flex", alignItems: "center", gap: 4,
          }}
        >
          {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
        <pre style={{ margin: 0, padding: "16px 60px 16px 16px", color: "#e2e8f0", fontSize: 13, fontFamily: "monospace", overflowX: "auto", whiteSpace: "pre" }}>
          {code}
        </pre>
      </div>
    </div>
  );
}

function Card({ title, icon, children, step }: { title: string; icon: React.ReactNode; children: React.ReactNode; step?: number }) {
  return (
    <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", marginBottom: 20 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", gap: 10 }}>
        {step && (
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#4e73df", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {step}
          </div>
        )}
        {!step && icon}
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>{title}</h3>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

export default function DnsSetupPage() {
  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>DNS Setup Guide</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#858796" }}>
          Route your organization&apos;s AI traffic through GoUsers by pointing your DNS to our gateway.
          All requests to <code style={{ background: "#f0f4ff", color: "#4e73df", padding: "1px 6px", borderRadius: 3, fontSize: 12 }}>api.openai.com</code>,{" "}
          <code style={{ background: "#f0f4ff", color: "#1cc88a", padding: "1px 6px", borderRadius: 3, fontSize: 12 }}>api.anthropic.com</code>, and{" "}
          <code style={{ background: "#f0f4ff", color: "#f6c23e", padding: "1px 6px", borderRadius: 3, fontSize: 12 }}>generativelanguage.googleapis.com</code>{" "}
          will be intercepted, filtered, and logged.
        </p>
      </div>

      {/* How it works */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { icon: <Globe size={20} color="#4e73df" />, label: "AI Request", desc: "App calls OpenAI/Claude/Gemini API", bg: "#f0f4ff" },
          { icon: <Network size={20} color="#1cc88a" />, label: "DNS Intercept", desc: "GoUsers CoreDNS routes to gateway", bg: "#f0fff8" },
          { icon: <Shield size={20} color="#e74a3b" />, label: "Filter & Log", desc: "Rules applied, then forwarded", bg: "#fff0f0" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 4, padding: 16, boxShadow: "0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06)", textAlign: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
              {s.icon}
            </div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#3d4465" }}>{s.label}</p>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#858796" }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Step 1: Point DNS */}
      <Card title="Point your DNS resolver to GoUsers" step={1} icon={<Network size={15} color="#4e73df" />}>
        <p style={{ fontSize: 13, color: "#495057", marginTop: 0 }}>
          Configure your network or device to use the GoUsers DNS gateway as the primary resolver.
          Replace <code style={{ background: "#f8f9fc", padding: "1px 5px", borderRadius: 3 }}>YOUR_GATEWAY_IP</code> with your instance&apos;s public IP or load balancer address.
        </p>

        <CodeBlock label="macOS / Linux — /etc/resolv.conf" code={`nameserver YOUR_GATEWAY_IP
nameserver 8.8.8.8   # fallback`} />

        <CodeBlock label="Windows — PowerShell (run as Administrator)" code={`Set-DnsClientServerAddress -InterfaceAlias "Ethernet" \`
  -ServerAddresses ("YOUR_GATEWAY_IP", "8.8.8.8")`} />

        <CodeBlock label="Docker Compose — add to any service" code={`services:
  your-app:
    dns:
      - YOUR_GATEWAY_IP
      - 8.8.8.8`} />

        <CodeBlock label="Kubernetes — CoreDNS ConfigMap patch" code={`data:
  Corefile: |
    .:53 {
        forward . YOUR_GATEWAY_IP
        cache 30
    }`} />
      </Card>

      {/* Step 2: Configure API Keys */}
      <Card title="Add your AI provider API keys" step={2} icon={<Zap size={15} color="#4e73df" />}>
        <p style={{ fontSize: 13, color: "#495057", marginTop: 0 }}>
          Go to <strong>GPT Keys</strong> in the sidebar and add your API keys for each provider you want to use.
          GoUsers will use these keys to forward requests on your behalf after filtering.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            { label: "OpenAI", color: "#2da9e9", hint: "Get from platform.openai.com" },
            { label: "Anthropic", color: "#0ec8a2", hint: "Get from console.anthropic.com" },
            { label: "Google Gemini", color: "#f6c23e", hint: "Get from aistudio.google.com" },
          ].map((p) => (
            <div key={p.label} style={{ padding: 12, borderRadius: 4, border: `1px solid ${p.color}30`, background: `${p.color}08` }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#3d4465" }}>{p.label}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#858796" }}>{p.hint}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Step 3: Set filtering rules */}
      <Card title="Configure filtering rules (optional)" step={3} icon={<Shield size={15} color="#4e73df" />}>
        <p style={{ fontSize: 13, color: "#495057", marginTop: 0 }}>
          Go to <strong>Filtering</strong> to add keyword, regex, PII, or semantic rules. All traffic will be screened before being forwarded to AI providers.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { type: "Keyword", example: "Block messages containing 'password' or 'secret'", color: "#4e73df" },
            { type: "Regex", example: "Block SSN patterns: \\d{3}-\\d{2}-\\d{4}", color: "#1cc88a" },
            { type: "PII Detection", example: "Auto-block emails, phone numbers, credit cards", color: "#f6c23e" },
            { type: "Semantic (Llama)", example: "Block 'messages asking for confidential info'", color: "#e74a3b" },
          ].map((r) => (
            <div key={r.type} style={{ padding: 12, borderRadius: 4, background: "#f8f9fc", border: "1px solid #e9ecef" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#3d4465" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.color, marginRight: 6 }} />
                {r.type}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#858796" }}>{r.example}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Step 4: Verify */}
      <Card title="Verify the setup" step={4} icon={<Terminal size={15} color="#4e73df" />}>
        <p style={{ fontSize: 13, color: "#495057", marginTop: 0 }}>
          Run these commands to confirm DNS is routing through GoUsers:
        </p>
        <CodeBlock label="Check DNS resolution" code={`# Should resolve to YOUR_GATEWAY_IP, not OpenAI's real servers
nslookup api.openai.com YOUR_GATEWAY_IP

# Or with dig
dig @YOUR_GATEWAY_IP api.openai.com`} />
        <CodeBlock label="Test a request (your key is applied via GoUsers)" code={`curl https://api.openai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-test" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
# GoUsers intercepts this → applies filters → forwards with real key`} />

        <div style={{ background: "#f0fff8", border: "1px solid #1cc88a40", borderRadius: 4, padding: "12px 16px", marginTop: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#155724", display: "flex", alignItems: "center", gap: 8 }}>
            <Check size={15} color="#1cc88a" />
            <strong>Success:</strong> Check the Conversations page — your test message should appear there.
          </p>
        </div>
      </Card>
    </div>
  );
}
