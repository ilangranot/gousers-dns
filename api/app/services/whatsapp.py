"""
WhatsApp Business Cloud API service.

Responsibilities:
- Send messages via Meta Graph API
- Parse incoming webhook payloads
- Match intervention rules (keyword / regex / always / sentiment)
- Generate AI replies using the org's configured GPT connection
- Record all activity in the DB (whatsapp_messages, whatsapp_conversations)
"""

import re
import json
import hashlib
import hmac
import logging
from typing import Optional
from uuid import UUID

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decrypt_api_key

logger = logging.getLogger(__name__)

META_API_VERSION = "v19.0"
META_BASE = f"https://graph.facebook.com/{META_API_VERSION}"

# ── HMAC verification ─────────────────────────────────────────────────────────

def verify_webhook_signature(body: bytes, signature_header: str) -> bool:
    """
    Verify X-Hub-Signature-256 header sent by Meta.
    Returns True if signature matches or if WHATSAPP_APP_SECRET is not set (dev mode).
    """
    if not settings.WHATSAPP_APP_SECRET:
        return True  # dev mode — skip verification
    if not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        settings.WHATSAPP_APP_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


# ── Meta Graph API ─────────────────────────────────────────────────────────────

async def send_whatsapp_message(
    phone_number_id: str,
    to: str,
    text_body: str,
    access_token: str,
) -> Optional[str]:
    """
    Send a text message via Meta Cloud API.
    Returns the wa_message_id on success, None on failure.
    """
    url = f"{META_BASE}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text_body},
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
            )
            res.raise_for_status()
            data = res.json()
            return data.get("messages", [{}])[0].get("id")
    except Exception as e:
        logger.error("WhatsApp send failed: %s", e)
        return None


# ── Rule matching ──────────────────────────────────────────────────────────────

async def get_active_rules(session: AsyncSession, schema: str) -> list[dict]:
    """Return all active WhatsApp intervention rules ordered by priority desc."""
    result = await session.execute(
        text(f'SELECT * FROM "{schema}".whatsapp_rules WHERE is_active = TRUE ORDER BY priority DESC, created_at')
    )
    return [dict(r._mapping) for r in result]


def rule_matches(rule: dict, content: str) -> bool:
    """Return True if the message content triggers this rule."""
    trigger = rule["trigger_type"]
    pattern = rule.get("pattern") or ""
    content_lower = content.lower()

    if trigger == "always":
        return True
    if trigger == "keyword":
        return pattern.lower() in content_lower
    if trigger == "regex":
        try:
            return bool(re.search(pattern, content, re.IGNORECASE))
        except re.error:
            return False
    if trigger == "sentiment":
        # Lightweight heuristic: check for negative sentiment keywords
        # For production, replace with a real sentiment model call
        negative = ["angry", "furious", "terrible", "awful", "worst", "hate",
                    "cancel", "refund", "complaint", "unacceptable", "disgusting"]
        return any(w in content_lower for w in negative)
    return False


# ── AI reply generation ────────────────────────────────────────────────────────

async def generate_ai_reply(
    session: AsyncSession,
    schema: str,
    conversation: dict,
    inbound_message: str,
    rule: dict,
) -> Optional[str]:
    """
    Generate a reply using the org's GPT connection.
    Uses the agent assigned to the rule (if any) for its system prompt,
    otherwise falls back to a generic customer-support prompt.
    Returns the reply text or None on failure.
    """
    # Load GPT connection (prefer openai, then any active)
    conn_result = await session.execute(
        text(f"""
            SELECT * FROM "{schema}".gpt_connections
            WHERE is_active = TRUE
            ORDER BY CASE provider WHEN 'openai' THEN 0 WHEN 'anthropic' THEN 1 ELSE 2 END
            LIMIT 1
        """)
    )
    gpt_conn = conn_result.fetchone()
    if not gpt_conn:
        logger.warning("No active GPT connection for schema %s — cannot generate WhatsApp reply", schema)
        return None

    gpt = dict(gpt_conn._mapping)
    provider = gpt["provider"]
    try:
        api_key = decrypt_api_key(gpt["encrypted_api_key"])
    except Exception:
        logger.error("Failed to decrypt API key for schema %s", schema)
        return None

    model = gpt.get("model") or ("gpt-4o" if provider == "openai" else "claude-3-5-sonnet-20241022")

    # Resolve system prompt from agent (if rule has agent_id)
    system_prompt = (
        "You are a helpful customer support assistant responding via WhatsApp. "
        "Be concise, friendly, and professional. Reply in the same language the user used."
    )
    if rule.get("agent_id"):
        agent_result = await session.execute(
            text(f'SELECT system_prompt FROM "{schema}".agents WHERE id = CAST(:id AS UUID) AND is_active = TRUE'),
            {"id": str(rule["agent_id"])},
        )
        agent_row = agent_result.fetchone()
        if agent_row:
            system_prompt = agent_row[0]

    # Build conversation history (last 10 messages for context)
    history_result = await session.execute(
        text(f"""
            SELECT direction, content FROM "{schema}".whatsapp_messages
            WHERE conversation_id = CAST(:cid AS UUID)
            ORDER BY created_at DESC LIMIT 10
        """),
        {"cid": str(conversation["id"])},
    )
    history = list(reversed(history_result.fetchall()))
    messages = []
    for row in history:
        role = "user" if row[0] == "inbound" else "assistant"
        messages.append({"role": role, "content": row[1]})
    # Ensure the current inbound message is included
    if not messages or messages[-1]["content"] != inbound_message:
        messages.append({"role": "user", "content": inbound_message})

    try:
        if provider == "openai":
            return await _call_openai(api_key, model, system_prompt, messages)
        elif provider == "anthropic":
            return await _call_anthropic(api_key, model, system_prompt, messages)
        else:
            logger.warning("Provider %s not supported for WhatsApp AI replies", provider)
            return None
    except Exception as e:
        logger.error("AI reply generation failed: %s", e)
        return None


async def _call_openai(api_key: str, model: str, system_prompt: str, messages: list[dict]) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "system", "content": system_prompt}] + messages,
                "max_tokens": 500,
                "temperature": 0.7,
            },
        )
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"].strip()


async def _call_anthropic(api_key: str, model: str, system_prompt: str, messages: list[dict]) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "system": system_prompt,
                "messages": messages,
                "max_tokens": 500,
            },
        )
        res.raise_for_status()
        return res.json()["content"][0]["text"].strip()


# ── Core webhook processor ─────────────────────────────────────────────────────

async def process_incoming_webhook(
    session: AsyncSession,
    schema: str,
    account: dict,
    wa_contact_id: str,
    contact_name: str,
    contact_phone: str,
    wa_message_id: str,
    content: str,
) -> None:
    """
    Full pipeline for one inbound WhatsApp message:
    1. Upsert conversation record
    2. Store inbound message
    3. Check intervention rules
    4. Optionally generate and send AI reply
    """
    # 1. Upsert conversation
    conv_result = await session.execute(
        text(f"""
            INSERT INTO "{schema}".whatsapp_conversations
                (account_id, wa_contact_id, contact_name, contact_phone, last_message_at)
            VALUES (CAST(:account_id AS UUID), :wa_contact_id, :contact_name, :contact_phone, NOW())
            ON CONFLICT (account_id, wa_contact_id)
            DO UPDATE SET
                contact_name = EXCLUDED.contact_name,
                last_message_at = NOW()
            RETURNING *
        """),
        {
            "account_id": str(account["id"]),
            "wa_contact_id": wa_contact_id,
            "contact_name": contact_name,
            "contact_phone": contact_phone,
        },
    )
    conversation = dict(conv_result.fetchone()._mapping)

    # 2. Store inbound message (check for duplicate wa_message_id)
    dup = await session.execute(
        text(f'SELECT id FROM "{schema}".whatsapp_messages WHERE wa_message_id = :wmid'),
        {"wmid": wa_message_id},
    )
    if dup.fetchone():
        await session.commit()
        return  # already processed this message

    msg_result = await session.execute(
        text(f"""
            INSERT INTO "{schema}".whatsapp_messages
                (conversation_id, direction, content, wa_message_id, status)
            VALUES (CAST(:cid AS UUID), 'inbound', :content, :wmid, 'received')
            RETURNING *
        """),
        {"cid": str(conversation["id"]), "content": content, "wmid": wa_message_id},
    )
    inbound_msg = dict(msg_result.fetchone()._mapping)
    await session.commit()

    # 3. Check intervention rules
    rules = await get_active_rules(session, schema)
    matched_rule = next((r for r in rules if rule_matches(r, content)), None)

    if not matched_rule:
        return

    if matched_rule["action"] == "block":
        # Mark message as filtered, do not reply
        await session.execute(
            text(f"""
                UPDATE "{schema}".whatsapp_messages
                SET was_filtered = TRUE, filter_reason = :reason
                WHERE id = CAST(:mid AS UUID)
            """),
            {"reason": f"Rule '{matched_rule['name']}' blocked this message", "mid": str(inbound_msg["id"])},
        )
        await session.commit()
        return

    if matched_rule["action"] == "flag":
        # Just mark as filtered/flagged for admin review, no automatic reply
        await session.execute(
            text(f"""
                UPDATE "{schema}".whatsapp_messages
                SET was_filtered = TRUE, filter_reason = :reason
                WHERE id = CAST(:mid AS UUID)
            """),
            {"reason": f"Rule '{matched_rule['name']}' flagged this message for review", "mid": str(inbound_msg["id"])},
        )
        await session.commit()
        return

    # action == "reply"
    reply_text: Optional[str] = None

    if matched_rule.get("response_template"):
        reply_text = matched_rule["response_template"]
    else:
        reply_text = await generate_ai_reply(session, schema, conversation, content, matched_rule)

    if not reply_text:
        return

    # Decrypt access token and send the reply
    try:
        access_token = decrypt_api_key(account["access_token_encrypted"])
    except Exception:
        logger.error("Failed to decrypt WhatsApp access token for account %s", account["id"])
        return

    out_wa_id = await send_whatsapp_message(
        phone_number_id=account["phone_number_id"],
        to=contact_phone or wa_contact_id,
        text_body=reply_text,
        access_token=access_token,
    )

    out_status = "sent" if out_wa_id else "failed"

    # Store outbound message
    await session.execute(
        text(f"""
            INSERT INTO "{schema}".whatsapp_messages
                (conversation_id, direction, content, wa_message_id, status, ai_intervened)
            VALUES (CAST(:cid AS UUID), 'outbound', :content, :wmid, :status, TRUE)
        """),
        {
            "cid": str(conversation["id"]),
            "content": reply_text,
            "wmid": out_wa_id,
            "status": out_status,
        },
    )
    # Mark inbound message as AI-intervened
    await session.execute(
        text(f"""
            UPDATE "{schema}".whatsapp_messages
            SET ai_intervened = TRUE
            WHERE id = CAST(:mid AS UUID)
        """),
        {"mid": str(inbound_msg["id"])},
    )
    await session.commit()
