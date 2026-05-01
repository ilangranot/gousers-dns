import json
import httpx
from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.security import decrypt_api_key

PROVIDER_DEFAULTS = {
    "openai": "gpt-4o",
    "anthropic": "claude-3-5-sonnet-20241022",
    "gemini": "gemini-1.5-pro",
}

_WEB_SEARCH_TOOL_OAI = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the web for current information: recent events, prices, statistics, "
            "competitor data, trends, or anything requiring up-to-date data."
        ),
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "The search query"}},
            "required": ["query"],
        },
    },
}


async def check_web_search_intent(
    provider: str,
    messages: list[dict],
    api_key: str,
    model: str,
) -> Optional[str]:
    """
    Non-streaming tool-check: ask the LLM if it needs a web search.
    Returns the search query string if yes, None otherwise.
    Only supports OpenAI and Anthropic; returns None for others.
    """
    if provider == "openai":
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": messages,
                    "tools": [_WEB_SEARCH_TOOL_OAI],
                    "tool_choice": "auto",
                    "max_tokens": 100,
                },
            )
            res.raise_for_status()
            data = res.json()
        choice = data["choices"][0]
        if choice.get("finish_reason") == "tool_calls":
            for tc in choice["message"].get("tool_calls", []):
                if tc["function"]["name"] == "web_search":
                    try:
                        return json.loads(tc["function"]["arguments"]).get("query", "")
                    except (json.JSONDecodeError, KeyError):
                        return None
        return None

    elif provider == "anthropic":
        tool_def = {
            "name": "web_search",
            "description": _WEB_SEARCH_TOOL_OAI["function"]["description"],
            "input_schema": _WEB_SEARCH_TOOL_OAI["function"]["parameters"],
        }
        # Anthropic messages can't start with system role inline; extract it
        system_text = ""
        filtered = []
        for m in messages:
            if m["role"] == "system":
                system_text += m["content"] + "\n"
            else:
                filtered.append(m)
        payload: dict = {
            "model": model,
            "max_tokens": 100,
            "messages": filtered,
            "tools": [tool_def],
            "tool_choice": {"type": "auto"},
        }
        if system_text:
            payload["system"] = system_text.strip()
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
                json=payload,
            )
            res.raise_for_status()
            data = res.json()
        for block in data.get("content", []):
            if block.get("type") == "tool_use" and block.get("name") == "web_search":
                return block.get("input", {}).get("query")
        return None

    return None  # Gemini, Ollama: skip


async def call_llm_simple(
    provider: str,
    messages: list[dict],
    api_key: str,
    model: str,
    max_tokens: int = 4096,
    system_prompt: Optional[str] = None,
) -> str:
    """Non-streaming call using pre-loaded credentials — no DB session needed."""
    final_messages = list(messages)
    if system_prompt is not None:
        final_messages = [{"role": "system", "content": system_prompt}] + messages

    if provider == "openai":
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "messages": final_messages, "max_tokens": max_tokens},
            )
            res.raise_for_status()
            return res.json()["choices"][0]["message"]["content"]

    elif provider == "anthropic":
        # Anthropic requires system as a top-level field, not inside messages
        sys_parts: list[str] = []
        filtered = []
        for m in final_messages:
            if m["role"] == "system":
                sys_parts.append(m["content"])
            else:
                filtered.append(m)
        payload: dict = {"model": model, "max_tokens": max_tokens, "messages": filtered}
        if sys_parts:
            payload["system"] = "\n".join(sys_parts)
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
                json=payload,
            )
            res.raise_for_status()
            return res.json()["content"][0]["text"]

    elif provider == "gemini":
        contents = [
            {"role": m["role"] if m["role"] != "assistant" else "model", "parts": [{"text": m["content"]}]}
            for m in final_messages if m["role"] != "system"
        ]
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                json={"contents": contents},
            )
            res.raise_for_status()
            return res.json()["candidates"][0]["content"]["parts"][0]["text"]

    else:
        raise ValueError(f"Provider {provider} not supported for call_llm_simple")


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


async def call_gpt(
    provider: str,
    messages: list[dict],
    session: AsyncSession,
    schema: str,
    system_prompt: Optional[str] = None,
) -> str:
    """Non-streaming single call — collects full response as a string."""
    conn = await get_connection(provider, session, schema)
    model = conn.get("model") or PROVIDER_DEFAULTS[provider]
    api_key = conn["api_key"]

    final_messages = messages
    if system_prompt:
        final_messages = [{"role": "system", "content": system_prompt}] + messages

    if provider == "openai":
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "messages": final_messages},
            )
            res.raise_for_status()
            return res.json()["choices"][0]["message"]["content"]

    elif provider == "anthropic":
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
                json={"model": model, "messages": final_messages, "max_tokens": 4096},
            )
            res.raise_for_status()
            return res.json()["content"][0]["text"]

    else:  # gemini
        contents = [{"role": m["role"] if m["role"] != "assistant" else "model", "parts": [{"text": m["content"]}]} for m in final_messages]
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                json={"contents": contents},
            )
            res.raise_for_status()
            return res.json()["candidates"][0]["content"]["parts"][0]["text"]


async def stream_gpt(
    provider: str,
    messages: list[dict],
    session: AsyncSession,
    schema: str,
    system_prompt: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    conn = await get_connection(provider, session, schema)
    model = conn.get("model") or PROVIDER_DEFAULTS[provider]
    streamer = STREAMERS[provider]

    final_messages = messages
    if system_prompt:
        final_messages = [{"role": "system", "content": system_prompt}] + messages

    async for chunk in streamer(final_messages, conn["api_key"], model):
        yield chunk
