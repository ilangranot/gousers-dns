from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy import text
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_size=5, max_overflow=5)
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
    provider_user_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    usage_level TEXT NOT NULL DEFAULT 'beginner',
    is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES "{schema}".agents(id) ON DELETE SET NULL,
    title TEXT,
    gpt_target TEXT NOT NULL DEFAULT 'openai',
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
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

CREATE TABLE IF NOT EXISTS "{schema}".agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    agentic_instructions TEXT,
    provider TEXT NOT NULL DEFAULT 'openai',
    model TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".user_agent_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES "{schema}".agents(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT FALSE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS "{schema}".user_agent_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES "{schema}".agents(id) ON DELETE CASCADE,
    goals JSONB DEFAULT '[]',
    context_note TEXT DEFAULT '',
    style_preference TEXT DEFAULT 'balanced',
    session_count INTEGER DEFAULT 0,
    onboarding_completed_at TIMESTAMPTZ,
    last_checkin_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS "{schema}".invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'pending',
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "{schema}".agent_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES "{schema}".agents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    schedule_type TEXT NOT NULL DEFAULT 'interval',
    interval_value INTEGER,
    interval_unit TEXT DEFAULT 'hours',
    cron_day_of_week TEXT,
    cron_hour INTEGER,
    cron_minute INTEGER DEFAULT 0,
    target_type TEXT NOT NULL DEFAULT 'all',
    target_user_ids JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".user_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL,
    label TEXT,
    config JSONB DEFAULT '{{}}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES "{schema}".cards(id) ON DELETE CASCADE,
    origin_session_id UUID REFERENCES "{schema}".sessions(id) ON DELETE SET NULL,
    chat_session_id UUID REFERENCES "{schema}".sessions(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'task',
    title TEXT NOT NULL,
    fields JSONB DEFAULT '{{}}',
    notes TEXT DEFAULT '',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{schema}".agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES "{schema}".agents(id) ON DELETE SET NULL,
    goal TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    steps JSONB DEFAULT '[]',
    artifacts JSONB DEFAULT '{{}}',
    result TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_created_at_{schema} ON "{schema}".analytics_events(created_at);
CREATE INDEX IF NOT EXISTS messages_session_id_{schema} ON "{schema}".messages(session_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_{schema} ON "{schema}".sessions(user_id);
"""

PUBLIC_SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_key TEXT UNIQUE NOT NULL,
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
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS vertical_subcategory TEXT;

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.generated_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    html_content TEXT NOT NULL,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);
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
        # Rename clerk_user_id → provider_user_id if old column exists
        await conn.execute(text(f"""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='{schema}' AND table_name='users'
                           AND column_name='clerk_user_id') THEN
                    ALTER TABLE "{schema}".users RENAME COLUMN clerk_user_id TO provider_user_id;
                END IF;
            END $$
        """))
        # Rename clerk_invitation_id → token in invitations if old column exists
        await conn.execute(text(f"""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='{schema}' AND table_name='invitations'
                           AND column_name='clerk_invitation_id') THEN
                    ALTER TABLE "{schema}".invitations RENAME COLUMN clerk_invitation_id TO token;
                END IF;
            END $$
        """))
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
        # Add agents table
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}".agents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                description TEXT,
                system_prompt TEXT NOT NULL,
                agentic_instructions TEXT,
                provider TEXT NOT NULL DEFAULT 'openai',
                model TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        # Add agentic_instructions column to existing agents tables
        await conn.execute(text(f"""
            ALTER TABLE "{schema}".agents
            ADD COLUMN IF NOT EXISTS agentic_instructions TEXT
        """))
        # Add user_agent_assignments table
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}".user_agent_assignments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
                agent_id UUID NOT NULL REFERENCES "{schema}".agents(id) ON DELETE CASCADE,
                is_active BOOLEAN DEFAULT FALSE,
                assigned_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, agent_id)
            )
        """))
        # Migrate user_agent_assignments: drop old UNIQUE(user_id) → UNIQUE(user_id, agent_id)
        await conn.execute(text(f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE table_schema = '{schema}'
                      AND table_name = 'user_agent_assignments'
                      AND constraint_name = 'user_agent_assignments_user_id_key'
                ) THEN
                    ALTER TABLE "{schema}".user_agent_assignments
                        DROP CONSTRAINT user_agent_assignments_user_id_key;
                    ALTER TABLE "{schema}".user_agent_assignments
                        ADD CONSTRAINT user_agent_assignments_user_id_agent_id_key
                        UNIQUE(user_id, agent_id);
                END IF;
            END $$
        """))
        # Add is_active column to user_agent_assignments
        await conn.execute(text(f"""
            ALTER TABLE "{schema}".user_agent_assignments
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE
        """))
        # Add user_agent_goals table
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}".user_agent_goals (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
                agent_id UUID NOT NULL REFERENCES "{schema}".agents(id) ON DELETE CASCADE,
                goals JSONB DEFAULT '[]',
                context_note TEXT DEFAULT '',
                style_preference TEXT DEFAULT 'balanced',
                session_count INTEGER DEFAULT 0,
                onboarding_completed_at TIMESTAMPTZ,
                last_checkin_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, agent_id)
            )
        """))
        # Add invitations table
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}".invitations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                token TEXT UNIQUE NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'member',
                status TEXT NOT NULL DEFAULT 'pending',
                invited_at TIMESTAMPTZ DEFAULT NOW(),
                accepted_at TIMESTAMPTZ
            )
        """))
        # Add is_archived column to sessions table
        await conn.execute(text(f"""
            ALTER TABLE "{schema}".sessions
            ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE
        """))
        # Add agent_id column to sessions table
        await conn.execute(text(f"""
            ALTER TABLE "{schema}".sessions
            ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES "{schema}".agents(id) ON DELETE SET NULL
        """))
        # Add usage_level column to users table
        await conn.execute(text(f"""
            ALTER TABLE "{schema}".users
            ADD COLUMN IF NOT EXISTS usage_level TEXT NOT NULL DEFAULT 'beginner'
        """))
        # Add is_disabled column to users table
        await conn.execute(text(f"""
            ALTER TABLE "{schema}".users
            ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE
        """))
        # Add agent_schedules table
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}".agent_schedules (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                agent_id UUID NOT NULL REFERENCES "{schema}".agents(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                schedule_type TEXT NOT NULL DEFAULT 'interval',
                interval_value INTEGER,
                interval_unit TEXT DEFAULT 'hours',
                cron_day_of_week TEXT,
                cron_hour INTEGER,
                cron_minute INTEGER DEFAULT 0,
                target_type TEXT NOT NULL DEFAULT 'all',
                target_user_ids JSONB DEFAULT '[]',
                is_active BOOLEAN DEFAULT TRUE,
                last_run_at TIMESTAMPTZ,
                next_run_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        # Add user_connections table
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}".user_connections (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
                service_type TEXT NOT NULL,
                label TEXT,
                config JSONB DEFAULT '{{}}',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        # Add notes table
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}".notes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
                content TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        # Add cards table
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}".cards (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
                parent_id UUID REFERENCES "{schema}".cards(id) ON DELETE CASCADE,
                origin_session_id UUID REFERENCES "{schema}".sessions(id) ON DELETE SET NULL,
                chat_session_id UUID REFERENCES "{schema}".sessions(id) ON DELETE SET NULL,
                type TEXT NOT NULL DEFAULT 'task',
                title TEXT NOT NULL,
                fields JSONB DEFAULT '{{}}',
                notes TEXT DEFAULT '',
                is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        # Add agent_tasks table
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}".agent_tasks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE,
                agent_id UUID REFERENCES "{schema}".agents(id) ON DELETE SET NULL,
                goal TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                steps JSONB DEFAULT '[]',
                artifacts JSONB DEFAULT '{{}}',
                result TEXT,
                error TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))


async def init_db():
    async with engine.begin() as conn:
        for stmt in PUBLIC_SCHEMA_SQL.split(";"):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(text(stmt))
        # Rename clerk_org_id → org_key in public.organizations if old column exists
        await conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name='organizations'
                           AND column_name='clerk_org_id') THEN
                    ALTER TABLE public.organizations RENAME COLUMN clerk_org_id TO org_key;
                END IF;
            END $$
        """))
        # Migrate any schemas created before new tables were added
        await _migrate_existing_schemas(conn)
