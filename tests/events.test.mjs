import test from "node:test";
import assert from "node:assert/strict";
import { applySessionEvent, shouldApplySnapshot } from "../src/lib/sessionEvents.js";
import { fixture } from "./helpers.mjs";

test("delta preserves unchanged catalogue and participant references", () => {
  const session = fixture();
  const changed = { ...session.participants[0], budget: 228 };
  const event = { sessionId: session.id, revision: 1, timestamp: 10, fields: { turnIdx: 1 }, participants: [changed] };
  const result = applySessionEvent(session, event);
  assert.equal(result.gap, false);
  assert.equal(result.session.playerPool, session.playerPool);
  assert.equal(result.session.participants[1], session.participants[1]);
  assert.equal(result.session.participants[0], changed);
  assert.equal(applySessionEvent(result.session, event).session, result.session);
  assert.equal(applySessionEvent(session, { ...event, revision: 3 }).gap, true);
});

test("stale HTTP snapshots cannot replace newer socket state", () => {
  assert.equal(shouldApplySnapshot({ revision: 3, updatedAt: 100 }, { revision: 2, updatedAt: 200 }), false);
  assert.equal(shouldApplySnapshot({ revision: 3, updatedAt: 100 }, { revision: 3, updatedAt: 100 }), false);
  assert.equal(shouldApplySnapshot({ revision: 3, updatedAt: 100 }, { revision: 4, updatedAt: 101 }), true);
});
