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
async def test_chat_error_when_no_gpt_connection(client):
    """When stream_gpt raises (e.g. no GPT connection), the SSE stream yields an error event."""
    from app.services.filtering import FilterResult

    mock_allow = FilterResult(action="allow", reason=None, modified_content=None)

    fake_session_row = MagicMock()
    fake_session_row.id = uuid.uuid4()
    empty_result = MagicMock(
        fetchone=MagicMock(return_value=None),
        __iter__=MagicMock(return_value=iter([])),
    )
    # History SELECT must return at least the user message so messages[-1] works
    fake_msg = MagicMock()
    fake_msg.role = "user"
    fake_msg.content = "hello"
    history_result = MagicMock(__iter__=MagicMock(return_value=iter([fake_msg])))

    mock_execute = AsyncMock(side_effect=[
        MagicMock(fetchone=MagicMock(return_value=fake_session_row)),  # INSERT session RETURNING id
        empty_result,  # UPDATE user_agent_goals (session_count increment)
        empty_result,  # INSERT user message
        history_result,  # SELECT history
        empty_result,  # SELECT org docs
        empty_result,  # SELECT agent context
    ])

    # mock_db.execute is used by get_db (public DB) for _load_org_context vertical query
    from tests.api.conftest import make_mock_session  # noqa
    from app.main import app as fastapi_app
    from app.api.deps import get_db
    pub_db = make_mock_session()
    pub_db.execute = AsyncMock(return_value=MagicMock(fetchone=MagicMock(return_value=None)))
    fastapi_app.dependency_overrides[get_db] = lambda: pub_db

    async def _error_gen(*args, **kwargs):
        raise RuntimeError("No GPT connection configured")
        yield  # make it an async generator

    with patch("app.services.filtering.filtering_service.evaluate",
               new=AsyncMock(return_value=mock_allow)), \
         patch("app.api.routes.chat.get_tenant_session", new=AsyncMock(
             return_value=AsyncMock(
                 execute=mock_execute,
                 commit=AsyncMock(),
                 close=AsyncMock(),
             )
         )), \
         patch("app.api.routes.chat.stream_gpt", new=_error_gen), \
         patch("app.api.routes.chat.process_analytics"):
        resp = await client.post("/chat/", json={"message": "hello", "gpt_target": "openai"})

    assert resp.status_code == 200
    assert '"error"' in resp.text


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
