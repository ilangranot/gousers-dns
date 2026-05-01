# GoUsers Web

Next.js 15 App Router frontend for the GoUsers AI Gateway. Includes the marketing website, AI chat interface, admin panel, and super admin dashboard.

## Stack

- **Framework**: Next.js 15 (App Router)
- **Auth**: Clerk v6 (`@clerk/nextjs`)
- **Styling**: Tailwind CSS + CSS variables theming
- **API client**: `web/lib/api.ts` (httpx wrapper with Clerk token polling)

## Structure

```
web/
  app/
    (marketing)/         # Public marketing pages (no auth)
    admin/               # Org admin panel (admin role required)
      agents/            # Agent CRUD
      connections/       # GPT connection management
      conversations/     # Message history viewer
      dns/               # DNS setup guide
      documents/         # Document upload for RAG
      filtering/         # Filtering rule CRUD
      settings/          # Theme, logo, display name
      team/              # User management + invitations
    superadmin/          # Staff-only cross-tenant dashboard
      orgs/              # Org list + per-org detail
    chat/                # AI chat interface
    globals.css          # CSS variable themes
    layout.tsx           # Root layout + ThemeProvider
  components/
    ui/                  # Shared UI: GoUsersLogo, OrgLogo, ThemeProvider, etc.
  lib/
    api.ts               # API client functions (all routes)
    themes.ts            # Theme definitions
    types.ts             # TypeScript interfaces
  middleware.ts          # Clerk auth middleware
  Dockerfile
  next.config.ts
  package.json
```

## Local Development

```bash
cd web
npm install
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_API_URL
npm run dev
```

App available at http://localhost:3000.

## Theming

5 built-in themes: `midnight`, `ocean`, `forest`, `sunset`, `light`.

CSS variables defined in `globals.css` as RGB triplets:
```css
[data-theme="midnight"] { --bg-base: 13 13 23; --accent: 139 92 246; ... }
```

Theme selected in admin settings, persisted to the org's settings via API, and cached in `localStorage`.

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `NEXT_PUBLIC_API_URL` | API base URL (e.g. `https://api.gousers.com`) |
| `NEXT_PUBLIC_STAFF_EMAILS` | Comma-separated staff emails for super admin gate |
