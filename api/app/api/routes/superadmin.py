from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.api.deps import require_staff, get_db
from app.core.database import get_tenant_session
from app.core.security import encrypt_api_key
from app.services.email import send_reset_email
from app.core.config import settings
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


@router.get("/check")
async def check_staff(_: dict = Depends(require_staff)):
    """Returns 200 if the caller is a staff member, 403 otherwise."""
    return {"ok": True}


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
            "SELECT id, org_key, name, schema_name, created_at "
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
            "org_key": org["org_key"],
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
            "WHERE CAST(id AS TEXT) = :id OR org_key = :id"
        ),
        {"id": org_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Org not found")

    schema = row[0]
    users_result = await db.execute(
        text(
            f'SELECT id, provider_user_id, email, role, is_disabled, created_at '
            f'FROM "{schema}".users ORDER BY created_at'
        )
    )
    return [
        {
            "id": str(r.id),
            "provider_user_id": r.provider_user_id,
            "email": r.email,
            "role": r.role,
            "is_disabled": bool(r.is_disabled),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in users_result
    ]


@router.post("/orgs/{org_id}/connections")
async def seed_org_connection(
    org_id: str,
    body: dict,
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Staff endpoint to add or replace a GPT API key for any org."""
    result = await db.execute(
        text(
            "SELECT schema_name FROM public.organizations "
            "WHERE CAST(id AS TEXT) = :id OR org_key = :id"
        ),
        {"id": org_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Org not found")

    provider = body.get("provider", "openai")
    api_key = body.get("api_key", "")
    model = body.get("model") or None
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    schema = row[0]
    encrypted = encrypt_api_key(api_key)

    tenant = await get_tenant_session(schema)
    try:
        result = await tenant.execute(
            text(f"""
                INSERT INTO "{schema}".gpt_connections (provider, encrypted_api_key, model, is_active)
                VALUES (:provider, :encrypted_api_key, :model, TRUE)
                ON CONFLICT (provider) DO UPDATE
                  SET encrypted_api_key = EXCLUDED.encrypted_api_key,
                      model = EXCLUDED.model,
                      is_active = TRUE
                RETURNING id, provider, model, is_active
            """),
            {"provider": provider, "encrypted_api_key": encrypted, "model": model},
        )
        await tenant.commit()
        return dict(result.fetchone()._mapping)
    finally:
        await tenant.close()


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
            "WHERE CAST(id AS TEXT) = :id OR org_key = :id"
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


async def _get_org_schema(org_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        text("SELECT schema_name FROM public.organizations WHERE CAST(id AS TEXT) = :id OR org_key = :id"),
        {"id": org_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Org not found")
    return row[0]


@router.delete("/orgs/{org_id}")
async def delete_org(
    org_id: str,
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Delete an organization and drop its tenant schema."""
    schema = await _get_org_schema(org_id, db)
    # Drop schema cascade
    await db.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
    await db.execute(
        text("DELETE FROM public.organizations WHERE CAST(id AS TEXT) = :id OR org_key = :id"),
        {"id": org_id},
    )
    await db.commit()
    return {"ok": True}


@router.delete("/orgs/{org_id}/members/{member_id}")
async def delete_org_member(
    org_id: str,
    member_id: str,
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from an org's tenant schema."""
    schema = await _get_org_schema(org_id, db)
    tenant = await get_tenant_session(schema)
    try:
        await tenant.execute(
            text(f'DELETE FROM "{schema}".users WHERE CAST(id AS TEXT) = :id'),
            {"id": member_id},
        )
        await tenant.commit()
    finally:
        await tenant.close()
    return {"ok": True}


@router.delete("/orgs/{org_id}/members/{member_id}/account")
async def delete_member_account(
    org_id: str,
    member_id: str,
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a user's account from public.users (and their tenant row).

    This removes their ability to log in entirely. The tenant schema row is also
    deleted so the org membership is cleaned up.
    """
    schema = await _get_org_schema(org_id, db)
    tenant = await get_tenant_session(schema)
    try:
        # Get provider_user_id (= public.users.id as text)
        result = await tenant.execute(
            text(f'SELECT provider_user_id, email FROM "{schema}".users WHERE CAST(id AS TEXT) = :id'),
            {"id": member_id},
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Member not found")
        provider_user_id = row.provider_user_id
        email = row.email

        # Remove from tenant schema
        await tenant.execute(
            text(f'DELETE FROM "{schema}".users WHERE CAST(id AS TEXT) = :id'),
            {"id": member_id},
        )
        await tenant.commit()
    finally:
        await tenant.close()

    # Remove from public.users (the actual account)
    await db.execute(
        text("DELETE FROM public.users WHERE id = CAST(:uid AS UUID) OR email = :email"),
        {"uid": provider_user_id, "email": email},
    )
    await db.commit()
    return {"ok": True, "deleted_email": email}


@router.patch("/orgs/{org_id}/members/{member_id}/disable")
async def toggle_member_disabled(
    org_id: str,
    member_id: str,
    body: dict,
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Disable or re-enable a member account. Body: {disabled: bool}"""
    schema = await _get_org_schema(org_id, db)
    disabled = bool(body.get("disabled", True))
    tenant = await get_tenant_session(schema)
    try:
        result = await tenant.execute(
            text(f'UPDATE "{schema}".users SET is_disabled = :disabled WHERE CAST(id AS TEXT) = :id RETURNING id, email, is_disabled'),
            {"disabled": disabled, "id": member_id},
        )
        await tenant.commit()
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Member not found")
        return {"id": str(row.id), "email": row.email, "is_disabled": row.is_disabled}
    finally:
        await tenant.close()


@router.post("/orgs/{org_id}/members/{member_id}/reset-password")
async def send_member_reset_password(
    org_id: str,
    member_id: str,
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Send a password reset email to a specific org member."""
    schema = await _get_org_schema(org_id, db)
    tenant = await get_tenant_session(schema)
    try:
        result = await tenant.execute(
            text(f'SELECT email FROM "{schema}".users WHERE CAST(id AS TEXT) = :id'),
            {"id": member_id},
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Member not found")
        email = row.email
    finally:
        await tenant.close()

    # Look up the public user by email
    pub_result = await db.execute(
        text("SELECT id FROM public.users WHERE email = :email"),
        {"email": email},
    )
    pub_user = pub_result.fetchone()
    if not pub_user:
        raise HTTPException(status_code=404, detail="User account not found")

    token = str(uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.execute(
        text("INSERT INTO public.password_reset_tokens (user_id, token, expires_at) VALUES (:uid, :token, :exp)"),
        {"uid": pub_user.id, "token": token, "exp": expires_at},
    )
    await db.commit()

    reset_url = f"{settings.APP_BASE_URL}/reset-password?token={token}"
    await send_reset_email(email, reset_url)

    return {"ok": True, "email": email, "reset_url": reset_url}


@router.get("/orgs/{org_id}/session-log")
async def get_org_session_log(
    org_id: str,
    days: int = Query(default=30, ge=1, le=365),
    _: dict = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Detailed log of all user sessions with start and end times."""
    schema = await _get_org_schema(org_id, db)
    tenant = await get_tenant_session(schema)
    try:
        result = await tenant.execute(
            text(f"""
                SELECT
                    s.id as session_id,
                    s.title,
                    s.gpt_target,
                    s.created_at as start_time,
                    s.updated_at as end_time,
                    u.email,
                    u.role,
                    COUNT(m.id) as message_count,
                    SUM(CASE WHEN m.was_blocked THEN 1 ELSE 0 END) as blocked_count
                FROM "{schema}".sessions s
                JOIN "{schema}".users u ON u.id = s.user_id
                LEFT JOIN "{schema}".messages m ON m.session_id = s.id
                WHERE s.created_at > NOW() - INTERVAL '{days} days'
                GROUP BY s.id, s.title, s.gpt_target, s.created_at, s.updated_at, u.email, u.role
                ORDER BY s.created_at DESC
            """)
        )
        return [
            {
                "session_id": str(r.session_id),
                "title": r.title,
                "gpt_target": r.gpt_target,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "end_time": r.end_time.isoformat() if r.end_time else None,
                "email": r.email,
                "role": r.role,
                "message_count": int(r.message_count or 0),
                "blocked_count": int(r.blocked_count or 0),
            }
            for r in result
        ]
    finally:
        await tenant.close()
