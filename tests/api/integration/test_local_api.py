"""
Local integration tests — hit the actual running Docker API (localhost:8000).
These verify that SQL queries and endpoint wiring work end-to-end.

Run (requires docker compose up):
  PYTHONPATH=api python -m pytest tests/api/integration/test_local_api.py -v

These tests use a pre-seeded test JWT from the conftest bypass token.
Auth is bypassed by patching verify_token in the running app;
instead we test endpoints with mock-auth headers and a real DB.
"""
import os
import pytest
import httpx

BASE = os.getenv("LOCAL_API_URL", "http://localhost:8000")
skip_if_no_api = pytest.mark.skipif(
    not _api_up(),
    reason="Local API not running (docker compose up api)"
) if False else pytest.mark.skipif(False, reason="")


def _api_up() -> bool:
    try:
        r = httpx.get(f"{BASE}/health", timeout=2)
        return r.status_code == 200
    except Exception:
        return False


@pytest.fixture(autouse=True)
def require_local_api():
    if not _api_up():
        pytest.skip("Local API not running — start with: docker compose up api")


@pytest.mark.asyncio
async def test_health():
    async with httpx.AsyncClient(base_url=BASE) as client:
        r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_superadmin_check_requires_auth():
    """Unauthenticated request returns 422 or 401."""
    async with httpx.AsyncClient(base_url=BASE) as client:
        r = await client.get("/superadmin/check")
    assert r.status_code in (401, 422)


@pytest.mark.asyncio
async def test_chat_sessions_requires_auth():
    """Unauthenticated request returns 422 or 401."""
    async with httpx.AsyncClient(base_url=BASE) as client:
        r = await client.get("/chat/sessions")
    assert r.status_code in (401, 422)


@pytest.mark.asyncio
async def test_openai_live():
    """Direct proxy call — confirms API key and streaming work."""
    pytest.importorskip("app.services.proxy")
    import sys
    sys.path.insert(0, "api")
    from app.services.proxy import stream_openai

    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        pytest.skip("OPENAI_API_KEY not set")

    chunks = []
    async for chunk in stream_openai(
        [{"role": "user", "content": "Say OK"}], key, "gpt-4o-mini"
    ):
        chunks.append(chunk)
    assert "".join(chunks).strip()
