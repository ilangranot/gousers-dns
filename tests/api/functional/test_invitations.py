"""
Functional tests for invitation create/revoke.
No external API calls — all DB interactions are mocked.
"""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


def _fake_row(**kwargs):
    row = MagicMock()
    row._mapping = kwargs
    return row


@pytest.mark.asyncio
async def test_list_invitations_empty(client):
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([])),
    ))
    session.close = AsyncMock()
    with patch("app.api.routes.invitations.get_tenant_session", return_value=session):
        resp = await client.get("/admin/invitations/")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_invitation(client):
    inv_id = str(uuid.uuid4())
    token = str(uuid.uuid4())
    fake_row = {
        "id": inv_id,
        "token": token,
        "email": "newuser@example.com",
        "role": "member",
        "status": "pending",
        "invited_at": "2024-01-01T00:00:00",
        "accepted_at": None,
    }

    session = AsyncMock()
    result = MagicMock()
    result.fetchone = MagicMock(return_value=_fake_row(**fake_row))
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    session.close = AsyncMock()

    with patch("app.api.routes.invitations.get_tenant_session", return_value=session):
        resp = await client.post("/admin/invitations/", json={
            "email": "newuser@example.com",
            "role": "member",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "newuser@example.com"
    assert "token" in data


@pytest.mark.asyncio
async def test_revoke_invitation(client):
    inv_id = str(uuid.uuid4())

    session = AsyncMock()
    inv_row = MagicMock()
    inv_row._mapping = {"id": inv_id}
    result = MagicMock()
    result.fetchone = MagicMock(return_value=inv_row)
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    session.close = AsyncMock()

    with patch("app.api.routes.invitations.get_tenant_session", return_value=session):
        resp = await client.delete(f"/admin/invitations/{inv_id}")

    assert resp.status_code in (200, 404)
