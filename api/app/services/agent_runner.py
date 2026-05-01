"""
Agent runner: LLM tool-calling loop with web_search, store_artifact, human_action.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── Tool definitions (OpenAI format) ──────────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for up-to-date information. Use this before making any claim about "
                "current trends, keywords, competitors, prices, or recent events."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query to run"},
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return (1-10, default 5)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "store_artifact",
            "description": (
                "Save a completed piece of content (article, report, email, plan, etc.) as a named artifact. "
                "Call this immediately after producing each finished piece of content."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "Short identifier for this artifact (e.g. 'article_1', 'keywords')"},
                    "content": {"type": "string", "description": "The full content to store"},
                    "description": {"type": "string", "description": "One-line human-readable description of what this is"},
                },
                "required": ["key", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "human_action",
            "description": (
                "Pause the task and ask the human to perform a manual action they must complete themselves "
                "(e.g. logging into their CMS, publishing a file, entering credentials). "
                "Only call this when you literally cannot proceed without physical human access."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "instruction": {
                        "type": "string",
                        "description": (
                            "Exact step-by-step instructions for the human. Include specific menu paths, "
                            "copy-pasteable text, and precise button names."
                        ),
                    },
                    "expected_result": {
                        "type": "string",
                        "description": "What the agent expects to happen after the human completes this step",
                    },
                    "confirmation_prompt": {
                        "type": "string",
                        "description": "What to ask the human when they confirm completion",
                    },
                },
                "required": ["instruction"],
            },
        },
    },
]

# Anthropic format for the same tools
def _anthropic_tools() -> list[dict]:
    result = []
    for t in TOOLS:
        fn = t["function"]
        result.append({
            "name": fn["name"],
            "description": fn["description"],
            "input_schema": fn["parameters"],
        })
    return result


AGENT_SYSTEM_PROMPT = """You are an autonomous AI agent. Execute tasks completely and independently.

Rules:
- Use web_search BEFORE making any claim about current trends, keywords, competitors, prices, or recent events.
- Use store_artifact to save each completed piece of content immediately after producing it.
- Only call human_action when you literally cannot proceed without physical human access to their system, account, or browser.
- When calling human_action: give exact, copy-pasteable step-by-step instructions with specific menu paths and button names.
- After a human confirms, continue to the next step immediately without re-summarizing what was done.
- Produce COMPLETE deliverables — full articles, complete emails, full reports. Never just outlines or summaries.
- When all steps are complete, write a concise summary of exactly what was accomplished."""


# ── Normalize tool call results ────────────────────────────────────────────────

def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── OpenAI tool calling ────────────────────────────────────────────────────────

async def _call_openai(messages: list[dict], model: str, api_key: str) -> dict:
    payload = {
        "model": model,
        "messages": messages,
        "tools": TOOLS,
        "tool_choice": "auto",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    choice = data["choices"][0]
    msg = choice["message"]
    finish = choice.get("finish_reason", "")

    if finish == "tool_calls" and msg.get("tool_calls"):
        calls = []
        for tc in msg["tool_calls"]:
            try:
                inp = json.loads(tc["function"]["arguments"])
            except json.JSONDecodeError:
                inp = {}
            calls.append({"id": tc["id"], "name": tc["function"]["name"], "input": inp})
        return {"type": "tool_calls", "calls": calls, "raw_message": msg}
    else:
        return {"type": "final", "content": msg.get("content", "") or ""}


# ── Anthropic tool calling ─────────────────────────────────────────────────────

def _convert_messages_to_anthropic(messages: list[dict]) -> tuple[str, list[dict]]:
    """Convert OpenAI-format messages to Anthropic format. Returns (system_prompt, messages)."""
    system_parts = []
    converted = []

    for msg in messages:
        role = msg["role"]
        if role == "system":
            system_parts.append(msg["content"])
            continue

        if role == "user":
            # Could be plain text or tool_result content
            content = msg.get("content")
            if isinstance(content, str):
                converted.append({"role": "user", "content": content})
            else:
                # Already Anthropic-format content blocks
                converted.append({"role": "user", "content": content})

        elif role == "assistant":
            tool_calls = msg.get("tool_calls")
            if tool_calls:
                content_blocks = []
                if msg.get("content"):
                    content_blocks.append({"type": "text", "text": msg["content"]})
                for tc in tool_calls:
                    try:
                        inp = json.loads(tc["function"]["arguments"])
                    except (json.JSONDecodeError, TypeError):
                        inp = {}
                    content_blocks.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["function"]["name"],
                        "input": inp,
                    })
                converted.append({"role": "assistant", "content": content_blocks})
            else:
                converted.append({"role": "assistant", "content": msg.get("content", "")})

        elif role == "tool":
            # OpenAI tool result → Anthropic tool_result block
            tool_use_id = msg.get("tool_call_id", "")
            result_content = msg.get("content", "")
            # Must be attached to a "user" message
            if converted and converted[-1]["role"] == "user":
                # Append to existing user message
                existing = converted[-1]["content"]
                if isinstance(existing, str):
                    existing = [{"type": "text", "text": existing}]
                existing.append({"type": "tool_result", "tool_use_id": tool_use_id, "content": result_content})
                converted[-1]["content"] = existing
            else:
                converted.append({
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": result_content}],
                })

    return "\n\n".join(system_parts), converted


async def _call_anthropic(messages: list[dict], model: str, api_key: str) -> dict:
    system_prompt, anthropic_messages = _convert_messages_to_anthropic(messages)

    payload = {
        "model": model,
        "max_tokens": 8192,
        "tools": _anthropic_tools(),
        "messages": anthropic_messages,
    }
    if system_prompt:
        payload["system"] = system_prompt

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    stop_reason = data.get("stop_reason", "")
    content_blocks = data.get("content", [])

    tool_use_blocks = [b for b in content_blocks if b.get("type") == "tool_use"]
    text_blocks = [b for b in content_blocks if b.get("type") == "text"]

    if stop_reason == "tool_use" and tool_use_blocks:
        # Build a raw_message in OpenAI format for message history reconstruction
        tool_calls = [
            {
                "id": b["id"],
                "type": "function",
                "function": {"name": b["name"], "arguments": json.dumps(b["input"])},
            }
            for b in tool_use_blocks
        ]
        text_content = " ".join(b.get("text", "") for b in text_blocks)
        raw_message = {
            "role": "assistant",
            "content": text_content or None,
            "tool_calls": tool_calls,
        }
        calls = [{"id": b["id"], "name": b["name"], "input": b["input"]} for b in tool_use_blocks]
        return {"type": "tool_calls", "calls": calls, "raw_message": raw_message}
    else:
        final_text = " ".join(b.get("text", "") for b in text_blocks)
        return {"type": "final", "content": final_text}


# ── Public: call LLM with tools ───────────────────────────────────────────────

async def call_llm_with_tools(messages: list[dict], provider: str, model: str, api_key: str) -> dict:
    """
    Call the LLM with tool definitions.
    Returns:
      {"type": "tool_calls", "calls": [{id, name, input}], "raw_message": {...}}
    or
      {"type": "final", "content": "..."}
    """
    if provider == "anthropic":
        return await _call_anthropic(messages, model, api_key)
    else:
        # Default to OpenAI-compatible
        return await _call_openai(messages, model, api_key)


# ── Tool execution ─────────────────────────────────────────────────────────────

HUMAN_ACTION_SENTINEL = "__HUMAN_ACTION__"


def _format_search_results(query: str, results: list[dict], title_key="title", url_key="url", snippet_key="content") -> str:
    if not results:
        return f"No results found for: {query}"
    lines = [f"**Search results for: {query}**\n"]
    for i, r in enumerate(results, 1):
        title = r.get(title_key, "")
        url = r.get(url_key, "")
        snippet = r.get(snippet_key, "")
        lines.append(f"{i}. **{title}**\n   {url}\n   {snippet}\n")
    return "\n".join(lines)


async def _tavily_search(query: str, num_results: int, api_key: str) -> str:
    """Search via Tavily API (reliable, designed for AI agents)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": min(num_results, 10),
            },
        )
        resp.raise_for_status()
        data = resp.json()
    return _format_search_results(query, data.get("results", []))


async def _ddg_search(query: str, num_results: int) -> str:
    """DuckDuckGo search using html backend (lxml required) with retry."""
    import time
    import random

    def _search():
        from duckduckgo_search import DDGS
        # Try html → lite → api, each with one retry on rate-limit
        backends = ["html", "lite", "api"]
        last_err = None
        for backend in backends:
            for attempt in range(2):
                try:
                    results = list(DDGS().text(query, max_results=min(num_results, 10), backend=backend))
                    if results:
                        return _format_search_results(
                            query, results,
                            title_key="title", url_key="href", snippet_key="body",
                        )
                except Exception as e:
                    last_err = e
                    if attempt == 0:
                        time.sleep(random.uniform(2, 4))
        return f"Search error: {last_err}"

    return await asyncio.to_thread(_search)


async def _web_search(query: str, num_results: int = 5) -> str:
    """Search the web. Uses Tavily if TAVILY_API_KEY is set; otherwise DuckDuckGo."""
    from app.core.config import settings
    if settings.TAVILY_API_KEY:
        try:
            return await _tavily_search(query, num_results, settings.TAVILY_API_KEY)
        except Exception as e:
            logger.warning("Tavily search failed (%s), falling back to DuckDuckGo", e)
    return await _ddg_search(query, num_results)


async def execute_tool(
    name: str,
    inp: dict,
    task_id: str,
    schema_name: str,
    tenant: AsyncSession,
) -> str:
    """
    Execute a tool and return its result as a string.
    For human_action, returns HUMAN_ACTION_SENTINEL — caller must handle the pause.
    """
    if name == "web_search":
        query = inp.get("query", "")
        num = int(inp.get("num_results", 5))
        return await _web_search(query, num)

    elif name == "store_artifact":
        key = inp.get("key", f"artifact_{str(uuid4())[:8]}")
        content = inp.get("content", "")
        description = inp.get("description", "")
        # Merge into agent_tasks.artifacts JSONB
        await tenant.execute(
            text(f"""
                UPDATE "{schema_name}".agent_tasks
                SET artifacts = artifacts || jsonb_build_object(:key, :content),
                    updated_at = NOW()
                WHERE id = CAST(:task_id AS UUID)
            """),
            {"key": key, "content": content, "task_id": task_id},
        )
        await tenant.commit()
        desc_str = f" — {description}" if description else ""
        return f"Artifact '{key}' saved ({len(content)} chars){desc_str}"

    elif name == "human_action":
        return HUMAN_ACTION_SENTINEL

    else:
        return f"Unknown tool: {name}"


# ── Message history reconstruction ────────────────────────────────────────────

def build_messages_from_steps(goal: str, steps: list[dict], system_prompt: str) -> list[dict]:
    """
    Reconstruct the LLM message list from the stored steps array.
    Enables resumption after a human_action checkpoint.

    Step types:
      tool_call   — stores tool name, input, output (when done). Emits one assistant
                    message + one tool result.
      human_action — the paused call. Emits the assistant message; tool result comes
                    from a separate tool_result step added by the confirm endpoint.
      tool_result  — raw tool result (used for human_action confirmation).
      final        — task done, skip.
    """
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": goal},
    ]

    for step in steps:
        stype = step.get("type")
        tc_id = step.get("tool_call_id") or step.get("id", "")

        if stype == "tool_call":
            # Emit the assistant message for this call
            messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": tc_id,
                    "type": "function",
                    "function": {
                        "name": step.get("tool", ""),
                        "arguments": json.dumps(step.get("input") or {}),
                    },
                }],
            })
            # Emit the tool result if the call completed
            if step.get("status") == "done" and step.get("output") is not None:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": step["output"],
                })

        elif stype == "human_action":
            # Emit the assistant message for the human_action tool call.
            # The tool result (confirmation) is a separate tool_result step below.
            messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": tc_id,
                    "type": "function",
                    "function": {
                        "name": "human_action",
                        "arguments": json.dumps(step.get("input") or {}),
                    },
                }],
            })

        elif stype == "tool_result":
            # Raw tool result — used for human_action confirmation added by confirm endpoint
            messages.append({
                "role": "tool",
                "tool_call_id": step.get("tool_call_id", ""),
                "content": step.get("output", ""),
            })

        # final: skip — task is done

    return messages
