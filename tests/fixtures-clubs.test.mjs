import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupFixtures } from "../src/game/groupsFixtures.js";
import { generateAuctionSetup } from "../backend/src/services/gameSetup.js";
import { appendThirdLeg } from "../backend/shared/fixtureLegs.js";
import { normalizeSessionRecord } from "../src/utils/sessionData.js";
import { normalizeSessionDocument } from "../backend/src/services/sessionState.js";
import { ISL_CLUBS } from "../backend/shared/islClubs.js";
import { readClubSelections, saveClubSelection } from "../backend/src/services/clubSelections.js";
import { MemoryFirestore } from "./helpers.mjs";

const names = Array.from({ length: 8 }, (_, i) => `Player-${i}`);
test("three legs create 84 unique fixtures and 21 games per team for eight teams", () => {
  const fixtures = buildGroupFixtures({ A: names }, "triple").A;
  assert.equal(fixtures.length, 84);
  assert.equal(new Set(fixtures.map(fixture => fixture.id)).size, 84);
  for (const name of names) assert.equal(fixtures.filter(fixture => fixture.home === name || fixture.away === name).length, 21);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    assert.equal(fixtures.filter(fixture => [fixture.home, fixture.away].includes(names[i]) && [fixture.home, fixture.away].includes(names[j])).length, 3);
  }
  assert.equal(normalizeSessionRecord({ fixtureLeg: "triple" }).fixtureLeg, "triple");
  assert.equal(normalizeSessionDocument({ fixtureLeg: "triple" }).fixtureLeg, "triple");
});

test("backend generation accepts triple legs and frontend generation preserves double fixture IDs", () => {
  const generated = generateAuctionSetup({ selectedPlayers: [], tiers: {}, participantNames: names, mysteryEnabled: false, groupsEnabled: true, groupCount: 1, fixtureLeg: "triple" });
  assert.equal(generated.fixtures.A.length, 84);
  const two = buildGroupFixtures({ A: names }, "double").A;
  const three = buildGroupFixtures({ A: names }, "triple").A;
  assert.deepEqual(three.slice(0, 56), two);
});

test("append-only migration preserves scores, IDs, extra metadata and is repeat-safe", () => {
  const previous = buildGroupFixtures({ A: names }, "double");
  previous.A[0] = { ...previous.A[0], homeGoals: 2, awayGoals: 1, scoreUpdatedBy: "owner" };
  previous._penalties = { "Player-0": { points: 1 } };
  const { fixtures, added } = appendThirdLeg({ A: names }, previous);
  assert.equal(added, 28);
  assert.deepEqual(fixtures.A.slice(0, 56), previous.A);
  assert.deepEqual(fixtures._penalties, previous._penalties);
  assert.equal(appendThirdLeg({ A: names }, fixtures).added, 0);
  assert.throws(() => appendThirdLeg({ A: names }, { A: previous.A.slice(0, 10) }), /manual review/);
});

test("club choices validate ownership and persist concurrently without replacing squads or identities", async () => {
  assert.equal(ISL_CLUBS.length, 14);
  assert.equal(new Set(ISL_CLUBS.map(club => club.id)).size, 14);
  const db = new MemoryFirestore();
  const participants = [{ name: "Alice", squad: [{ id: 1 }], budget: 10 }, { name: "Bob", squad: [], budget: 20 }];
  db.write("auctionResults/result", { host: "Alice", participants, participantNames: ["Alice", "Bob"], fixtures: { A: [{ id: "A-0", home: "Alice", away: "Bob" }] } });
  await Promise.all([saveClubSelection(db, "result", "Alice", "113302"), saveClubSelection(db, "result", "Bob", "113298")]);
  assert.deepEqual(await readClubSelections(db, "result", "Alice"), { Alice: "113302", Bob: "113298" });
  assert.deepEqual(db.snapshot("auctionResults/result").data().participants, participants);
  assert.equal(db.snapshot("auctionResults/result").data().fixtures.A[0].home, "Alice");
  await assert.rejects(saveClubSelection(db, "result", "outsider", "113302"), { status: 403 });
  await assert.rejects(saveClubSelection(db, "result", "Alice", "made-up-club"), { status: 400 });
  await saveClubSelection(db, "result", "Alice", "");
  assert.deepEqual(await readClubSelections(db, "result", "Bob"), { Bob: "113298" });
});
