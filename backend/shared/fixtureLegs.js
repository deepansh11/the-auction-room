export function fixtureLegCount(value) {
  return value === "triple" ? 3 : value === "double" ? 2 : 1;
}

export function normalizeFixtureLeg(value, fallback = "single") {
  return ["single", "double", "triple"].includes(value) ? value : fallback;
}

// Keep existing single/double fixture IDs. The third leg gets a separate namespace.
export function expandFixtureLegs(single, label, count) {
  const rounds = Math.max(0, ...single.map(fixture => fixture.round));
  const fixtures = [];
  single.forEach((fixture, index) => {
    fixtures.push({ id: `${label}-${count === 1 ? index : index * 2}`, ...fixture, leg: 1, homeGoals: null, awayGoals: null });
    if (count >= 2) fixtures.push({ id: `${label}-${index * 2 + 1}`, round: fixture.round + rounds, home: fixture.away, away: fixture.home, leg: 2, homeGoals: null, awayGoals: null });
  });
  if (count === 3) single.forEach((fixture, index) => fixtures.push({ id: `${label}-leg3-${index}`, ...fixture, round: fixture.round + rounds * 2, leg: 3, homeGoals: null, awayGoals: null }));
  return fixtures;
}

// Safe upgrade for an existing double round robin: no old fixture is rewritten or removed.
export function appendThirdLeg(groups, previousFixtures) {
  const fixtures = { ...previousFixtures };
  let added = 0;
  for (const [label, teams] of Object.entries(groups)) {
    if (!Array.isArray(teams) || teams.length < 2) continue;
    const previous = previousFixtures[label] || [];
    const rounds = teams.length % 2 === 0 ? teams.length - 1 : teams.length;
    const pairs = new Map();
    for (const fixture of previous) {
      if (!teams.includes(fixture.home) || !teams.includes(fixture.away) || fixture.home === fixture.away) throw new Error(`Unexpected teams in group ${label}; refusing to rewrite fixtures.`);
      const key = JSON.stringify([fixture.home, fixture.away].sort());
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(fixture);
    }
    if (pairs.size !== teams.length * (teams.length - 1) / 2 || [...pairs.values()].some(pair => pair.length !== 2 && pair.length !== 3)) {
      throw new Error(`Group ${label} is not a two/three-leg round robin; manual review is required.`);
    }
    const ids = new Set(previous.map(fixture => fixture.id));
    const extra = [];
    for (const pair of pairs.values()) {
      if (pair.length === 3) continue;
      const first = [...pair].sort((a, b) => a.round - b.round)[0];
      if (first.round < 1 || first.round > rounds) throw new Error(`Could not identify first leg in group ${label}.`);
      let id = `${label}-leg3-${extra.length}`;
      while (ids.has(id)) id += "-new";
      ids.add(id);
      extra.push({ id, round: first.round + rounds * 2, home: first.home, away: first.away, leg: 3, homeGoals: null, awayGoals: null });
    }
    fixtures[label] = [...previous, ...extra];
    added += extra.length;
  }
  return { fixtures, added };
}
