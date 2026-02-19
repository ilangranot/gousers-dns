from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy import text
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_size=20, max_overflow=10)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def get_tenant_session(org_schema: str) -> AsyncSession:
    session = AsyncSessionLocal()
    await session.execute(text(f'SET search_path TO "{org_schema}", public'))
    return session


async def get_task_session(org_schema: str) -> AsyncSession:
    """Fork-safe session for Celery tasks: uses NullPool so no connections are shared across processes."""
    task_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    factory = async_sessionmaker(task_engine, class_=AsyncSession, expire_on_commit=False)
    session = factory()
    await session.execute(text(f'SET search_path TO "{org_schema}", public'))
    return session


# SQL to provision a new org schema with all required tables
TENANT_SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS "{schema}";

CREATE TABLE IF NOT EXISTS "{schema}".users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
    title TEXT,
    gpt_target TEXT NOT NULL DEFAULT 'openai',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES "{schema}".sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    was_blocked BOOLEAN DEFAULT FALSE,
    block_reason TEXT,
    gpt_target TEXT,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".filtering_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    pattern TEXT,
    action TEXT NOT NULL DEFAULT 'block',
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".gpt_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    model TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider)
);

CREATE TABLE IF NOT EXISTS "{schema}".analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES "{schema}".sessions(id) ON DELETE SET NULL,
    user_id UUID REFERENCES "{schema}".users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{{}}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".org_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    content_text TEXT NOT NULL,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_created_at_{schema} ON "{schema}".analytics_events(created_at);
CREATE INDEX IF NOT EXISTS messages_session_id_{schema} ON "{schema}".messages(session_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_{schema} ON "{schema}".sessions(user_id);
"""

PUBLIC_SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_org_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    schema_name TEXT UNIQUE NOT NULL,
    theme TEXT NOT NULL DEFAULT 'midnight',
    logo_base64 TEXT,
    org_display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'midnight';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_base64 TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS org_display_name TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS vertical TEXT NOT NULL DEFAULT 'general';
"""


async def provision_org_schema(schema: str):
    async with engine.begin() as conn:
        sql = TENANT_SCHEMA_SQL.format(schema=schema)
        for stmt in sql.split(";"):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(text(stmt))


async def _migrate_existing_schemas(conn):
    """Apply new tables/columns to all schemas that already exist."""
    result = await conn.execute(text("SELECT schema_name FROM public.organizations"))
    schemas = [r[0] for r in result]
    for schema in schemas:
        # Add org_documents table if it doesn't exist yet
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}".org_documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                filename TEXT NOT NULL,
                content_text TEXT NOT NULL,
                file_size INTEGER,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))


async def init_db():
    async with engine.begin() as conn:
        for stmt in PUBLIC_SCHEMA_SQL.split(";"):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(text(stmt))
        # Migrate any schemas created before new tables were added
        await _migrate_existing_schemas(conn)
