# Super Admin Dashboard Changelog

## [0.0.1] - 2026-02-22

### Added
- Staff email gate in layout (reads `NEXT_PUBLIC_STAFF_EMAILS`, redirects non-staff to `/`)
- Overview page: 4 stat cards (total orgs, users, messages, blocked) + top-5 orgs table
- Orgs list page: full table with name, schema, member count, message count, blocked count, last active timestamp
- Org detail page: member list table + daily usage bar chart (messages vs blocked over last 30 days)
- Sidebar navigation: Overview, Organizations links
- All pages use `getSuperAdminOverview`, `getSuperAdminOrgs`, `getOrgMembers`, `getOrgUsage` API helpers
- Backend: `require_staff()` dependency enforces server-side staff-only access
- Backend: 4 cross-tenant SQL endpoints aggregating across all org schemas
