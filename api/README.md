# GoUsers API

FastAPI backend for the GoUsers AI Gateway. Handles authentication, multi-tenant isolation, filtering, LLM proxying, and analytics.

## Stack

- **Framework**: FastAPI + uvicorn
- **Database**: PostgreSQL via asyncpg + SQLAlchemy async (schema-per-tenant)
- **Auth**: Clerk JWT verification (RS256 + JWKS)
- **Filtering**: Regex → Presidio NER → Ollama semantic (3 layers)
- **Tasks**: Celery + Redis (analytics, title generation, suggestions)
- **Encryption**: Fernet symmetric encryption for stored API keys

## Structure

```
api/
  app/
    api/
      deps.py          # Clerk JWT verify, get_org_context, require_staff
      routes/
        admin.py       # Filtering rules, GPT connections, users, agents
        analytics.py   # Summary + team analytics
        auth.py        # Invitation accept flow
        chat.py        # Session CRUD + streaming LLM proxy
        documents.py   # Org document upload/list
        invitations.py # Invitation create/revoke (Clerk API)
        settings.py    # Theme, logo, display name
        superadmin.py  # Cross-tenant staff dashboard
    core/
      config.py        # Pydantic settings (reads .env)
      database.py      # Engine, schema provisioning, get_db, get_tenant_session
      security.py      # Fernet encrypt/decrypt for API keys
    schemas/
      schemas.py       # Pydantic request/response models
    services/
      analytics.py     # record_event, get_summary
      filtering.py     # FilteringService (regex + Presidio + Ollama)
      llm.py           # Ollama client for semantic filtering
      presidio_service.py  # Presidio AnalyzerEngine wrapper
      proxy.py         # stream_openai / stream_anthropic / stream_gemini
      verticals.py     # System prompt builder from org docs
    workers/
      tasks.py         # Celery tasks: process_analytics, generate_suggestions
  Dockerfile.prod
  requirements.txt
```

## Local Development

Use python 3.12
```bash
# Install Python 3.12 if you don't have it
  brew install python@3.12

  # Recreate the venv with 3.12
  deactivate  # if venv is active
  rm -rf .venv
  python3.12 -m venv .venv
  source .venv/bin/activate

  # Install deps
  pip install -r requirements.txt

  # Then run as before:
  uvicorn app.main:app --reload --port 8000
  
  cat > /Users/ilangranot/work/gousers-v1/api/.env << 'EOF'
  DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/aigateway
  REDIS_URL=redis://localhost:6379
  ENCRYPTION_KEY
  EOF

  Then generate an encryption key and fill it in:
  source .venv/bin/activate
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

  If you don't have Postgres locally, the easiest option is Docker:
  docker run -d --name pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=aigateway -p 5432:5432 postgres:16
  docker run -d --name redis -p 6379:6379 redis:7
```


```bash
cd api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Requires environment variables (see `api/.env.example`):
- `DATABASE_URL` — PostgreSQL asyncpg URL
- `REDIS_URL` — Redis URL
- `CLERK_SECRET_KEY` — Clerk secret key
- `ENCRYPTION_KEY` — Fernet key (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)

## Running Tests

```bash
pip install -r tests/requirements-test.txt
PYTHONPATH=api python -m pytest tests/api/ -v
```

## Key Patterns

- **Schema isolation**: every query uses schema-qualified table names (`"org_xxx".tablename`) to avoid `search_path` reset issues
- **Auto-provisioning**: org schema created on first authenticated request (no webhook needed)
- **Staff access**: set `STAFF_EMAILS=you@example.com` to grant super admin access
