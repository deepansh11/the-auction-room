/**
 * Enumerate every combination of tier-counts that exactly fills `slots` remaining squad spots
 * without exceeding `budget`, given each tier's price. Used to power the "what can I still
 * afford?" dropdown on the formations/squad planner.
 *
 * Returns an array of { counts: { [tierKey]: number }, totalCost } sorted by totalCost
 * descending (most premium loadout first), capped at `maxResults` to keep the UI usable.
 */
export function computeBudgetCombinations({ budget, slots, tiers, maxResults = 500 }) {
  const safeBudget = Number(budget);
  const safeSlots = Math.floor(Number(slots));
  if (!Number.isFinite(safeBudget) || safeBudget < 0) return [];
  if (!Number.isFinite(safeSlots) || safeSlots < 0) return [];

  const tierEntries = Object.entries(tiers || {})
    .map(([key, t]) => ({ key, price: Number(t?.price) || 0 }))
    .sort((a, b) => b.price - a.price);
  const n = tierEntries.length;
  if (n === 0) return [];

  if (safeSlots === 0) {
    const counts = {};
    tierEntries.forEach((t) => { counts[t.key] = 0; });
    return [{ counts, totalCost: 0 }];
  }

  const results = [];
  const counts = new Array(n).fill(0);

  function recurse(idx, remainingSlots, remainingBudget) {
    if (results.length >= maxResults) return;
    if (idx === n) {
      if (remainingSlots === 0) {
        const combo = {};
        tierEntries.forEach((t, i) => { combo[t.key] = counts[i]; });
        results.push({ counts: combo, totalCost: safeBudget - remainingBudget });
      }
      return;
    }

    const price = tierEntries[idx].price;
    const maxByBudget = price > 0 ? Math.floor(remainingBudget / price) : remainingSlots;
    const maxCount = Math.min(remainingSlots, maxByBudget);

    for (let c = maxCount; c >= 0; c -= 1) {
      counts[idx] = c;
      recurse(idx + 1, remainingSlots - c, remainingBudget - c * price);
      if (results.length >= maxResults) break;
    }
    counts[idx] = 0;
  }

  recurse(0, safeSlots, safeBudget);
  results.sort((a, b) => b.totalCost - a.totalCost);
  return results;
}

/**
 * Human-readable label for a combination, e.g. "2× S+ · 1× S · 4× A — 83M / 95M budget".
 */
export function formatCombination(combo, budget) {
  if (!combo) return "";
  const parts = Object.entries(combo.counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count}× ${key}`);
  const spendText = `${combo.totalCost}M spent`;
  const leftText = Number.isFinite(Number(budget)) ? ` · ${Number(budget) - combo.totalCost}M left` : "";
  return `${parts.length ? parts.join(" · ") : "No purchases"} — ${spendText}${leftText}`;
}
