import { LOTS, getTierKey } from "../game/constants.js";
import { shuffleArray } from "../utils/random.js";

/**
 * Distribute players into lots using balanced per-tier spread.
 */
export function distributeLotsByTier(players, tiers) {
  if (!players.length || !LOTS) return {};
  
  const lots = {};
  for (let i = 0; i < LOTS; i++) {
    lots[i + 1] = [];
  }

  // Separate by tier
  const byTier = {};
  Object.keys(tiers).forEach(tierKey => {
    byTier[tierKey] = players.filter(p => getTierKey(p.rating, tiers) === tierKey);
    byTier[tierKey] = shuffleArray(byTier[tierKey]);
  });

  const tierKeys = Object.keys(tiers);

  // Spread each tier round-robin across lots to keep lot strength balanced.
  for (const tierKey of tierKeys) {
    byTier[tierKey].forEach((player, index) => {
      const lotNum = (index % LOTS) + 1;
      lots[lotNum].push(player);
    });
  }

  return lots;
}

/**
 * Assign lot numbers to each player based on lot distribution
 */
export function assignLotsToPlayers(players, tiers) {
  const lots = distributeLotsByTier(players, tiers);
  const withLots = [];
  
  for (const [lotNum, lotPlayers] of Object.entries(lots)) {
    for (const player of lotPlayers) {
      withLots.push({
        ...player,
        lot: parseInt(lotNum)
      });
    }
  }
  
  return withLots;
}
