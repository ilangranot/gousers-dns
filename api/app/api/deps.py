import logging
import re
from typing import Optional
from fastapi import Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from jose import jwt, JWTError
from app.core.config import settings
from app.core.database import get_db, get_tenant_session, provision_org_schema
from app.schemas.schemas import OrgContext

logger = logging.getLogger(__name__)


def _schema_for(org_key: str) -> str:
    slug = re.sub(r"[^a-z0-9]", "_", org_key.lower())
    return f"org_{slug}"


async def verify_token(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[7:]
    try:
        return jwt.decode(token, settings.AUTH_SECRET, algorithms=["HS256"])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_org_context(
    claims: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
) -> OrgContext:
    provider_user_id: str = claims.get("sub", "")
    org_key: Optional[str] = claims.get("orgKey")

    # Fall back to personal workspace if no org is active
    workspace_key = org_key or f"personal_{provider_user_id}"
    schema = _schema_for(workspace_key)

    # Auto-provision org row + schema on first request
    result = await db.execute(
        text("SELECT * FROM public.organizations WHERE org_key = :key"),
        {"key": workspace_key},
    )
    org = result.fetchone()

    if not org:
        await provision_org_schema(schema)
        result = await db.execute(
            text("""
                INSERT INTO public.organizations (org_key, name, schema_name)
                VALUES (:key, :name, :schema)
                ON CONFLICT (org_key) DO UPDATE SET name = EXCLUDED.name
                RETURNING *
            """),
            {"key": workspace_key, "name": claims.get("orgSlug") or "Personal", "schema": schema},
        )
        await db.commit()
        org = result.fetchone()

    org = dict(org._mapping)

    # Auto-provision user inside the org schema
    tenant = await get_tenant_session(schema)
    try:
        result = await tenant.execute(
            text(f'SELECT * FROM "{schema}".users WHERE provider_user_id = :uid'),
            {"uid": provider_user_id},
        )
        user = result.fetchone()

        if not user:
            count_row = await tenant.execute(text(f'SELECT COUNT(*) FROM "{schema}".users'))
            role = "admin" if count_row.scalar() == 0 else (
                "admin" if claims.get("orgRole") == "admin" else "member"
            )
            email = claims.get("email") or provider_user_id
            result = await tenant.execute(
                text(f"""
                    INSERT INTO "{schema}".users (provider_user_id, email, role)
                    VALUES (:uid, :email, :role)
                    ON CONFLICT (provider_user_id) DO UPDATE SET email = EXCLUDED.email
                    RETURNING *
                """),
                {"uid": provider_user_id, "email": email, "role": role},
            )
            await tenant.commit()
            user = result.fetchone()

        user = dict(user._mapping)

        # In a personal workspace, the owner is always admin (prevents self-demotion lockout)
        if workspace_key.startswith("personal_") and user["role"] != "admin":
            await tenant.execute(
                text(f'UPDATE "{schema}".users SET role = \'admin\' WHERE id = CAST(:uid AS UUID)'),
                {"uid": str(user["id"])},
            )
            await tenant.commit()
            user["role"] = "admin"
    finally:
        await tenant.close()

    return OrgContext(
        org_key=workspace_key,
        org_id=org["id"],
        schema_name=schema,
        provider_user_id=provider_user_id,
        user_id=user["id"],
        user_role=user["role"],
    )


async def require_admin(ctx: OrgContext = Depends(get_org_context)) -> OrgContext:
    if ctx.user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return ctx


async def require_staff(claims: dict = Depends(verify_token)) -> dict:
    email = claims.get("email", "")
    allowed = [e.strip() for e in settings.STAFF_EMAILS.split(",") if e.strip()]
    logger.info("require_staff: sub=%s email=%s allowed=%s",
                claims.get("sub"), email, allowed)
    if not email or email not in allowed:
        raise HTTPException(status_code=403, detail="Staff access only")
    return claims
