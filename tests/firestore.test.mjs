import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { processSessionAction } from "../backend/src/services/sessionActions.js";
import { fixture, testUser } from "./helpers.mjs";
import { once } from "node:events";

test("real Firestore emulator transaction contention, idempotency and terminal persistence", { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  const require = createRequire(new URL("../backend/package.json", import.meta.url));
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const app = initializeApp({ projectId: "demo-fc-auction" }, `test-${Date.now()}`);
  const db = getFirestore(app);
  const session = fixture();
  session.id = `emulator-${Date.now()}`;
  const catalog = new Map(session.playerPool.map(p => [p.id, p]));
  const args = { db, sessionId: session.id, user: testUser("test-0"), catalog };
  try {
    await db.collection("sessions").doc(session.id).set(session);
    const command = { type: "pick", playerId: session.playerPool.find(p => p.lot === 1).id, expectedRevision: 0, requestId: "emulator-request-01" };
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => processSessionAction({ ...args, command: { ...command, requestId: `emulator-request-${i}` } })));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const accepted = results.find(r => r.status === "fulfilled").value;
    const retry = await processSessionAction({ ...args, command: { ...command, requestId: accepted.event.eventId } });
    assert.equal(retry.duplicate, true);
    assert.equal(retry.session.participants[0].budget, 228);
    // Actual HTTP routes against the same emulator, never a production project.
    process.env.FIREBASE_PROJECT_ID = "demo-fc-auction";
    process.env.AUTH_JWT_SECRET = "isolated-emulator-tests-only";
    const express = require("express");
    const jwt = require("jsonwebtoken");
    const { default: roomRoutes } = await import("../backend/src/routes/rooms.js");
    const { default: resultRoutes } = await import("../backend/src/routes/results.js");
    const api = express();
    api.use(express.json());
    api.use("/api", roomRoutes);
    api.use("/api", resultRoutes);
    const http = api.listen(0, "127.0.0.1");
    await once(http, "listening");
    const url = `http://127.0.0.1:${http.address().port}/api/sessions/${session.id}`;
    const token = jwt.sign(testUser("test-0"), process.env.AUTH_JWT_SECRET);
    try {
      const unauthorized = await fetch(url);
      assert.equal(unauthorized.status, 401);
      const legacy = await fetch(url, { method: "PUT", headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ session }) });
      assert.equal(legacy.status, 409);
      assert.equal((await legacy.json()).code, "CLIENT_UPGRADE_REQUIRED");
      const end = await fetch(`${url}/actions`, { method: "POST", headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ command: { type: "end", requestId: "emulator-end-request", expectedRevision: 1 } }) });
      assert.equal(end.status, 200);
      assert.equal((await end.json()).event.fields.status, "complete");
      const { getPlayerCatalog } = await import("../backend/src/services/playerCatalog.js");
      const selected = [...(await getPlayerCatalog()).values()].slice(0, 52);
      const base = `http://127.0.0.1:${http.address().port}/api`;
      const call = async (path, body, name = "test-0") => {
        const response = await fetch(`${base}${path}`, { method: "POST", headers: { authorization: `Bearer ${jwt.sign(testUser(name), process.env.AUTH_JWT_SECRET)}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return { status: response.status, data: await response.json() };
      };
      const createdId = `http-auction-${Date.now()}`;
      const created = await call("/rooms", { spec: { id: createdId, roomCode: "HTTP01", name: "Emulator auction", budgetPerBidder: 240,
        tiers: session.tiers, selectedPlayers: selected, participantNames: ["test-0", "Player 2"], fixtureLeg: "triple", groupsEnabled: true, groupCount: 1 } });
      assert.equal(created.status, 201);
      assert.equal(created.data.session.playerPool.length, 0);
      assert.equal(created.data.session.fixtureLeg, "triple");
      assert.equal(created.data.session.fixtures.A.length, 3);
      const joined = await call("/rooms/HTTP01/join", { username: "TEST-1" }, "test-1");
      assert.equal(joined.status, 200);
      assert.equal(joined.data.session.participants[1].name, "test-1");
      let revision = joined.data.session.revision;
      const act = async (type, extra = {}, name = "test-0") => {
        const result = await call(`/sessions/${createdId}/actions`, { command: { type, expectedRevision: revision, requestId: `http-action-${revision}`, ...extra } }, name);
        assert.equal(result.status, 200, result.data.error);
        revision = result.data.event.revision;
        return result.data.event;
      };
      await act("reveal-draw");
      const revealed = await act("reveal-draw");
      await act("start");
      const opened = await act("open-lot");
      const picked = await act("pick", { playerId: opened.fields.playerPool[0].id }, revealed.fields.sequence[0]);
      assert.equal(picked.participants[0].budget, 228);
      // The simplified result editor uses the existing targeted score endpoint for hosts too.
      const resultRef = db.collection("auctionResults").doc(session.id);
      await resultRef.set({ fixtures: { A: [{ id: "score-fixture", home: "test-1", away: "test-2", homeGoals: null, awayGoals: null }] } }, { merge: true });
      const saveScore = (name, homeGoals, awayGoals) => fetch(`${base}/results/${session.id}/fixtures/score-fixture/score`, {
        method: "PUT", headers: { authorization: `Bearer ${jwt.sign(testUser(name), process.env.AUTH_JWT_SECRET)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ groupLabel: "A", homeGoals, awayGoals }),
      });
      assert.equal((await saveScore("test-3", 99, 99)).status, 403);
      assert.equal((await saveScore("test-0", 3, 1)).status, 200);
      assert.equal((await resultRef.get()).data().fixtures.A[0].homeGoals, 3);
      assert.equal((await saveScore("test-1", 0, 0)).status, 200);
      assert.equal((await resultRef.get()).data().fixtures.A[0].homeGoals, 0);
      assert.equal((await saveScore("test-0", null, null)).status, 200);
      assert.equal((await resultRef.get()).data().fixtures.A[0].homeGoals, null);
      // Manual player stats: real API, canonical squad IDs, legacy hydration, resave, and links.
      await resultRef.set({
        participants: [{ name: "test-1", squad: [{ id: 123, name: "Sample Forward", pos: "ST" }] }],
        ballonDorUploadToken: "emulator-shared-stats-token",
      }, { merge: true });
      const legacyStatsId = `${session.id}__score-fixture__test-1`;
      await db.collection("auctionPerformanceSubmissions").doc(legacyStatsId).set({
        auctionResultId: session.id, fixtureId: "score-fixture", mappedParticipantName: "test-1", createdAt: 44, updatedAt: 44,
        players: [{ id: "scan-123", name: "Sample Forward", goals: 3, assists: 1, rating: 9.5 }, { id: "former-id", name: "Former Player", goals: 1, assists: 0 }],
      });
      const stats = { fixtureId: "score-fixture", mappedParticipantName: "test-1", players: [{ id: "123", name: "Spoofed Name", goals: 4, assists: 2 }, { id: "former-id", goals: 1, assists: 0 }] };
      const submitStats = (name, body, publicToken = "") => fetch(publicToken
        ? `${base}/public/results/${session.id}/ballon-dor-submissions?token=${publicToken}&fixtureId=score-fixture`
        : `${base}/results/${session.id}/ballon-dor-submissions`, {
        method: "POST", headers: { ...(publicToken ? {} : { authorization: `Bearer ${jwt.sign(testUser(name), process.env.AUTH_JWT_SECRET)}` }), "Content-Type": "application/json" },
        body: JSON.stringify({ submission: body }),
      });
      assert.equal((await submitStats("test-2", stats)).status, 403);
      assert.equal((await submitStats("test-1", { ...stats, players: [{ id: "unknown", goals: 3, assists: 0 }] })).status, 400);
      assert.equal((await submitStats("test-1", { ...stats, players: [{ ...stats.players[0], goals: -1 }, stats.players[1]] })).status, 400);
      const manual = await submitStats("test-1", stats);
      assert.equal(manual.status, 201);
      const saved = (await manual.json()).submission;
      assert.equal(saved.id, legacyStatsId);
      assert.equal(saved.createdAt, 44);
      assert.equal(saved.players[0].name, "Sample Forward");
      assert.equal(saved.players[0].rating, undefined);
      assert.equal(saved.players[1].name, "Former Player");
      assert.equal((await submitStats("test-0", stats)).status, 201);
      assert.equal((await submitStats(null, stats, "invalid-token")).status, 403);
      assert.equal((await submitStats(null, stats, "emulator-shared-stats-token")).status, 201);
      const sharedContext = await fetch(`${base}/public/results/${session.id}/ballon-dor-upload?token=emulator-shared-stats-token&fixtureId=score-fixture`);
      assert.equal(sharedContext.status, 200);
      assert.equal((await sharedContext.json()).participants[0].squad[0].id, 123);
      const saveClub = (name, clubId) => fetch(`${base}/results/${session.id}/club-selection`, { method: "PUT",
        headers: { authorization: `Bearer ${jwt.sign(testUser(name), process.env.AUTH_JWT_SECRET)}`, "Content-Type": "application/json" }, body: JSON.stringify({ clubId, username: "test-2" }) });
      assert.equal((await saveClub("test-1", "113302")).status, 200);
      assert.equal((await resultRef.get()).data().clubSelections["test-1"], "113302");
      assert.equal((await resultRef.get()).data().participants[0].name, "test-1");
      assert.equal((await saveClub("outsider", "113298")).status, 403);
      assert.equal((await saveClub("test-1", "invalid-club")).status, 400);
    } finally { await new Promise(resolve => http.close(resolve)); }
    assert.equal((await db.collection("sessions").doc(session.id).get()).data().status, "complete");
    assert.equal((await db.collection("auctionResults").doc(session.id).get()).exists, true);
  } finally { await db.terminate(); await deleteApp(app); }
});
