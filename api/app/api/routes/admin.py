from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.api.deps import require_admin
from app.schemas.schemas import (
    OrgContext, FilteringRuleCreate, FilteringRuleUpdate,
    GPTConnectionCreate, UserRoleUpdate, AgentCreate, AgentUpdate, AgentAssignmentCreate,
)
from app.core.database import get_tenant_session
from app.core.security import encrypt_api_key

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Filtering Rules ────────────────────────────────────────────────────────

@router.get("/filtering-rules")
async def list_rules(ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(text("SELECT * FROM filtering_rules ORDER BY priority DESC, created_at"))
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.post("/filtering-rules")
async def create_rule(body: FilteringRuleCreate, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text("""
                INSERT INTO filtering_rules (name, type, pattern, action, priority)
                VALUES (:name, :type, :pattern, :action, :priority)
                RETURNING *
            """),
            body.model_dump(),
        )
        await session.commit()
        return dict(result.fetchone()._mapping)
    finally:
        await session.close()


@router.patch("/filtering-rules/{rule_id}")
async def update_rule(rule_id: UUID, body: FilteringRuleUpdate, ctx: OrgContext = Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["rule_id"] = str(rule_id)

    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"UPDATE filtering_rules SET {set_clause} WHERE id = :rule_id::uuid RETURNING *"),
            updates,
        )
        await session.commit()
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Rule not found")
        return dict(row._mapping)
    finally:
        await session.close()


@router.delete("/filtering-rules/{rule_id}")
async def delete_rule(rule_id: UUID, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text("DELETE FROM filtering_rules WHERE id = :id::uuid"),
            {"id": str(rule_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


# ── GPT Connections ────────────────────────────────────────────────────────

@router.get("/gpt-connections")
async def list_connections(ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(text("SELECT id, provider, model, is_active, created_at FROM gpt_connections"))
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.post("/gpt-connections")
async def upsert_connection(body: GPTConnectionCreate, ctx: OrgContext = Depends(require_admin)):
    encrypted = encrypt_api_key(body.api_key)
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text("""
                INSERT INTO gpt_connections (provider, encrypted_api_key, model)
                VALUES (:provider, :encrypted_api_key, :model)
                ON CONFLICT (provider) DO UPDATE
                SET encrypted_api_key = EXCLUDED.encrypted_api_key,
                    model = COALESCE(EXCLUDED.model, gpt_connections.model)
                RETURNING id, provider, model, is_active, created_at
            """),
            {"provider": body.provider, "encrypted_api_key": encrypted, "model": body.model},
        )
        await session.commit()
        return dict(result.fetchone()._mapping)
    finally:
        await session.close()


@router.delete("/gpt-connections/{provider}")
async def delete_connection(provider: str, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(text("DELETE FROM gpt_connections WHERE provider = :p"), {"p": provider})
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


# ── User Management ────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(text("SELECT id, clerk_user_id, email, role, created_at FROM users ORDER BY created_at"))
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.patch("/users/{user_id}/role")
async def update_user_role(user_id: UUID, body: UserRoleUpdate, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text("UPDATE users SET role = :role WHERE id = :id::uuid RETURNING *"),
            {"role": body.role, "id": str(user_id)},
        )
        await session.commit()
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(row._mapping)
    finally:
        await session.close()


@router.delete("/users/{user_id}")
async def remove_user(user_id: UUID, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text("DELETE FROM users WHERE id = :id::uuid AND clerk_user_id != :self"),
            {"id": str(user_id), "self": ctx.user_clerk_id},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


# ── Agents ─────────────────────────────────────────────────────────────────
# NOTE: assignment routes MUST come before /{agent_id} routes to avoid
# FastAPI treating the literal "assignments" as an agent_id path param.

@router.get("/agents/assignments")
async def list_assignments(ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(text(f"""
            SELECT uaa.id, uaa.user_id, uaa.agent_id, uaa.assigned_at,
                   u.email AS user_email, a.name AS agent_name
            FROM "{ctx.schema_name}".user_agent_assignments uaa
            JOIN "{ctx.schema_name}".users u ON u.id = uaa.user_id
            JOIN "{ctx.schema_name}".agents a ON a.id = uaa.agent_id
            ORDER BY uaa.assigned_at DESC
        """))
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.put("/agents/assignments")
async def upsert_assignment(body: AgentAssignmentCreate, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"""
                INSERT INTO "{ctx.schema_name}".user_agent_assignments (user_id, agent_id)
                VALUES (:user_id::uuid, :agent_id::uuid)
                ON CONFLICT (user_id) DO UPDATE SET agent_id = EXCLUDED.agent_id, assigned_at = NOW()
                RETURNING *
            """),
            {"user_id": str(body.user_id), "agent_id": str(body.agent_id)},
        )
        await session.commit()
        return dict(result.fetchone()._mapping)
    finally:
        await session.close()


@router.delete("/agents/assignments/{user_id}")
async def remove_assignment(user_id: UUID, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text(f'DELETE FROM "{ctx.schema_name}".user_agent_assignments WHERE user_id = :uid::uuid'),
            {"uid": str(user_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


@router.get("/agents")
async def list_agents(ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'SELECT * FROM "{ctx.schema_name}".agents ORDER BY created_at')
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.post("/agents")
async def create_agent(body: AgentCreate, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"""
                INSERT INTO "{ctx.schema_name}".agents
                    (name, description, system_prompt, provider, model)
                VALUES (:name, :description, :system_prompt, :provider, :model)
                RETURNING *
            """),
            body.model_dump(),
        )
        await session.commit()
        return dict(result.fetchone()._mapping)
    finally:
        await session.close()


@router.patch("/agents/{agent_id}")
async def update_agent(agent_id: UUID, body: AgentUpdate, ctx: OrgContext = Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["agent_id"] = str(agent_id)
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'UPDATE "{ctx.schema_name}".agents SET {set_clause}, updated_at = NOW() WHERE id = :agent_id::uuid RETURNING *'),
            updates,
        )
        await session.commit()
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        return dict(row._mapping)
    finally:
        await session.close()


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: UUID, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text(f'DELETE FROM "{ctx.schema_name}".agents WHERE id = :id::uuid'),
            {"id": str(agent_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()
