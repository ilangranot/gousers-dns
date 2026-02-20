import json
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_org_context
from app.schemas.schemas import ChatRequest, OrgContext
from app.core.database import get_tenant_session, get_db
from app.services.filtering import filtering_service
from app.services.proxy import stream_gpt
from app.services.verticals import build_system_prompt
from app.workers.tasks import process_analytics, generate_suggestions, generate_session_title

router = APIRouter(prefix="/chat", tags=["chat"])


def s(schema: str, table: str) -> str:
    """Return schema-qualified table name."""
    return f'"{schema}".{table}'


@router.get("/sessions")
async def list_sessions(ctx: OrgContext = Depends(get_org_context)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"SELECT * FROM {s(ctx.schema_name, 'sessions')} WHERE user_id = :uid ORDER BY updated_at DESC"),
            {"uid": str(ctx.user_id)},
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.get("/sessions/{session_id}/messages")
async def get_messages(session_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"SELECT id FROM {s(ctx.schema_name, 'sessions')} WHERE id = :sid AND user_id = :uid"),
            {"sid": str(session_id), "uid": str(ctx.user_id)},
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")

        result = await session.execute(
            text(f"SELECT * FROM {s(ctx.schema_name, 'messages')} WHERE session_id = :sid ORDER BY created_at"),
            {"sid": str(session_id)},
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


async def _load_agent_context(ctx: OrgContext, tenant) -> dict | None:
    """Return the active agent assigned to the calling user, or None."""
    result = await tenant.execute(
        text(f"""
            SELECT a.id, a.name, a.system_prompt, a.provider, a.model
            FROM "{ctx.schema_name}".user_agent_assignments uaa
            JOIN "{ctx.schema_name}".agents a ON a.id = uaa.agent_id
            WHERE uaa.user_id = :uid::uuid AND a.is_active = TRUE
        """),
        {"uid": str(ctx.user_id)},
    )
    row = result.fetchone()
    return dict(row._mapping) if row else None


async def _load_org_context(ctx: OrgContext, db: AsyncSession, tenant) -> tuple[str, str]:
    """Returns (vertical, doc_context_str) for use in system prompts."""
    org_row = await db.execute(
        text("SELECT vertical FROM public.organizations WHERE clerk_org_id = :id"),
        {"id": ctx.clerk_org_id},
    )
    row = org_row.fetchone()
    vertical = (row.vertical if row else None) or "general"

    docs_row = await tenant.execute(
        text(f'SELECT filename, content_text FROM "{ctx.schema_name}".org_documents ORDER BY created_at LIMIT 5')
    )
    docs = [dict(r._mapping) for r in docs_row]
    return vertical, docs


@router.get("/agent-context")
async def get_agent_context(ctx: OrgContext = Depends(get_org_context)):
    """Return the active agent assigned to the calling user (or null)."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        agent = await _load_agent_context(ctx, session)
        return agent
    finally:
        await session.close()


@router.post("/")
async def chat(req: ChatRequest, ctx: OrgContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)):
    schema = ctx.schema_name
    session = await get_tenant_session(schema)
    try:
        # Create or get session
        if req.session_id:
            result = await session.execute(
                text(f"SELECT id FROM {s(schema, 'sessions')} WHERE id = :sid AND user_id = :uid"),
                {"sid": str(req.session_id), "uid": str(ctx.user_id)},
            )
            if not result.fetchone():
                raise HTTPException(status_code=404, detail="Session not found")
            session_id = req.session_id
        else:
            result = await session.execute(
                text(f"INSERT INTO {s(schema, 'sessions')} (user_id, gpt_target) VALUES (:uid, :gpt) RETURNING id"),
                {"uid": str(ctx.user_id), "gpt": req.gpt_target},
            )
            session_id = result.fetchone().id
            await session.commit()

        # Run filtering (uses schema-qualified queries)
        filter_result = await filtering_service.evaluate(req.message, session, schema)

        if filter_result.action == "block":
            await session.execute(
                text(f"""
                    INSERT INTO {s(schema, 'messages')} (session_id, role, content, was_blocked, block_reason, gpt_target)
                    VALUES (:sid, 'user', :content, TRUE, :reason, :gpt)
                """),
                {"sid": str(session_id), "content": req.message, "reason": filter_result.reason, "gpt": req.gpt_target},
            )
            await session.commit()
            process_analytics.delay(schema, "message_blocked", str(ctx.user_id), str(session_id), {"reason": filter_result.reason})

            async def blocked_stream():
                yield f"data: {json.dumps({'blocked': True, 'reason': filter_result.reason})}\n\n"

            return StreamingResponse(blocked_stream(), media_type="text/event-stream")

        content_to_send = filter_result.modified_content if filter_result.action == "modify" else req.message

        # Save user message
        await session.execute(
            text(f"INSERT INTO {s(schema, 'messages')} (session_id, role, content, gpt_target) VALUES (:sid, 'user', :content, :gpt)"),
            {"sid": str(session_id), "content": req.message, "gpt": req.gpt_target},
        )

        # Load conversation history
        history = await session.execute(
            text(f"SELECT role, content FROM {s(schema, 'messages')} WHERE session_id = :sid AND was_blocked = FALSE ORDER BY created_at"),
            {"sid": str(session_id)},
        )
        messages = [{"role": r.role, "content": r.content} for r in history]
        messages[-1]["content"] = content_to_send

        # Load vertical + docs for system context
        vertical, docs = await _load_org_context(ctx, db, session)
        system_prompt = build_system_prompt(vertical, docs)

        # Prepend agent system prompt if assigned
        agent = await _load_agent_context(ctx, session)
        if agent:
            system_prompt = agent["system_prompt"] + "\n\n" + system_prompt

        await session.commit()

        async def response_stream():
            full_response = []
            try:
                async for chunk in stream_gpt(req.gpt_target, messages, session, schema, system_prompt=system_prompt):
                    full_response.append(chunk)
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return

            complete = "".join(full_response)
            save_session = await get_tenant_session(schema)
            try:
                await save_session.execute(
                    text(f"INSERT INTO {s(schema, 'messages')} (session_id, role, content, gpt_target) VALUES (:sid, 'assistant', :content, :gpt)"),
                    {"sid": str(session_id), "content": complete, "gpt": req.gpt_target},
                )
                await save_session.execute(
                    text(f"UPDATE {s(schema, 'sessions')} SET updated_at = NOW() WHERE id = :sid"),
                    {"sid": str(session_id)},
                )
                await save_session.commit()
            finally:
                await save_session.close()

            process_analytics.delay(schema, "message_sent", str(ctx.user_id), str(session_id), {"provider": req.gpt_target})
            doc_context = "\n".join(d["content_text"][:500] for d in docs[:2])
            generate_suggestions.delay(schema, str(session_id), str(ctx.user_id), vertical, doc_context)
            generate_session_title.delay(schema, str(session_id))

            yield f"data: {json.dumps({'done': True, 'session_id': str(session_id)})}\n\n"

        return StreamingResponse(response_stream(), media_type="text/event-stream")
    finally:
        await session.close()
