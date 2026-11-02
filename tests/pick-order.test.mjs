import test from "node:test";
import assert from "node:assert/strict";
import { getOrderedParticipants } from "../src/lib/pickOrder.js";

const participants = ["Alice", "Bob", "Cara"].map(name => ({ name, budget: 240, squad: [] }));

test("cards follow the current lot sequence and keep identity colors stable across rotation", () => {
  const first = getOrderedParticipants(participants, ["Cara", "Alice", "Bob"]);
  assert.deepEqual(first.map(row => [row.participant.name, row.position, row.colorIndex]), [["Cara", 1, 2], ["Alice", 2, 0], ["Bob", 3, 1]]);
  const next = getOrderedParticipants(participants, ["Alice", "Bob", "Cara"]);
  assert.deepEqual(next.map(row => row.position), [1, 2, 3]);
  assert.equal(next.find(row => row.participant.name === "Cara").colorIndex, 2);
  assert.equal(first[0].participant, participants[2]);
});

test("missing/abandoned names aren't shown and no unconfirmed position is invented", () => {
  const rows = getOrderedParticipants(participants, ["departed", "Bob", "Bob"]);
  assert.deepEqual(rows.map(row => [row.participant.name, row.position]), [["Bob", 2], ["Alice", null], ["Cara", null]]);
  assert.equal(getOrderedParticipants(participants, []).every(row => row.position === null), true);
});
