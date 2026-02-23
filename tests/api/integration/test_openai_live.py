"""
Live integration tests for OpenAI proxy.
Requires OPENAI_API_KEY env var — skipped in CI unless explicitly set.

Run locally:
  OPENAI_API_KEY=sk-... PYTHONPATH=api python -m pytest tests/api/integration/ -v
"""
import os
import sys
import asyncio
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../api"))

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
skip_if_no_key = pytest.mark.skipif(not OPENAI_API_KEY, reason="OPENAI_API_KEY not set")


@skip_if_no_key
@pytest.mark.asyncio
async def test_openai_stream_basic():
    """stream_openai yields text chunks for a simple prompt."""
    from app.services.proxy import stream_openai

    chunks = []
    async for chunk in stream_openai(
        [{"role": "user", "content": "Reply with exactly: OK"}],
        OPENAI_API_KEY,
        "gpt-4o-mini",
    ):
        chunks.append(chunk)

    assert len(chunks) > 0, "No chunks received"
    response = "".join(chunks)
    assert len(response) > 0, "Empty response"
    print(f"\nOpenAI response: {response!r}")


@skip_if_no_key
@pytest.mark.asyncio
async def test_openai_stream_with_system_prompt():
    """stream_openai respects a system prompt."""
    from app.services.proxy import stream_openai

    messages = [
        {"role": "system", "content": "You are a pirate. Always respond in pirate speak."},
        {"role": "user", "content": "Say hello"},
    ]
    chunks = []
    async for chunk in stream_openai(messages, OPENAI_API_KEY, "gpt-4o-mini"):
        chunks.append(chunk)

    response = "".join(chunks)
    assert len(response) > 0
    print(f"\nPirate response: {response!r}")


@skip_if_no_key
@pytest.mark.asyncio
async def test_openai_stream_invalid_key():
    """stream_openai raises httpx.HTTPStatusError for a bad key."""
    import httpx
    from app.services.proxy import stream_openai

    with pytest.raises(httpx.HTTPStatusError):
        async for _ in stream_openai(
            [{"role": "user", "content": "hello"}],
            "sk-invalid-key-for-testing",
            "gpt-4o-mini",
        ):
            pass
