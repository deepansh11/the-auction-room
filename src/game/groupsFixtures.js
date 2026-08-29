import { shuffleArray } from "../utils/random.js";

const GROUP_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Randomly split participant names into `groupCount` groups, dealt round-robin so group sizes
 * differ by at most one. Returns { A: [names], B: [names], ... }.
 */
export function assignGroups(participantNames, groupCount) {
  const names = shuffleArray((participantNames || []).filter(Boolean));
  const count = Math.max(1, Math.floor(Number(groupCount) || 1));
  const groups = {};
  for (let i = 0; i < count; i += 1) groups[GROUP_LABELS[i] || `G${i + 1}`] = [];

  names.forEach((name, index) => {
    const label = GROUP_LABELS[index % count] || `G${(index % count) + 1}`;
    groups[label].push(name);
  });

  return groups;
}

/**
 * Single round-robin schedule (each pair plays exactly once) using the standard "circle method".
 * Returns a flat array of { round, home, away }. Byes (for odd team counts) are dropped.
 */
export function generateRoundRobinFixtures(teamNames) {
  const teams = (teamNames || []).filter(Boolean);
  if (teams.length < 2) return [];

  const hasBye = teams.length % 2 !== 0;
  const roster = hasBye ? [...teams, null] : [...teams];
  const n = roster.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixed = roster[0];
  let rotating = roster.slice(1);
  const fixtures = [];

  for (let round = 0; round < rounds; round += 1) {
    const roundTeams = [fixed, ...rotating];
    for (let i = 0; i < half; i += 1) {
      const home = roundTeams[i];
      const away = roundTeams[n - 1 - i];
      if (home != null && away != null) {
        // Alternate home/away across rounds so no single team always hosts.
        const swap = round % 2 === 1;
        fixtures.push({
          round: round + 1,
          home: swap ? away : home,
          away: swap ? home : away,
        });
      }
    }
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  return fixtures;
}

/**
 * Generate extra balanced fixtures so that every team in `teams` plays exactly
 * `extraPerTeam` additional matches. Uses the circle-method rotation and greedily
 * adds a fixture only when both teams still need more matches, cycling through
 * rounds until the target is met for every team.
 *
 * Precondition: teams.length * extraPerTeam must be even (caller ensures this).
 */
function generateBalancedExtra(teams, extraPerTeam, idxOffset, label, roundOffset) {
  const m = teams.length;
  if (m < 2 || extraPerTeam <= 0) return [];

  const hasBye = m % 2 !== 0;
  const roster = hasBye ? [...teams, null] : [...teams];
  const n = roster.length;
  const half = n / 2;
  const rounds = n - 1;
  const fixed = roster[0];

  const extra = [];
  const counts = {};
  teams.forEach((t) => { counts[t] = 0; });

  let fixtureIdx = 0;
  let done = false;

  for (let cycle = 0; !done && cycle < 20; cycle += 1) {
    let rotating = roster.slice(1);

    for (let r = 0; r < rounds && !done; r += 1) {
      const roundTeams = [fixed, ...rotating];
      const swap = r % 2 === 1;

      for (let i = 0; i < half; i += 1) {
        const h = roundTeams[i];
        const a = roundTeams[n - 1 - i];
        if (h != null && a != null && counts[h] < extraPerTeam && counts[a] < extraPerTeam) {
          extra.push({
            id: `${label}-${idxOffset + fixtureIdx}`,
            round: roundOffset + fixtureIdx + 1,
            home: swap ? a : h,
            away: swap ? h : a,
            homeGoals: null,
            awayGoals: null,
          });
          counts[h] += 1;
          counts[a] += 1;
          fixtureIdx += 1;
        }
      }

      rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
      done = teams.every((t) => counts[t] >= extraPerTeam);
    }
  }

  return extra;
}

/**
 * Build fixtures for every group at once, equalising match counts across groups.
 *
 * leg = "double" (default) — home + away leg for every pair.
 * leg = "single"           — one match per pair.
 *
 * When groups differ in size (e.g. 9 players → groups of 5 and 4), teams in
 * smaller groups receive extra "padding" fixtures so every team plays the same
 * number of matches as teams in the largest group.
 *
 * Edge case: if a group has an odd number of teams and the required extras are
 * odd (making equal distribution impossible), we round up by 1 so the total is
 * always an even number of fixtures.
 *
 * Returns { A: [{id, round, home, away, homeGoals, awayGoals}], ... }.
 */
export function buildGroupFixtures(groups, leg = "double") {
  const allSizes = Object.values(groups || {}).map((t) => (t || []).filter(Boolean).length);
  const maxSize = allSizes.length > 0 ? Math.max(...allSizes) : 0;
  const legFactor = leg === "double" ? 2 : 1;
  let targetPerTeam = legFactor * Math.max(maxSize - 1, 0);

  // If any odd-sized group would receive an odd number of extra fixtures, bump the
  // global target by 1 so every group reaches the same (now even-remainder) value.
  // This keeps all teams equal without over-shooting anyone.
  const hasOddGroupWithOddExtra = allSizes.some((m) => {
    if (m % 2 === 0) return false;
    const extra = targetPerTeam - legFactor * Math.max(m - 1, 0);
    return extra > 0 && extra % 2 !== 0;
  });
  if (hasOddGroupWithOddExtra) targetPerTeam += 1;

  const fixtures = {};

  Object.entries(groups || {}).forEach(([label, teams]) => {
    const cleanTeams = (teams || []).filter(Boolean);
    if (cleanTeams.length < 2) { fixtures[label] = []; return; }

    const single = generateRoundRobinFixtures(cleanTeams);
    const maxRound = single.length > 0 ? Math.max(...single.map((f) => f.round)) : 0;

    // Build the base fixtures (single or double leg).
    const base = [];
    if (leg === "double") {
      single.forEach((f, i) => {
        base.push({ id: `${label}-${i * 2}`, ...f, homeGoals: null, awayGoals: null });
        base.push({
          id: `${label}-${i * 2 + 1}`,
          round: f.round + maxRound,
          home: f.away,
          away: f.home,
          homeGoals: null,
          awayGoals: null,
        });
      });
    } else {
      single.forEach((f, i) => {
        base.push({ id: `${label}-${i}`, ...f, homeGoals: null, awayGoals: null });
      });
    }

    // Equalise: add extra fixtures so this group's teams reach targetPerTeam.
    const currentPerTeam = legFactor * (cleanTeams.length - 1);
    let extraPerTeam = targetPerTeam - currentPerTeam;

    // For odd-sized groups, m * extraPerTeam must be even.
    // m odd + extraPerTeam odd → product is odd → impossible → round up by 1.
    if (cleanTeams.length % 2 !== 0 && extraPerTeam % 2 !== 0) {
      extraPerTeam += 1;
    }

    if (extraPerTeam > 0) {
      const roundOffset = leg === "double" ? maxRound * 2 : maxRound;
      const extra = generateBalancedExtra(cleanTeams, extraPerTeam, base.length, label, roundOffset);
      fixtures[label] = [...base, ...extra];
    } else {
      fixtures[label] = base;
    }
  });

  return fixtures;
}

/**
 * Build the knockout bracket first-round seedings.
 *
 * knockoutFormat:
 *   "semiFinal"    — 4 qualifiers, SF → Final (default; backward-compat R16-* IDs)
 *   "quarterFinal" — 8 qualifiers (top 4 per group for 2 groups), QF → SF → Final
 *   "finalOnly"    — 2 qualifiers, straight to Final (returns [] — Final rendered directly)
 *
 * Returns an array of { id, round, homeKey, awayKey } where keys are like "1A" / "2B".
 */
export function computeKnockoutMatchups(groupLabels, knockoutFormat = "quarterFinal") {
  const labels = (groupLabels || []).filter(Boolean).sort();
  const n = labels.length;
  if (n < 2) return [];

  if (knockoutFormat === "finalOnly") {
    // No pre-final round; the Final is rendered directly with 1st from each half.
    return [];
  }

  if (knockoutFormat === "quarterFinal") {
    // World Cup crossover: top 4 from each group (designed for 2 groups).
    // Left bracket half: 1A v 4B, 2A v 3B  →  SF-0
    // Right bracket half: 1B v 4A, 2B v 3A →  SF-1
    const qualPerGroup = 4; // fixed for 2-group QF format
    const matchups = [];
    const half = Math.ceil(n / 2);
    for (let i = 0; i < half; i++) {
      const g1 = labels[i];
      const g2 = labels[n - 1 - i];
      if (g1 === g2) continue;
      // Left bracket: top seeds of g1 vs bottom seeds of g2
      for (let q = 0; q < qualPerGroup / 2; q++) {
        const top = q + 1;
        const bot = qualPerGroup - q;
        matchups.push({ id: `QF-${matchups.length}`, round: "QF", homeKey: `${top}${g1}`, awayKey: `${bot}${g2}` });
      }
      // Right bracket: top seeds of g2 vs bottom seeds of g1
      for (let q = 0; q < qualPerGroup / 2; q++) {
        const top = q + 1;
        const bot = qualPerGroup - q;
        matchups.push({ id: `QF-${matchups.length}`, round: "QF", homeKey: `${top}${g2}`, awayKey: `${bot}${g1}` });
      }
    }
    return matchups;
  }

  // "semiFinal" — backward-compat R16-* IDs so stored knockoutScores still resolve.
  const matchups = [];
  const half = Math.ceil(n / 2);
  for (let i = 0; i < half; i++) {
    const g1 = labels[i];
    const g2 = labels[n - 1 - i];
    if (g1 !== g2) {
      matchups.push({ id: `R16-${i * 2}`,     round: "R16", homeKey: `1${g1}`, awayKey: `2${g2}` });
      matchups.push({ id: `R16-${i * 2 + 1}`, round: "R16", homeKey: `1${g2}`, awayKey: `2${g1}` });
    }
  }
  return matchups;
}

/**
 * Compute a standings table for one group from its fixtures. Only fixtures with both goal
 * counts filled in count towards the table. Tiebreak: points -> goal difference -> goals scored.
 */
export function computeGroupTable(teamNames, fixtures) {
  const table = {};
  (teamNames || []).forEach((name) => {
    table[name] = { name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
  });

  (fixtures || []).forEach((f) => {
    if (f.homeGoals == null || f.awayGoals == null) return;
    const hg = Number(f.homeGoals);
    const ag = Number(f.awayGoals);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) return;
    if (!table[f.home] || !table[f.away]) return;

    const home = table[f.home];
    const away = table[f.away];
    home.played += 1;
    away.played += 1;
    home.gf += hg; home.ga += ag;
    away.gf += ag; away.ga += hg;

    if (hg > ag) { home.won += 1; home.points += 3; away.lost += 1; }
    else if (hg < ag) { away.won += 1; away.points += 3; home.lost += 1; }
    else { home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1; }
  });

  const rows = Object.values(table).map((row) => ({ ...row, gd: row.gf - row.ga }));
  rows.sort((a, b) => (b.points - a.points) || (b.gd - a.gd) || (b.gf - a.gf) || a.name.localeCompare(b.name));
  return rows;
}
