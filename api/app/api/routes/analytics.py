from fastapi import APIRouter, Depends, Query
from app.api.deps import require_admin
from app.schemas.schemas import OrgContext
from app.core.database import get_tenant_session
from app.services.analytics import get_summary

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
async def summary(days: int = Query(default=30, ge=1, le=365), ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        return await get_summary(session, days)
    finally:
        await session.close()


@router.get("/conversations")
async def list_conversations(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    ctx: OrgContext = Depends(require_admin),
):
    """Admin view of all conversations in the org."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        from sqlalchemy import text
        result = await session.execute(
            text("""
                SELECT s.id, s.title, s.gpt_target, s.created_at, s.updated_at,
                       u.email as user_email,
                       COUNT(m.id) as message_count,
                       SUM(CASE WHEN m.was_blocked THEN 1 ELSE 0 END) as blocked_count
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                LEFT JOIN messages m ON m.session_id = s.id
                GROUP BY s.id, u.email
                ORDER BY s.updated_at DESC
                LIMIT :limit OFFSET :offset
            """),
            {"limit": limit, "offset": offset},
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.get("/conversations/{session_id}")
async def get_conversation(session_id: str, ctx: OrgContext = Depends(require_admin)):
    """Admin view of full conversation."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        from sqlalchemy import text
        result = await session.execute(
            text("SELECT * FROM messages WHERE session_id = :sid::uuid ORDER BY created_at"),
            {"sid": session_id},
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()
