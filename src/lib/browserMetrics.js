const enabled = import.meta.env?.VITE_PERFORMANCE_LOGS === "true";
const samples = new Map();

export function browserMetric(name, value) {
  if (!enabled) return;
  const values = samples.get(name) || [];
  if (values.length >= 1000) values.shift();
  values.push(value);
  samples.set(name, values);
}

export function auctionRenderMetric(_id, _phase, actualDuration) {
  browserMetric("react_commit_render_ms", actualDuration);
}

export function startBrowserMonitoring() {
  if (!enabled) return () => {};
  let observer;
  if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
    observer = new PerformanceObserver(list => list.getEntries().forEach(entry => browserMetric("long_task_ms", entry.duration)));
    observer.observe({ type: "longtask", buffered: true });
  }
  const timer = setInterval(() => {
    const summary = Object.fromEntries([...samples].map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [name, { count: sorted.length, p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) }];
    }));
    console.info(JSON.stringify({ event: "browser_performance", timestamp: Date.now(), metrics: summary }));
  }, 30000);
  return () => { clearInterval(timer); observer?.disconnect(); samples.clear(); };
}
