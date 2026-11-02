export function recommendedPlayerExclusions(players, participantCount, playersPerPerson = 26) {
  const sorted = players.filter(player => player.rating >= 80).slice().sort((a, b) => b.rating - a.rating);
  const selected = new Set(sorted.slice(0, participantCount * playersPerPerson).map(player => player.id));
  return new Set(sorted.filter(player => !selected.has(player.id)).map(player => player.id));
}

export function validateAuctionSetup({ name, names, budget, players, tiers, host }) {
  const errors = [];
  if (!name.trim() || name.trim().length > 120) errors.push("Enter an auction name between 1 and 120 characters.");
  if (names.length < 2 || names.length > 10) errors.push("Choose between 2 and 10 participants.");
  if (names.some(value => !value.trim() || value.trim().length > 40)) errors.push("Each participant needs a username or an open-seat name, up to 40 characters.");
  if (new Set(names.map(value => value.trim().toLowerCase())).size !== names.length) errors.push("Participant names must be unique.");
  if (!names.map(value => value.trim()).includes(host)) errors.push("Keep your own account in the host seat.");
  if (!Number.isFinite(Number(budget)) || Number(budget) <= 0) errors.push("Enter a budget greater than zero.");
  if (!players.length) errors.push("Select at least one player in Player pool.");
  const rules = Object.values(tiers);
  const validTiers = rules.length > 0 && rules.every(tier => [tier.min, tier.max, tier.price].every(Number.isFinite)
    && tier.min >= 0 && tier.max <= 100 && tier.min <= tier.max && tier.price > 0);
  if (!validTiers) errors.push("Each price tier needs a valid rating range (0–100) and a price greater than zero.");
  else if (players.some(player => rules.filter(tier => player.rating >= tier.min && player.rating <= tier.max).length !== 1)) {
    errors.push("Every selected player must match exactly one price tier. Check gaps or overlapping rating ranges.");
  }
  return errors;
}
