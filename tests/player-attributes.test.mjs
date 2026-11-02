import test from "node:test";
import assert from "node:assert/strict";
import { formatStarRating, getPlayerAttributes } from "../src/lib/playerAttributes.js";

test("striker attributes retain important-stat order and exact supplied values", () => {
  const attributes = getPlayerAttributes({ pos: "ST", pace: 97, shooting: 90, dribbling: 92, passing: 81, physic: 76, defending: 37 });
  assert.deepEqual(attributes.map(({ label, value }) => [label, value]), [["Pace", 97], ["Shooting", 90], ["Dribbling", 92], ["Passing", 81], ["Physical", 76], ["Defending", 37]]);
  assert.equal(attributes[0].tone, "exceptional");
  assert.equal(attributes.at(-1).tone, "lower");
});

test("goalkeepers show goalkeeper attributes and do not substitute missing values with zero", () => {
  const attributes = getPlayerAttributes({ pos: "GK", gkDiving: 89, gkSpeed: 0, gkPositioning: null, pace: 99 });
  assert.deepEqual(attributes.map(attribute => attribute.label), ["Diving", "Handling", "Kicking", "Reflexes", "Speed", "Positioning"]);
  assert.equal(attributes.find(attribute => attribute.label === "Speed").value, 0);
  assert.equal(attributes.find(attribute => attribute.label === "Positioning").value, null);
  assert.equal(attributes[1].tone, "missing");
});

test("defenders retain defense-first ordering; stars reject unknown/invalid ratings", () => {
  assert.equal(getPlayerAttributes({ pos: "CB" })[0].label, "Defending");
  assert.equal(formatStarRating(4), "4 / 5");
  assert.equal(formatStarRating(5), "5 / 5");
  for (const value of [null, undefined, "", 0, 6, NaN]) assert.equal(formatStarRating(value), "Not available");
});
