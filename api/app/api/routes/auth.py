import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from passlib.context import CryptContext

from app.core.config import settings
from app.core.database import get_db, provision_org_schema
from app.services.email import send_reset_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class RegisterRequest(BaseModel):
    email: str
    password: str


class VerifyRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class AcceptInvitationRequest(BaseModel):
    token: str
    email: str


def _personal_org_key(user_id: str) -> str:
    return f"personal_{user_id}"


def _schema_for(org_key: str) -> str:
    slug = re.sub(r"[^a-z0-9]", "_", org_key.lower())
    return f"org_{slug}"


@router.post("/register")
async def register(body: RegisterRequest):
    """Create a new user account and provision a personal org schema."""
    async for db in get_db():
        # Check if email already exists
        result = await db.execute(
            text("SELECT id FROM public.users WHERE email = :email"),
            {"email": body.email},
        )
        if result.fetchone():
            raise HTTPException(status_code=409, detail="Email already registered")

        password_hash = pwd_context.hash(body.password)
        result = await db.execute(
            text("""
                INSERT INTO public.users (email, password_hash)
                VALUES (:email, :hash)
                RETURNING id, email
            """),
            {"email": body.email, "hash": password_hash},
        )
        await db.commit()
        user = dict(result.fetchone()._mapping)

        # Provision personal org schema
        org_key = _personal_org_key(str(user["id"]))
        schema = _schema_for(org_key)
        await provision_org_schema(schema)
        await db.execute(
            text("""
                INSERT INTO public.organizations (org_key, name, schema_name)
                VALUES (:key, :name, :schema)
                ON CONFLICT (org_key) DO NOTHING
            """),
            {"key": org_key, "name": "Personal", "schema": schema},
        )
        await db.commit()

        return {"id": str(user["id"]), "email": user["email"], "orgKey": org_key, "orgRole": "admin"}


@router.post("/verify-credentials")
async def verify_credentials(body: VerifyRequest):
    """Verify email + password and return user info for Auth.js JWT callback."""
    async for db in get_db():
        result = await db.execute(
            text("SELECT id, email, password_hash FROM public.users WHERE email = :email"),
            {"email": body.email},
        )
        user = result.fetchone()
        if not user or not user.password_hash:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not pwd_context.verify(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        personal_org_key = _personal_org_key(str(user.id))

        # Ensure personal org row exists (handles users created before personal org was provisioned)
        personal_schema = _schema_for(personal_org_key)
        result = await db.execute(
            text("SELECT org_key FROM public.organizations WHERE org_key = :key"),
            {"key": personal_org_key},
        )
        if not result.fetchone():
            await provision_org_schema(personal_schema)
            await db.execute(
                text("""
                    INSERT INTO public.organizations (org_key, name, schema_name)
                    VALUES (:key, :name, :schema)
                    ON CONFLICT (org_key) DO NOTHING
                """),
                {"key": personal_org_key, "name": "Personal", "schema": personal_schema},
            )
            await db.commit()

        # Check if the user belongs to a named (non-personal) org — return that org if so
        # Look for a non-personal org where the user is a member
        orgs_result = await db.execute(
            text("SELECT org_key, schema_name FROM public.organizations WHERE org_key NOT LIKE 'personal_%' ORDER BY created_at DESC"),
        )
        org_rows = orgs_result.fetchall()

        active_org_key = personal_org_key
        active_org_role = "admin"

        for org_row in org_rows:
            okey = org_row.org_key
            oschema = org_row.schema_name
            try:
                from app.core.database import get_tenant_session as _gts
                ts = await _gts(oschema)
                try:
                    ur = await ts.execute(
                        text(f'SELECT role FROM "{oschema}".users WHERE provider_user_id = :uid'),
                        {"uid": str(user.id)},
                    )
                    user_in_org = ur.fetchone()
                    if user_in_org:
                        active_org_key = okey
                        active_org_role = user_in_org.role
                        break
                finally:
                    await ts.close()
            except Exception:
                continue

        return {"id": str(user.id), "email": user.email, "orgKey": active_org_key, "orgRole": active_org_role}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """Generate a password-reset token and email a link to the user.

    Always returns 200 so callers can't enumerate registered emails.
    """
    async for db in get_db():
        result = await db.execute(
            text("SELECT id FROM public.users WHERE email = :email"),
            {"email": body.email},
        )
        user = result.fetchone()
        if not user:
            return {"ok": True}

        token = str(uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.execute(
            text("""
                INSERT INTO public.password_reset_tokens (user_id, token, expires_at)
                VALUES (:uid, :token, :exp)
            """),
            {"uid": user.id, "token": token, "exp": expires_at},
        )
        await db.commit()

        reset_url = f"{settings.APP_BASE_URL}/reset-password?token={token}"
        await send_reset_email(body.email, reset_url)

        return {"ok": True}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Consume a password-reset token and update the user's password."""
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    async for db in get_db():
        result = await db.execute(
            text("""
                SELECT user_id FROM public.password_reset_tokens
                WHERE token = :token
                  AND used_at IS NULL
                  AND expires_at > NOW()
            """),
            {"token": body.token},
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Invalid or expired reset link")

        password_hash = pwd_context.hash(body.password)
        await db.execute(
            text("UPDATE public.users SET password_hash = :hash WHERE id = :uid"),
            {"hash": password_hash, "uid": row.user_id},
        )
        await db.execute(
            text("UPDATE public.password_reset_tokens SET used_at = NOW() WHERE token = :token"),
            {"token": body.token},
        )
        await db.commit()
        return {"ok": True}


@router.post("/accept-invitation")
async def accept_invitation(body: AcceptInvitationRequest):
    """Accept a pending invitation token and link the user to the org.

    Call this after the user registers. The token in the URL (?invite=TOKEN)
    identifies the invitation; the email must match the invitation's email.
    """
    async for db in get_db():
        # Find user by email
        user_result = await db.execute(
            text("SELECT id, email FROM public.users WHERE email = :email"),
            {"email": body.email},
        )
        user = user_result.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found. Please register first.")

        # Scan all non-personal orgs for the invitation token
        orgs_result = await db.execute(
            text("SELECT org_key, schema_name FROM public.organizations WHERE org_key NOT LIKE 'personal_%'"),
        )
        org_rows = orgs_result.fetchall()

        from app.core.database import get_tenant_session as _gts
        for org_row in org_rows:
            oschema = org_row.schema_name
            okey = org_row.org_key
            try:
                ts = await _gts(oschema)
                try:
                    inv_result = await ts.execute(
                        text(f"SELECT id, email, role FROM \"{oschema}\".invitations WHERE token = :token AND status = 'pending'"),
                        {"token": body.token},
                    )
                    inv = inv_result.fetchone()
                    if not inv:
                        continue

                    if inv.email.lower() != body.email.lower():
                        raise HTTPException(
                            status_code=400,
                            detail="Invitation email does not match your account email",
                        )

                    # Add user to the org's tenant schema
                    await ts.execute(
                        text(f"""
                            INSERT INTO "{oschema}".users (provider_user_id, email, role)
                            VALUES (:uid, :email, :role)
                            ON CONFLICT (provider_user_id) DO UPDATE SET email = EXCLUDED.email
                        """),
                        {"uid": str(user.id), "email": body.email, "role": inv.role},
                    )
                    # Mark invitation as accepted
                    await ts.execute(
                        text(f"UPDATE \"{oschema}\".invitations SET status = 'accepted', accepted_at = NOW() WHERE token = :token"),
                        {"token": body.token},
                    )
                    await ts.commit()
                    return {"ok": True, "org_key": okey, "role": inv.role}
                finally:
                    await ts.close()
            except HTTPException:
                raise
            except Exception:
                continue

        raise HTTPException(status_code=404, detail="Invitation not found or already accepted")
