import test from "node:test";
import assert from "node:assert/strict";
import { recommendedPlayerExclusions, validateAuctionSetup } from "../src/lib/setupValidation.js";
import { TIERS } from "../src/game/constants.js";

const players = Array.from({ length: 300 }, (_, id) => ({ id, name: `Player ${id}`, rating: 80 + id % 15 }));
const valid = { name: "Friends auction", names: ["Host", "Player 2"], budget: 240, players, tiers: TIERS, host: "Host" };

test("recommended pool takes the highest rated 26 players per participant without mutating catalogue", () => {
  const excluded = recommendedPlayerExclusions(players, 5);
  const selected = players.filter(player => !excluded.has(player.id));
  assert.equal(selected.length, 130);
  assert.equal(Math.min(...selected.map(player => player.rating)) >= Math.max(...players.filter(player => excluded.has(player.id)).map(player => player.rating)), true);
  assert.equal(players[0].id, 0);
  assert.equal(recommendedPlayerExclusions(players, 10).size, 40);
});

test("defaults and custom pool sizes are valid; duplicate names and empty selections are not", () => {
  assert.deepEqual(validateAuctionSetup(valid), []);
  assert.deepEqual(validateAuctionSetup({ ...valid, players: players.slice(0, 3) }), []);
  assert(validateAuctionSetup({ ...valid, names: ["Host", " host "] }).includes("Participant names must be unique."));
  assert(validateAuctionSetup({ ...valid, players: [] }).some(error => error.includes("Select at least one player")));
  assert(validateAuctionSetup({ ...valid, budget: "" }).some(error => error.includes("budget")));
  assert(validateAuctionSetup({ ...valid, name: " " }).some(error => error.includes("auction name")));
});

test("invalid prices, gaps and overlapping price tiers are rejected before room creation", () => {
  assert(validateAuctionSetup({ ...valid, tiers: { ...TIERS, A: { ...TIERS.A, price: 0 } } }).some(error => error.includes("price greater than zero")));
  assert(validateAuctionSetup({ ...valid, tiers: { ...TIERS, A: { ...TIERS.A, max: 85 } } }).some(error => error.includes("exactly one price tier")));
  assert(validateAuctionSetup({ ...valid, tiers: { ...TIERS, A: { ...TIERS.A, min: 81 } } }).some(error => error.includes("exactly one price tier")));
});
