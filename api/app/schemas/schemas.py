from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime
from uuid import UUID


# ── Auth / Org ─────────────────────────────────────────────────────────────

class OrgContext(BaseModel):
    org_key: str
    org_id: UUID
    schema_name: str
    provider_user_id: str
    user_id: UUID
    user_role: str


# ── Chat ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: Optional[UUID] = None
    message: str
    gpt_target: Literal["openai", "anthropic", "gemini"] = "openai"
    incognito: bool = False
    card_id: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: UUID
    message_id: UUID
    blocked: bool = False
    block_reason: Optional[str] = None


# ── Sessions ───────────────────────────────────────────────────────────────

class SessionOut(BaseModel):
    id: UUID
    title: Optional[str]
    gpt_target: str
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    id: UUID
    role: str
    content: str
    was_blocked: bool
    block_reason: Optional[str]
    created_at: datetime


# ── Filtering Rules ────────────────────────────────────────────────────────

class FilteringRuleCreate(BaseModel):
    name: str
    type: Literal["keyword", "regex", "pii", "semantic"]
    pattern: Optional[str] = None
    action: Literal["block", "allow", "modify"] = "block"
    priority: int = 0


class FilteringRuleOut(FilteringRuleCreate):
    id: UUID
    is_active: bool
    created_at: datetime


class FilteringRuleUpdate(BaseModel):
    name: Optional[str] = None
    pattern: Optional[str] = None
    action: Optional[Literal["block", "allow", "modify"]] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


# ── GPT Connections ────────────────────────────────────────────────────────

class GPTConnectionCreate(BaseModel):
    provider: Literal["openai", "anthropic", "gemini"]
    api_key: str
    model: Optional[str] = None


class GPTConnectionOut(BaseModel):
    id: UUID
    provider: str
    model: Optional[str]
    is_active: bool
    created_at: datetime


class GPTConnectionUpdate(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    is_active: Optional[bool] = None


# ── Analytics ──────────────────────────────────────────────────────────────

class AnalyticsSummary(BaseModel):
    total_messages: int
    blocked_messages: int
    active_sessions: int
    active_users: int
    messages_by_provider: dict[str, int]
    messages_by_day: list[dict]
    top_blocked_rules: list[dict]


# ── Users (admin) ──────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: UUID
    provider_user_id: str
    email: str
    role: str
    created_at: datetime


class UserRoleUpdate(BaseModel):
    role: Literal["member", "admin"]


# ── Invitations ─────────────────────────────────────────────────────────────

class InvitationCreate(BaseModel):
    email: str
    role: Literal["member", "admin"] = "member"


class InvitationOut(BaseModel):
    id: UUID
    token: str
    email: str
    role: str
    status: str
    invited_at: datetime


# ── Agents ──────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: str
    agentic_instructions: Optional[str] = None
    provider: str = "openai"
    model: Optional[str] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    agentic_instructions: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    is_active: Optional[bool] = None


class AgentOut(AgentCreate):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AgentAssignmentCreate(BaseModel):
    user_id: UUID
    agent_id: UUID


class AgentAssignmentOut(BaseModel):
    id: UUID
    user_id: UUID
    agent_id: UUID
    assigned_at: datetime
    user_email: Optional[str] = None
    agent_name: Optional[str] = None


class AgentContext(BaseModel):
    agent_id: UUID
    name: str
    system_prompt: str
    provider: str
    model: Optional[str] = None


# ── Team Analytics ───────────────────────────────────────────────────────────

class TeamUserStats(BaseModel):
    id: UUID
    email: str
    role: str
    message_count: int
    blocked_count: int
    session_count: int
    block_rate_pct: Optional[float] = None


# ── WhatsApp ─────────────────────────────────────────────────────────────────

class WhatsAppAccountCreate(BaseModel):
    phone_number_id: str
    display_phone_number: Optional[str] = None
    access_token: str   # plaintext — encrypted on save
    verify_token: str


class WhatsAppAccountOut(BaseModel):
    id: UUID
    phone_number_id: str
    display_phone_number: Optional[str]
    verify_token: str
    is_active: bool
    created_at: datetime


class WhatsAppConversationOut(BaseModel):
    id: UUID
    account_id: UUID
    wa_contact_id: str
    contact_name: Optional[str]
    contact_phone: Optional[str]
    agent_id: Optional[UUID]
    status: str
    last_message_at: datetime
    created_at: datetime


class WhatsAppMessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    direction: str           # inbound | outbound
    content: str
    wa_message_id: Optional[str]
    status: str              # received | sent | failed | read
    was_filtered: bool
    filter_reason: Optional[str]
    ai_intervened: bool
    created_at: datetime


class WhatsAppRuleCreate(BaseModel):
    name: str
    trigger_type: Literal["keyword", "regex", "always", "sentiment"] = "keyword"
    pattern: Optional[str] = None
    action: Literal["reply", "flag", "block"] = "reply"
    agent_id: Optional[UUID] = None
    response_template: Optional[str] = None
    priority: int = 0


class WhatsAppRuleUpdate(BaseModel):
    name: Optional[str] = None
    trigger_type: Optional[Literal["keyword", "regex", "always", "sentiment"]] = None
    pattern: Optional[str] = None
    action: Optional[Literal["reply", "flag", "block"]] = None
    agent_id: Optional[UUID] = None
    response_template: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


class WhatsAppRuleOut(BaseModel):
    id: UUID
    name: str
    trigger_type: str
    pattern: Optional[str]
    action: str
    agent_id: Optional[UUID]
    response_template: Optional[str]
    is_active: bool
    priority: int
    created_at: datetime


class WhatsAppSendRequest(BaseModel):
    message: str
