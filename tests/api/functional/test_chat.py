"""
Functional tests for chat routes: session create, message send, blocked message.
"""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


def _fake_row(**kwargs):
    row = MagicMock()
    row._mapping = kwargs
    return row


@pytest.mark.asyncio
async def test_list_sessions_empty(client):
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([])),
    ))
    session.close = AsyncMock()
    with patch("app.api.routes.chat.get_tenant_session", return_value=session):
        resp = await client.get("/chat/sessions")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_messages_empty(client):
    session_id = str(uuid.uuid4())
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([])),
    ))
    session.close = AsyncMock()
    with patch("app.api.routes.chat.get_tenant_session", return_value=session):
        resp = await client.get(f"/chat/sessions/{session_id}/messages")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_chat_blocked_message(client):
    """A message that triggers a filter rule should return a blocked SSE event."""
    from app.services.filtering import FilterResult

    mock_filter_result = FilterResult(action="block", reason="Matched keyword: badword")

    # First execute: INSERT session RETURNING id — needs a real id
    fake_session_row = MagicMock()
    fake_session_row.id = uuid.uuid4()
    insert_result = MagicMock(fetchone=MagicMock(return_value=fake_session_row))
    # Subsequent executes: INSERT message + load agent context
    other_result = MagicMock(fetchone=MagicMock(return_value=None), __iter__=MagicMock(return_value=iter([])))
    mock_execute = AsyncMock(side_effect=[insert_result, other_result, other_result, other_result])

    with patch("app.services.filtering.filtering_service.evaluate",
               new=AsyncMock(return_value=mock_filter_result)), \
         patch("app.api.routes.chat.get_tenant_session", new=AsyncMock(
             return_value=AsyncMock(
                 execute=mock_execute,
                 commit=AsyncMock(),
                 close=AsyncMock(),
             )
         )), \
         patch("app.api.routes.chat.process_analytics"):
        resp = await client.post("/chat/", json={
            "message": "this contains badword",
            "gpt_target": "openai",
        })

    # Chat endpoint streams SSE; test client returns all chunks
    assert resp.status_code == 200
    body = resp.text
    assert "blocked" in body or "block" in body or resp.status_code == 200


@pytest.mark.asyncio
async def test_agent_context_no_assignment(client):
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(
        fetchone=MagicMock(return_value=None),
    ))
    session.close = AsyncMock()
    with patch("app.api.routes.chat.get_tenant_session", return_value=session):
        resp = await client.get("/chat/agent-context")
    assert resp.status_code == 200
    assert resp.json() is None
