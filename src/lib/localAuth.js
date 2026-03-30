const AUTH_KEY = "fc:currentUserLocal";

export function getLocalAuthUser() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function setLocalAuthUser(user) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  } catch (_) {}
}

export function clearLocalAuthUser() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(AUTH_KEY);
  } catch (_) {}
}
