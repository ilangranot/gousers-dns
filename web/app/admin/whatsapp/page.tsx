"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getWhatsAppAccounts, createWhatsAppAccount, deleteWhatsAppAccount,
  getWhatsAppRules, createWhatsAppRule, updateWhatsAppRule, deleteWhatsAppRule,
  getWhatsAppConversations,
} from "@/lib/api";
import { MessageCircle, Plus, Trash2, ToggleLeft, ToggleRight, Webhook, ListFilter, MessagesSquare } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Account = {
  id: string; phone_number_id: string; display_phone_number: string | null;
  verify_token: string; is_active: boolean; created_at: string;
};

type Rule = {
  id: string; name: string; trigger_type: string; pattern: string | null;
  action: string; agent_id: string | null; response_template: string | null;
  is_active: boolean; priority: number; created_at: string;
};

type Conversation = {
  id: string; wa_contact_id: string; contact_name: string | null;
  contact_phone: string | null; status: string; last_message_at: string;
  last_message: string | null; message_count: number;
};

// ─── Style constants ──────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 8, border: "1px solid #dee2e6",
  padding: "20px 24px", marginBottom: 16,
};
const input: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 13,
  border: "1px solid #d1d3e2", borderRadius: 4, color: "#3d4465",
  background: "#fff", outline: "none", boxSizing: "border-box",
};
const btn = (color = "#007bff"): React.CSSProperties => ({
  background: color, color: "#fff", border: "none", borderRadius: 4,
  padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: 500,
});
const badge = (color: string, bg: string): React.CSSProperties => ({
  display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 8px",
  borderRadius: 12, background: bg, color,
});

const ACTION_BADGE: Record<string, [string, string]> = {
  reply:  ["#155724", "#d4edda"],
  flag:   ["#856404", "#fff3cd"],
  block:  ["#c0392b", "#fde8e8"],
};

const TRIGGER_BADGE: Record<string, [string, string]> = {
  keyword:   ["#0c63e4", "#cfe2ff"],
  regex:     ["#6f42c1", "#e9d8f9"],
  always:    ["#495057", "#e9ecef"],
  sentiment: ["#d63384", "#fce4ec"],
};

// ─── Empty form values ────────────────────────────────────────────────────────

const EMPTY_ACCOUNT = { phone_number_id: "", display_phone_number: "", access_token: "", verify_token: "" };
const EMPTY_RULE = { name: "", trigger_type: "keyword", pattern: "", action: "reply", response_template: "", priority: 0 };

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = "accounts" | "rules" | "conversations";

export default function WhatsAppAdminPage() {
  const [tab, setTab] = useState<Tab>("accounts");

  // Accounts state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accForm, setAccForm] = useState(EMPTY_ACCOUNT);
  const [addingAcc, setAddingAcc] = useState(false);
  const [accLoading, setAccLoading] = useState(false);

  // Rules state
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE);
  const [addingRule, setAddingRule] = useState(false);

  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const loadAccounts = () =>
    getWhatsAppAccounts().then(setAccounts).catch(console.error);
  const loadRules = () =>
    getWhatsAppRules().then(setRules).catch(console.error);
  const loadConversations = () =>
    getWhatsAppConversations().then(setConversations).catch(console.error);

  useEffect(() => {
    loadAccounts();
    loadRules();
    loadConversations();
  }, []);

  // ── Account handlers ──────────────────────────────────────────────────────
  async function submitAccount(e: React.FormEvent) {
    e.preventDefault();
    setAccLoading(true);
    try {
      await createWhatsAppAccount(accForm);
      setAccForm(EMPTY_ACCOUNT);
      setAddingAcc(false);
      loadAccounts();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAccLoading(false);
    }
  }

  async function removeAccount(id: string) {
    if (!confirm("Delete this WhatsApp account and all its conversations?")) return;
    await deleteWhatsAppAccount(id).catch(console.error);
    loadAccounts();
    loadConversations();
  }

  // ── Rule handlers ─────────────────────────────────────────────────────────
  async function submitRule(e: React.FormEvent) {
    e.preventDefault();
    await createWhatsAppRule(ruleForm).catch(console.error);
    setRuleForm(EMPTY_RULE);
    setAddingRule(false);
    loadRules();
  }

  async function toggleRule(rule: Rule) {
    await updateWhatsAppRule(rule.id, { is_active: !rule.is_active }).catch(console.error);
    loadRules();
  }

  async function removeRule(id: string) {
    if (!confirm("Delete this rule?")) return;
    await deleteWhatsAppRule(id).catch(console.error);
    loadRules();
  }

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: 500,
    borderBottom: tab === t ? "2px solid #007bff" : "2px solid transparent",
    color: tab === t ? "#007bff" : "#6c757d",
    background: "none", border: "none", outline: "none",
  });

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <MessageCircle size={28} color="#25D366" />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e2a35", margin: 0 }}>WhatsApp Integration</h1>
          <p style={{ color: "#6c757d", fontSize: 13, margin: "2px 0 0" }}>
            Connect WhatsApp Business accounts, define intervention rules, and monitor conversations.
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #dee2e6", marginBottom: 24 }}>
        <button style={tabStyle("accounts")} onClick={() => setTab("accounts")}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Webhook size={14} /> Accounts
          </span>
        </button>
        <button style={tabStyle("rules")} onClick={() => setTab("rules")}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ListFilter size={14} /> Intervention Rules
          </span>
        </button>
        <button style={tabStyle("conversations")} onClick={() => setTab("conversations")}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <MessagesSquare size={14} /> Conversations ({conversations.length})
          </span>
        </button>
      </div>

      {/* ── Accounts Tab ─────────────────────────────────────────────────── */}
      {tab === "accounts" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#343a40", margin: 0 }}>
              WhatsApp Business Accounts
            </h2>
            {!addingAcc && (
              <button style={btn()} onClick={() => setAddingAcc(true)}>
                <Plus size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                Add Account
              </button>
            )}
          </div>

          {/* Setup guide */}
          <div style={{ ...card, background: "#f0f7ff", border: "1px solid #b8daff", marginBottom: 20 }}>
            <strong style={{ fontSize: 13, color: "#004085" }}>Setup Guide</strong>
            <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13, color: "#004085", lineHeight: 1.6 }}>
              <li>Go to <strong>Meta Developer Portal</strong> → create a WhatsApp Business app.</li>
              <li>Under <em>WhatsApp → API Setup</em>, note your <strong>Phone Number ID</strong> and generate a <strong>temporary access token</strong> (or use a permanent system-user token).</li>
              <li>Set the webhook URL to: <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 3, fontSize: 12 }}>
                {"https://your-api-domain/whatsapp/webhook/{org_key}"}
              </code></li>
              <li>Set the <strong>Verify Token</strong> to any string you choose — enter the same value below.</li>
              <li>Subscribe to the <strong>messages</strong> webhook field.</li>
            </ol>
          </div>

          {/* Add form */}
          {addingAcc && (
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>New WhatsApp Account</h3>
              <form onSubmit={submitAccount} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: "#6c757d", display: "block", marginBottom: 4 }}>
                      Phone Number ID *
                    </label>
                    <input
                      style={input}
                      required
                      placeholder="1234567890"
                      value={accForm.phone_number_id}
                      onChange={e => setAccForm(f => ({ ...f, phone_number_id: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#6c757d", display: "block", marginBottom: 4 }}>
                      Display Phone Number
                    </label>
                    <input
                      style={input}
                      placeholder="+1 555 000 0000"
                      value={accForm.display_phone_number}
                      onChange={e => setAccForm(f => ({ ...f, display_phone_number: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#6c757d", display: "block", marginBottom: 4 }}>
                    Access Token * (encrypted at rest)
                  </label>
                  <input
                    style={input}
                    required
                    type="password"
                    placeholder="EAAxxxxxxxx..."
                    value={accForm.access_token}
                    onChange={e => setAccForm(f => ({ ...f, access_token: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#6c757d", display: "block", marginBottom: 4 }}>
                    Verify Token * (used for webhook verification)
                  </label>
                  <input
                    style={input}
                    required
                    placeholder="my-secret-token"
                    value={accForm.verify_token}
                    onChange={e => setAccForm(f => ({ ...f, verify_token: e.target.value }))}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={btn()} disabled={accLoading}>
                    {accLoading ? "Saving…" : "Save Account"}
                  </button>
                  <button type="button" style={btn("#6c757d")} onClick={() => setAddingAcc(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Account list */}
          {accounts.length === 0 && !addingAcc && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#6c757d", fontSize: 14 }}>
              No WhatsApp accounts connected yet. Click <strong>Add Account</strong> to get started.
            </div>
          )}
          {accounts.map(acc => (
            <div key={acc.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <MessageCircle size={16} color="#25D366" />
                    <strong style={{ fontSize: 14 }}>{acc.display_phone_number || acc.phone_number_id}</strong>
                    <span style={badge(acc.is_active ? "#155724" : "#6c757d", acc.is_active ? "#d4edda" : "#e9ecef")}>
                      {acc.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6c757d" }}>
                    Phone Number ID: <code>{acc.phone_number_id}</code>
                  </div>
                  <div style={{ fontSize: 12, color: "#6c757d", marginTop: 2 }}>
                    Verify Token: <code>{acc.verify_token}</code>
                  </div>
                </div>
                <button
                  style={{ ...btn("#dc3545"), padding: "6px 12px" }}
                  onClick={() => removeAccount(acc.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Rules Tab ────────────────────────────────────────────────────── */}
      {tab === "rules" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "#343a40", margin: "0 0 4px" }}>
                Intervention Rules
              </h2>
              <p style={{ fontSize: 12, color: "#6c757d", margin: 0 }}>
                Rules are evaluated in priority order. First match wins.
              </p>
            </div>
            {!addingRule && (
              <button style={btn()} onClick={() => setAddingRule(true)}>
                <Plus size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                Add Rule
              </button>
            )}
          </div>

          {/* Rule form */}
          {addingRule && (
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>New Intervention Rule</h3>
              <form onSubmit={submitRule} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: "#6c757d", display: "block", marginBottom: 4 }}>Rule Name *</label>
                    <input
                      style={input}
                      required
                      placeholder="e.g. Angry customer"
                      value={ruleForm.name}
                      onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#6c757d", display: "block", marginBottom: 4 }}>Trigger Type</label>
                    <select
                      style={input}
                      value={ruleForm.trigger_type}
                      onChange={e => setRuleForm(f => ({ ...f, trigger_type: e.target.value }))}
                    >
                      <option value="keyword">Keyword</option>
                      <option value="regex">Regex</option>
                      <option value="always">Always (every message)</option>
                      <option value="sentiment">Negative Sentiment</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#6c757d", display: "block", marginBottom: 4 }}>Action</label>
                    <select
                      style={input}
                      value={ruleForm.action}
                      onChange={e => setRuleForm(f => ({ ...f, action: e.target.value }))}
                    >
                      <option value="reply">AI Reply</option>
                      <option value="flag">Flag for Review</option>
                      <option value="block">Block Message</option>
                    </select>
                  </div>
                </div>

                {ruleForm.trigger_type !== "always" && ruleForm.trigger_type !== "sentiment" && (
                  <div>
                    <label style={{ fontSize: 12, color: "#6c757d", display: "block", marginBottom: 4 }}>
                      {ruleForm.trigger_type === "keyword" ? "Keyword" : "Regex Pattern"} *
                    </label>
                    <input
                      style={input}
                      required
                      placeholder={ruleForm.trigger_type === "keyword" ? "cancel" : "cancel|refund|money back"}
                      value={ruleForm.pattern}
                      onChange={e => setRuleForm(f => ({ ...f, pattern: e.target.value }))}
                    />
                  </div>
                )}

                {ruleForm.action === "reply" && (
                  <div>
                    <label style={{ fontSize: 12, color: "#6c757d", display: "block", marginBottom: 4 }}>
                      Static Response Template (leave empty to use AI)
                    </label>
                    <textarea
                      style={{ ...input, height: 70, resize: "vertical" }}
                      placeholder="Hi! Thanks for reaching out. Our team will be in touch shortly…"
                      value={ruleForm.response_template}
                      onChange={e => setRuleForm(f => ({ ...f, response_template: e.target.value }))}
                    />
                  </div>
                )}

                <div style={{ width: 80 }}>
                  <label style={{ fontSize: 12, color: "#6c757d", display: "block", marginBottom: 4 }}>Priority</label>
                  <input
                    style={input}
                    type="number"
                    value={ruleForm.priority}
                    onChange={e => setRuleForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                  />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={btn()}>Save Rule</button>
                  <button type="button" style={btn("#6c757d")} onClick={() => setAddingRule(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {rules.length === 0 && !addingRule && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#6c757d", fontSize: 14 }}>
              No intervention rules defined. Add a rule to start automating WhatsApp responses.
            </div>
          )}

          {rules.map(rule => {
            const [ac, ab] = ACTION_BADGE[rule.action] ?? ["#6c757d", "#e9ecef"];
            const [tc, tb] = TRIGGER_BADGE[rule.trigger_type] ?? ["#6c757d", "#e9ecef"];
            return (
              <div key={rule.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <strong style={{ fontSize: 14 }}>{rule.name}</strong>
                      <span style={badge(ac, ab)}>{rule.action}</span>
                      <span style={badge(tc, tb)}>{rule.trigger_type}</span>
                      {rule.priority > 0 && (
                        <span style={badge("#6c757d", "#e9ecef")}>priority {rule.priority}</span>
                      )}
                    </div>
                    {rule.pattern && (
                      <div style={{ fontSize: 12, color: "#495057", marginBottom: 4 }}>
                        Pattern: <code style={{ background: "#f8f9fa", padding: "1px 4px", borderRadius: 3 }}>{rule.pattern}</code>
                      </div>
                    )}
                    {rule.response_template && (
                      <div style={{ fontSize: 12, color: "#6c757d", fontStyle: "italic" }}>
                        &ldquo;{rule.response_template.slice(0, 100)}{rule.response_template.length > 100 ? "…" : ""}&rdquo;
                      </div>
                    )}
                    {rule.action === "reply" && !rule.response_template && (
                      <div style={{ fontSize: 12, color: "#6c757d" }}>Uses AI to generate reply</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                    <button
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
                      onClick={() => toggleRule(rule)}
                      title={rule.is_active ? "Disable rule" : "Enable rule"}
                    >
                      {rule.is_active
                        ? <ToggleRight size={22} color="#28a745" />
                        : <ToggleLeft size={22} color="#adb5bd" />}
                    </button>
                    <button
                      style={{ ...btn("#dc3545"), padding: "6px 10px" }}
                      onClick={() => removeRule(rule.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Conversations Tab ─────────────────────────────────────────────── */}
      {tab === "conversations" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#343a40", margin: 0 }}>
              Conversations ({conversations.length})
            </h2>
            <button style={btn("#6c757d")} onClick={loadConversations}>Refresh</button>
          </div>

          {conversations.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#6c757d", fontSize: 14 }}>
              No conversations yet. Messages received via WhatsApp will appear here.
            </div>
          )}

          {conversations.map(conv => (
            <Link
              key={conv.id}
              href={`/admin/whatsapp/conversations/${conv.id}`}
              style={{ textDecoration: "none" }}
            >
              <div style={{
                ...card,
                cursor: "pointer",
                transition: "box-shadow 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#343a40" }}>
                      {conv.contact_name || conv.contact_phone || conv.wa_contact_id}
                    </div>
                    {conv.contact_name && (
                      <div style={{ fontSize: 12, color: "#6c757d" }}>{conv.contact_phone}</div>
                    )}
                    {conv.last_message && (
                      <div style={{ fontSize: 12, color: "#495057", marginTop: 4, fontStyle: "italic" }}>
                        {conv.last_message.slice(0, 80)}{conv.last_message.length > 80 ? "…" : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                    <div style={{ fontSize: 12, color: "#6c757d" }}>
                      {new Date(conv.last_message_at).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 12, color: "#6c757d", marginTop: 4 }}>
                      {conv.message_count} message{conv.message_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
