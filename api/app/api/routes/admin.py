import re
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_admin, get_org_context, get_db
from app.schemas.schemas import (
    OrgContext, FilteringRuleCreate, FilteringRuleUpdate,
    GPTConnectionCreate, UserRoleUpdate, AgentCreate, AgentUpdate, AgentAssignmentCreate,
)
from app.core.database import get_tenant_session, provision_org_schema
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
            text(f"UPDATE filtering_rules SET {set_clause} WHERE id = CAST(:rule_id AS UUID) RETURNING *"),
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
            text("DELETE FROM filtering_rules WHERE id = CAST(:id AS UUID)"),
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
        result = await session.execute(text("SELECT id, provider_user_id, email, role, created_at FROM users ORDER BY created_at"))
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.patch("/users/{user_id}/role")
async def update_user_role(user_id: UUID, body: UserRoleUpdate, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text("UPDATE users SET role = :role WHERE id = CAST(:id AS UUID) RETURNING *"),
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
            text("DELETE FROM users WHERE id = CAST(:id AS UUID) AND provider_user_id != :self"),
            {"id": str(user_id), "self": ctx.provider_user_id},
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
                VALUES (CAST(:user_id AS UUID), CAST(:agent_id AS UUID))
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
            text(f'DELETE FROM "{ctx.schema_name}".user_agent_assignments WHERE user_id = CAST(:uid AS UUID)'),
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
            text(f'UPDATE "{ctx.schema_name}".agents SET {set_clause}, updated_at = NOW() WHERE id = CAST(:agent_id AS UUID) RETURNING *'),
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
            text(f'DELETE FROM "{ctx.schema_name}".agents WHERE id = CAST(:id AS UUID)'),
            {"id": str(agent_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


# ── Create Organization ────────────────────────────────────────────────────

def _schema_for_key(org_key: str) -> str:
    slug = re.sub(r"[^a-z0-9]", "_", org_key.lower())
    return f"org_{slug}"


@router.post("/create-organization")
async def create_organization(
    body: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Convert personal workspace to a named org. Creates new org and migrates the current user."""
    org_name = (body.get("org_name") or "").strip()
    if not org_name:
        raise HTTPException(status_code=400, detail="org_name is required")

    # Derive a unique org_key from the name + user id suffix
    slug = re.sub(r"[^a-z0-9]", "_", org_name.lower())
    org_key = f"org_{slug}_{ctx.provider_user_id[:8]}"
    schema = _schema_for_key(org_key)

    # Check it doesn't already exist
    existing = await db.execute(
        text("SELECT id FROM public.organizations WHERE org_key = :key"),
        {"key": org_key},
    )
    if existing.fetchone():
        raise HTTPException(status_code=409, detail="Organization key already exists")

    # Provision schema + org row
    await provision_org_schema(schema)
    result = await db.execute(
        text("""
            INSERT INTO public.organizations (org_key, name, schema_name)
            VALUES (:key, :name, :schema)
            RETURNING id, org_key, name, schema_name
        """),
        {"key": org_key, "name": org_name, "schema": schema},
    )
    await db.commit()
    result.fetchone()  # consume result

    # Migrate user from personal schema to new org schema
    personal_schema = ctx.schema_name
    personal_session = await get_tenant_session(personal_schema)
    try:
        user_row = await personal_session.execute(
            text(f'SELECT provider_user_id, email, role FROM "{personal_schema}".users WHERE id = CAST(:uid AS UUID)'),
            {"uid": str(ctx.user_id)},
        )
        user = user_row.fetchone()
    finally:
        await personal_session.close()

    if user:
        new_session = await get_tenant_session(schema)
        try:
            await new_session.execute(
                text(f"""
                    INSERT INTO "{schema}".users (provider_user_id, email, role)
                    VALUES (:pid, :email, 'admin')
                    ON CONFLICT (provider_user_id) DO NOTHING
                """),
                {"pid": user.provider_user_id, "email": user.email},
            )
            await new_session.commit()
        finally:
            await new_session.close()

    return {"org_key": org_key, "name": org_name, "schema_name": schema}


# ── User Connections (personal — per-user knowledge base links) ────────────

@router.get("/user-connections")
async def list_user_connections(ctx: OrgContext = Depends(get_org_context)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'SELECT id, service_type, label, config, is_active, created_at FROM "{ctx.schema_name}".user_connections WHERE user_id = CAST(:uid AS UUID) ORDER BY created_at'),
            {"uid": str(ctx.user_id)},
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.post("/user-connections")
async def add_user_connection(body: dict, ctx: OrgContext = Depends(get_org_context)):
    service_type = body.get("service_type", "")
    label = body.get("label") or service_type
    config = body.get("config") or {}
    if not service_type:
        raise HTTPException(status_code=400, detail="service_type is required")

    session = await get_tenant_session(ctx.schema_name)
    try:
        import json as _json
        result = await session.execute(
            text(f"""
                INSERT INTO "{ctx.schema_name}".user_connections (user_id, service_type, label, config)
                VALUES (CAST(:uid AS UUID), :service_type, :label, CAST(:config AS JSONB))
                RETURNING id, service_type, label, config, is_active, created_at
            """),
            {"uid": str(ctx.user_id), "service_type": service_type, "label": label, "config": _json.dumps(config)},
        )
        await session.commit()
        return dict(result.fetchone()._mapping)
    finally:
        await session.close()


@router.delete("/user-connections/{connection_id}")
async def delete_user_connection(connection_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text(f'DELETE FROM "{ctx.schema_name}".user_connections WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
            {"id": str(connection_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


# ── Agent Schedules ────────────────────────────────────────────────────────

def _compute_next_run(schedule: dict):
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    stype = schedule.get("schedule_type", "interval")

    if stype == "interval":
        val = int(schedule.get("interval_value") or 1)
        unit = schedule.get("interval_unit") or "hours"
        if unit == "minutes":
            return now + timedelta(minutes=val)
        elif unit == "hours":
            return now + timedelta(hours=val)
        else:  # days
            return now + timedelta(days=val)

    # cron-style: find next occurrence of day_of_week + hour:minute
    hour = int(schedule.get("cron_hour") or 9)
    minute = int(schedule.get("cron_minute") or 0)
    dow_str = schedule.get("cron_day_of_week") or "*"  # "*" = every day, else "0,1,2..." (0=Mon)

    # Compute next occurrence
    candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)

    if dow_str != "*":
        allowed = {int(d) for d in dow_str.split(",")}  # 0=Mon..6=Sun
        for _ in range(7):
            if candidate.weekday() in allowed:
                break
            candidate += timedelta(days=1)

    return candidate


@router.get("/agent-schedules")
async def list_agent_schedules(ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(text(f"""
            SELECT s.*, a.name as agent_name, a.provider as agent_provider
            FROM "{ctx.schema_name}".agent_schedules s
            JOIN "{ctx.schema_name}".agents a ON a.id = s.agent_id
            ORDER BY s.created_at DESC
        """))
        rows = []
        for r in result:
            d = dict(r._mapping)
            # Serialize datetimes and UUIDs
            for k in ("id", "agent_id"):
                if d.get(k):
                    d[k] = str(d[k])
            for k in ("last_run_at", "next_run_at", "created_at"):
                if d.get(k):
                    d[k] = d[k].isoformat()
            rows.append(d)
        return rows
    finally:
        await session.close()


@router.post("/agent-schedules")
async def create_agent_schedule(body: dict, ctx: OrgContext = Depends(require_admin)):
    import json as _json
    agent_id = body.get("agent_id", "")
    name = (body.get("name") or "").strip()
    prompt = (body.get("prompt") or "").strip()
    if not agent_id or not name or not prompt:
        raise HTTPException(status_code=400, detail="agent_id, name, and prompt are required")

    next_run = _compute_next_run(body)

    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"""
                INSERT INTO "{ctx.schema_name}".agent_schedules
                    (agent_id, name, prompt, schedule_type, interval_value, interval_unit,
                     cron_day_of_week, cron_hour, cron_minute,
                     target_type, target_user_ids, next_run_at)
                VALUES
                    (CAST(:agent_id AS UUID), :name, :prompt, :schedule_type,
                     :interval_value, :interval_unit,
                     :cron_day_of_week, :cron_hour, :cron_minute,
                     :target_type, CAST(:target_user_ids AS JSONB), :next_run_at)
                RETURNING id
            """),
            {
                "agent_id": agent_id,
                "name": name,
                "prompt": prompt,
                "schedule_type": body.get("schedule_type", "interval"),
                "interval_value": body.get("interval_value"),
                "interval_unit": body.get("interval_unit", "hours"),
                "cron_day_of_week": body.get("cron_day_of_week"),
                "cron_hour": body.get("cron_hour"),
                "cron_minute": body.get("cron_minute", 0),
                "target_type": body.get("target_type", "all"),
                "target_user_ids": _json.dumps(body.get("target_user_ids") or []),
                "next_run_at": next_run,
            },
        )
        await session.commit()
        return {"id": str(result.fetchone().id), "ok": True}
    finally:
        await session.close()


@router.patch("/agent-schedules/{schedule_id}")
async def update_agent_schedule(schedule_id: UUID, body: dict, ctx: OrgContext = Depends(require_admin)):
    import json as _json
    session = await get_tenant_session(ctx.schema_name)
    try:
        # Load current row so we can recompute next_run if needed
        row = (await session.execute(
            text(f'SELECT * FROM "{ctx.schema_name}".agent_schedules WHERE id = CAST(:id AS UUID)'),
            {"id": str(schedule_id)},
        )).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Schedule not found")

        merged = dict(row._mapping)
        merged.update({k: v for k, v in body.items() if v is not None})

        # If toggling active only (no schedule fields changing) keep next_run, otherwise recompute
        schedule_fields = {"schedule_type", "interval_value", "interval_unit", "cron_day_of_week", "cron_hour", "cron_minute"}
        if schedule_fields & set(body.keys()):
            next_run = _compute_next_run(merged)
        else:
            next_run = row.next_run_at

        await session.execute(
            text(f"""
                UPDATE "{ctx.schema_name}".agent_schedules SET
                    name = :name, prompt = :prompt,
                    schedule_type = :schedule_type,
                    interval_value = :interval_value, interval_unit = :interval_unit,
                    cron_day_of_week = :cron_day_of_week, cron_hour = :cron_hour, cron_minute = :cron_minute,
                    target_type = :target_type, target_user_ids = CAST(:target_user_ids AS JSONB),
                    is_active = :is_active, next_run_at = :next_run_at
                WHERE id = CAST(:id AS UUID)
            """),
            {
                "name": merged.get("name"),
                "prompt": merged.get("prompt"),
                "schedule_type": merged.get("schedule_type", "interval"),
                "interval_value": merged.get("interval_value"),
                "interval_unit": merged.get("interval_unit", "hours"),
                "cron_day_of_week": merged.get("cron_day_of_week"),
                "cron_hour": merged.get("cron_hour"),
                "cron_minute": merged.get("cron_minute", 0),
                "target_type": merged.get("target_type", "all"),
                "target_user_ids": _json.dumps(merged.get("target_user_ids") or []),
                "is_active": bool(merged.get("is_active", True)),
                "next_run_at": next_run,
                "id": str(schedule_id),
            },
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


@router.delete("/agent-schedules/{schedule_id}")
async def delete_agent_schedule(schedule_id: UUID, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text(f'DELETE FROM "{ctx.schema_name}".agent_schedules WHERE id = CAST(:id AS UUID)'),
            {"id": str(schedule_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


@router.post("/agent-schedules/{schedule_id}/trigger")
async def trigger_agent_schedule(schedule_id: UUID, ctx: OrgContext = Depends(require_admin)):
    """Manually trigger a schedule immediately."""
    from app.workers.tasks import run_agent_schedule
    run_agent_schedule.delay(ctx.schema_name, str(schedule_id))
    return {"ok": True, "queued": True}


@router.get("/team-connections")
async def list_team_connections(ctx: OrgContext = Depends(require_admin)):
    """For org admins: see which users have which connections (not the data)."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"""
                SELECT u.id as user_id, u.email, uc.service_type, uc.label, uc.is_active, uc.created_at
                FROM "{ctx.schema_name}".users u
                LEFT JOIN "{ctx.schema_name}".user_connections uc ON uc.user_id = u.id
                ORDER BY u.email, uc.service_type
            """)
        )
        rows = [dict(r._mapping) for r in result]
        # Group by user
        users: dict = {}
        for r in rows:
            uid = str(r["user_id"])
            if uid not in users:
                users[uid] = {"user_id": uid, "email": r["email"], "connections": []}
            if r["service_type"]:
                users[uid]["connections"].append({
                    "service_type": r["service_type"],
                    "label": r["label"],
                    "is_active": r["is_active"],
                })
        return list(users.values())
    finally:
        await session.close()
