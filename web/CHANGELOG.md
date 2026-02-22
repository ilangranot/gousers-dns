# Web Changelog

## [0.0.1] - 2026-02-22

### Added
- Next.js 15 App Router with Clerk v6 authentication
- AI chat interface with streaming SSE from backend
- Multi-provider support: OpenAI, Anthropic, Gemini, Ollama
- Admin panel (requires `admin` role):
  - Filtering rules: create, list, delete keyword/regex/PII/semantic rules
  - GPT connections: add/remove API keys per provider
  - User management: view members, update roles, remove users
  - Team invitations: send, list, revoke Clerk-backed invitations
  - Agents: create named AI agents with custom system prompts; assign to users
  - Documents: upload org documents for RAG context
  - Settings: org display name, logo upload, theme selection
  - Conversation history viewer with blocked message highlighting
  - DNS setup guide
- Super admin dashboard (requires staff email):
  - Overview: total orgs, users, messages, blocked count
  - Org list with per-org stats (members, messages, last active)
  - Org detail: member list + daily usage chart
- 5-theme system (midnight, ocean, forest, sunset, light) via CSS variables
- `OrgLogo` component with GoUsers SVG fallback
- Clerk token polling (`getToken()`) with retry loop for async Clerk init
- `NEXT_PUBLIC_STAFF_EMAILS` client-side staff gate in superadmin layout
