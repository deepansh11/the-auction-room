/**
 * Lightweight, fire-and-forget product analytics. Events are queued client-side and flushed in
 * small batches (instead of one HTTP request per action) to /api/analytics/events. Failures are
 * always swallowed silently — analytics must never affect the app's actual functionality.
 */

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta?.env?.VITE_API_BASE_URL)
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
    : "";

const FLUSH_INTERVAL_MS = 4000;
const MAX_BATCH_SIZE = 25;
const MAX_QUEUE_SIZE = 200; // drop oldest rather than grow unbounded if the network is down

let authToken = "";
let queue = [];
let flushTimer = null;

// One id per browser tab/load, so events can be grouped into a "visit" without needing cookies.
const analyticsSessionId = (() => {
  try {
    const existing = sessionStorage.getItem("analyticsSessionId");
    if (existing) return existing;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("analyticsSessionId", id);
    return id;
  } catch (_err) {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
})();

export function setAnalyticsAuthToken(token) {
  authToken = token || "";
}

function scheduleFlush() {
  if (flushTimer || queue.length === 0) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

async function flush(useBeacon = false) {
  if (!authToken || queue.length === 0 || !API_BASE_URL) return;
  const events = queue.splice(0, MAX_BATCH_SIZE);
  if (queue.length > 0) scheduleFlush();

  const body = JSON.stringify({ events });
  const url = `${API_BASE_URL}/api/analytics/events`;

  try {
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      // Beacon can't carry an Authorization header, so it's only a best-effort last resort on
      // unload; normal flushes always go through fetch so events stay attributed to a user.
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${authToken}` },
      body,
      keepalive: useBeacon,
    });
  } catch (_err) {
    // Silently drop — analytics is best-effort only.
  }
}

/**
 * Queue a product analytics event. `properties` should be small, flat, JSON-serializable values.
 */
export function trackEvent(name, properties = {}) {
  if (!name) return;
  if (queue.length >= MAX_QUEUE_SIZE) queue.shift();

  queue.push({
    event: String(name).slice(0, 64),
    properties,
    clientTimestamp: Date.now(),
    sessionId: analyticsSessionId,
  });

  scheduleFlush();
}

/** Convenience helper for screen/tab views. */
export function trackScreenView(screenName, properties = {}) {
  trackEvent("screen_view", { screen: screenName, ...properties });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}
