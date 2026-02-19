import json
import httpx
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.security import decrypt_api_key

PROVIDER_DEFAULTS = {
    "openai": "gpt-4o",
    "anthropic": "claude-3-5-sonnet-20241022",
    "gemini": "gemini-1.5-pro",
}


async def get_connection(provider: str, session: AsyncSession, schema: str) -> dict:
    result = await session.execute(
        text(f'SELECT * FROM "{schema}".gpt_connections WHERE provider = :provider AND is_active = TRUE'),
        {"provider": provider},
    )
    row = result.fetchone()
    if not row:
        raise ValueError(f"No active API key configured for provider: {provider}")
    conn = dict(row._mapping)
    conn["api_key"] = decrypt_api_key(conn["encrypted_api_key"])
    return conn


async def stream_openai(messages: list[dict], api_key: str, model: str) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "stream": True},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        content = chunk["choices"][0]["delta"].get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError):
                        continue


async def stream_anthropic(messages: list[dict], api_key: str, model: str) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={"model": model, "messages": messages, "stream": True, "max_tokens": 4096},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    try:
                        event = json.loads(line[6:])
                        if event.get("type") == "content_block_delta":
                            yield event["delta"].get("text", "")
                    except (json.JSONDecodeError, KeyError):
                        continue


async def stream_gemini(messages: list[dict], api_key: str, model: str) -> AsyncGenerator[str, None]:
    # Convert to Gemini format
    contents = [{"role": m["role"] if m["role"] != "assistant" else "model", "parts": [{"text": m["content"]}]} for m in messages]
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={api_key}",
            json={"contents": contents},
        ) as response:
            response.raise_for_status()
            buffer = ""
            async for chunk in response.aiter_text():
                buffer += chunk
                try:
                    data = json.loads(buffer)
                    for candidate in data.get("candidates", []):
                        for part in candidate.get("content", {}).get("parts", []):
                            yield part.get("text", "")
                    buffer = ""
                except json.JSONDecodeError:
                    continue


STREAMERS = {
    "openai": stream_openai,
    "anthropic": stream_anthropic,
    "gemini": stream_gemini,
}


async def stream_gpt(
    provider: str,
    messages: list[dict],
    session: AsyncSession,
    schema: str,
    system_prompt: str | None = None,
) -> AsyncGenerator[str, None]:
    conn = await get_connection(provider, session, schema)
    model = conn.get("model") or PROVIDER_DEFAULTS[provider]
    streamer = STREAMERS[provider]

    final_messages = messages
    if system_prompt:
        final_messages = [{"role": "system", "content": system_prompt}] + messages

    async for chunk in streamer(final_messages, conn["api_key"], model):
        yield chunk
