# Changelog

All notable changes to the GoUsers AI Gateway project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [0.0.1] - 2026-02-22

### Added
- Initial project: FastAPI backend + Next.js 15 frontend + CoreDNS routing
- Schema-per-tenant PostgreSQL with auto-provisioning on first request
- Multi-provider LLM proxy: OpenAI, Anthropic, Gemini, Ollama
- 3-layer filtering pipeline: regex → Presidio NER → Llama semantic
- Admin panel: filtering rules, GPT connections, user management, agents, team invitations
- Analytics: per-session and per-org message/blocked/provider stats
- Theming system with 5 built-in themes (midnight, ocean, forest, sunset, light)
- Super admin dashboard for internal staff (org overview, member lists, usage charts)
- Dev AWS environment (`*.dev.gousers.com`) using ECS Fargate with shared prod RDS
- CI/CD pipelines: `ci-test` (all branches), `ci-dev` (develop), `ci-prod` (main)
- Branch protection on `main` requiring 1 PR approval
- 69 pytest API tests (unit + functional) covering all major routes
- Playwright E2E test scaffolding for web flows
