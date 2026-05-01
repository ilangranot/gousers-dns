# Admin Panel Changelog

## [0.0.1] - 2026-02-22

### Added
- Admin layout with sidebar: Filtering, Connections, Team, Agents, Conversations, Documents, Settings, DNS
- Filtering rules page: add/delete keyword, regex, PII, and semantic rules
- GPT connections page: per-provider API key management (OpenAI, Anthropic, Gemini)
- Team page: member list with role display, invite new members (Clerk invitations), revoke pending invites
- Agents page: create agents with name + system prompt + provider/model; assign agents to individual users
- Conversations page: session list → message history, blocked message highlighting with reason tooltip
- Documents page: file upload for RAG context injection into system prompt
- Settings page: org display name, logo upload (S3), theme picker (5 themes)
- DNS setup page: CoreDNS configuration guide
