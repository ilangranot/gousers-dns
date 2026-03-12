"use client";
import { useEffect, useState } from "react";
import {
  getAgents, createAgent, updateAgent, deleteAgent,
  getAssignments, addAssignment, removeAssignmentByAgent, activateAssignment,
  getUsers,
  getAgentSchedules, createAgentSchedule, updateAgentSchedule, deleteAgentSchedule, triggerAgentSchedule,
} from "@/lib/api";
import { Agent, AgentAssignment, User, AgentSchedule } from "@/lib/types";
import { Bot, Plus, Trash2, Edit2, Check, X, Clock, Play, Sparkles, Download } from "lucide-react";

// ── Ecosystem templates ───────────────────────────────────────────────────────

interface EcoTemplate {
  name: string;
  category: string;
  emoji: string;
  description: string;
  provider: "openai" | "anthropic" | "gemini";
  system_prompt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Operations":       "#4e73df",
  "Marketing":        "#e83e8c",
  "HR & People":      "#1cc88a",
  "Training":         "#f6a623",
  "Customer Success": "#36b9cc",
};

const ECOSYSTEM: EcoTemplate[] = [
  {
    name: "Marketing Strategist",
    category: "Marketing",
    emoji: "📣",
    description: "Develops marketing strategies, campaign briefs, audience targeting, and brand messaging.",
    provider: "openai",
    system_prompt: `You are an expert Marketing Strategist. Help the user with:
- Marketing strategy and campaign planning
- Target audience analysis and persona development
- Brand positioning and messaging frameworks
- Content calendar planning and creative briefs
- Campaign performance analysis and optimization
- Competitive analysis and market research

Always provide actionable, data-driven recommendations. Ask clarifying questions about the brand, target audience, and goals before making recommendations. Format deliverables clearly with sections and bullet points.`,
  },
  {
    name: "Web Marketing Specialist",
    category: "Marketing",
    emoji: "🌐",
    description: "Expert in SEO, paid ads, social media, Google Analytics, and digital growth tactics.",
    provider: "openai",
    system_prompt: `You are a Web Marketing Specialist with deep expertise in digital marketing. Help the user with:
- SEO strategy: keyword research, on-page optimization, technical SEO, link building
- Paid advertising: Google Ads, Meta Ads, LinkedIn Ads — ad copy, bidding strategies, targeting
- Social media marketing: content strategy, posting schedules, engagement tactics
- Web analytics: interpreting Google Analytics/GA4 data, conversion tracking, funnel analysis
- Email marketing: segmentation, A/B testing, automation flows
- Landing page optimization and CRO (conversion rate optimization)

Always base recommendations on best practices and data. Provide specific, actionable tactics with measurable KPIs.`,
  },
  {
    name: "Sales Coach",
    category: "Marketing",
    emoji: "💼",
    description: "Helps with sales scripts, objection handling, pipeline management, and closing strategies.",
    provider: "openai",
    system_prompt: `You are an expert Sales Coach with experience across B2B and B2C sales environments.

Help the user with:
- Prospecting: ideal customer profile (ICP), outreach sequences, cold email/call scripts
- Discovery conversations: needs assessment, pain point identification, qualification (BANT, MEDDIC)
- Value proposition and demo preparation
- Handling objections: price, timing, competition, internal buy-in
- Negotiation and closing techniques
- Pipeline management and forecasting
- Account expansion and upselling strategies
- CRM best practices and sales process optimization

Roleplay: When asked, act as a prospect for sales practice — realistic but fair.`,
  },
  {
    name: "Executive Secretary",
    category: "Operations",
    emoji: "📋",
    description: "Handles scheduling, email drafting, meeting agendas, task prioritization, and executive support.",
    provider: "openai",
    system_prompt: `You are a highly efficient Executive Secretary and Personal Assistant. Help the user with:
- Drafting professional emails, memos, and correspondence
- Creating meeting agendas and taking structured meeting notes
- Scheduling coordination and calendar management advice
- Task and priority management using frameworks like the Eisenhower Matrix
- Travel planning and logistics coordination
- Document formatting, proofreading, and editing
- Preparing reports, presentations, and executive summaries

Be concise, professional, and proactive. Always produce polished, ready-to-use outputs.`,
  },
  {
    name: "Product Manager",
    category: "Operations",
    emoji: "🚀",
    description: "Assists with product roadmaps, user stories, PRDs, feature prioritization, and sprint planning.",
    provider: "openai",
    system_prompt: `You are an experienced Product Manager. Help the user with:
- Product roadmap creation and prioritization (RICE, MoSCoW frameworks)
- Writing Product Requirements Documents (PRDs) and feature specs
- User story writing: As a [user], I want [feature], so that [benefit]
- Customer discovery and user research planning
- Defining success metrics, KPIs, and OKRs for product features
- Competitive analysis and product positioning
- Sprint planning, backlog grooming, and release planning
- Stakeholder communication and alignment

Be structured and systematic. Help translate business needs into clear technical requirements.`,
  },
  {
    name: "Project Manager",
    category: "Operations",
    emoji: "📊",
    description: "Manages timelines, milestones, risks, dependencies, and stakeholder communications.",
    provider: "openai",
    system_prompt: `You are a certified Project Manager (PMP-level expertise). Help the user with:
- Project charter and scope definition
- Work breakdown structure (WBS) and milestone planning
- Risk identification, assessment, and mitigation strategies
- Resource allocation and capacity planning
- Status report writing and stakeholder update communications
- RAID log management (Risks, Assumptions, Issues, Dependencies)
- Agile/Scrum facilitation: sprint planning, retrospectives, standups
- Project closure and lessons learned documentation

Be structured and proactive about risks. Always ask for project context before making recommendations.`,
  },
  {
    name: "General Manager",
    category: "Operations",
    emoji: "🏢",
    description: "Strategic business advisor for operations, team management, KPIs, and executive decisions.",
    provider: "openai",
    system_prompt: `You are a seasoned General Manager with broad business expertise. Help the user with:
- Business strategy development and competitive positioning
- Operational efficiency analysis and process improvement
- Team structure, organizational design, and delegation
- KPI dashboards and performance management frameworks
- P&L interpretation and budget planning
- Cross-functional alignment and change management
- Decision-making frameworks for complex business problems
- Culture building and leadership development

Bring a balanced, executive perspective. Challenge assumptions constructively. Help the user see the big picture while providing actionable next steps.`,
  },
  {
    name: "Dispatcher",
    category: "Operations",
    emoji: "🗂️",
    description: "Routes tasks, manages team workloads, coordinates handoffs, and tracks job statuses.",
    provider: "openai",
    system_prompt: `You are an expert Dispatcher and Operations Coordinator. Help the user with:
- Task routing and team assignment optimization
- Workload balancing and capacity management
- Priority triage and escalation protocols
- Creating and maintaining work queues and job tracking
- Coordination between departments, teams, or service areas
- SLA monitoring and on-time delivery tracking
- Writing clear handoff notes and job instructions
- Incident response coordination and communication

Be organized, precise, and decisive. Help the user maintain order and visibility across multiple concurrent workstreams.`,
  },
  {
    name: "GoUsers Guide",
    category: "Training",
    emoji: "🤖",
    description: "Teaches users how to get the most out of the GoUsers AI platform — features, tips, and best practices.",
    provider: "openai",
    system_prompt: `You are the GoUsers Platform Guide — an expert assistant who helps users learn and master the GoUsers AI Gateway platform.

GoUsers is an AI gateway that allows organizations to:
- Chat with AI models (OpenAI/ChatGPT, Anthropic/Claude, Google Gemini) through a unified interface
- Apply organization-specific filtering and content policies to all AI interactions
- Manage team members and assign AI agents with custom personalities and system prompts
- Upload knowledge base documents that AI uses as context
- Set up scheduled automated agent runs for recurring tasks
- Track usage analytics and manage connections to external services
- Customize the platform with themes, logos, and industry-specific settings
- Use incognito mode for unmonitored direct AI access

Help users understand features, write effective prompts, set up agents and filtering rules, troubleshoot issues, and get maximum value from their AI gateway investment. Be patient, step-by-step, and celebrate when users learn new things.`,
  },
  {
    name: "Onboarding Buddy",
    category: "HR & People",
    emoji: "👋",
    description: "Guides new employees through company processes, culture, tools, and first-week essentials.",
    provider: "openai",
    system_prompt: `You are a warm, welcoming New Employee Onboarding Buddy. Your role is to help new team members feel comfortable, informed, and set up for success.

Help new employees with:
- Understanding company culture, values, and norms
- Navigating common HR processes: benefits enrollment, payroll, time-off requests
- Learning about tools and systems used by the team
- Understanding their role, goals, and who to go to for what
- Setting up their workspace, accounts, and access
- Answering common first-week questions without judgment
- Understanding meeting culture, communication norms, and expectations

Be warm, patient, and reassuring. Remind new employees that it's normal to feel overwhelmed and that everyone was new once. Always point them to the right people or resources when you don't know the answer.`,
  },
  {
    name: "HR Advisor",
    category: "HR & People",
    emoji: "👥",
    description: "Advises on HR policies, performance management, hiring, conflict resolution, and compliance.",
    provider: "openai",
    system_prompt: `You are an experienced HR Advisor supporting managers and employees with people-related questions.

Help users with:
- HR policy interpretation and guidance
- Performance management: setting expectations, feedback, PIPs, reviews
- Hiring and recruiting: job descriptions, interview questions, evaluation criteria
- Onboarding and offboarding processes
- Employee relations: handling complaints, mediating conflicts, investigations
- Compensation and benefits guidance
- Employment law basics (always recommend consulting legal counsel for specific legal situations)
- Culture and engagement: recognition programs, team building, retention strategies
- Difficult conversations: terminations, disciplinary actions, sensitive topics

Always be empathetic to all parties involved. Approach issues fairly. Flag situations that require escalation to legal counsel or senior leadership.`,
  },
  {
    name: "Customer Satisfaction",
    category: "Customer Success",
    emoji: "⭐",
    description: "Collects customer feedback, measures NPS satisfaction, and surfaces insights about the GoUsers experience.",
    provider: "openai",
    system_prompt: `You are a Customer Satisfaction agent for GoUsers. Your mission is to understand how customers feel about their GoUsers experience and surface actionable insights.

Engage customers to:
- Share their overall experience with the GoUsers platform
- Rate specific features: chat interface, filtering, agents, analytics, admin panel
- Describe what's working well and what could be improved
- Share their top use cases and workflows
- Identify any pain points or missing features
- Rate their overall satisfaction on an NPS scale (0–10)

Conversation approach:
- Be conversational, friendly, and genuinely curious
- Ask follow-up questions to go deeper on issues raised
- Thank customers for specific feedback
- Acknowledge frustrations empathetically without being defensive

At the end, produce a structured summary: NPS score, top positives, top improvement areas, and any feature requests mentioned.`,
  },
  {
    name: "AI Skills Coach",
    category: "Training",
    emoji: "🧠",
    description: "Teaches prompt engineering, AI concepts, and how to leverage AI effectively in daily work.",
    provider: "openai",
    system_prompt: `You are an AI Skills Coach who helps professionals learn to work effectively with AI tools.

Teach users:
- Prompt engineering fundamentals: clarity, context, examples, constraints, output format
- Advanced prompting techniques: chain-of-thought, role prompting, few-shot examples, iterative refinement
- How to use AI for specific tasks: writing, analysis, coding, research, brainstorming
- Understanding AI capabilities and limitations (hallucinations, knowledge cutoffs, biases)
- Building AI workflows and automations
- Evaluating AI output quality and when to trust vs. verify
- Privacy and security best practices when using AI
- Staying current with the rapidly evolving AI landscape

Teaching approach:
- Start by assessing the user's current AI knowledge level
- Use practical examples and hands-on exercises
- Explain WHY techniques work, not just how
- Encourage experimentation and build confidence through small wins

Always be encouraging. Make AI accessible and practical, not intimidating.`,
  },
  {
    name: "Skills Development Coach",
    category: "Training",
    emoji: "📚",
    description: "Coaches professional skills: communication, leadership, time management, critical thinking, and more.",
    provider: "openai",
    system_prompt: `You are a Professional Skills Development Coach who helps individuals grow their capabilities and advance their careers.

Help users develop skills including:
- Communication: writing, presenting, active listening, giving/receiving feedback
- Leadership: influence, delegation, motivating teams, difficult conversations
- Time management: prioritization, deep work, managing distractions, energy management
- Critical thinking: structured problem-solving, decision frameworks, avoiding cognitive biases
- Emotional intelligence: self-awareness, empathy, managing stress, conflict resolution
- Negotiation and persuasion
- Strategic thinking and systems thinking
- Personal productivity and habit formation

Coaching approach:
- Start by understanding the user's specific skill gap or goal
- Use evidence-based frameworks and models (cite them clearly)
- Provide practical exercises and real-world application scenarios
- Give honest, constructive feedback
- Help the user create an actionable development plan

Be direct, supportive, and results-focused. Great coaches challenge their clients to grow.`,
  },
  {
    name: "Finance Advisor",
    category: "Operations",
    emoji: "💰",
    description: "Helps with budgeting, financial analysis, forecasting, reporting, and business finance decisions.",
    provider: "openai",
    system_prompt: `You are a Finance Advisor with expertise in business finance and financial management.

Help the user with:
- Budget planning and variance analysis
- Financial forecasting and modeling
- P&L (Profit & Loss) statement interpretation
- Cash flow management and analysis
- KPI definition and financial dashboard creation
- Cost optimization and efficiency analysis
- Investment analysis and ROI calculations
- Financial reporting for stakeholders and board presentations
- Unit economics: CAC, LTV, gross margin, burn rate

Always clarify that responses are for informational purposes and users should consult a licensed financial professional for specific financial decisions. Be precise with numbers and clearly state assumptions in any analysis.`,
  },
];

// ── Agent form types ──────────────────────────────────────────────────────────

interface AgentFormState {
  name: string;
  description: string;
  system_prompt: string;
  provider: string;
  model: string;
}

const emptyForm: AgentFormState = {
  name: "",
  description: "",
  system_prompt: "",
  provider: "openai",
  model: "",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ScheduleFormState {
  agent_id: string;
  name: string;
  prompt: string;
  schedule_type: "interval" | "cron";
  interval_value: string;
  interval_unit: "minutes" | "hours" | "days";
  cron_days: number[];
  cron_hour: string;
  cron_minute: string;
  target_type: "all" | "specific";
  target_user_ids: string[];
}

const emptyScheduleForm: ScheduleFormState = {
  agent_id: "",
  name: "",
  prompt: "",
  schedule_type: "interval",
  interval_value: "1",
  interval_unit: "hours",
  cron_days: [],
  cron_hour: "9",
  cron_minute: "0",
  target_type: "all",
  target_user_ids: [],
};

function scheduleLabel(s: AgentSchedule): string {
  if (s.schedule_type === "interval") return `Every ${s.interval_value} ${s.interval_unit}`;
  const time = `${String(s.cron_hour ?? 9).padStart(2, "0")}:${String(s.cron_minute ?? 0).padStart(2, "0")}`;
  if (!s.cron_day_of_week || s.cron_day_of_week === "*") return `Daily at ${time}`;
  const days = s.cron_day_of_week.split(",").map(d => DAYS[parseInt(d)]).join(", ");
  return `${days} at ${time}`;
}

// ── Page component ────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignments, setAssignments] = useState<AgentAssignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [schedules, setSchedules] = useState<AgentSchedule[]>([]);

  // Agent form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Assignment form
  const [assignUserId, setAssignUserId] = useState("");
  const [assignAgentId, setAssignAgentId] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Schedule form
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [schedForm, setSchedForm] = useState<ScheduleFormState>(emptyScheduleForm);
  const [savingSched, setSavingSched] = useState(false);
  const [schedError, setSchedError] = useState("");
  const [triggering, setTriggering] = useState<string | null>(null);

  // Ecosystem
  const [ecoCategory, setEcoCategory] = useState("All");
  const [installing, setInstalling] = useState<string | null>(null);

  const loadAgents = () => getAgents().then(setAgents).catch(console.error);
  const loadAssignments = () => getAssignments().then(setAssignments).catch(console.error);
  const loadUsers = () => getUsers().then(setUsers).catch(console.error);
  const loadSchedules = () => getAgentSchedules().then((d: AgentSchedule[]) => setSchedules(d)).catch(console.error);

  useEffect(() => {
    loadAgents();
    loadAssignments();
    loadUsers();
    loadSchedules();
  }, []);

  // ── Agent CRUD ─────────────────────────────────────────────────────────────

  function startEdit(agent: Agent) {
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      description: agent.description ?? "",
      system_prompt: agent.system_prompt,
      provider: agent.provider,
      model: agent.model ?? "",
    });
    setShowForm(true);
    setFormError("");
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const payload = { ...form, description: form.description || null, model: form.model || null };
      if (editingId) await updateAgent(editingId, payload);
      else await createAgent(payload);
      cancelForm();
      loadAgents();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(agent: Agent) {
    if (!confirm(`Delete agent "${agent.name}"? All assignments will be removed.`)) return;
    await deleteAgent(agent.id).catch(console.error);
    loadAgents();
    loadAssignments();
  }

  async function toggleActive(agent: Agent) {
    await updateAgent(agent.id, { is_active: !agent.is_active }).catch(console.error);
    loadAgents();
  }

  // ── Assignments ────────────────────────────────────────────────────────────

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignUserId || !assignAgentId) return;
    setAssigning(true);
    try {
      await addAssignment({ user_id: assignUserId, agent_id: assignAgentId });
      setAssignUserId("");
      setAssignAgentId("");
      loadAssignments();
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassign(userId: string, agentId: string) {
    await removeAssignmentByAgent(userId, agentId).catch(console.error);
    loadAssignments();
  }

  async function handleActivate(userId: string, agentId: string) {
    await activateAssignment(userId, agentId).catch(console.error);
    loadAssignments();
  }

  // ── Ecosystem install ──────────────────────────────────────────────────────

  async function handleInstall(template: EcoTemplate) {
    setInstalling(template.name);
    try {
      await createAgent({
        name: template.name,
        description: template.description,
        system_prompt: template.system_prompt,
        provider: template.provider,
        model: null,
      });
      await loadAgents();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setInstalling(null);
    }
  }

  // ── Schedule handlers ──────────────────────────────────────────────────────

  function startEditSchedule(s: AgentSchedule) {
    setEditingScheduleId(s.id);
    setSchedForm({
      agent_id: s.agent_id,
      name: s.name,
      prompt: s.prompt,
      schedule_type: s.schedule_type,
      interval_value: String(s.interval_value ?? 1),
      interval_unit: (s.interval_unit as ScheduleFormState["interval_unit"]) ?? "hours",
      cron_days: s.cron_day_of_week && s.cron_day_of_week !== "*" ? s.cron_day_of_week.split(",").map(Number) : [],
      cron_hour: String(s.cron_hour ?? 9),
      cron_minute: String(s.cron_minute ?? 0),
      target_type: s.target_type,
      target_user_ids: s.target_user_ids ?? [],
    });
    setShowScheduleForm(true);
    setSchedError("");
  }

  function cancelScheduleForm() {
    setShowScheduleForm(false);
    setEditingScheduleId(null);
    setSchedForm(emptyScheduleForm);
    setSchedError("");
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSchedError("");
    setSavingSched(true);
    try {
      const payload = {
        agent_id: schedForm.agent_id,
        name: schedForm.name,
        prompt: schedForm.prompt,
        schedule_type: schedForm.schedule_type,
        interval_value: schedForm.schedule_type === "interval" ? parseInt(schedForm.interval_value) || 1 : null,
        interval_unit: schedForm.schedule_type === "interval" ? schedForm.interval_unit : null,
        cron_day_of_week: schedForm.schedule_type === "cron" ? (schedForm.cron_days.length > 0 ? schedForm.cron_days.join(",") : "*") : null,
        cron_hour: schedForm.schedule_type === "cron" ? parseInt(schedForm.cron_hour) || 9 : null,
        cron_minute: schedForm.schedule_type === "cron" ? parseInt(schedForm.cron_minute) || 0 : 0,
        target_type: schedForm.target_type,
        target_user_ids: schedForm.target_type === "specific" ? schedForm.target_user_ids : [],
      };
      if (editingScheduleId) await updateAgentSchedule(editingScheduleId, payload);
      else await createAgentSchedule(payload);
      cancelScheduleForm();
      loadSchedules();
    } catch (err: any) {
      setSchedError(err.message);
    } finally {
      setSavingSched(false);
    }
  }

  async function handleDeleteSchedule(id: string, name: string) {
    if (!confirm(`Delete schedule "${name}"?`)) return;
    await deleteAgentSchedule(id).catch(console.error);
    loadSchedules();
  }

  async function handleToggleSchedule(s: AgentSchedule) {
    await updateAgentSchedule(s.id, { is_active: !s.is_active }).catch(console.error);
    loadSchedules();
  }

  async function handleTrigger(s: AgentSchedule) {
    setTriggering(s.id);
    try {
      await triggerAgentSchedule(s.id);
      loadSchedules();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTriggering(null);
    }
  }

  function toggleCronDay(day: number) {
    setSchedForm(f => ({ ...f, cron_days: f.cron_days.includes(day) ? f.cron_days.filter(d => d !== day) : [...f.cron_days, day] }));
  }

  function toggleTargetUser(uid: string) {
    setSchedForm(f => ({ ...f, target_user_ids: f.target_user_ids.includes(uid) ? f.target_user_ids.filter(id => id !== uid) : [...f.target_user_ids, uid] }));
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 13,
    border: "1px solid #d1d3e2", borderRadius: 4, outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "#858796", display: "block", marginBottom: 4 };

  // Ecosystem derived state
  const categories = ["All", ...Array.from(new Set(ECOSYSTEM.map(t => t.category)))];
  const filteredEco = ecoCategory === "All" ? ECOSYSTEM : ECOSYSTEM.filter(t => t.category === ecoCategory);
  const installedNames = new Set(agents.map(a => a.name));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#3d4465" }}>Agents</h1>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#858796" }}>
          Define AI personas with custom system prompts and assign them to users
        </p>
      </div>

      {/* ══ Ecosystem ═══════════════════════════════════════════════════════ */}
      <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", marginBottom: 24, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid #e9ecef", background: "linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={18} color="#f6c23e" />
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>Agent Ecosystem</h3>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                Ready-made AI agents — click Add to install instantly into your workspace
              </p>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "3px 10px" }}>
              {ECOSYSTEM.length} agents
            </span>
          </div>

          {/* Category filter */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {categories.map(cat => {
              const active = ecoCategory === cat;
              const color = CATEGORY_COLORS[cat] ?? "#fff";
              return (
                <button
                  key={cat}
                  onClick={() => setEcoCategory(cat)}
                  style={{
                    padding: "4px 12px", fontSize: 11, fontWeight: 700, borderRadius: 10,
                    border: `1px solid ${active ? color : "rgba(255,255,255,0.25)"}`,
                    background: active ? color : "rgba(255,255,255,0.08)",
                    color: active ? "#fff" : "rgba(255,255,255,0.7)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Card grid */}
        <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {filteredEco.map(template => {
            const isInstalled = installedNames.has(template.name);
            const isInstalling = installing === template.name;
            const catColor = CATEGORY_COLORS[template.category] ?? "#6c757d";
            return (
              <div
                key={template.name}
                style={{
                  border: "1px solid",
                  borderColor: isInstalled ? `${catColor}40` : "#e9ecef",
                  borderRadius: 8,
                  padding: "14px 14px 12px",
                  background: isInstalled ? `${catColor}06` : "#fafbfc",
                  display: "flex", flexDirection: "column", gap: 8,
                  transition: "box-shadow 0.15s",
                  position: "relative",
                }}
              >
                {/* Top row */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{template.emoji}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#3d4465", lineHeight: 1.3 }}>{template.name}</div>
                    <span style={{
                      display: "inline-block", marginTop: 4,
                      fontSize: 9, fontWeight: 700, color: catColor,
                      background: `${catColor}15`, borderRadius: 8,
                      padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.05em"
                    }}>
                      {template.category}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <p style={{ margin: 0, fontSize: 11, color: "#858796", lineHeight: 1.5, flex: 1 }}>
                  {template.description}
                </p>

                {/* Action */}
                {isInstalled ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#1cc88a", marginTop: 2 }}>
                    <Check size={12} /> Installed
                  </div>
                ) : (
                  <button
                    onClick={() => handleInstall(template)}
                    disabled={isInstalling}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 4,
                      border: `1px solid ${catColor}40`, background: `${catColor}10`,
                      color: catColor, cursor: isInstalling ? "default" : "pointer",
                      opacity: isInstalling ? 0.7 : 1, width: "100%", justifyContent: "center",
                    }}
                  >
                    <Download size={12} />
                    {isInstalling ? "Adding…" : "Add Agent"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ My Agents ════════════════════════════════════════════════════════ */}
      <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", marginBottom: 24, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={15} color="#4e73df" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>
              My Agents <span style={{ fontSize: 12, fontWeight: 400, color: "#858796" }}>({agents.length})</span>
            </h3>
          </div>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 13, borderRadius: 4, border: "none", background: "#4e73df", color: "#fff", cursor: "pointer", fontWeight: 600 }}
            >
              <Plus size={14} /> Add Agent
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleSave} style={{ padding: "16px 20px", borderBottom: "1px solid #e9ecef", background: "#f8f9fc" }}>
            <h4 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#495057" }}>
              {editingId ? "Edit Agent" : "New Agent"}
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input style={inputStyle} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer Support Bot" />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional short description" />
              </div>
              <div>
                <label style={labelStyle}>Provider</label>
                <select style={inputStyle} value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Gemini</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Model (optional)</label>
                <input style={inputStyle} value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. gpt-4o" />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>System Prompt *</label>
              <textarea
                required value={form.system_prompt}
                onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                rows={5}
                placeholder="You are a helpful assistant…"
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            {formError && <p style={{ color: "#e74c3c", fontSize: 12, margin: "0 0 10px" }}>{formError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", fontSize: 13, borderRadius: 4, border: "none", background: "#4e73df", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                <Check size={13} /> {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={cancelForm} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", fontSize: 13, borderRadius: 4, border: "1px solid #d1d3e2", background: "#fff", color: "#6e707e", cursor: "pointer" }}>
                <X size={13} /> Cancel
              </button>
            </div>
          </form>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
              {["Name", "Description", "Provider", "Active", ""].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a, i) => (
              <tr key={a.id} style={{ borderBottom: i < agents.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontWeight: 600, color: "#3d4465" }}>{a.name}</span>
                </td>
                <td style={{ padding: "12px 16px", color: "#858796", maxWidth: 240 }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                    {a.description || <em>—</em>}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#f0f0f5", color: "#495057" }}>{a.provider}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <button
                    onClick={() => toggleActive(a)}
                    style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: a.is_active ? "#d4edda" : "#f8d7da", color: a.is_active ? "#155724" : "#721c24" }}
                  >
                    {a.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => startEdit(a)} style={{ padding: "5px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d3e2", background: "#fff", color: "#6e707e", cursor: "pointer" }}>
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(a)} style={{ padding: "5px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #e74c3c40", background: "#fff", color: "#e74c3c", cursor: "pointer" }}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "40px 0", textAlign: "center", color: "#858796" }}>No agents yet — install from the Ecosystem above or create a custom one</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ══ Assignments ══════════════════════════════════════════════════════ */}
      <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", marginBottom: 24, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>User Assignments</h3>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#858796" }}>Users can have multiple agents assigned — set one as Active for each user</p>
        </div>

        <form onSubmit={handleAssign} style={{ padding: "14px 16px", borderBottom: "1px solid #e9ecef", background: "#f8f9fc", display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>User</label>
            <select style={inputStyle} value={assignUserId} onChange={e => setAssignUserId(e.target.value)} required>
              <option value="">Select user…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>Agent</label>
            <select style={inputStyle} value={assignAgentId} onChange={e => setAssignAgentId(e.target.value)} required>
              <option value="">Select agent…</option>
              {agents.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={assigning} style={{ padding: "8px 18px", fontSize: 13, borderRadius: 4, border: "none", background: "#1cc88a", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
            {assigning ? "Assigning…" : "Add Assignment"}
          </button>
        </form>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
              {["User", "Agent", "Active", "Assigned", ""].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a, i) => (
              <tr key={a.id} style={{ borderBottom: i < assignments.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                <td style={{ padding: "12px 16px", color: "#3d4465" }}>{a.user_email}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#e8f4fd", color: "#1a6896" }}>{a.agent_name}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {(a as AgentAssignment & { is_active?: boolean }).is_active ? (
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "#d4edda", color: "#155724" }}>Active</span>
                  ) : (
                    <button
                      onClick={() => handleActivate(a.user_id, a.agent_id)}
                      style={{ padding: "2px 8px", fontSize: 11, borderRadius: 10, border: "1px solid #c3e6cb", background: "#fff", color: "#28a745", cursor: "pointer", fontWeight: 600 }}
                    >
                      Set Active
                    </button>
                  )}
                </td>
                <td style={{ padding: "12px 16px", color: "#858796" }}>
                  {new Date(a.assigned_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <button onClick={() => handleUnassign(a.user_id, a.agent_id)} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 4, border: "1px solid #e74c3c40", background: "#fff", color: "#e74c3c", cursor: "pointer" }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "40px 0", textAlign: "center", color: "#858796" }}>No assignments yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ══ Schedules ════════════════════════════════════════════════════════ */}
      <div style={{ background: "#fff", borderRadius: 4, boxShadow: "0 0 1px rgba(0,0,0,0.125), 0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e9ecef", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={15} color="#f6c23e" />
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#495057" }}>
                Schedules <span style={{ fontSize: 12, fontWeight: 400, color: "#858796" }}>({schedules.length})</span>
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: "#858796" }}>Run an agent on a schedule and deliver responses to users as chat sessions</p>
            </div>
          </div>
          {!showScheduleForm && (
            <button
              onClick={() => { setShowScheduleForm(true); setEditingScheduleId(null); setSchedForm(emptyScheduleForm); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 13, borderRadius: 4, border: "none", background: "#f6c23e", color: "#fff", cursor: "pointer", fontWeight: 600 }}
            >
              <Plus size={14} /> Add Schedule
            </button>
          )}
        </div>

        {showScheduleForm && (
          <form onSubmit={handleSaveSchedule} style={{ padding: "16px 20px", borderBottom: "1px solid #e9ecef", background: "#fffdf5" }}>
            <h4 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#495057" }}>
              {editingScheduleId ? "Edit Schedule" : "New Schedule"}
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Agent *</label>
                <select style={inputStyle} required value={schedForm.agent_id} onChange={e => setSchedForm(f => ({ ...f, agent_id: e.target.value }))}>
                  <option value="">Select agent…</option>
                  {agents.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Schedule Name *</label>
                <input style={inputStyle} required placeholder="e.g. Daily Briefing" value={schedForm.name} onChange={e => setSchedForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Prompt *</label>
              <textarea
                required rows={3}
                placeholder="The message to send to the agent on each run…"
                value={schedForm.prompt}
                onChange={e => setSchedForm(f => ({ ...f, prompt: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Frequency</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {(["interval", "cron"] as const).map(t => (
                  <button key={t} type="button" onClick={() => setSchedForm(f => ({ ...f, schedule_type: t }))}
                    style={{ padding: "6px 16px", fontSize: 13, borderRadius: 4, border: "1px solid", cursor: "pointer", fontWeight: 600, borderColor: schedForm.schedule_type === t ? "#f6c23e" : "#d1d3e2", background: schedForm.schedule_type === t ? "#fff8e1" : "#fff", color: schedForm.schedule_type === t ? "#856404" : "#6e707e" }}>
                    {t === "interval" ? "Repeat every…" : "Specific time"}
                  </button>
                ))}
              </div>
              {schedForm.schedule_type === "interval" ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#495057" }}>Every</span>
                  <input type="number" min="1" style={{ ...inputStyle, width: 80 }} value={schedForm.interval_value} onChange={e => setSchedForm(f => ({ ...f, interval_value: e.target.value }))} />
                  <select style={{ ...inputStyle, width: 120 }} value={schedForm.interval_unit} onChange={e => setSchedForm(f => ({ ...f, interval_unit: e.target.value as ScheduleFormState["interval_unit"] }))}>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#858796", display: "block", marginBottom: 6 }}>Days (leave empty for every day)</span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {DAYS.map((day, i) => (
                        <button key={i} type="button" onClick={() => toggleCronDay(i)}
                          style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid", cursor: "pointer", fontWeight: 600, borderColor: schedForm.cron_days.includes(i) ? "#4e73df" : "#d1d3e2", background: schedForm.cron_days.includes(i) ? "#e8f0fe" : "#fff", color: schedForm.cron_days.includes(i) ? "#1a3c8f" : "#6e707e" }}>
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#495057" }}>At</span>
                    <input type="number" min="0" max="23" style={{ ...inputStyle, width: 70 }} placeholder="Hour" value={schedForm.cron_hour} onChange={e => setSchedForm(f => ({ ...f, cron_hour: e.target.value }))} />
                    <span style={{ fontSize: 16, color: "#495057" }}>:</span>
                    <input type="number" min="0" max="59" style={{ ...inputStyle, width: 70 }} placeholder="Min" value={schedForm.cron_minute} onChange={e => setSchedForm(f => ({ ...f, cron_minute: e.target.value }))} />
                    <span style={{ fontSize: 12, color: "#858796" }}>UTC</span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Target Users</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {(["all", "specific"] as const).map(t => (
                  <button key={t} type="button" onClick={() => setSchedForm(f => ({ ...f, target_type: t }))}
                    style={{ padding: "6px 16px", fontSize: 13, borderRadius: 4, border: "1px solid", cursor: "pointer", fontWeight: 600, borderColor: schedForm.target_type === t ? "#1cc88a" : "#d1d3e2", background: schedForm.target_type === t ? "#d4edda" : "#fff", color: schedForm.target_type === t ? "#155724" : "#6e707e" }}>
                    {t === "all" ? "All users" : "Specific users"}
                  </button>
                ))}
              </div>
              {schedForm.target_type === "specific" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {users.map(u => (
                    <button key={u.id} type="button" onClick={() => toggleTargetUser(u.id)}
                      style={{ padding: "4px 12px", fontSize: 12, borderRadius: 10, border: "1px solid", cursor: "pointer", borderColor: schedForm.target_user_ids.includes(u.id) ? "#4e73df" : "#d1d3e2", background: schedForm.target_user_ids.includes(u.id) ? "#e8f0fe" : "#fff", color: schedForm.target_user_ids.includes(u.id) ? "#1a3c8f" : "#6e707e" }}>
                      {u.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {schedError && <p style={{ color: "#e74c3c", fontSize: 12, margin: "0 0 10px" }}>{schedError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={savingSched} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", fontSize: 13, borderRadius: 4, border: "none", background: "#f6c23e", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                <Check size={13} /> {savingSched ? "Saving…" : "Save Schedule"}
              </button>
              <button type="button" onClick={cancelScheduleForm} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", fontSize: 13, borderRadius: 4, border: "1px solid #d1d3e2", background: "#fff", color: "#6e707e", cursor: "pointer" }}>
                <X size={13} /> Cancel
              </button>
            </div>
          </form>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e9ecef" }}>
              {["Name", "Agent", "Frequency", "Target", "Last Run", "Next Run", ""].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#858796", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedules.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: i < schedules.length - 1 ? "1px solid #f0f0f5" : "none" }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ fontWeight: 600, color: "#3d4465" }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "#858796", marginTop: 2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.prompt}</div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#f0f0f5", color: "#495057" }}>{s.agent_name}</span>
                </td>
                <td style={{ padding: "12px 16px", color: "#495057" }}>{scheduleLabel(s)}</td>
                <td style={{ padding: "12px 16px", color: "#858796", fontSize: 12 }}>
                  {s.target_type === "all" ? "All users" : `${(s.target_user_ids ?? []).length} user(s)`}
                </td>
                <td style={{ padding: "12px 16px", color: "#858796", fontSize: 12 }}>
                  {s.last_run_at ? new Date(s.last_run_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : <em>Never</em>}
                </td>
                <td style={{ padding: "12px 16px", color: "#495057", fontSize: 12 }}>
                  {s.next_run_at ? new Date(s.next_run_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                    <button onClick={() => handleToggleSchedule(s)} style={{ padding: "3px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: s.is_active ? "#d4edda" : "#f8d7da", color: s.is_active ? "#155724" : "#721c24" }}>
                      {s.is_active ? "On" : "Off"}
                    </button>
                    <button onClick={() => handleTrigger(s)} disabled={triggering === s.id} title="Run now"
                      style={{ padding: "5px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #1cc88a40", background: "#fff", color: "#1cc88a", cursor: "pointer", display: "flex", alignItems: "center" }}>
                      <Play size={12} />
                    </button>
                    <button onClick={() => startEditSchedule(s)} style={{ padding: "5px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d3e2", background: "#fff", color: "#6e707e", cursor: "pointer" }}>
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDeleteSchedule(s.id, s.name)} style={{ padding: "5px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #e74c3c40", background: "#fff", color: "#e74c3c", cursor: "pointer" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "40px 0", textAlign: "center", color: "#858796" }}>No schedules yet — add one above</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
