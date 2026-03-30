import { LOTS, getTierKey } from "../game/constants.js";

/**
 * Distribute players into lots, ensuring at least 1 S+ player per lot when possible
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
    byTier[tierKey].sort(() => Math.random() - 0.5); // Shuffle within tier
  });

  const tierKeys = Object.keys(tiers).sort((a, b) => {
    // S+ first, then descending
    if (a === "S+") return -1;
    if (b === "S+") return 1;
    return 0;
  });

  // First pass: ensure each lot gets at least 1 S+ if available
  const sPlusCount = byTier["S+"]?.length || 0;
  if (sPlusCount > 0) {
    const sPlusPerLot = Math.floor(sPlusCount / LOTS);
    const sPlusExtra = sPlusCount % LOTS;
    let sPlusIdx = 0;
    
    for (let i = 0; i < LOTS; i++) {
      const count = sPlusPerLot + (i < sPlusExtra ? 1 : 0);
      for (let j = 0; j < count && sPlusIdx < byTier["S+"].length; j++) {
        lots[i + 1].push(byTier["S+"][sPlusIdx++]);
      }
    }
  }

  // Second pass: distribute remaining players
  for (const tierKey of tierKeys) {
    if (tierKey === "S+") continue;
    for (const player of byTier[tierKey]) {
      // Find lot with fewest players
      let minLot = 1;
      let minCount = lots[1].length;
      for (let i = 2; i <= LOTS; i++) {
        if (lots[i].length < minCount) {
          minLot = i;
          minCount = lots[i].length;
        }
      }
      lots[minLot].push(player);
    }
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
