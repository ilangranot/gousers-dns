const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getToken(): Promise<string> {
  if (typeof window === "undefined") return "";
  // Wait up to 5s for Clerk to initialize
  for (let i = 0; i < 50; i++) {
    const clerk = (window as any).Clerk;
    if (clerk?.session) return (await clerk.session.getToken()) ?? "";
    await new Promise((r) => setTimeout(r, 100));
  }
  return "";
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
) {
  const token = await getToken();
  const res = await fetch(`${API}/chat/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, gpt_target: gptTarget, session_id: sessionId }),
  });

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

// ── Analytics ─────────────────────────────────────────────────────────────

export const getAnalyticsSummary = (days = 30) =>
  apiFetch(`/analytics/summary?days=${days}`);
export const getConversations = (limit = 50, offset = 0) =>
  apiFetch(`/analytics/conversations?limit=${limit}&offset=${offset}`);
export const getConversation = (sessionId: string) =>
  apiFetch(`/analytics/conversations/${sessionId}`);

// ── Settings ───────────────────────────────────────────────────────────────

export const getOrgSettings = () => apiFetch("/settings/");

export const getOrgLogo = () => apiFetch("/settings/logo");

export const updateOrgSettings = (body: { theme?: string; org_display_name?: string; vertical?: string }) =>
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
