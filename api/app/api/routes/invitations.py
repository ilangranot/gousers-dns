from uuid import UUID, uuid4
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_admin
from app.schemas.schemas import OrgContext, InvitationCreate
from app.core.config import settings
from app.core.database import get_tenant_session, get_db
from app.services.email import send_invitation_email

router = APIRouter(prefix="/admin/invitations", tags=["invitations"])


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
async def create_invitation(
    body: InvitationCreate,
    background_tasks: BackgroundTasks,
    ctx: OrgContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if ctx.org_key.startswith("personal_"):
        raise HTTPException(status_code=400, detail="Cannot invite members to a personal workspace")

    # Get org display name for the invitation email
    org_result = await db.execute(
        text("SELECT name, org_display_name FROM public.organizations WHERE org_key = :key"),
        {"key": ctx.org_key},
    )
    org_row = org_result.fetchone()
    org_name = (org_row.org_display_name or org_row.name) if org_row else "Your Organization"

    token = str(uuid4())

    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"""
                INSERT INTO "{ctx.schema_name}".invitations
                    (token, email, role)
                VALUES (:token, :email, :role)
                RETURNING *
            """),
            {"token": token, "email": body.email, "role": body.role},
        )
        await session.commit()
        row = dict(result.fetchone()._mapping)
    finally:
        await session.close()

    # Send invitation email in the background
    invite_url = f"{settings.APP_BASE_URL}/sign-up?invite={token}"
    background_tasks.add_task(
        send_invitation_email,
        body.email,
        org_name,
        invite_url,
        body.role,
    )

    # Include the invite URL so the frontend can display a copyable link
    return {**row, "invite_url": invite_url}


@router.delete("/{invitation_id}")
async def revoke_invitation(invitation_id: UUID, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'SELECT id FROM "{ctx.schema_name}".invitations WHERE id = CAST(:id AS UUID)'),
            {"id": str(invitation_id)},
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Invitation not found")

        await session.execute(
            text(f'DELETE FROM "{ctx.schema_name}".invitations WHERE id = CAST(:id AS UUID)'),
            {"id": str(invitation_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()
