import { monitorEventLoopDelay, performance } from "node:perf_hooks";

const samples = new Map();
const MAX_SAMPLES = 1000;

export function observe(name, milliseconds) {
  const values = samples.get(name) || [];
  if (values.length === MAX_SAMPLES) values.shift();
  values.push(milliseconds);
  samples.set(name, values);
}

export function metricSummary() {
  return Object.fromEntries([...samples].map(([name, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return [name, {
      count: values.length,
      p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
      p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
      max: sorted.at(-1),
    }];
  }));
}

export function structuredLog(event, fields = {}) {
  if (process.env.PERFORMANCE_LOGS === "true") {
    console.log(JSON.stringify({ event, timestamp: Date.now(), ...fields }));
  }
}

export function requestTiming(req, res, next) {
  const started = performance.now();
  res.once("finish", () => {
    const durationMs = performance.now() - started;
    observe("http_ms", durationMs);
    // Route patterns only: no tokens, query strings, IP addresses, or request bodies.
    structuredLog("http_request", { method: req.method, route: req.route?.path || "middleware", status: res.statusCode, durationMs });
  });
  next();
}

export function startRuntimeMonitoring(connectionStats = () => ({})) {
  if (process.env.PERFORMANCE_LOGS !== "true") return () => {};
  const lag = monitorEventLoopDelay({ resolution: 20 });
  lag.enable();
  let cpu = process.cpuUsage();
  const timer = setInterval(() => {
    const nextCpu = process.cpuUsage();
    structuredLog("runtime", {
      ...connectionStats(), metrics: metricSummary(),
      eventLoopP95Ms: lag.percentile(95) / 1e6,
      memory: process.memoryUsage(),
      cpuMicroseconds: { user: nextCpu.user - cpu.user, system: nextCpu.system - cpu.system },
    });
    cpu = nextCpu;
    lag.reset();
  }, 30000);
  timer.unref();
  return () => { clearInterval(timer); lag.disable(); };
}
