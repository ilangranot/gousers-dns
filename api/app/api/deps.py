import logging
import re
import httpx
from typing import Optional
from fastapi import Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from jose import jwt, JWTError
from app.core.config import settings
from app.core.database import get_db, get_tenant_session, provision_org_schema
from app.schemas.schemas import OrgContext

logger = logging.getLogger(__name__)

# Cache JWKS so we don't fetch on every request
_jwks_cache: Optional[dict] = None

# Cache Clerk user emails to avoid repeated API calls (sub → email)
_clerk_email_cache: dict = {}


async def _get_clerk_user_email(sub: str) -> str:
    """Look up a user's primary email from Clerk API by their user ID."""
    if sub in _clerk_email_cache:
        return _clerk_email_cache[sub]
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"https://api.clerk.com/v1/users/{sub}",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            )
            logger.info("Clerk API user lookup sub=%s status=%s", sub, resp.status_code)
            if resp.status_code == 200:
                data = resp.json()
                primary_id = data.get("primary_email_address_id", "")
                for addr in data.get("email_addresses", []):
                    if addr.get("id") == primary_id:
                        email = addr.get("email_address", "")
                        _clerk_email_cache[sub] = email
                        return email
            else:
                logger.warning("Clerk API user lookup failed: sub=%s status=%s body=%s",
                               sub, resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("Clerk API user lookup exception: sub=%s error=%s", sub, exc)
    return ""


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.clerk.com/v1/jwks",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            )
            _jwks_cache = resp.json()
    return _jwks_cache


def _schema_for(clerk_id: str) -> str:
    slug = re.sub(r"[^a-z0-9]", "_", clerk_id.lower())
    return f"org_{slug}"


async def verify_clerk_token(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[7:]
    try:
        jwks = await _get_jwks()
        header = jwt.get_unverified_header(token)
        key = next((k for k in jwks["keys"] if k["kid"] == header["kid"]), None)
        if not key:
            # Stale cache — refresh and retry once
            global _jwks_cache
            _jwks_cache = None
            jwks = await _get_jwks()
            key = next((k for k in jwks["keys"] if k["kid"] == header["kid"]), None)
        if not key:
            raise HTTPException(status_code=401, detail="Unknown signing key")
        return jwt.decode(token, key, algorithms=["RS256"])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_org_context(
    claims: dict = Depends(verify_clerk_token),
    db: AsyncSession = Depends(get_db),
) -> OrgContext:
    clerk_user_id: str = claims.get("sub", "")
    clerk_org_id: Optional[str] = claims.get("org_id")

    # Fall back to a personal workspace if no org is active
    workspace_id = clerk_org_id or f"personal_{clerk_user_id}"
    schema = _schema_for(workspace_id)

    # Auto-provision org row + schema on first request (no webhook required)
    result = await db.execute(
        text("SELECT * FROM public.organizations WHERE clerk_org_id = :id"),
        {"id": workspace_id},
    )
    org = result.fetchone()

    if not org:
        await provision_org_schema(schema)
        result = await db.execute(
            text("""
                INSERT INTO public.organizations (clerk_org_id, name, schema_name)
                VALUES (:id, :name, :schema)
                ON CONFLICT (clerk_org_id) DO UPDATE SET name = EXCLUDED.name
                RETURNING *
            """),
            {"id": workspace_id, "name": claims.get("org_slug") or "Personal", "schema": schema},
        )
        await db.commit()
        org = result.fetchone()

    org = dict(org._mapping)

    # Auto-provision user inside the org schema
    tenant = await get_tenant_session(schema)
    try:
        result = await tenant.execute(
            text("SELECT * FROM users WHERE clerk_user_id = :uid"),
            {"uid": clerk_user_id},
        )
        user = result.fetchone()

        if not user:
            count_row = await tenant.execute(text("SELECT COUNT(*) FROM users"))
            # First user in the org becomes admin automatically
            role = "admin" if count_row.scalar() == 0 else (
                "admin" if claims.get("org_role") == "org:admin" else "member"
            )
            email = claims.get("email") or await _get_clerk_user_email(clerk_user_id) or clerk_user_id
            result = await tenant.execute(
                text("""
                    INSERT INTO users (clerk_user_id, email, role)
                    VALUES (:uid, :email, :role)
                    ON CONFLICT (clerk_user_id) DO UPDATE SET email = EXCLUDED.email
                    RETURNING *
                """),
                {"uid": clerk_user_id, "email": email, "role": role},
            )
            await tenant.commit()
            user = result.fetchone()

        user = dict(user._mapping)
    finally:
        await tenant.close()

    return OrgContext(
        clerk_org_id=workspace_id,
        org_id=org["id"],
        schema_name=schema,
        user_clerk_id=clerk_user_id,
        user_id=user["id"],
        user_role=user["role"],
    )


async def require_admin(ctx: OrgContext = Depends(get_org_context)) -> OrgContext:
    if ctx.user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return ctx


async def require_staff(claims: dict = Depends(verify_clerk_token)) -> dict:
    # Email may not be in JWT if no custom template is configured — fall back to Clerk API
    sub = claims.get("sub", "")
    email = claims.get("email") or await _get_clerk_user_email(sub)
    allowed = [e.strip() for e in settings.STAFF_EMAILS.split(",") if e.strip()]
    logger.info("require_staff: sub=%s jwt_email=%s resolved_email=%s allowed=%s",
                sub, claims.get("email"), email, allowed)
    if not email or email not in allowed:
        raise HTTPException(status_code=403, detail="Staff access only")
    return claims
