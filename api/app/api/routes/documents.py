import io
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import text
from app.api.deps import require_admin, get_org_context
from app.schemas.schemas import OrgContext
from app.core.database import get_tenant_session

router = APIRouter(prefix="/admin/documents", tags=["documents"])

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_TYPES = {
    "text/plain", "text/markdown", "text/csv",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _extract_text(data: bytes, content_type: str, filename: str) -> str:
    """Extract plain text from various file formats."""
    if content_type == "application/pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n\n".join(pages).strip()
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}")

    if content_type in ("application/vnd.openxmlformats-officedocument.wordprocessingml.document",):
        try:
            from docx import Document
            doc = Document(io.BytesIO(data))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse DOCX: {e}")

    # Plain text / markdown / CSV
    try:
        return data.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not decode file: {e}")


@router.get("/")
async def list_documents(
    ctx: OrgContext = Depends(get_org_context),
):
    tenant = await get_tenant_session(ctx.schema_name)
    try:
        result = await tenant.execute(
            text(f'SELECT id, filename, file_size, created_at FROM "{ctx.schema_name}".org_documents ORDER BY created_at DESC')
        )
        return [dict(r._mapping) for r in result]
    finally:
        await tenant.close()


@router.post("/")
async def upload_document(
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require_admin),
):
    ct = file.content_type or "text/plain"
    if ct not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: PDF, TXT, MD, CSV, DOCX",
        )

    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="File must be under 10 MB")
    if not data.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    content_text = _extract_text(data, ct, file.filename or "document")
    if not content_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract any text from the file")

    tenant = await get_tenant_session(ctx.schema_name)
    try:
        result = await tenant.execute(
            text(
                f'INSERT INTO "{ctx.schema_name}".org_documents (filename, content_text, file_size) '
                f'VALUES (:filename, :content_text, :file_size) RETURNING id, filename, file_size, created_at'
            ),
            {"filename": file.filename, "content_text": content_text, "file_size": len(data)},
        )
        row = dict(result.fetchone()._mapping)
        await tenant.commit()
        return row
    finally:
        await tenant.close()


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    ctx: OrgContext = Depends(require_admin),
):
    tenant = await get_tenant_session(ctx.schema_name)
    try:
        await tenant.execute(
            text(f'DELETE FROM "{ctx.schema_name}".org_documents WHERE id = :id'),
            {"id": doc_id},
        )
        await tenant.commit()
        return {"ok": True}
    finally:
        await tenant.close()
