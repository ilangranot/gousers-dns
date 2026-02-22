# Admin Panel

The admin panel (`/admin`) is accessible to users with the `admin` role within their organization.

## Sections

| Route | Description |
|---|---|
| `/admin` | Dashboard overview |
| `/admin/filtering` | Create and manage filtering rules (keyword, regex, PII, semantic) |
| `/admin/connections` | Add/remove LLM API keys (OpenAI, Anthropic, Gemini, Ollama) |
| `/admin/team` | View members, change roles, invite new users, revoke invitations |
| `/admin/agents` | Create agents with custom system prompts; assign agents to users |
| `/admin/conversations` | Browse message history, see blocked messages and reasons |
| `/admin/documents` | Upload documents for RAG system context |
| `/admin/settings` | Org display name, logo, and theme selection |
| `/admin/dns` | DNS setup guide for connecting your domain |

## Access Control

Role check is enforced by the `require_admin` FastAPI dependency on every admin API route. The frontend also guards the layout — non-admin users are redirected to the chat interface.

## Key Files

- `layout.tsx` — admin shell with sidebar navigation
- `filtering/page.tsx` — filtering rule CRUD
- `connections/page.tsx` — GPT connection upsert/delete
- `team/page.tsx` — user list + invitation management
- `agents/page.tsx` — agent CRUD + user assignments
- `settings/page.tsx` — org settings (theme, logo, display name)
