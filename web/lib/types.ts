export type GptTarget = "openai" | "anthropic" | "gemini";

export interface Session {
  id: string;
  title: string | null;
  gpt_target: GptTarget;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  was_blocked: boolean;
  block_reason: string | null;
  gpt_target: string | null;
  created_at: string;
}

export interface FilteringRule {
  id: string;
  name: string;
  type: "keyword" | "regex" | "semantic";
  pattern: string | null;
  action: "block" | "allow" | "modify";
  priority: number;
  is_active: boolean;
  created_at: string;
}

export interface GptConnection {
  id: string;
  provider: GptTarget;
  model: string | null;
  is_active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  provider_user_id: string;
  email: string;
  role: "member" | "admin";
  created_at: string;
}

export interface OrgDocument {
  id: string;
  filename: string;
  file_size: number;
  created_at: string;
}

export interface AnalyticsSummary {
  total_messages: number;
  blocked_messages: number;
  active_sessions: number;
  active_users: number;
  messages_by_provider: Record<string, number>;
  messages_by_day: { day: string; total: number; blocked: number }[];
  top_blocked_rules: { reason: string; count: number }[];
}

export interface Invitation {
  id: string;
  token: string;
  email: string;
  role: "member" | "admin";
  status: string;
  invited_at: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  agentic_instructions: string | null;
  provider: string;
  model: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentAssignment {
  id: string;
  user_id: string;
  agent_id: string;
  assigned_at: string;
  user_email: string | null;
  agent_name: string | null;
}

export interface AgentContext {
  id: string;
  name: string;
  system_prompt: string;
  provider: string;
  model: string | null;
}

export interface TeamUserStats {
  id: string;
  email: string;
  role: string;
  usage_level: string;
  message_count: number;
  blocked_count: number;
  session_count: number;
  block_rate_pct: number | null;
}

// ── Super Admin ────────────────────────────────────────────────────────────

export interface SuperAdminOverview {
  total_orgs: number;
  total_users: number;
  total_messages: number;
  total_blocked: number;
}

export interface SuperAdminOrg {
  id: string;
  org_key: string;
  name: string;
  schema_name: string;
  created_at: string | null;
  member_count: number;
  message_count: number;
  blocked_count: number;
  last_active: string | null;
}

export interface SuperAdminMember {
  id: string;
  provider_user_id: string;
  email: string;
  role: string;
  is_disabled: boolean;
  created_at: string | null;
}

export interface SuperAdminUsageDay {
  day: string;
  total: number;
  blocked: number;
}

export interface SuperAdminSessionLog {
  session_id: string;
  title: string | null;
  gpt_target: string;
  start_time: string;
  end_time: string;
  email: string;
  role: string;
  message_count: number;
  blocked_count: number;
}

export interface UserConnection {
  id: string;
  service_type: string;
  label: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface TeamConnection {
  user_id: string;
  email: string;
  connections: { service_type: string; label: string | null; is_active: boolean }[];
}

export interface Note {
  id: string;
  content: string;
  updated_at: string | null;
}

export interface Card {
  id: string;
  parent_id: string | null;
  origin_session_id: string | null;
  chat_session_id: string | null;
  type: string;
  title: string;
  fields: Record<string, string>;
  notes: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserAgent extends Agent {
  is_active: boolean;
}

export interface AgentGoals {
  goals: string[];
  context_note: string;
  style_preference: "brief" | "balanced" | "detailed";
  session_count: number;
  onboarding_completed_at: string | null;
  last_checkin_at: string | null;
}

export interface AgentTaskStep {
  id: string;
  type: "tool_call" | "tool_result" | "human_action" | "final";
  tool?: "web_search" | "human_action" | "store_artifact";
  input?: Record<string, unknown>;
  output?: string;
  tool_call_id?: string;
  status: "running" | "done" | "waiting" | "confirmed";
  created_at: string;
}

export interface AgentTask {
  id: string;
  goal: string;
  status: "pending" | "running" | "waiting_human" | "completed" | "failed" | "cancelled";
  steps: AgentTaskStep[];
  artifacts: Record<string, string>;
  result: string | null;
  error: string | null;
  agent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentSchedule {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_provider: string;
  name: string;
  prompt: string;
  schedule_type: "interval" | "cron";
  interval_value: number | null;
  interval_unit: "minutes" | "hours" | "days" | null;
  cron_day_of_week: string | null;
  cron_hour: number | null;
  cron_minute: number;
  target_type: "all" | "specific";
  target_user_ids: string[];
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}
