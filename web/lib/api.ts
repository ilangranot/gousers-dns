const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Simple in-memory token cache
let _cachedToken: string | null = null;
let _cacheExpiry = 0;

async function getToken(): Promise<string> {
  if (typeof window === "undefined") return "";

  const now = Date.now();
  // Use cached token if still valid (30s buffer before expiry)
  if (_cachedToken && now < _cacheExpiry - 30_000) {
    return _cachedToken;
  }

  try {
    const res = await fetch("/api/auth/token");
    if (!res.ok) return "";
    const data = await res.json();
    const token: string = data.token ?? "";
    if (!token) return "";

    // Decode exp claim without verifying signature (browser-side)
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      _cacheExpiry = (payload.exp ?? 0) * 1000;
    } else {
      _cacheExpiry = now + 24 * 60 * 60 * 1000;
    }
    _cachedToken = token;
    return token;
  } catch {
    return "";
  }
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ── Chat ──────────────────────────────────────────────────────────────────

export const getSessions = () => apiFetch("/chat/sessions");

export const getMessages = (sessionId: string) =>
  apiFetch(`/chat/sessions/${sessionId}/messages`);

export async function streamChat(
  message: string,
  gptTarget: string,
  sessionId: string | null,
  onChunk: (chunk: string) => void,
  onDone: (sessionId: string) => void,
  onBlocked: (reason: string) => void,
  onError?: (error: string) => void,
  cardId?: string | null,
) {
  const token = await getToken();
  const res = await fetch(`${API}/chat/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, gpt_target: gptTarget, session_id: sessionId, card_id: cardId ?? undefined }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    onError?.(err.detail ?? "Request failed");
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.chunk) onChunk(data.chunk);
        if (data.blocked) onBlocked(data.reason ?? "Message blocked by organization policy");
        if (data.done) onDone(data.session_id);
        if (data.error) onError?.(data.error);
      } catch {}
    }
  }
}

// ── Admin ─────────────────────────────────────────────────────────────────

export const getFilteringRules = () => apiFetch("/admin/filtering-rules");
export const createFilteringRule = (body: object) =>
  apiFetch("/admin/filtering-rules", { method: "POST", body: JSON.stringify(body) });
export const updateFilteringRule = (id: string, body: object) =>
  apiFetch(`/admin/filtering-rules/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteFilteringRule = (id: string) =>
  apiFetch(`/admin/filtering-rules/${id}`, { method: "DELETE" });

export const getGptConnections = () => apiFetch("/admin/gpt-connections");
export const upsertGptConnection = (body: object) =>
  apiFetch("/admin/gpt-connections", { method: "POST", body: JSON.stringify(body) });
export const deleteGptConnection = (provider: string) =>
  apiFetch(`/admin/gpt-connections/${provider}`, { method: "DELETE" });

export const getUsers = () => apiFetch("/admin/users");
export const updateUserRole = (userId: string, role: string) =>
  apiFetch(`/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
export const removeUser = (userId: string) =>
  apiFetch(`/admin/users/${userId}`, { method: "DELETE" });

// ── Invitations ────────────────────────────────────────────────────────────

export const getInvitations = () => apiFetch("/admin/invitations/");
export const createInvitation = (body: { email: string; role: string }) =>
  apiFetch("/admin/invitations/", { method: "POST", body: JSON.stringify(body) });
export const revokeInvitation = (id: string) =>
  apiFetch(`/admin/invitations/${id}`, { method: "DELETE" });

// ── Agents ─────────────────────────────────────────────────────────────────

export const getAgents = () => apiFetch("/admin/agents");
export const createAgent = (body: object) =>
  apiFetch("/admin/agents", { method: "POST", body: JSON.stringify(body) });
export const updateAgent = (id: string, body: object) =>
  apiFetch(`/admin/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteAgent = (id: string) =>
  apiFetch(`/admin/agents/${id}`, { method: "DELETE" });

export const getAssignments = () => apiFetch("/admin/agents/assignments");
export const upsertAssignment = (body: { user_id: string; agent_id: string }) =>
  apiFetch("/admin/agents/assignments", { method: "PUT", body: JSON.stringify(body) });
export const removeAssignment = (userId: string) =>
  apiFetch(`/admin/agents/assignments/${userId}`, { method: "DELETE" });

export const getAgentContext = () => apiFetch("/chat/agent-context");
export const getAgentStarters = (): Promise<string[]> => apiFetch("/chat/agent-starters");

// ── Analytics ─────────────────────────────────────────────────────────────

export const getAnalyticsSummary = (days = 30) =>
  apiFetch(`/analytics/summary?days=${days}`);
export const getConversations = (limit = 50, offset = 0) =>
  apiFetch(`/analytics/conversations?limit=${limit}&offset=${offset}`);
export const getConversation = (sessionId: string) =>
  apiFetch(`/analytics/conversations/${sessionId}`);
export const getTeamAnalytics = (days = 30) =>
  apiFetch(`/analytics/team?days=${days}`);
export const triggerUsageAssessment = () =>
  apiFetch("/analytics/team/assess", { method: "POST" });

// ── Settings ───────────────────────────────────────────────────────────────

export const getOrgSettings = () => apiFetch("/settings/");

export const getOrgLogo = () => apiFetch("/settings/logo");

export const updateOrgSettings = (body: { theme?: string; org_display_name?: string; vertical?: string; vertical_subcategory?: string }) =>
  apiFetch("/settings/", { method: "PATCH", body: JSON.stringify(body) });

export async function uploadLogo(file: File) {
  const token = await getToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/settings/logo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Upload failed");
  }
  return res.json();
}

export const deleteLogo = () => apiFetch("/settings/logo", { method: "DELETE" });

// ── Documents ──────────────────────────────────────────────────────────────

export const getDocuments = () => apiFetch("/admin/documents/");

export async function uploadDocument(file: File) {
  const token = await getToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/admin/documents/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Upload failed");
  }
  return res.json();
}

export const deleteDocument = (id: string) =>
  apiFetch(`/admin/documents/${id}`, { method: "DELETE" });

// ── Chat extras ────────────────────────────────────────────────────────────

export const renameSession = (sessionId: string, title: string) =>
  apiFetch(`/chat/sessions/${sessionId}`, { method: "PATCH", body: JSON.stringify({ title }) });

export const archiveSession = (sessionId: string, archived = true) =>
  apiFetch(`/chat/sessions/${sessionId}/archive`, { method: "PATCH", body: JSON.stringify({ archived }) });

export const deleteSession = (sessionId: string) =>
  apiFetch(`/chat/sessions/${sessionId}`, { method: "DELETE" });

export const getArchivedSessions = () => apiFetch("/chat/sessions?archived=true");

export const getNotes = () => apiFetch("/chat/notes");
export const updateNote = (noteId: string, content: string) =>
  apiFetch(`/chat/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ content }) });

// ── Cards ───────────────────────────────────────────────────────────────────

export const getCards = () => apiFetch("/chat/cards");
export const createCard = (body: { type: string; title: string; fields?: Record<string, string>; notes?: string; parent_id?: string | null; origin_session_id?: string | null }) =>
  apiFetch("/chat/cards", { method: "POST", body: JSON.stringify(body) });
export const updateCard = (id: string, body: { title?: string; fields?: Record<string, string>; notes?: string; chat_session_id?: string }) =>
  apiFetch(`/chat/cards/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteCard = (id: string) =>
  apiFetch(`/chat/cards/${id}`, { method: "DELETE" });
export const restoreCard = (id: string) =>
  apiFetch(`/chat/cards/${id}/restore`, { method: "POST" });
export const getCardSession = (id: string) =>
  apiFetch(`/chat/cards/${id}/session`);

export async function streamChatIncognito(
  message: string,
  gptTarget: string,
  sessionId: string | null,
  onChunk: (chunk: string) => void,
  onDone: (sessionId: string) => void,
  onError?: (error: string) => void,
) {
  const token = await getToken();
  const res = await fetch(`${API}/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, gpt_target: gptTarget, session_id: sessionId, incognito: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    onError?.(err.detail ?? "Request failed");
    return;
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.chunk) onChunk(data.chunk);
        if (data.done) onDone(data.session_id);
        if (data.error) onError?.(data.error);
      } catch {}
    }
  }
}

// ── User Connections ───────────────────────────────────────────────────────

export const getUserConnections = () => apiFetch("/admin/user-connections");
export const addUserConnection = (body: { service_type: string; label?: string; config?: object }) =>
  apiFetch("/admin/user-connections", { method: "POST", body: JSON.stringify(body) });
export const deleteUserConnection = (id: string) =>
  apiFetch(`/admin/user-connections/${id}`, { method: "DELETE" });
export const getTeamConnections = () => apiFetch("/admin/team-connections");

// ── Create Organization ────────────────────────────────────────────────────

export const createOrganization = (org_name: string) =>
  apiFetch("/admin/create-organization", { method: "POST", body: JSON.stringify({ org_name }) });

// ── Agent Schedules ────────────────────────────────────────────────────────

export const getAgentSchedules = () => apiFetch("/admin/agent-schedules");
export const createAgentSchedule = (body: object) =>
  apiFetch("/admin/agent-schedules", { method: "POST", body: JSON.stringify(body) });
export const updateAgentSchedule = (id: string, body: object) =>
  apiFetch(`/admin/agent-schedules/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteAgentSchedule = (id: string) =>
  apiFetch(`/admin/agent-schedules/${id}`, { method: "DELETE" });
export const triggerAgentSchedule = (id: string) =>
  apiFetch(`/admin/agent-schedules/${id}/trigger`, { method: "POST" });

// ── Super Admin ────────────────────────────────────────────────────────────

export const checkSuperAdmin = () => apiFetch("/superadmin/check");
export const getSuperAdminOverview = () => apiFetch("/superadmin/overview");
export const getSuperAdminOrgs = () => apiFetch("/superadmin/orgs");
export const getOrgMembers = (orgId: string) => apiFetch(`/superadmin/orgs/${orgId}/members`);
export const getOrgUsage = (orgId: string, days = 30) =>
  apiFetch(`/superadmin/orgs/${orgId}/usage?days=${days}`);
export const deleteOrg = (orgId: string) =>
  apiFetch(`/superadmin/orgs/${orgId}`, { method: "DELETE" });
export const deleteOrgMember = (orgId: string, memberId: string) =>
  apiFetch(`/superadmin/orgs/${orgId}/members/${memberId}`, { method: "DELETE" });
export const deleteOrgMemberAccount = (orgId: string, memberId: string) =>
  apiFetch(`/superadmin/orgs/${orgId}/members/${memberId}/account`, { method: "DELETE" });
export const toggleMemberDisabled = (orgId: string, memberId: string, disabled: boolean) =>
  apiFetch(`/superadmin/orgs/${orgId}/members/${memberId}/disable`, { method: "PATCH", body: JSON.stringify({ disabled }) });
export const sendMemberResetPassword = (orgId: string, memberId: string) =>
  apiFetch(`/superadmin/orgs/${orgId}/members/${memberId}/reset-password`, { method: "POST" });
export const getOrgSessionLog = (orgId: string, days = 30) =>
  apiFetch(`/superadmin/orgs/${orgId}/session-log?days=${days}`);
