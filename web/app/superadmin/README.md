# Super Admin Dashboard

The super admin dashboard (`/superadmin`) is restricted to GoUsers staff members. Access is gated by email address — only emails listed in `NEXT_PUBLIC_STAFF_EMAILS` (and the backend `STAFF_EMAILS` setting) can access these pages.

## Pages

| Route | Description |
|---|---|
| `/superadmin` | Overview cards: total orgs, users, messages, blocked count + top-5 org table |
| `/superadmin/orgs` | Full org table with per-org stats (members, messages, blocked, last active) |
| `/superadmin/orgs/[orgId]` | Org detail: member list + daily messages/blocked usage chart |

## Access Control

**Client-side**: `layout.tsx` reads `NEXT_PUBLIC_STAFF_EMAILS`, checks the signed-in user's email via `useUser()`, and redirects non-staff to `/`.

**Server-side**: All `/superadmin/*` API endpoints require the `require_staff` FastAPI dependency, which validates the Clerk JWT email against `STAFF_EMAILS`. Non-staff users receive a `403 Forbidden`.

## Key Files

- `layout.tsx` — staff email gate + sidebar (Overview, Organizations)
- `page.tsx` — overview cards + top-5 org table
- `orgs/page.tsx` — full org list
- `orgs/[orgId]/page.tsx` — org detail with usage chart

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /superadmin/overview` | Cross-tenant totals (orgs, users, messages, blocked) |
| `GET /superadmin/orgs` | Per-org stats list |
| `GET /superadmin/orgs/{id}/members` | Users in a specific org schema |
| `GET /superadmin/orgs/{id}/usage?days=N` | Daily message/blocked counts |
