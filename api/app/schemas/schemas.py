from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime
from uuid import UUID


# ── Auth / Org ─────────────────────────────────────────────────────────────

class OrgContext(BaseModel):
    clerk_org_id: str
    org_id: UUID
    schema_name: str
    user_clerk_id: str
    user_id: UUID
    user_role: str


# ── Chat ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: Optional[UUID] = None
    message: str
    gpt_target: Literal["openai", "anthropic", "gemini"] = "openai"


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
    clerk_user_id: str
    email: str
    role: str
    created_at: datetime


class UserRoleUpdate(BaseModel):
    role: Literal["member", "admin"]
