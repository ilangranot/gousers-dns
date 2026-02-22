"""
Functional tests for admin routes (filtering rules, GPT connections, users).
Mocks get_tenant_session since admin routes call it directly.
"""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


def _fake_row(**kwargs):
    row = MagicMock()
    row._mapping = kwargs
    return row


def _session_with_rows(*rows):
    """Return a mock session whose execute() returns the given rows."""
    result = MagicMock()
    result.fetchone = MagicMock(return_value=_fake_row(**rows[0]) if rows else None)
    result.__iter__ = MagicMock(return_value=iter([_fake_row(**r) for r in rows]))
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    session.close = AsyncMock()
    return session


# ── Filtering Rules ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_filtering_rules_empty(client):
    empty_session = _session_with_rows()
    empty_session.execute = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([])),
        fetchone=MagicMock(return_value=None),
    ))
    with patch("app.core.database.get_tenant_session", return_value=empty_session):
        resp = await client.get("/admin/filtering-rules")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_filtering_rule(client):
    rule_id = str(uuid.uuid4())
    fake_row = {
        "id": rule_id, "name": "block-ssn", "type": "pii",
        "pattern": "ALL", "action": "block", "priority": 0,
        "is_active": True, "created_at": "2024-01-01T00:00:00",
    }
    session = _session_with_rows(fake_row)
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.post("/admin/filtering-rules", json={
            "name": "block-ssn", "type": "pii", "pattern": "ALL", "action": "block",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "block-ssn"
    assert data["type"] == "pii"


@pytest.mark.asyncio
async def test_create_filtering_rule_invalid_type(client):
    resp = await client.post("/admin/filtering-rules", json={
        "name": "bad", "type": "invalid", "action": "block",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_filtering_rule(client):
    rule_id = str(uuid.uuid4())
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.close = AsyncMock()
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.delete(f"/admin/filtering-rules/{rule_id}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


# ── GPT Connections ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_gpt_connections_empty(client):
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([])),
    ))
    session.close = AsyncMock()
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.get("/admin/gpt-connections")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_upsert_gpt_connection(client):
    conn_id = str(uuid.uuid4())
    fake_row = {
        "id": conn_id, "provider": "openai", "model": "gpt-4o",
        "is_active": True, "created_at": "2024-01-01T00:00:00",
    }
    session = _session_with_rows(fake_row)
    with patch("app.core.database.get_tenant_session", return_value=session), \
         patch("app.api.routes.admin.encrypt_api_key", return_value="encrypted-key"):
        resp = await client.post("/admin/gpt-connections", json={
            "provider": "openai", "api_key": "sk-real-key", "model": "gpt-4o",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "openai"


@pytest.mark.asyncio
async def test_delete_gpt_connection(client):
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.close = AsyncMock()
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.delete("/admin/gpt-connections/openai")
    assert resp.status_code == 200


# ── User Management ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_users(client):
    user_id = str(uuid.uuid4())
    fake_row = {
        "id": user_id, "clerk_user_id": "user_abc",
        "email": "test@example.com", "role": "member",
        "created_at": "2024-01-01T00:00:00",
    }
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([_fake_row(**fake_row)])),
    ))
    session.close = AsyncMock()
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.get("/admin/users")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_remove_user(client):
    user_id = str(uuid.uuid4())
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.close = AsyncMock()
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.delete(f"/admin/users/{user_id}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_member_cannot_access_admin(member_client):
    """Members should be rejected from admin endpoints (403)."""
    from app.api.deps import require_admin
    from app.main import app

    # Remove admin override so require_admin runs real check
    app.dependency_overrides.pop(require_admin, None)
    resp = await member_client.get("/admin/filtering-rules")
    assert resp.status_code == 403
