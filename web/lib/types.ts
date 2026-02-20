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
  clerk_user_id: string;
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
  clerk_invitation_id: string;
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
  message_count: number;
  blocked_count: number;
  session_count: number;
  block_rate_pct: number | null;
}
