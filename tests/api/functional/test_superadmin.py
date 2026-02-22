"""
Functional tests for /superadmin/* endpoints.
- Staff client: should get 200
- Regular client: should get 403
"""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


def _fake_org_row():
    row = MagicMock()
    row._mapping = {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "clerk_org_id": "org_test",
        "name": "Test Org",
        "schema_name": "org_test",
        "created_at": None,
    }
    return row


def _empty_db():
    result = MagicMock()
    result.__iter__ = MagicMock(return_value=iter([]))
    result.fetchone = MagicMock(return_value=None)
    result.scalar = MagicMock(return_value=0)
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result)
    return session


# ── Staff access ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_overview_staff_access(staff_client):
    # First execute: list orgs (returns empty), subsequent: counts
    call_results = [
        # list orgs
        MagicMock(__iter__=MagicMock(return_value=iter([]))),
    ]
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=call_results)

    from app.api.deps import get_db
    from app.main import app
    app.dependency_overrides[get_db] = lambda: db

    resp = await staff_client.get("/superadmin/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_orgs" in data
    assert data["total_orgs"] == 0


@pytest.mark.asyncio
async def test_list_orgs_staff_access(staff_client):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([])),
    ))

    from app.api.deps import get_db
    from app.main import app
    app.dependency_overrides[get_db] = lambda: db

    resp = await staff_client.get("/superadmin/orgs")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_org_members_not_found(staff_client):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(
        fetchone=MagicMock(return_value=None),
    ))

    from app.api.deps import get_db
    from app.main import app
    app.dependency_overrides[get_db] = lambda: db

    resp = await staff_client.get("/superadmin/orgs/nonexistent-id/members")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_org_usage_not_found(staff_client):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(
        fetchone=MagicMock(return_value=None),
    ))

    from app.api.deps import get_db
    from app.main import app
    app.dependency_overrides[get_db] = lambda: db

    resp = await staff_client.get("/superadmin/orgs/nonexistent-id/usage")
    assert resp.status_code == 404


# ── Non-staff access blocked ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_overview_non_staff_blocked(client):
    """Regular admin users must not access superadmin endpoints."""
    resp = await client.get("/superadmin/overview")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_orgs_non_staff_blocked(client):
    resp = await client.get("/superadmin/orgs")
    assert resp.status_code == 403
