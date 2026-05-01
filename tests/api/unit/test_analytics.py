"""
Unit tests for analytics.get_summary — mocks the DB session.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import date


def _scalar_result(value):
    result = MagicMock()
    result.scalar = MagicMock(return_value=value)
    return result


def _rows_result(rows):
    result = MagicMock()
    result.__iter__ = MagicMock(return_value=iter(rows))
    return result


@pytest.mark.asyncio
async def test_get_summary_returns_expected_structure():
    from app.services.analytics import get_summary

    session = AsyncMock()

    # Return values in order: total, blocked, active_sessions, active_users,
    # by_provider, by_day, top_blocked
    by_provider_row = MagicMock()
    by_provider_row.gpt_target = "openai"
    by_provider_row.count = 5

    by_day_row = MagicMock()
    by_day_row.day = date(2024, 1, 1)
    by_day_row.total = 10
    by_day_row.blocked = 2

    top_blocked_row = MagicMock()
    top_blocked_row.block_reason = "Matched keyword: badword"
    top_blocked_row.count = 3

    def make_result(value=None, rows=None):
        r = MagicMock()
        r.scalar = MagicMock(return_value=value)
        if rows is not None:
            r.__iter__ = MagicMock(return_value=iter(rows))
        return r

    session.execute = AsyncMock(side_effect=[
        make_result(100),                      # total
        make_result(10),                       # blocked
        make_result(20),                       # active_sessions
        make_result(15),                       # active_users
        make_result(rows=[by_provider_row]),   # by_provider
        make_result(rows=[by_day_row]),        # by_day
        make_result(rows=[top_blocked_row]),   # top_blocked
    ])

    result = await get_summary(session, days=30)

    assert result["total_messages"] == 100
    assert result["blocked_messages"] == 10
    assert result["active_sessions"] == 20
    assert result["active_users"] == 15
    assert result["messages_by_provider"] == {"openai": 5}
    assert len(result["messages_by_day"]) == 1
    assert result["messages_by_day"][0]["day"] == "2024-01-01"
    assert result["messages_by_day"][0]["total"] == 10
    assert result["top_blocked_rules"][0]["reason"] == "Matched keyword: badword"


@pytest.mark.asyncio
async def test_get_summary_empty_db():
    from app.services.analytics import get_summary

    session = AsyncMock()

    def make_result(value=None, rows=None):
        r = MagicMock()
        r.scalar = MagicMock(return_value=value)
        if rows is not None:
            r.__iter__ = MagicMock(return_value=iter(rows))
        return r

    session.execute = AsyncMock(side_effect=[
        make_result(0),
        make_result(0),
        make_result(0),
        make_result(0),
        make_result(rows=[]),
        make_result(rows=[]),
        make_result(rows=[]),
    ])

    result = await get_summary(session, days=30)
    assert result["total_messages"] == 0
    assert result["blocked_messages"] == 0
    assert result["messages_by_provider"] == {}
    assert result["messages_by_day"] == []
    assert result["top_blocked_rules"] == []
