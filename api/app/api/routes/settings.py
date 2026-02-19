import base64
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.api.deps import require_admin, get_org_context
from app.schemas.schemas import OrgContext
from app.core.database import get_db

router = APIRouter(prefix="/settings", tags=["settings"])

from app.services.verticals import VERTICAL_LABELS

ALLOWED_THEMES = {"midnight", "ocean", "forest", "sunset", "light"}
ALLOWED_VERTICALS = set(VERTICAL_LABELS.keys())
MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB


class OrgSettingsUpdate(BaseModel):
    theme: Optional[str] = None
    org_display_name: Optional[str] = None
    vertical: Optional[str] = None


@router.get("/")
async def get_settings(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT theme, logo_base64, org_display_name, vertical FROM public.organizations WHERE clerk_org_id = :id"),
        {"id": ctx.clerk_org_id},
    )
    row = result.fetchone()
    if not row:
        return {"theme": "midnight", "has_logo": False, "org_display_name": None, "vertical": "general"}
    d = dict(row._mapping)
    d["has_logo"] = bool(d.pop("logo_base64", None))
    return d


@router.get("/logo")
async def get_logo(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT logo_base64 FROM public.organizations WHERE clerk_org_id = :id"),
        {"id": ctx.clerk_org_id},
    )
    row = result.fetchone()
    if not row or not row.logo_base64:
        return {"logo_base64": None}
    return {"logo_base64": row.logo_base64}


@router.patch("/")
async def update_settings(
    body: OrgSettingsUpdate,
    ctx: OrgContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.theme and body.theme not in ALLOWED_THEMES:
        raise HTTPException(status_code=400, detail=f"Invalid theme. Choose from: {sorted(ALLOWED_THEMES)}")
    if body.vertical and body.vertical not in ALLOWED_VERTICALS:
        raise HTTPException(status_code=400, detail=f"Invalid vertical. Choose from: {sorted(ALLOWED_VERTICALS)}")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"ok": True}

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["org_id"] = ctx.clerk_org_id
    await db.execute(
        text(f"UPDATE public.organizations SET {set_clause} WHERE clerk_org_id = :org_id"),
        updates,
    )
    await db.commit()
    return {"ok": True}


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = await file.read()
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo must be under 2 MB")

    encoded = f"data:{file.content_type};base64,{base64.b64encode(data).decode()}"
    await db.execute(
        text("UPDATE public.organizations SET logo_base64 = :logo WHERE clerk_org_id = :id"),
        {"logo": encoded, "id": ctx.clerk_org_id},
    )
    await db.commit()
    return {"ok": True, "logo_base64": encoded}


@router.delete("/logo")
async def delete_logo(
    ctx: OrgContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("UPDATE public.organizations SET logo_base64 = NULL WHERE clerk_org_id = :id"),
        {"id": ctx.clerk_org_id},
    )
    await db.commit()
    return {"ok": True}
