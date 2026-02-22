"""
Functional tests for /analytics/summary and /analytics/team.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date


def _make_summary():
    return {
        "total_messages": 100,
        "blocked_messages": 10,
        "active_sessions": 20,
        "active_users": 15,
        "messages_by_provider": {"openai": 80, "anthropic": 20},
        "messages_by_day": [{"day": "2024-01-01", "total": 10, "blocked": 1}],
        "top_blocked_rules": [{"reason": "badword", "count": 5}],
    }


@pytest.mark.asyncio
async def test_analytics_summary(client):
    with patch("app.api.routes.analytics.get_summary", new=AsyncMock(return_value=_make_summary())), \
         patch("app.api.routes.analytics.get_tenant_session", new=AsyncMock(
             return_value=AsyncMock(close=AsyncMock())
         )):
        resp = await client.get("/analytics/summary?days=30")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_messages"] == 100
    assert data["blocked_messages"] == 10
    assert "messages_by_provider" in data


@pytest.mark.asyncio
async def test_analytics_summary_default_days(client):
    with patch("app.api.routes.analytics.get_summary", new=AsyncMock(return_value=_make_summary())), \
         patch("app.api.routes.analytics.get_tenant_session", new=AsyncMock(
             return_value=AsyncMock(close=AsyncMock())
         )):
        resp = await client.get("/analytics/summary")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_analytics_team(client):
    fake_row = MagicMock()
    fake_row._mapping = {
        "id": "00000000-0000-0000-0000-000000000002",
        "email": "admin@example.com",
        "role": "admin",
        "message_count": 50,
        "blocked_count": 5,
        "session_count": 10,
        "block_rate_pct": 10.0,
    }
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([fake_row])),
    ))
    session.close = AsyncMock()
    with patch("app.api.routes.analytics.get_tenant_session", return_value=session):
        resp = await client.get("/analytics/team?days=30")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
