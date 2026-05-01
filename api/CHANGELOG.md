# API Changelog

## [0.0.1] - 2026-02-22

### Added
- FastAPI application with Clerk JWT authentication (RS256 + JWKS caching)
- Schema-per-tenant PostgreSQL isolation with auto-provisioning on first request
- Admin routes: filtering rules CRUD, GPT connection upsert/delete, user management
- Agent CRUD and user-agent assignment routes
- Chat routes: session management, streaming SSE proxy to OpenAI/Anthropic/Gemini/Ollama
- 3-layer filtering pipeline: regex keyword/PII → Presidio NER → Ollama semantic
- Analytics: `record_event`, `get_summary`, per-day breakdowns, top blocked rules
- Team analytics: org-level aggregated stats
- Invitations: create, list, revoke via Clerk API; accept flow in auth route
- Documents: upload and list per-org RAG documents
- Settings: theme, logo (S3), display name per org
- Fernet encryption for stored LLM API keys
- `require_staff()` dependency for super admin access control
- Super admin router: cross-tenant overview, org list, org members, org usage
- Celery tasks: `process_analytics`, `generate_suggestions`, `generate_session_title`
- `STAFF_EMAILS` config setting for staff email whitelist
- `extra = "ignore"` on pydantic Settings (allows NEXT_PUBLIC_* vars in .env)
- Python 3.9 compatible type annotations (Optional[X] instead of X | None)
