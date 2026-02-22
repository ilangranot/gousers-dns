from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.api.deps import require_staff, get_db

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


@router.get("/overview")
async def get_overview(
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate totals: orgs, users, messages, blocked across all tenant schemas."""
    result = await db.execute(
        text("SELECT id, schema_name FROM public.organizations ORDER BY created_at")
    )
    orgs = [dict(r._mapping) for r in result]

    total_users = 0
    total_messages = 0
    total_blocked = 0

    for org in orgs:
        schema = org["schema_name"]
        try:
            row = await db.execute(text(f'SELECT COUNT(*) FROM "{schema}".users'))
            total_users += row.scalar() or 0

            row = await db.execute(text(f'SELECT COUNT(*) FROM "{schema}".messages'))
            total_messages += row.scalar() or 0

            row = await db.execute(
                text(f'SELECT COUNT(*) FROM "{schema}".messages WHERE was_blocked = TRUE')
            )
            total_blocked += row.scalar() or 0
        except Exception:
            pass

    return {
        "total_orgs": len(orgs),
        "total_users": total_users,
        "total_messages": total_messages,
        "total_blocked": total_blocked,
    }


@router.get("/orgs")
async def list_orgs(
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """List all orgs with per-org stats (member_count, message_count, last_active)."""
    result = await db.execute(
        text(
            "SELECT id, clerk_org_id, name, schema_name, created_at "
            "FROM public.organizations ORDER BY created_at"
        )
    )
    orgs = [dict(r._mapping) for r in result]

    enriched = []
    for org in orgs:
        schema = org["schema_name"]
        member_count = 0
        message_count = 0
        blocked_count = 0
        last_active = None

        try:
            row = await db.execute(text(f'SELECT COUNT(*) FROM "{schema}".users'))
            member_count = row.scalar() or 0

            row = await db.execute(text(f'SELECT COUNT(*) FROM "{schema}".messages'))
            message_count = row.scalar() or 0

            row = await db.execute(
                text(f'SELECT COUNT(*) FROM "{schema}".messages WHERE was_blocked = TRUE')
            )
            blocked_count = row.scalar() or 0

            row = await db.execute(text(f'SELECT MAX(created_at) FROM "{schema}".messages'))
            last_active = row.scalar()
        except Exception:
            pass

        enriched.append({
            "id": str(org["id"]),
            "clerk_org_id": org["clerk_org_id"],
            "name": org["name"],
            "schema_name": schema,
            "created_at": org["created_at"].isoformat() if org["created_at"] else None,
            "member_count": member_count,
            "message_count": message_count,
            "blocked_count": blocked_count,
            "last_active": last_active.isoformat() if last_active else None,
        })

    return enriched


@router.get("/orgs/{org_id}/members")
async def get_org_members(
    org_id: str,
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Users in a specific org's tenant schema."""
    result = await db.execute(
        text(
            "SELECT schema_name FROM public.organizations "
            "WHERE CAST(id AS TEXT) = :id OR clerk_org_id = :id"
        ),
        {"id": org_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Org not found")

    schema = row[0]
    users_result = await db.execute(
        text(
            f'SELECT id, clerk_user_id, email, role, created_at '
            f'FROM "{schema}".users ORDER BY created_at'
        )
    )
    return [
        {
            "id": str(r.id),
            "clerk_user_id": r.clerk_user_id,
            "email": r.email,
            "role": r.role,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in users_result
    ]


@router.get("/orgs/{org_id}/usage")
async def get_org_usage(
    org_id: str,
    days: int = Query(default=30, ge=1, le=365),
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Messages and blocked count per day for a specific org."""
    result = await db.execute(
        text(
            "SELECT schema_name FROM public.organizations "
            "WHERE CAST(id AS TEXT) = :id OR clerk_org_id = :id"
        ),
        {"id": org_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Org not found")

    schema = row[0]
    usage_result = await db.execute(
        text(f"""
            SELECT DATE(created_at) as day,
                   COUNT(*) as total,
                   SUM(CASE WHEN was_blocked THEN 1 ELSE 0 END) as blocked
            FROM "{schema}".messages
            WHERE created_at > NOW() - INTERVAL '{days} days'
            GROUP BY DATE(created_at)
            ORDER BY day
        """)
    )
    return [
        {"day": str(r.day), "total": r.total, "blocked": int(r.blocked or 0)}
        for r in usage_result
    ]
