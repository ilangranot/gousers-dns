from fastapi import APIRouter, Request, HTTPException, Header
from sqlalchemy import text
from svix.webhooks import Webhook, WebhookVerificationError
from app.core.config import settings
from app.core.database import get_db, provision_org_schema
import re

router = APIRouter(prefix="/auth", tags=["auth"])


def org_schema_name(clerk_org_id: str) -> str:
    slug = re.sub(r"[^a-z0-9]", "_", clerk_org_id.lower())
    return f"org_{slug}"


@router.post("/webhook")
async def clerk_webhook(request: Request, svix_id: str = Header(None), svix_timestamp: str = Header(None), svix_signature: str = Header(None)):
    """Handle Clerk webhooks: org created, user created/deleted."""
    payload = await request.body()
    headers = {
        "svix-id": svix_id or "",
        "svix-timestamp": svix_timestamp or "",
        "svix-signature": svix_signature or "",
    }

    try:
        wh = Webhook(settings.CLERK_WEBHOOK_SECRET)
        event = wh.verify(payload, headers)
    except WebhookVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = event.get("type")
    data = event.get("data", {})

    async for db in get_db():
        if event_type == "organization.created":
            clerk_org_id = data["id"]
            org_name = data["name"]
            schema = org_schema_name(clerk_org_id)

            await provision_org_schema(schema)
            await db.execute(
                text("INSERT INTO public.organizations (clerk_org_id, name, schema_name) VALUES (:id, :name, :schema) ON CONFLICT DO NOTHING"),
                {"id": clerk_org_id, "name": org_name, "schema": schema},
            )
            await db.commit()

        elif event_type == "organizationMembership.created":
            clerk_org_id = data["organization"]["id"]
            clerk_user_id = data["public_user_data"]["user_id"]
            email = data["public_user_data"].get("identifier", "")
            role = "admin" if data.get("role") == "org:admin" else "member"

            result = await db.execute(
                text("SELECT schema_name FROM public.organizations WHERE clerk_org_id = :id"),
                {"id": clerk_org_id},
            )
            row = result.fetchone()
            if row:
                schema = row.schema_name
                from app.core.database import get_tenant_session
                tenant = await get_tenant_session(schema)
                try:
                    await tenant.execute(
                        text("INSERT INTO users (clerk_user_id, email, role) VALUES (:uid, :email, :role) ON CONFLICT (clerk_user_id) DO NOTHING"),
                        {"uid": clerk_user_id, "email": email, "role": role},
                    )
                    await tenant.commit()
                finally:
                    await tenant.close()

        elif event_type == "organizationMembership.deleted":
            clerk_org_id = data["organization"]["id"]
            clerk_user_id = data["public_user_data"]["user_id"]

            result = await db.execute(
                text("SELECT schema_name FROM public.organizations WHERE clerk_org_id = :id"),
                {"id": clerk_org_id},
            )
            row = result.fetchone()
            if row:
                from app.core.database import get_tenant_session
                tenant = await get_tenant_session(row.schema_name)
                try:
                    await tenant.execute(
                        text("DELETE FROM users WHERE clerk_user_id = :uid"),
                        {"uid": clerk_user_id},
                    )
                    await tenant.commit()
                finally:
                    await tenant.close()

    return {"ok": True}
