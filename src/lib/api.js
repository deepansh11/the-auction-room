const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta?.env?.VITE_API_BASE_URL)
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
    : "";

function requireBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }
}

async function request(path, { method = "GET", body, token } = {}) {
  requireBaseUrl();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Request timeout. Please retry.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data;
}

export async function apiRegister(username, password) {
  return request("/api/auth/register", { method: "POST", body: { username, password } });
}

export async function apiLogin(username, password) {
  return request("/api/auth/login", { method: "POST", body: { username, password } });
}

export async function apiGetCurrentUser(token) {
  const data = await request("/api/users/me", { token });
  return data?.user;
}

export async function apiUpdateWishlists(wishlists, token) {
  await request("/api/users/me/wishlists", {
    method: "PUT",
    body: { wishlists },
    token,
  });
}

export async function apiCreateRoom(session, token) {
  const data = await request("/api/rooms", { method: "POST", body: { session }, token });
  return data?.session;
}

export async function apiGetRoom(roomCode) {
  const data = await request(`/api/rooms/${encodeURIComponent(roomCode)}`);
  return data?.session;
}

export async function apiJoinRoom(roomCode, username, token) {
  const data = await request(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
    method: "POST",
    body: { username },
    token,
  });
  return data?.session;
}

export async function apiListSessions(username, token) {
  const data = await request(`/api/sessions?username=${encodeURIComponent(username)}`, { token });
  return Array.isArray(data?.sessions) ? data.sessions : [];
}

export async function apiListResults(username, token) {
  const data = await request(`/api/results?username=${encodeURIComponent(username)}`, { token });
  return Array.isArray(data?.results) ? data.results : [];
}

export async function apiGetSession(sessionId) {
  const data = await request(`/api/sessions/${encodeURIComponent(sessionId)}`);
  return data?.session;
}

export async function apiUpdateSession(sessionId, session, token) {
  await request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    body: { session },
    token,
  });
}

export async function apiAbandonSession(sessionId, token) {
  const data = await request(`/api/sessions/${encodeURIComponent(sessionId)}/abandon`, {
    method: "POST",
    token,
  });
  return data?.session;
}
