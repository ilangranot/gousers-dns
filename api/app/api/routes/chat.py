import json
from typing import Optional
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

CARD_SYSTEM_PROMPT = """

SMART CARDS: You MUST proactively create structured cards for EVERYTHING actionable, recordable, or worth tracking — tasks, to-dos, customers, contacts, events, meetings, reminders, projects, notes. Do NOT ask for permission. If something can be tracked, create a card for it NOW.

Rules:
- Create MULTIPLE cards when appropriate — one per distinct task, contact, or item. Never merge multiple things into one card.
- For any project or complex task: ALWAYS create the parent card PLUS 2-4 subtask cards breaking it into concrete next steps.
- For any list the user gives you (e.g. "create tasks for X, Y, Z"): create a separate card for EACH item.
- Never say "I can create a card for that" — just create it silently.

Append card blocks at the VERY END of your response:
<card>{"type":"task","title":"Title here","fields":{"priority":"high","due":"2025-03-01"}}</card>
<card>{"type":"task","title":"Second task","fields":{"priority":"medium"}}</card>

Available types and their key fields:
- task: priority (low/medium/high), due, assignee, description, status
- customer: name, email, phone, company, notes
- contact: name, email, phone, role, company
- event: date, time, location, attendees, description
- reminder: when, description
- project: description, deadline, team, status
- note: tags, summary

QUICK REPLIES: After every response, append ONE <suggestions> block with exactly 3 short follow-up options:
<suggestions>["First follow-up","Second follow-up","Third follow-up"]</suggestions>
- Each under 8 words, action-oriented, specific to this conversation

RETITLE: If the conversation topic has shifted significantly, append <retitle>New Title Here</retitle> (title case, max 5 words, no punctuation). Only when topic genuinely changes.

Order: <card> blocks (if any) → <suggestions> → <retitle> (if applicable)"""


def s(schema: str, table: str) -> str:
    """Return schema-qualified table name."""
    return f'"{schema}".{table}'


@router.get("/sessions")
async def list_sessions(archived: bool = False, ctx: OrgContext = Depends(get_org_context)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"SELECT * FROM {s(ctx.schema_name, 'sessions')} WHERE user_id = :uid AND is_archived = :archived ORDER BY updated_at DESC"),
            {"uid": str(ctx.user_id), "archived": archived},
        )
        rows = []
        for r in result:
            d = dict(r._mapping)
            for k in ("id", "user_id"):
                if d.get(k):
                    d[k] = str(d[k])
            for k in ("created_at", "updated_at"):
                if d.get(k):
                    d[k] = d[k].isoformat()
            rows.append(d)
        return rows
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


async def _load_agent_context(ctx: OrgContext, tenant) -> Optional[dict]:
    """Return the active agent assigned to the calling user, or None."""
    result = await tenant.execute(
        text(f"""
            SELECT a.id, a.name, a.system_prompt, a.provider, a.model
            FROM "{ctx.schema_name}".user_agent_assignments uaa
            JOIN "{ctx.schema_name}".agents a ON a.id = uaa.agent_id
            WHERE uaa.user_id = CAST(:uid AS UUID) AND a.is_active = TRUE
        """),
        {"uid": str(ctx.user_id)},
    )
    row = result.fetchone()
    return dict(row._mapping) if row else None


async def _load_org_context(ctx: OrgContext, db: AsyncSession, tenant) -> tuple[str, str]:
    """Returns (vertical, doc_context_str) for use in system prompts."""
    org_row = await db.execute(
        text("SELECT vertical FROM public.organizations WHERE org_key = :id"),
        {"id": ctx.org_key},
    )
    row = org_row.fetchone()
    vertical = (row.vertical if row else None) or "general"

    docs_row = await tenant.execute(
        text(f'SELECT filename, content_text FROM "{ctx.schema_name}".org_documents ORDER BY created_at LIMIT 5')
    )
    docs = [dict(r._mapping) for r in docs_row]
    return vertical, docs


@router.get("/agent-starters")
async def get_agent_starters(ctx: OrgContext = Depends(get_org_context)):
    """Generate 4 conversation-starter suggestions for the user's assigned agent."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        agent = await _load_agent_context(ctx, session)
        if not agent:
            return []
        prompt = (
            f"You are this AI assistant:\n{agent['system_prompt'][:600]}\n\n"
            "Generate exactly 4 short conversation starters (under 8 words each) that a new user "
            "would realistically send to begin working with you. "
            'Return ONLY a JSON array, e.g. ["Starter 1","Starter 2","Starter 3","Starter 4"]'
        )
        from app.services.proxy import call_gpt
        raw = await call_gpt(agent["provider"], [{"role": "user", "content": prompt}], session, ctx.schema_name, system_prompt="")
        starters = json.loads(raw.strip())
        if isinstance(starters, list):
            return [str(s) for s in starters[:4]]
        return []
    except Exception:
        return [
            "What can you help me with?",
            "Walk me through what you do",
            "Let's get started",
            "Show me an example",
        ]
    finally:
        await session.close()


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

        # Incognito mode: bypass filtering, skip saving to DB, go direct to provider
        if req.incognito:
            # Use current session history but don't save new messages
            history = await session.execute(
                text(f"SELECT role, content FROM {s(schema, 'messages')} WHERE session_id = :sid AND was_blocked = FALSE ORDER BY created_at"),
                {"sid": str(session_id)},
            )
            inc_messages = [{"role": r.role, "content": r.content} for r in history]
            inc_messages.append({"role": "user", "content": req.message})

            async def incognito_stream():
                try:
                    async for chunk in stream_gpt(req.gpt_target, inc_messages, session, schema, system_prompt=""):
                        yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                    return
                yield f"data: {json.dumps({'done': True, 'session_id': str(session_id)})}\n\n"

            return StreamingResponse(incognito_stream(), media_type="text/event-stream")

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

        # If discussing a card, inject card context + update instructions
        if req.card_id:
            card_row = await session.execute(
                text(f'SELECT * FROM "{schema}".cards WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
                {"id": req.card_id, "uid": str(ctx.user_id)},
            )
            card_data = card_row.fetchone()
            if card_data:
                cd = dict(card_data._mapping)
                card_ctx = (
                    f'You are helping manage a {cd["type"]} card titled "{cd["title"]}".\n'
                    f'Current fields: {json.dumps(cd.get("fields") or {})}\n'
                    f'Notes: {cd.get("notes") or "(none)"}\n\n'
                    'When the user asks you to update fields, title, or notes, emit at the END of your response:\n'
                    '<card-update>{"title":"new title","fields":{"key":"value"},"notes":"updated notes"}</card-update>\n'
                    'Only include keys you are actually changing. '
                    'When creating a subtask, emit a normal <card> block — it will be linked as a subtask of this card.\n\n'
                )
                system_prompt = card_ctx + system_prompt

        # Always append smart-card instructions
        system_prompt += CARD_SYSTEM_PROMPT

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


@router.patch("/sessions/{session_id}")
async def rename_session(session_id: UUID, body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Rename a chat session title."""
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"UPDATE {s(ctx.schema_name, 'sessions')} SET title = :title WHERE id = CAST(:sid AS UUID) AND user_id = CAST(:uid AS UUID) RETURNING id"),
            {"title": title, "sid": str(session_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        return {"ok": True, "title": title}
    finally:
        await session.close()


@router.patch("/sessions/{session_id}/archive")
async def archive_session(session_id: UUID, body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Archive or unarchive a session."""
    archived = bool(body.get("archived", True))
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"UPDATE {s(ctx.schema_name, 'sessions')} SET is_archived = :archived WHERE id = CAST(:sid AS UUID) AND user_id = CAST(:uid AS UUID) RETURNING id"),
            {"archived": archived, "sid": str(session_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        return {"ok": True}
    finally:
        await session.close()


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    """Permanently delete a session and all its messages."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"DELETE FROM {s(ctx.schema_name, 'sessions')} WHERE id = CAST(:sid AS UUID) AND user_id = CAST(:uid AS UUID) RETURNING id"),
            {"sid": str(session_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        return {"ok": True}
    finally:
        await session.close()


# ── Notes ──────────────────────────────────────────────────────────────────

@router.get("/notes")
async def get_notes(ctx: OrgContext = Depends(get_org_context)):
    """Get the user's notes (single note record, create if not exists)."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'SELECT id, content, updated_at FROM "{ctx.schema_name}".notes WHERE user_id = CAST(:uid AS UUID) ORDER BY created_at LIMIT 1'),
            {"uid": str(ctx.user_id)},
        )
        row = result.fetchone()
        if row:
            return {"id": str(row.id), "content": row.content, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
        # Auto-create empty note
        result = await session.execute(
            text(f"INSERT INTO \"{ctx.schema_name}\".notes (user_id, content) VALUES (CAST(:uid AS UUID), '') RETURNING id, content, updated_at"),
            {"uid": str(ctx.user_id)},
        )
        await session.commit()
        row = result.fetchone()
        return {"id": str(row.id), "content": row.content, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
    finally:
        await session.close()


@router.patch("/notes/{note_id}")
async def update_note(note_id: UUID, body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Update note content."""
    content = body.get("content", "")
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'UPDATE "{ctx.schema_name}".notes SET content = :content, updated_at = NOW() WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID) RETURNING id, content, updated_at'),
            {"content": content, "id": str(note_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Note not found")
        return {"id": str(row.id), "content": row.content, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
    finally:
        await session.close()


# ── Cards ───────────────────────────────────────────────────────────────────

def _card_row_to_dict(r) -> dict:
    d = dict(r._mapping)
    for k in ("id", "user_id", "parent_id", "origin_session_id", "chat_session_id"):
        if d.get(k):
            d[k] = str(d[k])
    for k in ("created_at", "updated_at"):
        if d.get(k):
            d[k] = d[k].isoformat()
    return d


@router.get("/cards")
async def list_cards(ctx: OrgContext = Depends(get_org_context)):
    """List all non-deleted cards for the user (includes subtask structure)."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'SELECT * FROM "{ctx.schema_name}".cards WHERE user_id = CAST(:uid AS UUID) AND is_deleted = FALSE ORDER BY created_at DESC'),
            {"uid": str(ctx.user_id)},
        )
        cards = [_card_row_to_dict(r) for r in result]
        return cards
    finally:
        await session.close()


@router.post("/cards")
async def create_card(body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Create a card (from AI or manually)."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"""
                INSERT INTO "{ctx.schema_name}".cards (user_id, parent_id, origin_session_id, type, title, fields, notes)
                VALUES (CAST(:uid AS UUID), CAST(:parent_id AS UUID), CAST(:origin_session_id AS UUID), :type, :title, CAST(:fields AS jsonb), :notes)
                RETURNING *
            """),
            {
                "uid": str(ctx.user_id),
                "parent_id": body.get("parent_id"),
                "origin_session_id": body.get("origin_session_id"),
                "type": body.get("type", "task"),
                "title": body.get("title", "Untitled"),
                "fields": json.dumps(body.get("fields") or {}),
                "notes": body.get("notes", ""),
            },
        )
        await session.commit()
        return _card_row_to_dict(result.fetchone())
    finally:
        await session.close()


@router.patch("/cards/{card_id}")
async def update_card(card_id: UUID, body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Update card title, fields, or notes."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        # Build SET clauses dynamically
        sets, params = ["updated_at = NOW()"], {"id": str(card_id), "uid": str(ctx.user_id)}
        if "title" in body:
            sets.append("title = :title")
            params["title"] = body["title"]
        if "fields" in body:
            sets.append("fields = CAST(:fields AS jsonb)")
            params["fields"] = json.dumps(body["fields"])
        if "notes" in body:
            sets.append("notes = :notes")
            params["notes"] = body["notes"]
        if "chat_session_id" in body:
            sets.append("chat_session_id = CAST(:chat_session_id AS UUID)")
            params["chat_session_id"] = body["chat_session_id"]

        result = await session.execute(
            text(f'UPDATE "{ctx.schema_name}".cards SET {", ".join(sets)} WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID) RETURNING *'),
            params,
        )
        await session.commit()
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        return _card_row_to_dict(row)
    finally:
        await session.close()


@router.delete("/cards/{card_id}")
async def delete_card(card_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    """Soft-delete a card."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text(f'UPDATE "{ctx.schema_name}".cards SET is_deleted = TRUE, updated_at = NOW() WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
            {"id": str(card_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


@router.post("/cards/{card_id}/restore")
async def restore_card(card_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    """Restore a soft-deleted card."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text(f'UPDATE "{ctx.schema_name}".cards SET is_deleted = FALSE, updated_at = NOW() WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
            {"id": str(card_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


@router.get("/cards/{card_id}/session")
async def get_card_session(card_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    """Get or create the discussion session for a card."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        # Check if card already has a chat_session_id
        result = await session.execute(
            text(f'SELECT chat_session_id, title FROM "{ctx.schema_name}".cards WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
            {"id": str(card_id), "uid": str(ctx.user_id)},
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")

        if row.chat_session_id:
            return {"session_id": str(row.chat_session_id)}

        # Create a new session for this card
        sess_result = await session.execute(
            text(f'INSERT INTO "{ctx.schema_name}".sessions (user_id, gpt_target, title) VALUES (CAST(:uid AS UUID), \'openai\', :title) RETURNING id'),
            {"uid": str(ctx.user_id), "title": f"Card: {row.title}"},
        )
        new_session_id = str(sess_result.fetchone().id)

        # Link it back to the card
        await session.execute(
            text(f'UPDATE "{ctx.schema_name}".cards SET chat_session_id = CAST(:sid AS UUID) WHERE id = CAST(:id AS UUID)'),
            {"sid": new_session_id, "id": str(card_id)},
        )
        await session.commit()
        return {"session_id": new_session_id}
    finally:
        await session.close()
