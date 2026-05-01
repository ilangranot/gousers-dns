"""
Agent task routes: create, list, get, stream (SSE), confirm, cancel, delete.
"""

import asyncio
import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from typing import Optional

from fastapi import Request
from app.api.deps import get_org_context, verify_token
from app.schemas.schemas import OrgContext
from app.core.database import get_tenant_session
from app.core.config import settings
from jose import jwt, JWTError
import re

router = APIRouter(prefix="/agent-tasks", tags=["agent-tasks"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class CreateTaskRequest(BaseModel):
    goal: str
    agent_id: Optional[str] = None


class ConfirmTaskRequest(BaseModel):
    note: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _load_task(task_id: str, schema: str, tenant, user_id: str):
    row = (await tenant.execute(
        text(f'SELECT * FROM "{schema}".agent_tasks WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
        {"id": task_id, "uid": str(user_id)},
    )).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return dict(row._mapping)


def _serialize_task(task: dict) -> dict:
    return {
        "id": str(task["id"]),
        "goal": task["goal"],
        "status": task["status"],
        "steps": task.get("steps") or [],
        "artifacts": task.get("artifacts") or {},
        "result": task.get("result"),
        "error": task.get("error"),
        "agent_id": str(task["agent_id"]) if task.get("agent_id") else None,
        "created_at": task["created_at"].isoformat() if hasattr(task["created_at"], "isoformat") else str(task["created_at"]),
        "updated_at": task["updated_at"].isoformat() if hasattr(task["updated_at"], "isoformat") else str(task["updated_at"]),
    }


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/")
async def create_agent_task(
    body: CreateTaskRequest,
    ctx: OrgContext = Depends(get_org_context),
):
    from app.workers.tasks import run_agent_loop
    tenant = await get_tenant_session(ctx.schema_name)
    try:
        # Resolve agent_id: use provided, or fall back to user's active agent
        agent_id = body.agent_id
        if not agent_id:
            row = (await tenant.execute(
                text(f"""
                    SELECT a.agent_id FROM "{ctx.schema_name}".user_agent_assignments a
                    WHERE a.user_id = CAST(:uid AS UUID) AND a.is_active = TRUE
                    LIMIT 1
                """),
                {"uid": str(ctx.user_id)},
            )).fetchone()
            if row:
                agent_id = str(row.agent_id)

        result = await tenant.execute(
            text(f"""
                INSERT INTO "{ctx.schema_name}".agent_tasks (user_id, agent_id, goal, status)
                VALUES (CAST(:uid AS UUID), CAST(:agent_id AS UUID), :goal, 'pending')
                RETURNING *
            """ if agent_id else f"""
                INSERT INTO "{ctx.schema_name}".agent_tasks (user_id, goal, status)
                VALUES (CAST(:uid AS UUID), :goal, 'pending')
                RETURNING *
            """),
            {"uid": str(ctx.user_id), "goal": body.goal, **({"agent_id": agent_id} if agent_id else {})},
        )
        row = result.fetchone()  # fetch BEFORE commit — cursor closes after commit
        await tenant.commit()
        task = dict(row._mapping)
    finally:
        await tenant.close()

    # Fire Celery task
    run_agent_loop.delay(str(task["id"]), ctx.schema_name, ctx.org_key)

    return _serialize_task(task)


@router.get("/")
async def list_agent_tasks(ctx: OrgContext = Depends(get_org_context)):
    tenant = await get_tenant_session(ctx.schema_name)
    try:
        rows = (await tenant.execute(
            text(f"""
                SELECT id, goal, status, agent_id, created_at, updated_at
                FROM "{ctx.schema_name}".agent_tasks
                WHERE user_id = CAST(:uid AS UUID)
                ORDER BY created_at DESC
                LIMIT 100
            """),
            {"uid": str(ctx.user_id)},
        )).fetchall()
    finally:
        await tenant.close()

    return [
        {
            "id": str(r.id),
            "goal": r.goal,
            "status": r.status,
            "agent_id": str(r.agent_id) if r.agent_id else None,
            "created_at": r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
            "updated_at": r.updated_at.isoformat() if hasattr(r.updated_at, "isoformat") else str(r.updated_at),
        }
        for r in rows
    ]


@router.get("/{task_id}")
async def get_agent_task(task_id: str, ctx: OrgContext = Depends(get_org_context)):
    tenant = await get_tenant_session(ctx.schema_name)
    try:
        task = await _load_task(task_id, ctx.schema_name, tenant, ctx.user_id)
    finally:
        await tenant.close()
    return _serialize_task(task)


async def _resolve_sse_context(request: Request, token: Optional[str]) -> Optional[OrgContext]:
    """Resolve OrgContext for SSE using query-param token (EventSource can't set headers)."""
    raw_token = token
    if not raw_token:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            raw_token = auth[7:]
    if not raw_token:
        return None
    try:
        claims = jwt.decode(raw_token, settings.AUTH_SECRET, algorithms=["HS256"])
    except JWTError:
        return None

    provider_user_id = claims.get("sub", "")
    org_key = claims.get("orgKey")
    workspace_key = org_key or f"personal_{provider_user_id}"
    slug = re.sub(r"[^a-z0-9]", "_", workspace_key.lower())
    schema = f"org_{slug}"

    # Look up user_id in the tenant schema
    tenant = await get_tenant_session(schema)
    try:
        row = (await tenant.execute(
            text(f'SELECT id FROM "{schema}".users WHERE provider_user_id = :uid'),
            {"uid": provider_user_id},
        )).fetchone()
    finally:
        await tenant.close()

    if not row:
        return None

    from app.core.database import engine
    from sqlalchemy import text as sa_text
    async with engine.connect() as conn:
        org_row = (await conn.execute(
            sa_text("SELECT * FROM public.organizations WHERE org_key = :key"),
            {"key": workspace_key},
        )).fetchone()

    if not org_row:
        return None

    return OrgContext(
        org_key=workspace_key,
        org_id=org_row.id,
        schema_name=schema,
        provider_user_id=provider_user_id,
        user_id=row.id,
        user_role="member",
    )


@router.get("/{task_id}/stream")
async def stream_agent_task(
    task_id: str,
    request: Request,
    token: Optional[str] = Query(default=None),
):
    """SSE stream of step updates. Polls DB every 0.5s for up to 5 minutes."""
    ctx = await _resolve_sse_context(request, token)
    if not ctx:
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    schema = ctx.schema_name
    user_id = str(ctx.user_id)

    async def generate():
        seen_steps = 0
        for _ in range(600):  # 5 min × 600 × 0.5s
            tenant = await get_tenant_session(schema)
            try:
                row = (await tenant.execute(
                    text(f'SELECT * FROM "{schema}".agent_tasks WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
                    {"id": task_id, "uid": user_id},
                )).fetchone()
            finally:
                await tenant.close()

            if not row:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Task not found'})}\n\n"
                return

            task = dict(row._mapping)
            steps = task.get("steps") or []

            for step in steps[seen_steps:]:
                yield f"data: {json.dumps(step)}\n\n"
            seen_steps = len(steps)

            if task["status"] in ("completed", "failed", "cancelled"):
                payload = {
                    "type": "done",
                    "status": task["status"],
                    "result": task.get("result"),
                    "error": task.get("error"),
                    "artifacts": task.get("artifacts") or {},
                }
                yield f"data: {json.dumps(payload)}\n\n"
                return

            await asyncio.sleep(0.5)

        yield f"data: {json.dumps({'type': 'timeout'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{task_id}/confirm")
async def confirm_agent_task(
    task_id: str,
    body: ConfirmTaskRequest,
    ctx: OrgContext = Depends(get_org_context),
):
    from app.workers.tasks import run_agent_loop

    tenant = await get_tenant_session(ctx.schema_name)
    try:
        task = await _load_task(task_id, ctx.schema_name, tenant, ctx.user_id)

        if task["status"] != "waiting_human":
            raise HTTPException(status_code=400, detail=f"Task is not waiting for human input (status: {task['status']})")

        # Find the last waiting step and confirm it
        steps = list(task.get("steps") or [])
        waiting_step = None
        for s in reversed(steps):
            if s.get("type") == "human_action" and s.get("status") == "waiting":
                waiting_step = s
                break

        if not waiting_step:
            raise HTTPException(status_code=400, detail="No waiting human action step found")

        confirmation_text = body.note or "Human action confirmed."

        # Update the waiting step to confirmed
        updated_steps = []
        for s in steps:
            if s.get("id") == waiting_step["id"]:
                s = dict(s)
                s["status"] = "confirmed"
                s["output"] = confirmation_text
            updated_steps.append(s)

        # Append a tool_result step so LLM sees the confirmation
        tool_result_step = {
            "id": str(uuid4()),
            "type": "tool_result",
            "tool_call_id": waiting_step.get("tool_call_id", ""),
            "output": confirmation_text,
            "status": "done",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        updated_steps.append(tool_result_step)

        await tenant.execute(
            text(f"""
                UPDATE "{ctx.schema_name}".agent_tasks
                SET steps = CAST(:steps AS JSONB), status = 'pending', updated_at = NOW()
                WHERE id = CAST(:task_id AS UUID)
            """),
            {"steps": json.dumps(updated_steps), "task_id": task_id},
        )
        await tenant.commit()
    finally:
        await tenant.close()

    # Resume Celery task
    run_agent_loop.delay(task_id, ctx.schema_name, ctx.org_key)

    return {"ok": True}


@router.post("/{task_id}/cancel")
async def cancel_agent_task(task_id: str, ctx: OrgContext = Depends(get_org_context)):
    tenant = await get_tenant_session(ctx.schema_name)
    try:
        task = await _load_task(task_id, ctx.schema_name, tenant, ctx.user_id)
        if task["status"] in ("completed", "failed", "cancelled"):
            raise HTTPException(status_code=400, detail="Task is already finished")
        await tenant.execute(
            text(f'UPDATE "{ctx.schema_name}".agent_tasks SET status = \'cancelled\', updated_at = NOW() WHERE id = CAST(:id AS UUID)'),
            {"id": task_id},
        )
        await tenant.commit()
    finally:
        await tenant.close()
    return {"ok": True}


@router.delete("/{task_id}")
async def delete_agent_task(task_id: str, ctx: OrgContext = Depends(get_org_context)):
    tenant = await get_tenant_session(ctx.schema_name)
    try:
        task = await _load_task(task_id, ctx.schema_name, tenant, ctx.user_id)
        if task["status"] in ("running", "waiting_human"):
            raise HTTPException(status_code=400, detail="Cannot delete a running task. Cancel it first.")
        await tenant.execute(
            text(f'DELETE FROM "{ctx.schema_name}".agent_tasks WHERE id = CAST(:id AS UUID)'),
            {"id": task_id},
        )
        await tenant.commit()
    finally:
        await tenant.close()
    return {"ok": True}
