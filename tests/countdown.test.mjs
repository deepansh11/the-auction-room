import test from "node:test";
import assert from "node:assert/strict";
import { deadlinePassed, formatCountdown } from "../src/lib/countdown.js";

test("countdown formats days and hours and expires at the exact deadline", () => {
  assert.equal(formatCountdown(90061000), "01:01:01:01");
  assert.equal(formatCountdown(3661000), "01:01:01");
  assert.equal(formatCountdown(0), "00:00:00:00");
  assert.equal(deadlinePassed(100, 99), false);
  assert.equal(deadlinePassed(100, 100), true);
  assert.equal(deadlinePassed(0, 100), false);
  assert.equal(deadlinePassed(NaN, 100), false);
});
