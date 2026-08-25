/**
 * Server-side port of every "secret" auction-generation step: lot assignment, Mystery Card
 * pools + initial candidates, draw order, pick sequence, and group/fixture assignment.
 *
 * None of this may ever run in a client's browser (including the host's) — otherwise whoever's
 * browser computes it can simply read its own in-memory/outgoing-request values and get an
 * unfair look at information that's supposed to stay hidden until the game reveals it.
 */
import { rerollMysteryCandidates } from "./mysteryCard.js";

const POS_GROUPS = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CDM", "CM", "CAM", "LM", "RM"],
  ATT: ["ST", "CF", "LW", "RW", "SS"],
};
const POSITION_GROUP_KEYS = Object.keys(POS_GROUPS);

function getPosGroup(pos) {
  return POSITION_GROUP_KEYS.find((key) => POS_GROUPS[key].includes(pos)) || "MID";
}

function getTierKey(rating, tiers) {
  const entry = Object.entries(tiers || {}).find(([, t]) => rating >= t.min && rating <= t.max);
  return entry ? entry[0] : Object.keys(tiers || {})[0] || "A";
}

function shuffleArray(items) {
  const out = Array.isArray(items) ? [...items] : [];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Mirrors src/game/lotDistribution.js#assignLotsToPlayers. */
function assignLotsToPlayers(players, tiers, lots) {
  if (!players.length || !lots) return [];

  const result = {};
  for (let i = 0; i < lots; i += 1) result[i + 1] = [];

  const tierKeys = Object.keys(tiers || {});
  let bucketOffset = 0;

  for (const tierKey of tierKeys) {
    for (const posGroup of POSITION_GROUP_KEYS) {
      const bucket = shuffleArray(
        players.filter(
          (player) => getTierKey(player.rating, tiers) === tierKey && getPosGroup(player.pos) === posGroup
        )
      );

      const startLot = bucketOffset % lots;
      bucketOffset += 1;

      bucket.forEach((player, index) => {
        const lotNum = ((startLot + index) % lots) + 1;
        result[lotNum].push(player);
      });
    }
  }

  for (let i = 1; i <= lots; i += 1) {
    result[i] = shuffleArray(result[i]);
  }

  const withLots = [];
  for (const [lotNum, lotPlayers] of Object.entries(result)) {
    for (const player of lotPlayers) {
      withLots.push({ ...player, lot: parseInt(lotNum, 10) });
    }
  }
  return withLots;
}

/** Mirrors src/game/mysteryCard.js#buildMysteryPools / getMysteryEligiblePlayers. */
function buildMysteryPools(players, participantNames, minRating) {
  const names = (Array.isArray(participantNames) ? participantNames : []).filter(Boolean);
  const pools = {};
  names.forEach((name) => { pools[name] = []; });
  if (names.length === 0) return pools;

  const eligible = shuffleArray((players || []).filter((p) =>
    Number(p?.rating) >= minRating && String(p?.pos || "").toUpperCase() !== "GK"
  ));
  eligible.forEach((player, index) => {
    const name = names[index % names.length];
    pools[name].push(player.id);
  });

  return pools;
}

const GROUP_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Mirrors src/game/groupsFixtures.js#assignGroups. */
function assignGroups(participantNames, groupCount) {
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

/** Mirrors src/game/groupsFixtures.js#generateRoundRobinFixtures. */
function generateRoundRobinFixtures(teamNames) {
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
        const swap = round % 2 === 1;
        fixtures.push({ round: round + 1, home: swap ? away : home, away: swap ? home : away });
      }
    }
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  return fixtures;
}

/** Mirrors src/game/groupsFixtures.js#buildGroupFixtures. */
function buildGroupFixtures(groups) {
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

const MYSTERY_MIN_RATING = 87;

/**
 * Given a host-supplied auction spec, generates every random/secret piece of the auction
 * server-side: lot assignment, draw order, pick sequence, Mystery Card pools + initial
 * candidates, and group/fixture assignment. The host receives none of this back directly —
 * only the sanitized (empty-during-draw-phase) session view, same as every other participant.
 */
export function generateAuctionSetup({
  selectedPlayers,
  tiers,
  participantNames,
  mysteryEnabled,
  groupsEnabled,
  groupCount,
}) {
  const numLots = participantNames.length;
  const lotOrder = shuffleArray(Array.from({ length: numLots }, (_, i) => i + 1));
  const lotAssignedPlayers = assignLotsToPlayers(selectedPlayers, tiers, numLots);
  const shuffledPlayers = shuffleArray(lotAssignedPlayers).sort((a, b) => a.lot - b.lot);
  const sequence = shuffleArray(participantNames);

  const mysteryPools = mysteryEnabled ? buildMysteryPools(selectedPlayers, sequence, MYSTERY_MIN_RATING) : {};
  const mysteryCurrent = mysteryEnabled ? rerollMysteryCandidates(mysteryPools, {}) : {};

  const groups = groupsEnabled ? assignGroups(sequence, groupCount) : {};
  const fixtures = groupsEnabled ? buildGroupFixtures(groups) : {};

  return {
    lotOrder,
    sequence,
    playerPool: lotAssignedPlayers,
    shuffledPlayers,
    mysteryPools,
    mysteryCurrent,
    groups,
    fixtures,
  };
}
