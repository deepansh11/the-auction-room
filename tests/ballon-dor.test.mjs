import test from "node:test";
import assert from "node:assert/strict";
import { buildBallonDorRanking, manualStatRows, matchPlayerScore, statCount } from "../backend/shared/ballonDor.js";
import { normalizeManualPlayers, saveManualSubmission } from "../backend/src/services/performanceSubmission.js";
import { MemoryFirestore } from "./helpers.mjs";

const team = { name: "Alice", squad: [{ id: 1, name: "K. Mbappé", pos: "ST" }, { id: 2, name: "Rodri", pos: "CDM" }] };
const submission = (players, options = {}) => ({ auctionResultId: "league", fixtureId: "match-1", mappedParticipantName: "Alice", players, ...options });

test("goals/assists formula keeps per-match hat-trick bonus and ignores rating/POTM", () => {
  assert.equal(matchPlayerScore(3, 2), 5.5);
  assert.equal(matchPlayerScore(6, 0), 8);
  const rows = buildBallonDorRanking([
    submission([{ id: 1, name: "K. Mbappé", goals: 2, assists: 1, rating: 10, isPlayerOfTheMatch: true }]),
    submission([{ id: 1, name: "K. Mbappé", goals: 1, assists: 0, rating: 1 }], { fixtureId: "match-2" }),
  ]);
  assert.equal(rows[0].ballonDorScore, 3.75); // 2+1 across two matches is NOT a hat-trick.
  assert.equal(rows[0].hatTrickCount, 0);
  assert.equal(rows[0].averageRating, undefined);
});

test("resaves replace previous stats and equal scores use goals, not ratings, as tie-break", () => {
  const ranking = buildBallonDorRanking([
    submission([{ name: "Mbappe", goals: 9, assists: 0 }], { updatedAt: 1 }),
    submission([{ name: "Mbappe", goals: 3, assists: 0, rating: 1 }], { updatedAt: 2 }),
    submission([{ name: "Rodri", goals: 1, assists: 4, rating: 10 }], { mappedParticipantName: "Bob" }),
  ]);
  assert.equal(ranking[0].playerName, "Mbappe");
  assert.equal(ranking[0].goals, 3);
  assert.equal(ranking[0].ballonDorScore, 4);
  assert.equal(ranking[1].ballonDorScore, 4);
});

test("manual drafts map old OCR IDs by name and preserve unmatched historical entries", () => {
  const rows = manualStatRows(team, submission([
    { id: "scan-123", name: "K. Mbappe", goals: 3, assists: 2, rating: 9 },
    { id: "old-player", name: "Former Player", goals: 1, assists: 0 },
  ]));
  assert.deepEqual(rows.map(player => [player.id, player.goals, player.assists]), [["1", 3, 2], ["2", 0, 0], ["old-player", 1, 0]]);
  assert.equal(rows.at(-1).legacy, true);
  assert.equal(rows[0].rating, undefined);
});

test("backend derives player names, rejects arbitrary/duplicate IDs, invalid numbers and omitted history", () => {
  const input = [{ id: 1, name: "Spoofed player", goals: 3, assists: 1 }, { id: 2, goals: 0, assists: 0 }];
  assert.equal(normalizeManualPlayers(input, team)[0].name, "K. Mbappé");
  assert.throws(() => normalizeManualPlayers([{ ...input[0], id: "unknown" }], team), /Select players/);
  assert.throws(() => normalizeManualPlayers([input[0], input[0]], team), /Duplicate/);
  for (const value of [-1, 1.5, "1.5", "NaN", true, Infinity, "-2"]) {
    assert.equal(statCount(value), null);
    assert.throws(() => normalizeManualPlayers([{ ...input[0], goals: value }, input[1]], team), /whole numbers/);
  }
  assert.throws(() => normalizeManualPlayers([input[0]], team), /Include all squad/);
});

test("transactional submission resave keeps createdAt, cannot edit another team, validates shared links", async () => {
  const db = new MemoryFirestore();
  db.write("auctionResults/league", { host: "Host", participants: [team], fixtures: { A: [{ id: "match-1", home: "Alice", away: "Bob" }] }, ballonDorUploadToken: "valid-token" });
  const payload = submission([{ id: 1, goals: 3, assists: 2 }, { id: 2, goals: 0, assists: 0 }]);
  const save = extra => saveManualSubmission({ db, auctionResultId: "league", submission: payload, username: "Alice", ...extra });
  const first = await save();
  assert.equal(first.players[0].name, "K. Mbappé");
  assert.equal(first.players[0].rating, undefined);
  const second = await save();
  assert.equal(second.id, first.id);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal([...db.documents.keys()].filter(key => key.startsWith("auctionPerformanceSubmissions/")).length, 1);
  await assert.rejects(save({ username: "Bob" }), { status: 403 });
  await assert.rejects(save({ username: undefined, publicToken: "wrong-token" }), { status: 403 });
  await assert.rejects(save({ username: undefined, publicToken: "valid-token", requestedFixtureId: "other-match" }), { status: 403 });
  assert.equal((await save({ username: undefined, publicToken: "valid-token", requestedFixtureId: "match-1" })).id, first.id);
});

test("lossy legacy document-key collisions do not overwrite another team's stats", async () => {
  const db = new MemoryFirestore();
  db.write("auctionResults/league", { host: "Host", participants: [
    { name: "A+B", squad: [{ id: 1, name: "Forward A" }] }, { name: "A B", squad: [{ id: 2, name: "Forward B" }] },
  ], fixtures: { A: [{ id: "match-1", home: "A+B", away: "A B" }] } });
  const save = (name, id) => saveManualSubmission({ db, auctionResultId: "league", username: "Host",
    submission: { fixtureId: "match-1", mappedParticipantName: name, players: [{ id, goals: 1, assists: 0 }] } });
  const first = await save("A+B", 1);
  const second = await save("A B", 2);
  assert.notEqual(first.id, second.id);
  assert.equal((await save("A B", 2)).id, second.id);
  assert.equal(db.snapshot(`auctionPerformanceSubmissions/${first.id}`).data().mappedParticipantName, "A+B");
});

test("a failed submission commit leaves the previous durable stats intact", async () => {
  const db = new MemoryFirestore();
  db.write("auctionResults/league", { host: "Host", participants: [team], fixtures: { A: [{ id: "match-1", home: "Alice", away: "Bob" }] } });
  const payload = submission([{ id: 1, goals: 1, assists: 0 }, { id: 2, goals: 0, assists: 0 }]);
  const saved = await saveManualSubmission({ db, auctionResultId: "league", username: "Alice", submission: payload });
  db.failNextCommit = true;
  await assert.rejects(saveManualSubmission({ db, auctionResultId: "league", username: "Alice", submission: { ...payload, players: [{ id: 1, goals: 9, assists: 0 }, payload.players[1]] } }), /Simulated commit failure/);
  assert.equal(db.snapshot(`auctionPerformanceSubmissions/${saved.id}`).data().players[0].goals, 1);
});
