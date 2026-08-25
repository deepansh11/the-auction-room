/**
 * Server-side mirror of the pure reroll logic in src/game/mysteryCard.js.
 *
 * mysteryPools must never be sent to any client after room creation, so the backend has to be
 * the one recomputing each participant's current Mystery Card candidate whenever a lot
 * transition happens — no client ever holds enough information to do this itself anymore.
 */
export function rerollMysteryCandidates(pools, usedMap = {}) {
  const next = {};
  Object.entries(pools || {}).forEach(([name, pool]) => {
    if (usedMap?.[name]) return; // already used their card — nothing left to roll
    if (!Array.isArray(pool) || pool.length === 0) return; // no eligible players reserved for them
    next[name] = pool[Math.floor(Math.random() * pool.length)];
  });
  return next;
}
