import test from "node:test";
import assert from "node:assert/strict";
import { createRefreshController } from "../src/lib/refreshController.js";

test("overlapping refresh triggers share one request and one timer", async () => {
  let resolve;
  let requests = 0;
  const timers = new Map();
  const controller = createRefreshController({
    fetchLatest: () => { requests++; return new Promise(done => { resolve = done; }); },
    applyLatest: () => {},
    setTimer: fn => { const id = Symbol(); timers.set(id, fn); return id; },
    clearTimer: id => timers.delete(id),
  });
  const first = controller.refresh(true);
  controller.refresh(true);
  controller.refresh();
  await Promise.resolve();
  assert.equal(requests, 1);
  resolve({});
  await first;
  assert.equal(timers.size, 1);
  controller.setHealthy(true);
  assert.equal(timers.size, 0);
  await controller.refresh();
  assert.equal(requests, 1);
  controller.stop();
});

test("stopped controllers do not apply late responses or create timers", async () => {
  let resolve;
  let applied = false;
  let scheduled = 0;
  const controller = createRefreshController({ fetchLatest: () => new Promise(done => { resolve = done; }),
    applyLatest: () => { applied = true; }, setTimer: () => { scheduled++; }, clearTimer: () => {} });
  const work = controller.refresh();
  await Promise.resolve();
  controller.stop();
  resolve({});
  await work;
  assert.equal(applied, false);
  assert.equal(scheduled, 0);
});
