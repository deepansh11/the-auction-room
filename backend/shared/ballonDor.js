export const BALLON_DOR_FORMULA = "1 point per goal + 0.75 per assist + 1 bonus per three goals in a match";
export const BALLON_DOR_SCORING_VERSION = "goals-assists-hattricks-v1";

export function playerNameKey(value) {
  return String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function statCount(value) {
  if (value === "" || value === null || value === undefined) return 0;
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value.trim()))) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function rosterForTeam(team) {
  const byId = new Map();
  [...(team?.squad || []), ...(team?.soldPlayers || [])].forEach(player => {
    if (player?.id != null && player?.name && !byId.has(String(player.id))) byId.set(String(player.id), player);
  });
  return [...byId.values()];
}

export function manualStatRows(team, submission) {
  const saved = Array.isArray(submission?.players) ? submission.players : [];
  const used = new Set();
  const rows = rosterForTeam(team).map(player => {
    const index = saved.findIndex((entry, i) => !used.has(i) && (String(entry.id) === String(player.id) || playerNameKey(entry.name) === playerNameKey(player.name)));
    if (index >= 0) used.add(index);
    return { id: String(player.id), name: player.name, pos: player.pos || "", goals: saved[index]?.goals ?? 0, assists: saved[index]?.assists ?? 0 };
  });
  // Never silently erase historical entries that no longer appear in today's squad.
  const rowIds = new Set(rows.map(player => player.id));
  saved.forEach((player, index) => {
    const id = String(player.id || `legacy-${index}`);
    if (!used.has(index) && !rowIds.has(id) && player.name) {
      rows.push({ id, name: player.name, goals: player.goals ?? 0, assists: player.assists ?? 0, legacy: true });
      rowIds.add(id);
    }
  });
  return rows;
}

export function matchPlayerScore(goals, assists) {
  return goals + assists * 0.75 + Math.floor(goals / 3);
}

export function buildBallonDorRanking(submissions = []) {
  const byPlayer = new Map();
  // A resave replaces a team's match stats; duplicated snapshots must not inflate the table.
  const latest = new Map();
  submissions.forEach((submission, index) => {
    const key = submission.fixtureId && submission.mappedParticipantName
      ? JSON.stringify([submission.auctionResultId || "", submission.fixtureId, submission.mappedParticipantName]) : `legacy-${index}`;
    const previous = latest.get(key);
    if (!previous || Number(submission.updatedAt || 0) >= Number(previous.updatedAt || 0)) latest.set(key, submission);
  });
  latest.forEach((submission, index) => {
    const seen = new Set();
    (Array.isArray(submission.players) ? submission.players : []).forEach(player => {
      const key = playerNameKey(player?.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      const goals = statCount(player.goals) ?? 0;
      const assists = statCount(player.assists) ?? 0;
      const existing = byPlayer.get(key) || { playerKey: key, playerName: String(player.name).trim(), goals: 0, assists: 0, hatTrickCount: 0, teams: new Set(), fixtures: new Set() };
      existing.goals += goals;
      existing.assists += assists;
      existing.hatTrickCount += Math.floor(goals / 3);
      if (submission.mappedParticipantName) existing.teams.add(submission.mappedParticipantName);
      existing.fixtures.add(submission.fixtureId || submission.fixtureLabel || `legacy-${index}`);
      byPlayer.set(key, existing);
    });
  });
  return [...byPlayer.values()].map(entry => ({
    ...entry, teams: [...entry.teams], fixtures: [...entry.fixtures], submissions: entry.fixtures.size,
    ballonDorScore: Number((entry.goals + entry.assists * 0.75 + entry.hatTrickCount).toFixed(2)),
  })).sort((a, b) => b.ballonDorScore - a.ballonDorScore || b.goals - a.goals || b.assists - a.assists || a.playerName.localeCompare(b.playerName));
}
