/** Explicit maintenance command. Read-only unless --apply and an external backup path are set. */
import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { getFirebase } from "../backend/src/services/firebaseService.js";
import { appendThirdLeg } from "../backend/shared/fixtureLegs.js";

const args = process.argv.slice(2);
const value = key => args[args.indexOf(key) + 1];
const roomCode = value("--room");
const resultId = value("--result");
const apply = args.includes("--apply");
const backupPath = args.includes("--backup") ? path.resolve(value("--backup")) : "";
assert(/^[A-Z0-9]{6}$/.test(roomCode || ""), "Specify --room CODE");
assert(resultId && !resultId.includes("/"), "Specify the exact --result document ID");
if (apply) assert(backupPath && !backupPath.startsWith(`${process.cwd()}/`), "Applying requires --backup outside the repository (may contain private result metadata)");
const { db } = getFirebase();
try {
  const ref = db.collection("auctionResults").doc(resultId);
  const snapshot = await ref.get();
  assert(snapshot.exists, "Result not found");
  const before = snapshot.data();
  assert.equal(before.roomCode, roomCode, "Room/result mismatch");
  assert.equal(before.status, "complete", "This maintenance command only changes completed auctions");
  assert(["double", "triple"].includes(before.fixtureLeg), "Expected a double/triple-leg auction");
  const { fixtures, added } = appendThirdLeg(before.groups || {}, before.fixtures || {});
  const previous = Object.values(before.fixtures || {}).flatMap(group => Array.isArray(group) ? group : []);
  const next = Object.values(fixtures).flatMap(group => Array.isArray(group) ? group : []);
  console.log(JSON.stringify({ operation: "append-third-leg", roomCode, resultId, apply, beforeFixtures: previous.length, added, afterFixtures: next.length, participantCount: before.participants?.length || 0 }));
  if (apply && (added || before.fixtureLeg !== "triple")) {
    await writeFile(backupPath, JSON.stringify({ resultId, roomCode, backedUpAt: Date.now(), result: before }, null, 2), { flag: "wx", mode: 0o600 });
    await db.runTransaction(async transaction => {
      const current = await transaction.get(ref);
      assert(current.exists && current.updateTime.isEqual(snapshot.updateTime), "Result changed after backup; aborting. Inspect and rerun with a fresh backup.");
      transaction.update(ref, { fixtureLeg: "triple", fixtures, updatedAt: Date.now() });
    });
    const after = (await ref.get()).data();
    assert.equal(after.fixtureLeg, "triple");
    for (const [label, group] of Object.entries(before.fixtures || {})) {
      if (Array.isArray(group)) group.forEach(fixture => assert.deepEqual(after.fixtures[label].find(next => next.id === fixture.id), fixture));
      else assert.deepEqual(after.fixtures[label], group);
    }
    assert.equal(Object.values(after.fixtures).flatMap(group => Array.isArray(group) ? group : []).length, next.length);
    console.log(JSON.stringify({ verified: true, originalFixturesPreserved: previous.length, backupPath }));
  }
} finally { await db.terminate(); }
