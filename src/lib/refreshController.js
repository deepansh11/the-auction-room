// One in-flight request and one timer. A healthy stream makes HTTP a fallback, not a poller.
export function createRefreshController({ fetchLatest, applyLatest, onError = () => {}, pollMs = 15000,
  isHidden = () => false, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let stopped = false;
  let healthy = false;
  let running = null;
  let timer = null;
  let failures = 0;
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const schedule = milliseconds => {
    clear();
    if (!stopped && !healthy) timer = setTimer(() => { timer = null; refresh(); }, milliseconds);
  };
  const refresh = (force = false) => {
    if (stopped || (healthy && !force)) return Promise.resolve();
    if (running) return running;
    clear();
    if (!force && isHidden()) { schedule(60000); return Promise.resolve(); }
    running = Promise.resolve().then(fetchLatest).then(latest => {
      if (!stopped) { failures = 0; applyLatest(latest); }
    }).catch(error => {
      failures++;
      if (!stopped) onError(error);
      const retryMs = Math.max(pollMs, Math.min(60000, pollMs * 2 ** Math.min(failures, 2)), error.retryAfterMs || 0);
      schedule(retryMs);
    }).finally(() => {
      running = null;
      if (timer === null) schedule(pollMs);
    });
    return running;
  };
  return {
    refresh,
    start: () => schedule(2000), // Give the authenticated socket snapshot a chance first.
    setHealthy(value) { healthy = value; clear(); if (!healthy) refresh(); },
    stop() { stopped = true; clear(); },
  };
}
