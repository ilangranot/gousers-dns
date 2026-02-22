"""
Unit tests for Pydantic schema validation edge cases.
"""
import pytest
from pydantic import ValidationError


def test_filtering_rule_create_valid():
    from app.schemas.schemas import FilteringRuleCreate
    rule = FilteringRuleCreate(name="block-ssn", type="pii", pattern="ALL", action="block")
    assert rule.name == "block-ssn"
    assert rule.type == "pii"
    assert rule.action == "block"


def test_filtering_rule_create_invalid_type():
    from app.schemas.schemas import FilteringRuleCreate
    with pytest.raises(ValidationError):
        FilteringRuleCreate(name="test", type="invalid_type", action="block")


def test_filtering_rule_create_invalid_action():
    from app.schemas.schemas import FilteringRuleCreate
    with pytest.raises(ValidationError):
        FilteringRuleCreate(name="test", type="keyword", pattern="foo", action="explode")


def test_filtering_rule_create_optional_pattern():
    from app.schemas.schemas import FilteringRuleCreate
    rule = FilteringRuleCreate(name="semantic-test", type="semantic", action="block")
    assert rule.pattern is None


def test_gpt_connection_create_valid():
    from app.schemas.schemas import GPTConnectionCreate
    conn = GPTConnectionCreate(provider="openai", api_key="sk-test-123")
    assert conn.provider == "openai"
    assert conn.api_key == "sk-test-123"
    assert conn.model is None


def test_gpt_connection_create_invalid_provider():
    from app.schemas.schemas import GPTConnectionCreate
    with pytest.raises(ValidationError):
        GPTConnectionCreate(provider="grok", api_key="key")


def test_invitation_create_valid():
    from app.schemas.schemas import InvitationCreate
    inv = InvitationCreate(email="user@example.com", role="member")
    assert inv.email == "user@example.com"
    assert inv.role == "member"


def test_invitation_create_invalid_role():
    from app.schemas.schemas import InvitationCreate
    with pytest.raises(ValidationError):
        InvitationCreate(email="user@example.com", role="superuser")


def test_agent_create_defaults():
    from app.schemas.schemas import AgentCreate
    agent = AgentCreate(name="Bot", system_prompt="You are helpful.")
    assert agent.provider == "openai"
    assert agent.model is None
    assert agent.description is None


def test_chat_request_defaults():
    from app.schemas.schemas import ChatRequest
    req = ChatRequest(message="hello")
    assert req.gpt_target == "openai"
    assert req.session_id is None


def test_chat_request_invalid_target():
    from app.schemas.schemas import ChatRequest
    with pytest.raises(ValidationError):
        ChatRequest(message="hi", gpt_target="grok")


def test_user_role_update_valid():
    from app.schemas.schemas import UserRoleUpdate
    update = UserRoleUpdate(role="admin")
    assert update.role == "admin"


def test_user_role_update_invalid():
    from app.schemas.schemas import UserRoleUpdate
    with pytest.raises(ValidationError):
        UserRoleUpdate(role="superuser")
