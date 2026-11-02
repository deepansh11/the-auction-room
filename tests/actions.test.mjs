import test from "node:test";
import assert from "node:assert/strict";
import { applySessionCommand, buildSessionEvent, processSessionAction } from "../backend/src/services/sessionActions.js";
import { fixture, MemoryFirestore, testUser } from "./helpers.mjs";

function setup(count = 10) {
  const session = fixture(count);
  const catalog = new Map(session.playerPool.map(player => [player.id, { id: player.id, name: player.name, rating: player.rating, pos: player.pos }]));
  const db = new MemoryFirestore();
  db.write(`sessions/${session.id}`, session);
  db.write(`rooms/${session.roomCode}`, { sessionId: session.id });
  const playerId = session.playerPool.find(p => p.lot === 1).id;
  const command = { type: "pick", playerId, requestId: "test-request-001", expectedRevision: 0 };
  const args = { db, sessionId: session.id, user: testUser("test-0"), catalog };
  return { session, catalog, db, command, args };
}

test("valid pick uses durable budget and canonical player; delta omits static/private data", async () => {
  const { db, command, args } = setup();
  const result = await processSessionAction({ ...args, command: { ...command, budget: 99999, username: "test-9" } });
  assert.equal(result.session.participants[0].budget, 228);
  assert.equal(result.session.participants[0].squad.length, 1);
  assert.equal(result.session.turnIdx, 1);
  assert.equal(result.session.revision, 1);
  assert.equal(result.event.participants.length, 1);
  assert.equal(result.event.fields.playerPool, undefined);
  assert.equal(result.event.fields.mysteryCurrent, undefined);
  assert.equal(db.snapshot("sessions/test-session").data().participants[0].budget, 228);
});

for (const [name, alter, user, expected] of [
  ["insufficient budget", s => { s.participants[0].budget = 1; }, "test-0", "INSUFFICIENT_BUDGET"],
  ["completed auction", s => { s.status = "complete"; }, "test-0", "SESSION_CLOSED"],
  ["closed lot", s => { s.lotOpen = false; }, "test-0", "LOT_CLOSED"],
  ["wrong turn", () => {}, "test-1", "NOT_YOUR_TURN"],
  ["unauthorized participant", () => {}, "outsider", "FORBIDDEN"],
  ["full squad", s => { s.participants[0].squad = Array.from({ length: 16 }, (_, i) => ({ id: 500 + i })); }, "test-0", "SQUAD_FULL"],
]) {
  test(`${name} is rejected without mutation or receipt`, async () => {
    const { session, db, command, args } = setup();
    alter(session);
    db.write("sessions/test-session", session);
    const before = structuredClone([...db.documents]);
    await assert.rejects(processSessionAction({ ...args, user: testUser(user), command }), { code: expected });
    assert.deepEqual([...db.documents], before);
  });
}

test("already-owned and unopened players cannot be picked", async () => {
  const { session, db, args, command } = setup();
  session.participants[1].squad.push({ id: command.playerId });
  db.write("sessions/test-session", session);
  await assert.rejects(processSessionAction({ ...args, command }), { code: "INELIGIBLE_PLAYER" });
  const futureId = session.playerPool.find(p => p.lot === 2).id;
  await assert.rejects(processSessionAction({ ...args, command: { ...command, playerId: futureId } }), { code: "INELIGIBLE_PLAYER" });
});

test("concurrent same-turn requests accept exactly one durable acquisition", async () => {
  const { args, command, db } = setup();
  const results = await Promise.allSettled([
    processSessionAction({ ...args, command }),
    processSessionAction({ ...args, command: { ...command, requestId: "test-request-002" } }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code, "STALE_REVISION");
  assert.equal(db.snapshot("sessions/test-session").data().participants[0].squad.length, 1);
});

test("duplicate and timeout retry return original receipt; ID reuse is rejected", async () => {
  const { args, command } = setup();
  const accepted = await processSessionAction({ ...args, command });
  const retry = await processSessionAction({ ...args, command });
  assert.equal(retry.duplicate, true);
  assert.deepEqual(retry.event, accepted.event);
  assert.equal(retry.session.participants[0].budget, 228);
  await assert.rejects(processSessionAction({ ...args, command: { ...command, type: "pass" } }), { code: "REQUEST_ID_CONFLICT" });
});

test("commit failure neither changes budget nor saves a receipt; retry succeeds", async () => {
  const { args, command, db } = setup();
  db.failNextCommit = true;
  await assert.rejects(processSessionAction({ ...args, command }), /Simulated/);
  assert.equal(db.snapshot("sessions/test-session").data().participants[0].budget, 240);
  const retry = await processSessionAction({ ...args, command });
  assert.equal(retry.duplicate, false);
});

test("completion atomically archives and retains terminal state for restart recovery", async () => {
  const { args, db } = setup();
  await processSessionAction({ ...args, command: { type: "end", expectedRevision: 0, requestId: "test-end-request" } });
  assert.equal(db.snapshot("sessions/test-session").data().status, "complete");
  assert.equal(db.snapshot("auctionResults/test-session").exists, true);
  assert.equal(db.snapshot("rooms/TEST01").exists, false);
});

test("host transitions enforce authorization and draw sequence stays private", () => {
  const { session, catalog } = setup();
  session.status = "draw";
  session.lotOpen = false;
  const command = { type: "reveal-draw", requestId: "test-draw-request", expectedRevision: 0 };
  assert.throws(() => applySessionCommand(session, testUser("test-1"), command, catalog), { code: "FORBIDDEN" });
  const after = applySessionCommand(session, testUser("test-0"), command, catalog);
  const event = buildSessionEvent(session, after, command);
  assert.equal(event.fields.sequence.length, 1);
  assert.equal(event.fields.playerPool, undefined);
  assert.equal(session.revealedPickCount, undefined); // pure transition
});

test("Mystery Card charges server price once and preserves existing cross-team eligibility", () => {
  const { session, catalog } = setup();
  const id = session.playerPool.find(p => p.lot === 2).id;
  session.mysteryEnabled = true;
  session.mysteryPools = { "test-0": [id] };
  session.mysteryCurrent = { "test-0": id };
  session.mysteryUsed = {};
  session.participants[1].squad.push({ id });
  const after = applySessionCommand(session, testUser("test-0"), { type: "mystery", requestId: "test-mystery-id", expectedRevision: 0 }, catalog);
  assert.equal(after.participants[0].budget, 220);
  assert.equal(after.mysteryUsed["test-0"], true);
  assert.deepEqual(session.mysteryUsed, {});
});

test("expired transfer listings reject before financial changes", () => {
  const { session, catalog } = setup();
  session.status = "transfer";
  session.transferWindow = { phase: "selling", listingDeadlineAt: 100, requiredSalesMin: 2, requiredSalesMax: 5, completedBy: [] };
  assert.throws(() => applySessionCommand(session, testUser("test-0"), { type: "transfer-list", playerIds: [1, 2], requestId: "transfer-expired", expectedRevision: 0 }, catalog, 101), { code: "DEADLINE_PASSED" });
});

test("transfer submission and toggle use original purchase prices and allow restoration", () => {
  const { session, catalog } = setup();
  session.status = "transfer";
  session.transferWindow = { phase: "selling", requiredSalesMin: 2, requiredSalesMax: 5, completedBy: [] };
  session.participants[0].squad = [{ id: 1, purchasePrice: 12 }, { id: 2, purchasePrice: 20, viaMystery: true }];
  const command = { type: "transfer-list", playerIds: [1, 2], expectedRevision: 0, requestId: "transfer-price-test" };
  const listed = applySessionCommand(session, testUser("test-0"), command, catalog);
  assert.equal(listed.participants[0].budget, 272);
  assert.equal(listed.participants[0].soldPlayers.length, 2);
  assert.equal(listed.transferWindow.completedBy.length, 1);
  const restored = applySessionCommand(listed, testUser("test-0"), { type: "transfer-toggle", playerId: 2, listed: false, expectedRevision: 1, requestId: "transfer-restore-test" }, catalog);
  assert.equal(restored.participants[0].budget, 252);
  assert.equal(restored.participants[0].squad[0].purchasePrice, 20);
  assert.equal(restored.transferWindow.completedBy.length, 0);
});
