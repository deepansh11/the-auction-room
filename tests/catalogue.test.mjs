import test from "node:test";
import assert from "node:assert/strict";
import { loadPlayersFromCsv } from "../src/data/csvPlayerLoader.js";

test("catalogue fetch and parse are shared across simultaneous screen mounts", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, text: async () => "player_id,overall,short_name,player_positions\n42,85,Test Player,CM\n" }; };
  try {
    const first = loadPlayersFromCsv("/test-catalogue.csv");
    const second = loadPlayersFromCsv("/test-catalogue.csv");
    assert.equal(first, second);
    assert.equal((await first)[0].id, 42);
    assert.equal(calls, 1);
    assert.equal(await first, await second);
  } finally { globalThis.fetch = original; }
});

test("failed catalogue loads can be retried", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; if (calls === 1) throw new Error("Offline"); return { ok: true, text: async () => "player_id,overall,short_name,player_positions\n43,85,Retry Player,CM\n" }; };
  try {
    await assert.rejects(loadPlayersFromCsv("/retry-catalogue.csv"), /Offline/);
    assert.equal((await loadPlayersFromCsv("/retry-catalogue.csv"))[0].id, 43);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
