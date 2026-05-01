"""
WhatsApp Business Cloud API routes.

Public routes (no auth — verified by Meta):
  GET  /whatsapp/webhook/{org_key}   — Meta webhook verification challenge
  POST /whatsapp/webhook/{org_key}   — Receive incoming messages

Admin routes (require admin JWT):
  GET    /admin/whatsapp/accounts            — List WhatsApp accounts
  POST   /admin/whatsapp/accounts            — Add a WhatsApp account
  DELETE /admin/whatsapp/accounts/{id}       — Remove an account

  GET    /admin/whatsapp/conversations       — List conversations
  GET    /admin/whatsapp/conversations/{id}  — Conversation detail + messages
  POST   /admin/whatsapp/conversations/{id}/send — Send a manual message

  GET    /admin/whatsapp/rules               — List intervention rules
  POST   /admin/whatsapp/rules               — Create a rule
  PATCH  /admin/whatsapp/rules/{id}          — Update a rule
  DELETE /admin/whatsapp/rules/{id}          — Delete a rule
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, BackgroundTasks
from sqlalchemy import text

from app.api.deps import require_admin, get_org_context
from app.core.database import get_tenant_session
from app.core.security import encrypt_api_key, decrypt_api_key
from app.schemas.schemas import (
    OrgContext,
    WhatsAppAccountCreate,
    WhatsAppRuleCreate,
    WhatsAppRuleUpdate,
    WhatsAppSendRequest,
)
from app.services.whatsapp import (
    verify_webhook_signature,
    process_incoming_webhook,
    send_whatsapp_message,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["whatsapp"])


# ── Webhook verification + receive ────────────────────────────────────────────

@router.get("/whatsapp/webhook/{org_key}")
async def webhook_verify(
    org_key: str,
    hub_mode: str = Query(alias="hub.mode", default=""),
    hub_challenge: str = Query(alias="hub.challenge", default=""),
    hub_verify_token: str = Query(alias="hub.verify_token", default=""),
):
    """
    Meta sends a GET request to verify the webhook URL.
    We look up the WhatsApp account by verify_token and org_key,
    then echo back the hub.challenge.
    """
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    session = AsyncSessionLocal()
    try:
        # Resolve schema from org_key
        org_result = await session.execute(
            text("SELECT schema_name FROM public.organizations WHERE org_key = :key"),
            {"key": org_key},
        )
        org = org_result.fetchone()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        schema = org[0]

        # Find account with matching verify_token
        acc_result = await session.execute(
            text(f'SELECT verify_token FROM "{schema}".whatsapp_accounts WHERE is_active = TRUE'),
        )
        accounts = acc_result.fetchall()
        if not any(a[0] == hub_verify_token for a in accounts):
            raise HTTPException(status_code=403, detail="Invalid verify_token")

        if hub_mode != "subscribe":
            raise HTTPException(status_code=400, detail="Unexpected hub.mode")

        return int(hub_challenge)
    finally:
        await session.close()


@router.post("/whatsapp/webhook/{org_key}", status_code=200)
async def webhook_receive(
    org_key: str,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Meta POSTs incoming message events here.
    We verify the HMAC signature, parse the payload, and process each message
    in a background task so Meta gets a 200 response immediately.
    """
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    if not verify_webhook_signature(body, signature):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    import json
    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    if payload.get("object") != "whatsapp_business_account":
        return {"status": "ignored"}

    # Schedule background processing for each message in the payload
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            phone_number_id = value.get("metadata", {}).get("phone_number_id", "")
            contacts = {c["wa_id"]: c.get("profile", {}).get("name", "") for c in value.get("contacts", [])}

            for msg in value.get("messages", []):
                if msg.get("type") != "text":
                    continue  # only text messages for now

                wa_contact_id = msg.get("from", "")
                wa_message_id = msg.get("id", "")
                content = msg.get("text", {}).get("body", "")
                contact_name = contacts.get(wa_contact_id, "")

                if not content:
                    continue

                background_tasks.add_task(
                    _handle_inbound_message,
                    org_key=org_key,
                    phone_number_id=phone_number_id,
                    wa_contact_id=wa_contact_id,
                    contact_name=contact_name,
                    contact_phone=wa_contact_id,  # WA contact ID IS the phone number
                    wa_message_id=wa_message_id,
                    content=content,
                )

    return {"status": "ok"}


async def _handle_inbound_message(
    org_key: str,
    phone_number_id: str,
    wa_contact_id: str,
    contact_name: str,
    contact_phone: str,
    wa_message_id: str,
    content: str,
):
    """Background task: look up account and run the full processing pipeline."""
    from app.core.database import AsyncSessionLocal
    session = AsyncSessionLocal()
    try:
        org_result = await session.execute(
            text("SELECT schema_name FROM public.organizations WHERE org_key = :key"),
            {"key": org_key},
        )
        org = org_result.fetchone()
        if not org:
            logger.error("WhatsApp webhook: org_key '%s' not found", org_key)
            return
        schema = org[0]

        acc_result = await session.execute(
            text(f"""
                SELECT * FROM "{schema}".whatsapp_accounts
                WHERE phone_number_id = :pid AND is_active = TRUE
                LIMIT 1
            """),
            {"pid": phone_number_id},
        )
        account_row = acc_result.fetchone()
        if not account_row:
            logger.warning("WhatsApp webhook: no active account for phone_number_id '%s'", phone_number_id)
            return

        account = dict(account_row._mapping)
        await process_incoming_webhook(
            session=session,
            schema=schema,
            account=account,
            wa_contact_id=wa_contact_id,
            contact_name=contact_name,
            contact_phone=contact_phone,
            wa_message_id=wa_message_id,
            content=content,
        )
    except Exception:
        logger.exception("Error processing inbound WhatsApp message")
    finally:
        await session.close()


# ── Admin: Accounts ────────────────────────────────────────────────────────────

@router.get("/admin/whatsapp/accounts")
async def list_accounts(ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text("SELECT id, phone_number_id, display_phone_number, verify_token, is_active, created_at FROM whatsapp_accounts ORDER BY created_at DESC")
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.post("/admin/whatsapp/accounts", status_code=201)
async def create_account(body: WhatsAppAccountCreate, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        encrypted = encrypt_api_key(body.access_token)
        result = await session.execute(
            text("""
                INSERT INTO whatsapp_accounts
                    (phone_number_id, display_phone_number, access_token_encrypted, verify_token)
                VALUES (:phone_number_id, :display_phone_number, :token_enc, :verify_token)
                RETURNING id, phone_number_id, display_phone_number, verify_token, is_active, created_at
            """),
            {
                "phone_number_id": body.phone_number_id,
                "display_phone_number": body.display_phone_number,
                "token_enc": encrypted,
                "verify_token": body.verify_token,
            },
        )
        await session.commit()
        return dict(result.fetchone()._mapping)
    finally:
        await session.close()


@router.delete("/admin/whatsapp/accounts/{account_id}")
async def delete_account(account_id: UUID, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text("DELETE FROM whatsapp_accounts WHERE id = CAST(:id AS UUID)"),
            {"id": str(account_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


# ── Admin: Intervention Rules ──────────────────────────────────────────────────

@router.get("/admin/whatsapp/rules")
async def list_rules(ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text("SELECT * FROM whatsapp_rules ORDER BY priority DESC, created_at")
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.post("/admin/whatsapp/rules", status_code=201)
async def create_rule(body: WhatsAppRuleCreate, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text("""
                INSERT INTO whatsapp_rules
                    (name, trigger_type, pattern, action, agent_id, response_template, priority)
                VALUES
                    (:name, :trigger_type, :pattern, :action,
                     CAST(:agent_id AS UUID), :response_template, :priority)
                RETURNING *
            """),
            {
                "name": body.name,
                "trigger_type": body.trigger_type,
                "pattern": body.pattern,
                "action": body.action,
                "agent_id": str(body.agent_id) if body.agent_id else None,
                "response_template": body.response_template,
                "priority": body.priority,
            },
        )
        await session.commit()
        return dict(result.fetchone()._mapping)
    finally:
        await session.close()


@router.patch("/admin/whatsapp/rules/{rule_id}")
async def update_rule(rule_id: UUID, body: WhatsAppRuleUpdate, ctx: OrgContext = Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = []
    for k in updates:
        if k == "agent_id":
            set_parts.append("agent_id = CAST(:agent_id AS UUID)")
        else:
            set_parts.append(f"{k} = :{k}")

    set_clause = ", ".join(set_parts)
    updates["rule_id"] = str(rule_id)
    if "agent_id" in updates and updates["agent_id"]:
        updates["agent_id"] = str(updates["agent_id"])

    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"UPDATE whatsapp_rules SET {set_clause} WHERE id = CAST(:rule_id AS UUID) RETURNING *"),
            updates,
        )
        await session.commit()
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Rule not found")
        return dict(row._mapping)
    finally:
        await session.close()


@router.delete("/admin/whatsapp/rules/{rule_id}")
async def delete_rule(rule_id: UUID, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text("DELETE FROM whatsapp_rules WHERE id = CAST(:id AS UUID)"),
            {"id": str(rule_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


# ── Admin: Conversations ───────────────────────────────────────────────────────

@router.get("/admin/whatsapp/conversations")
async def list_conversations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    ctx: OrgContext = Depends(require_admin),
):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text("""
                SELECT c.*,
                       (SELECT content FROM whatsapp_messages m
                        WHERE m.conversation_id = c.id
                        ORDER BY m.created_at DESC LIMIT 1) AS last_message,
                       (SELECT COUNT(*) FROM whatsapp_messages m
                        WHERE m.conversation_id = c.id) AS message_count
                FROM whatsapp_conversations c
                ORDER BY c.last_message_at DESC
                LIMIT :limit OFFSET :offset
            """),
            {"limit": limit, "offset": offset},
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


@router.get("/admin/whatsapp/conversations/{conversation_id}")
async def get_conversation(conversation_id: UUID, ctx: OrgContext = Depends(require_admin)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        conv_result = await session.execute(
            text("SELECT * FROM whatsapp_conversations WHERE id = CAST(:id AS UUID)"),
            {"id": str(conversation_id)},
        )
        conv_row = conv_result.fetchone()
        if not conv_row:
            raise HTTPException(status_code=404, detail="Conversation not found")

        msgs_result = await session.execute(
            text("""
                SELECT * FROM whatsapp_messages
                WHERE conversation_id = CAST(:cid AS UUID)
                ORDER BY created_at ASC
            """),
            {"cid": str(conversation_id)},
        )
        return {
            "conversation": dict(conv_row._mapping),
            "messages": [dict(r._mapping) for r in msgs_result],
        }
    finally:
        await session.close()


@router.post("/admin/whatsapp/conversations/{conversation_id}/send", status_code=201)
async def send_manual_message(
    conversation_id: UUID,
    body: WhatsAppSendRequest,
    ctx: OrgContext = Depends(require_admin),
):
    """Allows admins to send a manual message into a WhatsApp conversation."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        # Load conversation + account
        conv_result = await session.execute(
            text("""
                SELECT c.*, a.phone_number_id, a.access_token_encrypted, a.is_active AS account_active
                FROM whatsapp_conversations c
                JOIN whatsapp_accounts a ON a.id = c.account_id
                WHERE c.id = CAST(:cid AS UUID)
            """),
            {"cid": str(conversation_id)},
        )
        row = conv_result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conversation not found")
        conv = dict(row._mapping)

        if not conv["account_active"]:
            raise HTTPException(status_code=400, detail="WhatsApp account is inactive")

        try:
            access_token = decrypt_api_key(conv["access_token_encrypted"])
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to decrypt access token")

        to = conv["contact_phone"] or conv["wa_contact_id"]
        out_wa_id = await send_whatsapp_message(
            phone_number_id=conv["phone_number_id"],
            to=to,
            text_body=body.message,
            access_token=access_token,
        )

        status = "sent" if out_wa_id else "failed"
        result = await session.execute(
            text("""
                INSERT INTO whatsapp_messages
                    (conversation_id, direction, content, wa_message_id, status, ai_intervened)
                VALUES (CAST(:cid AS UUID), 'outbound', :content, :wmid, :status, FALSE)
                RETURNING *
            """),
            {
                "cid": str(conversation_id),
                "content": body.message,
                "wmid": out_wa_id,
                "status": status,
            },
        )
        await session.execute(
            text("UPDATE whatsapp_conversations SET last_message_at = NOW() WHERE id = CAST(:id AS UUID)"),
            {"id": str(conversation_id)},
        )
        await session.commit()

        msg = dict(result.fetchone()._mapping)
        if status == "failed":
            raise HTTPException(status_code=502, detail="Message queued in DB but Meta API send failed")
        return msg
    finally:
        await session.close()
