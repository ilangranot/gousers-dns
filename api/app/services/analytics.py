from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from uuid import UUID


async def record_event(
    session: AsyncSession,
    event_type: str,
    user_id: UUID | None = None,
    session_id: UUID | None = None,
    metadata: dict | None = None,
):
    await session.execute(
        text("""
            INSERT INTO analytics_events (event_type, user_id, session_id, metadata)
            VALUES (:event_type, :user_id, :session_id, :metadata::jsonb)
        """),
        {
            "event_type": event_type,
            "user_id": str(user_id) if user_id else None,
            "session_id": str(session_id) if session_id else None,
            "metadata": str(metadata or {}).replace("'", '"'),
        },
    )
    await session.commit()


async def get_summary(session: AsyncSession, days: int = 30) -> dict:
    total = await session.execute(
        text("SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL ':days days'".replace(":days", str(days)))
    )
    blocked = await session.execute(
        text(f"SELECT COUNT(*) FROM messages WHERE was_blocked = TRUE AND created_at > NOW() - INTERVAL '{days} days'")
    )
    active_sessions = await session.execute(
        text(f"SELECT COUNT(DISTINCT id) FROM sessions WHERE updated_at > NOW() - INTERVAL '{days} days'")
    )
    active_users = await session.execute(
        text(f"SELECT COUNT(DISTINCT user_id) FROM sessions WHERE updated_at > NOW() - INTERVAL '{days} days'")
    )
    by_provider = await session.execute(
        text(f"SELECT gpt_target, COUNT(*) as count FROM messages WHERE created_at > NOW() - INTERVAL '{days} days' GROUP BY gpt_target")
    )
    by_day = await session.execute(
        text(f"""
            SELECT DATE(created_at) as day, COUNT(*) as total,
                   SUM(CASE WHEN was_blocked THEN 1 ELSE 0 END) as blocked
            FROM messages
            WHERE created_at > NOW() - INTERVAL '{days} days'
            GROUP BY DATE(created_at)
            ORDER BY day
        """)
    )
    top_blocked = await session.execute(
        text(f"""
            SELECT block_reason, COUNT(*) as count
            FROM messages
            WHERE was_blocked = TRUE AND block_reason IS NOT NULL
              AND created_at > NOW() - INTERVAL '{days} days'
            GROUP BY block_reason
            ORDER BY count DESC
            LIMIT 10
        """)
    )

    return {
        "total_messages": total.scalar() or 0,
        "blocked_messages": blocked.scalar() or 0,
        "active_sessions": active_sessions.scalar() or 0,
        "active_users": active_users.scalar() or 0,
        "messages_by_provider": {row.gpt_target: row.count for row in by_provider},
        "messages_by_day": [{"day": str(row.day), "total": row.total, "blocked": row.blocked} for row in by_day],
        "top_blocked_rules": [{"reason": row.block_reason, "count": row.count} for row in top_blocked],
    }
