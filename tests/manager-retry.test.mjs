import test from "node:test";
import assert from "node:assert/strict";
import { createSocketManager } from "../src/lib/socketManager.js";
import { mutateSession } from "../backend/src/services/sessionMutation.js";
import { processSessionAction } from "../backend/src/services/sessionActions.js";
import { MemoryFirestore, fixture, testUser } from "./helpers.mjs";

test("unknown transport outcome reuses request ID/revision and blocks unrelated commands", async () => {
  const submitted = [];
  const manager = createSocketManager({ connect: () => { throw new Error("No socket expected"); },
    httpAction: async (_id, command) => {
      submitted.push(command);
      if (submitted.length === 1) throw new Error("Lost response");
      return { ok: true, event: { eventId: command.requestId, revision: 1 } };
    } });
  await assert.rejects(manager.submit("test-session", { type: "pass" }, "token", 0), /Lost response/);
  assert.deepEqual(manager.getPending("test-session"), { type: "pass" });
  await assert.rejects(manager.submit("test-session", { type: "end" }, "token", 0), { code: "ACTION_PENDING" });
  await manager.submit("test-session", { type: "pass" }, "token", 5);
  assert.deepEqual(submitted[0], submitted[1]);
  assert.equal(submitted[1].expectedRevision, 0);
  assert.equal(manager.getPending("test-session"), null);
});

test("administrative transactions do not overwrite an accepted pick", async () => {
  const session = fixture();
  const db = new MemoryFirestore();
  db.write(`sessions/${session.id}`, session);
  const catalog = new Map(session.playerPool.map(p => [p.id, p]));
  await Promise.all([
    processSessionAction({ db, sessionId: session.id, user: testUser("test-0"), catalog,
      command: { type: "pick", expectedRevision: 0, requestId: "admin-race-request", playerId: session.playerPool.find(p => p.lot === 1).id } }),
    mutateSession(db, session.id, latest => ({ ...latest, abandonedBy: ["absent"] })),
  ]);
  const latest = db.snapshot(`sessions/${session.id}`).data();
  assert.equal(latest.participants[0].budget, 228);
  assert.equal(latest.participants[0].squad.length, 1);
  assert.equal(latest.revision, 2);
});
