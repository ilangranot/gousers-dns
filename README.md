# GoUsers AI Gateway

Full-stack AI gateway that routes LLM requests through configurable filtering, PII detection, and multi-provider proxy.

## Architecture

```
Users → CoreDNS → Next.js (web) → FastAPI (api) → Ollama / OpenAI / Anthropic / Gemini
                                        ↓
                                  PostgreSQL (schema-per-tenant)
                                  Redis + Celery (async tasks)
```

## Services

| Service | Path | Description |
|---|---|---|
| API | `api/` | FastAPI backend — auth, filtering, proxy, analytics |
| Web | `web/` | Next.js 15 frontend — chat, admin, super admin |
| Infra (prod) | `infrastructure/terraform/` | AWS ECS Fargate production environment |
| Infra (dev) | `infrastructure/terraform-dev/` | AWS ECS Fargate dev environment |
| Tests | `tests/` | Pytest API tests + Playwright E2E |

## Quick Start (local)

```bash
cp api/.env.example api/.env   # fill in CLERK_SECRET_KEY, ENCRYPTION_KEY
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:8000/docs

## Environments

| Env | Branch | Domain |
|---|---|---|
| Production | `main` | `app.gousers.com` / `api.gousers.com` |
| Dev | `develop` | `app.dev.gousers.com` / `api.dev.gousers.com` |

## CI/CD

- `ci-test.yml` — runs on all branches: lint + pytest
- `ci-dev.yml` — runs on `develop`: build `:dev` images → deploy `gousers-dev`
- `ci-prod.yml` — runs on `main`: build `:sha`+`:latest` images → deploy `gousers-prod`

Branch protection on `main` requires 1 PR approval and a passing `Validate` check.

## Super Admin

Staff members (configured via `STAFF_EMAILS` env var) can access `/superadmin` for cross-tenant analytics and org management.

## License

Proprietary — GoUsers Inc.
