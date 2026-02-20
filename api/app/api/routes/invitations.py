from uuid import UUID
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.api.deps import require_admin
from app.schemas.schemas import OrgContext, InvitationCreate
from app.core.database import get_tenant_session
from app.core.config import settings

router = APIRouter(prefix="/admin/invitations", tags=["invitations"])

CLERK_ROLE_MAP = {"member": "org:member", "admin": "org:admin"}


async def _clerk_post(path: str, body: dict) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.clerk.com/v1{path}",
            json=body,
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
        )
        if resp.status_code >= 400:
            detail = resp.json().get("errors", [{}])[0].get("message", resp.text)
            raise HTTPException(status_code=resp.status_code, detail=detail)
        return resp.json()


@router.get("/")
async def list_invitations(ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'SELECT * FROM "{ctx.schema_name}".invitations ORDER BY invited_at DESC')
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.post("/")
async def create_invitation(body: InvitationCreate, ctx: OrgContext = Depends(require_admin)):
    # Personal workspaces don't have a real Clerk org — reject invitations
    if ctx.clerk_org_id.startswith("personal_"):
        raise HTTPException(status_code=400, detail="Cannot invite members to a personal workspace")

    clerk_role = CLERK_ROLE_MAP.get(body.role, "org:member")
    inv = await _clerk_post(
        f"/organizations/{ctx.clerk_org_id}/invitations",
        {"email_address": body.email, "role": clerk_role},
    )

    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"""
                INSERT INTO "{ctx.schema_name}".invitations
                    (clerk_invitation_id, email, role)
                VALUES (:cid, :email, :role)
                ON CONFLICT (clerk_invitation_id) DO UPDATE SET status = 'pending'
                RETURNING *
            """),
            {"cid": inv["id"], "email": body.email, "role": body.role},
        )
        await session.commit()
        return dict(result.fetchone()._mapping)
    finally:
        await session.close()


@router.delete("/{invitation_id}")
async def revoke_invitation(invitation_id: UUID, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'SELECT clerk_invitation_id FROM "{ctx.schema_name}".invitations WHERE id = :id::uuid'),
            {"id": str(invitation_id)},
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Invitation not found")

        clerk_inv_id = row.clerk_invitation_id

        # Revoke in Clerk (best-effort — ignore errors if already accepted/revoked)
        if not ctx.clerk_org_id.startswith("personal_"):
            try:
                await _clerk_post(
                    f"/organizations/{ctx.clerk_org_id}/invitations/{clerk_inv_id}/revoke",
                    {},
                )
            except HTTPException:
                pass

        await session.execute(
            text(f'DELETE FROM "{ctx.schema_name}".invitations WHERE id = :id::uuid'),
            {"id": str(invitation_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()
