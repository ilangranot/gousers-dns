"""
Shared fixtures for all API tests.

Approach:
- Use httpx.AsyncClient(app=app, base_url="http://test") for functional tests
- Mock verify_token to return fake JWT claims (bypasses JWT network/crypto)
- Mock get_db / get_tenant_session to return a mock AsyncSession
- Unit tests import service classes directly (no HTTP layer)
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


# ── Fake JWT claims ───────────────────────────────────────────────────────────

STAFF_CLAIMS = {
    "sub": "user_staff123",
    "email": "staff@gousers.com",
    "orgKey": None,
}

ADMIN_CLAIMS = {
    "sub": "user_admin456",
    "email": "admin@example.com",
    "orgKey": "org_test",
    "orgRole": "admin",
}

MEMBER_CLAIMS = {
    "sub": "user_member789",
    "email": "member@example.com",
    "orgKey": "org_test",
    "orgRole": "member",
}


# ── Mock DB session ───────────────────────────────────────────────────────────

def make_mock_session():
    """Return a mock AsyncSession that records calls."""
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.close = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    return session


@pytest.fixture
def mock_db():
    return make_mock_session()


# ── FastAPI test client fixture ───────────────────────────────────────────────

@pytest.fixture
def app():
    """Return the FastAPI app with mocked settings."""
    import os
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
    os.environ.setdefault("AUTH_SECRET", "test_secret_32chars_padding_here!!")
    os.environ.setdefault("ENCRYPTION_KEY", "oXFCyhEQRKxXBiMAMwXbVRITq_6lBResVjVwDQCusIM=")
    os.environ.setdefault("STAFF_EMAILS", "staff@gousers.com")

    # Patch init_db so the test app doesn't try to connect to a real DB on startup
    with patch("app.core.database.init_db", new=AsyncMock()):
        from app.main import app as fastapi_app
        return fastapi_app


@pytest.fixture
async def client(app, mock_db):
    """
    Async test client with:
    - verify_token overridden to return ADMIN_CLAIMS
    - get_db overridden to return the mock session
    - get_org_context overridden to return a fake OrgContext
    """
    from app.api.deps import verify_token, get_db, get_org_context
    from app.schemas.schemas import OrgContext
    import uuid

    fake_org_ctx = OrgContext(
        org_key="org_test",
        org_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        schema_name="org_test",
        provider_user_id="user_admin456",
        user_id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
        user_role="admin",
    )

    app.dependency_overrides[verify_token] = lambda: ADMIN_CLAIMS
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_org_context] = lambda: fake_org_ctx

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
async def staff_client(app, mock_db):
    """Client authenticated as a staff user (for superadmin tests)."""
    from app.api.deps import verify_token, get_db, get_org_context, require_staff
    from app.schemas.schemas import OrgContext
    import uuid

    fake_org_ctx = OrgContext(
        org_key="org_staff",
        org_id=uuid.UUID("00000000-0000-0000-0000-000000000010"),
        schema_name="org_staff",
        provider_user_id="user_staff123",
        user_id=uuid.UUID("00000000-0000-0000-0000-000000000011"),
        user_role="admin",
    )

    app.dependency_overrides[verify_token] = lambda: STAFF_CLAIMS
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_org_context] = lambda: fake_org_ctx
    app.dependency_overrides[require_staff] = lambda: STAFF_CLAIMS

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
async def member_client(app, mock_db):
    """Client authenticated as a regular member."""
    from app.api.deps import verify_token, get_db, get_org_context
    from app.schemas.schemas import OrgContext
    import uuid

    fake_org_ctx = OrgContext(
        org_key="org_test",
        org_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        schema_name="org_test",
        provider_user_id="user_member789",
        user_id=uuid.UUID("00000000-0000-0000-0000-000000000003"),
        user_role="member",
    )

    app.dependency_overrides[verify_token] = lambda: MEMBER_CLAIMS
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_org_context] = lambda: fake_org_ctx

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
