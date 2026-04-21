from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.api.deps import get_org_context
from app.schemas.schemas import OrgContext

router = APIRouter(prefix="/sites", tags=["sites"])


@router.post("/")
async def deploy_site(
    body: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Save generated HTML and return a public URL."""
    html = body.get("html", "").strip()
    title = body.get("title", "Generated Site")
    if not html:
        raise HTTPException(status_code=400, detail="html is required")
    if len(html) > 5_000_000:
        raise HTTPException(status_code=400, detail="HTML too large (max 5MB)")

    result = await db.execute(
        text("INSERT INTO public.generated_sites (html_content, title) VALUES (:html, :title) RETURNING id"),
        {"html": html, "title": title},
    )
    await db.commit()
    site_id = str(result.fetchone().id)
    return {"id": site_id}


@router.get("/{site_id}", response_class=HTMLResponse)
async def get_site(site_id: str, db: AsyncSession = Depends(get_db)):
    """Serve a deployed site by ID (public, no auth required)."""
    try:
        result = await db.execute(
            text("SELECT html_content, title FROM public.generated_sites WHERE id = CAST(:id AS UUID)"),
            {"id": site_id},
        )
        row = result.fetchone()
    except Exception:
        raise HTTPException(status_code=404, detail="Site not found")
    if not row:
        raise HTTPException(status_code=404, detail="Site not found")
    return HTMLResponse(content=row.html_content, status_code=200)
