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
 * Build fixtures for every group at once. Returns { A: [{id, round, home, away, homeGoals, awayGoals}], ... }.
 */
export function buildGroupFixtures(groups) {
  const fixtures = {};
  Object.entries(groups || {}).forEach(([label, teams]) => {
    fixtures[label] = generateRoundRobinFixtures(teams).map((f, i) => ({
      id: `${label}-${i}`,
      ...f,
      homeGoals: null,
      awayGoals: null,
    }));
  });
  return fixtures;
}

/**
 * Build the knockout bracket seedings for a given set of groups.
 * Standard World-Cup format: 1A vs 2B, 1B vs 2A (2 groups), extended for more.
 * Returns an array of { id, round, homeKey, awayKey } where keys are like "1A" / "2B".
 */
export function computeKnockoutMatchups(groupLabels) {
  const labels = (groupLabels || []).filter(Boolean).sort();
  const n = labels.length;
  if (n < 2) return [];

  const matchups = [];
  // Pair groups in halves: first half vs second half in cross pattern
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
