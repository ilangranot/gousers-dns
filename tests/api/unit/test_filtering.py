"""
Unit tests for FilteringService logic.
No HTTP, no DB — pure function testing.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.filtering import (
    FilteringService,
    FilterResult,
    _detect_pii_regex,
    _redact_regex,
)


# ── _detect_pii_regex ─────────────────────────────────────────────────────────

def test_pii_regex_detects_email():
    result = _detect_pii_regex("Contact me at user@example.com please", "ALL")
    assert result is not None
    assert "email address" in result


def test_pii_regex_detects_ssn():
    result = _detect_pii_regex("My SSN is 123-45-6789", "ALL")
    assert result is not None
    assert "US SSN" in result


def test_pii_regex_detects_phone():
    result = _detect_pii_regex("Call me at 555-123-4567", "ALL")
    assert result is not None
    assert "phone number" in result


def test_pii_regex_clean_message():
    result = _detect_pii_regex("Hello world, this is a clean message.", "ALL")
    assert result is None


def test_pii_regex_specific_type_match():
    result = _detect_pii_regex("email: user@test.com", "email address")
    assert result is not None


def test_pii_regex_specific_type_no_match():
    # Ask only for SSN, but content has an email
    result = _detect_pii_regex("email: user@test.com", "US SSN")
    assert result is None


# ── _redact_regex ─────────────────────────────────────────────────────────────

def test_redact_email():
    text = "Send to user@example.com"
    redacted = _redact_regex(text, "email address")
    assert "user@example.com" not in redacted
    assert "[EMAIL_ADDRESS]" in redacted


def test_redact_ssn():
    text = "SSN: 123-45-6789"
    redacted = _redact_regex(text, "US SSN")
    assert "123-45-6789" not in redacted
    assert "[US_SSN]" in redacted


# ── FilteringService.evaluate ─────────────────────────────────────────────────

@pytest.fixture
def service():
    return FilteringService()


def _make_rule(**kwargs):
    defaults = {
        "id": "rule-1",
        "name": "test",
        "type": "keyword",
        "pattern": None,
        "action": "block",
        "priority": 0,
        "is_active": True,
    }
    defaults.update(kwargs)
    return defaults


@pytest.mark.asyncio
async def test_evaluate_no_rules_returns_allow(service):
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(fetchall=lambda: []))

    # Patch load_rules to return empty list
    service.load_rules = AsyncMock(return_value=[])
    result = await service.evaluate("hello world", session, "org_test")
    assert result.action == "allow"


@pytest.mark.asyncio
async def test_evaluate_keyword_block(service):
    session = AsyncMock()
    rules = [_make_rule(type="keyword", pattern="badword", action="block")]
    service.load_rules = AsyncMock(return_value=rules)

    result = await service.evaluate("this message contains badword here", session, "org_test")
    assert result.action == "block"
    assert "badword" in (result.reason or "")


@pytest.mark.asyncio
async def test_evaluate_keyword_case_insensitive(service):
    session = AsyncMock()
    rules = [_make_rule(type="keyword", pattern="BADWORD", action="block")]
    service.load_rules = AsyncMock(return_value=rules)

    result = await service.evaluate("this contains badword", session, "org_test")
    assert result.action == "block"


@pytest.mark.asyncio
async def test_evaluate_keyword_miss(service):
    session = AsyncMock()
    rules = [_make_rule(type="keyword", pattern="forbidden", action="block")]
    service.load_rules = AsyncMock(return_value=rules)

    result = await service.evaluate("totally clean message", session, "org_test")
    assert result.action == "allow"


@pytest.mark.asyncio
async def test_evaluate_regex_block(service):
    session = AsyncMock()
    rules = [_make_rule(type="regex", pattern=r"\b\d{4}-\d{4}\b", action="block", name="code-pattern")]
    service.load_rules = AsyncMock(return_value=rules)

    result = await service.evaluate("Code: 1234-5678", session, "org_test")
    assert result.action == "block"


@pytest.mark.asyncio
async def test_evaluate_pii_email_block(service):
    session = AsyncMock()
    rules = [_make_rule(type="pii", pattern="ALL", action="block")]
    service.load_rules = AsyncMock(return_value=rules)

    result = await service.evaluate("Reach me at hacker@evil.com", session, "org_test")
    assert result.action == "block"
    assert result.reason is not None


@pytest.mark.asyncio
async def test_evaluate_pii_email_modify(service):
    session = AsyncMock()
    rules = [_make_rule(type="pii", pattern="ALL", action="modify")]
    service.load_rules = AsyncMock(return_value=rules)

    result = await service.evaluate("Email: user@example.com", session, "org_test")
    assert result.action == "modify"
    assert result.modified_content is not None
    assert "user@example.com" not in (result.modified_content or "")


@pytest.mark.asyncio
async def test_evaluate_invalid_regex_skipped(service):
    """An invalid regex pattern should not crash the evaluation."""
    session = AsyncMock()
    rules = [_make_rule(type="regex", pattern="[invalid(", action="block")]
    service.load_rules = AsyncMock(return_value=rules)

    result = await service.evaluate("test message", session, "org_test")
    assert result.action == "allow"
