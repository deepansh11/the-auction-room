import { LOTS, getTierKey, getPosGroup } from "../game/constants.js";
import { shuffleArray } from "../utils/random.js";

/**
 * Distribute players into lots with equal representation of each position per lot.
 * Positions are balanced across lots first, then shuffled for variety within each lot.
 */
export function distributeLotsByPosition(players, tiers) {
  if (!players.length || !LOTS) return {};
  
  const lots = {};
  for (let i = 0; i < LOTS; i++) {
    lots[i + 1] = [];
  }

  // Separate players by position group
  const byPosition = {};
  const positionGroups = ["GK", "DEF", "MID", "ATT"];
  
  positionGroups.forEach(posGroup => {
    byPosition[posGroup] = players.filter(p => getPosGroup(p.pos) === posGroup);
    // Shuffle within each position to add variety while reducing tier clustering
    byPosition[posGroup] = shuffleArray(byPosition[posGroup]);
  });

  // Distribute each position round-robin across lots to balance representation
  for (const posGroup of positionGroups) {
    byPosition[posGroup].forEach((player, index) => {
      const lotNum = (index % LOTS) + 1;
      lots[lotNum].push(player);
    });
  }

  return lots;
}

/**
 * Distribute players into lots using balanced per-tier spread.
 * @deprecated Use distributeLotsByPosition instead for position-balanced lots
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
 * Assign lot numbers to each player based on position-balanced distribution
 */
export function assignLotsToPlayers(players, tiers) {
  // Use position-balanced distribution instead of tier-based
  const lots = distributeLotsByPosition(players, tiers);
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
