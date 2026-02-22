"""
Functional tests for agent CRUD and assignment endpoints.
"""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


def _fake_row(**kwargs):
    row = MagicMock()
    row._mapping = kwargs
    return row


def _session_returning(row_dict):
    result = MagicMock()
    result.fetchone = MagicMock(return_value=_fake_row(**row_dict) if row_dict else None)
    result.__iter__ = MagicMock(return_value=iter(
        [_fake_row(**row_dict)] if row_dict else []
    ))
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    session.close = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_list_agents_empty(client):
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([])),
    ))
    session.close = AsyncMock()
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.get("/admin/agents")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_agent(client):
    agent_id = str(uuid.uuid4())
    fake_row = {
        "id": agent_id,
        "name": "Support Bot",
        "description": "Handles support queries",
        "system_prompt": "You are a helpful support agent.",
        "provider": "openai",
        "model": "gpt-4o",
        "is_active": True,
        "created_at": "2024-01-01T00:00:00",
        "updated_at": "2024-01-01T00:00:00",
    }
    session = _session_returning(fake_row)
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.post("/admin/agents", json={
            "name": "Support Bot",
            "description": "Handles support queries",
            "system_prompt": "You are a helpful support agent.",
            "provider": "openai",
            "model": "gpt-4o",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Support Bot"
    assert data["provider"] == "openai"


@pytest.mark.asyncio
async def test_create_agent_missing_required_fields(client):
    resp = await client.post("/admin/agents", json={"name": "Bot"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_agent(client):
    agent_id = str(uuid.uuid4())
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.close = AsyncMock()
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.delete(f"/admin/agents/{agent_id}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


@pytest.mark.asyncio
async def test_list_assignments_empty(client):
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([])),
    ))
    session.close = AsyncMock()
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.get("/admin/agents/assignments")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_upsert_assignment(client):
    user_id = str(uuid.uuid4())
    agent_id = str(uuid.uuid4())
    assign_id = str(uuid.uuid4())
    fake_row = {
        "id": assign_id,
        "user_id": user_id,
        "agent_id": agent_id,
        "assigned_at": "2024-01-01T00:00:00",
    }
    session = _session_returning(fake_row)
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.put("/admin/agents/assignments", json={
            "user_id": user_id,
            "agent_id": agent_id,
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == user_id
    assert data["agent_id"] == agent_id


@pytest.mark.asyncio
async def test_remove_assignment(client):
    user_id = str(uuid.uuid4())
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.close = AsyncMock()
    with patch("app.core.database.get_tenant_session", return_value=session):
        resp = await client.delete(f"/admin/agents/assignments/{user_id}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
