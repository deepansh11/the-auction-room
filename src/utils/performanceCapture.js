function normalizeLine(line) {
  return String(line || "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[|•●°©]/g, " ")
    .trim();
}

function looksLikePlayerName(line) {
  const value = normalizeLine(line);
  if (!value) return false;
  if (value.length > 36) return false;
  if (/^(player performance|name|back|sort|scroll|summary|possession|shooting|passing|defending|goalkeeping|overall position|total rating|goals|assists|shots|shot accuracy|passes|pass accuracy|dribbles|dribble success|tackles|tackle success|offsides|fouls committed|possession won|possession lost|minutes played|distance covered|distance sprinted)$/i.test(value)) {
    return false;
  }
  if (/^[0-9.-]+$/.test(value)) return false;
  if (!/[a-z]/i.test(value)) return false;
  const withoutPreamble = value.replace(/^(?:LW|ST|RW|CAM|LCM|RCM|LAM|RAM|LDM|CDM|RDM|LB|LCB|RCB|RB|GK|LM|RM|CF|AM|CB|CM|DM|RW|LF|RF|DF|FW)\s+/i, "");
  return withoutPreamble.length >= 2 && /[A-Za-z]/.test(withoutPreamble);
}

function looksLikeTeamName(line) {
  const value = normalizeLine(line);
  if (!value || value.length < 3 || value.length > 40) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  return /FC|UNITED|CITY|TOWN|CLUB|SPORTING|ATHLETIC|REAL|SC|CF|AFC|BENGALURU|NORTHEAST/i.test(value)
    || value === value.toUpperCase();
}

function normalizeTeamKey(value = "") {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function parseNumericBlock(lines, startIndex, endIndex, { allowFloat = false, max = 99 } = {}) {
  return lines
    .slice(startIndex, endIndex)
    .map(normalizeLine)
    .filter(Boolean)
    .map((line) => allowFloat ? Number.parseFloat(line) : Number.parseInt(line, 10))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= max);
}

function findMarkerIndex(lines, marker, fromIndex = 0) {
  const needle = String(marker || "").toLowerCase();
  return lines.findIndex((line, index) => index >= fromIndex && normalizeLine(line).toLowerCase() === needle);
}

const POSITION_TOKENS = new Set([
  "GK", "RB", "LB", "CB", "RCB", "LCB", "RWB", "LWB",
  "CDM", "RDM", "LDM", "CM", "RCM", "LCM", "CAM", "RAM", "LAM",
  "RM", "LM", "RW", "LW", "RF", "LF", "CF", "ST", "AM", "DM",
]);

const POSITION_ALIASES = {
  L8: "LB",
  R8: "RB",
  C8: "CB",
  GK: "GK",
};

function sanitizeOcrToken(token) {
  return String(token || "")
    .replace(/[<>{}[\]()]/g, "")
    .replace(/[,]/g, ".");
}

function normalizeNumericLikeToken(token) {
  const raw = sanitizeOcrToken(token);
  if (/[A-HJ-NPR-TV-Za-hj-npr-tv-z]/.test(raw)) return raw;
  return raw
    .replace(/[OoQqD©¢]/g, "0")
    .replace(/[|Il]/g, "1")
    .replace(/[Ss]/g, "5");
}

function parseRatingToken(token) {
  const sanitized = normalizeNumericLikeToken(token).replace(/[^0-9.]/g, "");
  if (!sanitized) return null;
  const numeric = Number.parseFloat(sanitized);
  if (!Number.isFinite(numeric)) return null;
  if (numeric >= 40 && numeric <= 99) return Number((numeric / 10).toFixed(1));
  if (numeric >= 4 && numeric <= 10) return Number(numeric.toFixed(1));
  return null;
}

function parseStatToken(token) {
  const sanitized = normalizeNumericLikeToken(token).replace(/[^0-9]/g, "");
  if (!sanitized) return null;
  const numeric = Number.parseInt(sanitized, 10);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 20 ? numeric : null;
}

function cleanNameToken(token) {
  return String(token || "")
    .replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ]+/, "")
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ.\-'’]/g, "");
}

function normalizePositionToken(token) {
  const value = String(token || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (POSITION_TOKENS.has(value)) return value;
  if (POSITION_ALIASES[value]) return POSITION_ALIASES[value];
  return value
    .replace(/8/g, "B")
    .replace(/0/g, "O");
}

function countVisiblePlayerSlots(lines) {
  const count = lines.filter((line) => {
    const firstToken = normalizeLine(line).split(" ").filter(Boolean)[0];
    const normalized = normalizePositionToken(firstToken);
    return POSITION_TOKENS.has(normalized);
  }).length;
  return count >= 10 ? 12 : count;
}

function parsePlayerRowLine(line) {
  const cleaned = normalizeLine(line);
  if (!cleaned) return null;
  const tokens = cleaned.split(" ").filter(Boolean);
  const pos = normalizePositionToken(tokens[0]);
  if (!POSITION_TOKENS.has(pos)) return null;

  const nameTokens = [];
  const statValues = [];
  let rating = null;

  for (const rawToken of tokens.slice(1)) {
    if (rating === null) {
      const maybeRating = parseRatingToken(rawToken);
      if (maybeRating !== null) {
        rating = maybeRating;
        continue;
      }

      const nextNameToken = cleanNameToken(rawToken);
      if (nextNameToken) nameTokens.push(nextNameToken);
      continue;
    }

    const maybeStat = parseStatToken(rawToken);
    if (maybeStat !== null) statValues.push(maybeStat);
  }

  const name = normalizeLine(nameTokens.join(" "));
  const alphaOnlyName = name.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (!name || alphaOnlyName.length < 4 || rating === null) return null;

  return {
    name,
    rating,
    goals: statValues.length > 0 ? statValues[0] : "",
    assists: statValues.length > 1 ? statValues[1] : "",
  };
}

function collectLikelyPlayerRows(lines) {
  const rosterStart = lines.findIndex((line) => /\bPOSA\b/i.test(line) && /\bName\b/i.test(line));
  const rosterEnd = lines.findIndex((line, index) => index > rosterStart && /overall position|back|sort|scroll/i.test(line));
  const candidateLines = lines.slice(rosterStart >= 0 ? rosterStart + 1 : 0, rosterEnd > rosterStart ? rosterEnd : lines.length);

  const rows = candidateLines
    .map(parsePlayerRowLine)
    .filter(Boolean);

  const deduped = [];
  const seen = new Set();
  rows.forEach((row) => {
    const key = `${row.name}-${row.rating}-${row.goals}-${row.assists}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(row);
  });
  return deduped;
}

export function parsePerformanceCaptureText(rawText = "") {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const nameIndex = findMarkerIndex(lines, "Name");
  const rrIndex = findMarkerIndex(lines, "RR", Math.max(0, nameIndex));
  const goalsIndex = findMarkerIndex(lines, "G", Math.max(0, rrIndex));
  const assistsIndex = findMarkerIndex(lines, "AST", Math.max(0, goalsIndex));
  const summaryIndex = lines.findIndex((line) => /^summary$/i.test(line));
  const ovrIndex = findMarkerIndex(lines, "OVR");
  const totalRatingLine = lines.find((line) => /Total Rating:/i.test(line));
  const totalRatingMatch = totalRatingLine?.match(/Total Rating:\s*([0-9]+(?:\.[0-9]+)?)/i);
  const overallBeforeOvr = ovrIndex > 0 ? Number.parseFloat(lines[ovrIndex - 1]) : null;

  const fuzzyPlayerRows = collectLikelyPlayerRows(lines);
  const names = fuzzyPlayerRows.map((row) => row.name);
  const ratings = fuzzyPlayerRows.map((row) => row.rating);
  const goals = fuzzyPlayerRows.map((row) => row.goals);
  const assists = fuzzyPlayerRows.map((row) => row.assists);

  const fallbackNames = nameIndex >= 0 && rrIndex > nameIndex
    ? lines.slice(nameIndex + 1, rrIndex).filter(looksLikePlayerName)
    : [];
  const fallbackRatings = rrIndex >= 0 && goalsIndex > rrIndex
    ? parseNumericBlock(lines, rrIndex + 1, goalsIndex, { allowFloat: true, max: 10 })
    : [];
  const fallbackGoals = goalsIndex >= 0 && assistsIndex > goalsIndex
    ? parseNumericBlock(lines, goalsIndex + 1, assistsIndex, { allowFloat: false, max: 20 })
    : [];
  const assistsBlockEnd = summaryIndex > assistsIndex ? summaryIndex : lines.length;
  const fallbackAssists = assistsIndex >= 0
    ? parseNumericBlock(lines, assistsIndex + 1, assistsBlockEnd, { allowFloat: false, max: 20 })
    : [];

  const resolvedNames = fuzzyPlayerRows.length > 0 ? names : fallbackNames;
  const resolvedRatings = fuzzyPlayerRows.length > 0 ? ratings : fallbackRatings;
  const resolvedGoals = fuzzyPlayerRows.length > 0 ? goals : fallbackGoals;
  const resolvedAssists = fuzzyPlayerRows.length > 0 ? assists : fallbackAssists;

  const playerCount = Math.max(resolvedNames.length, resolvedRatings.length, resolvedGoals.length, resolvedAssists.length);
  const parsedPlayers = Array.from({ length: playerCount }, (_, index) => ({
    id: `scan-${index + 1}`,
    name: resolvedNames[index] || "",
    rating: Number.isFinite(resolvedRatings[index]) ? resolvedRatings[index] : "",
    goals: Number.isFinite(resolvedGoals[index]) ? resolvedGoals[index] : 0,
    assists: Number.isFinite(resolvedAssists[index]) ? resolvedAssists[index] : 0,
    isPlayerOfTheMatch: false,
  }));
  const expectedVisiblePlayerCount = Math.max(parsedPlayers.length, countVisiblePlayerSlots(lines));
  const missingVisiblePlayerCount = Math.max(0, expectedVisiblePlayerCount - parsedPlayers.length);
  const players = [
    ...parsedPlayers,
    ...Array.from({ length: missingVisiblePlayerCount }, (_, index) => ({
      id: `manual-missing-${index + 1}`,
      name: "",
      rating: "",
      goals: "",
      assists: "",
      isPlayerOfTheMatch: false,
      isManualPlaceholder: true,
    })),
  ];

  const markers = {
    hasName: nameIndex >= 0 || resolvedNames.length > 0,
    hasRr: rrIndex >= 0 || resolvedRatings.length > 0,
    hasGoals: goalsIndex >= 0 || resolvedGoals.length > 0,
    hasAssists: assistsIndex >= 0 || resolvedAssists.length > 0,
  };

  return {
    rawText: String(rawText || ""),
    lines,
    markers,
    players,
    expectedVisiblePlayerCount,
    missingVisiblePlayerCount,
  };
}

export function validatePerformanceCaptureDraft({
  mappedParticipantName = "",
  fixtureId = "",
  draft = {},
  participants = [],
  fixtures = [],
}) {
  const warnings = [];
  const playerRows = Array.isArray(draft.players) ? draft.players : [];
  const populatedPlayers = playerRows.filter((player) => normalizeLine(player?.name));
  const numericRatings = populatedPlayers.filter((player) => Number.isFinite(Number(player?.rating)));

  if (!mappedParticipantName) warnings.push("Select which league team this upload belongs to.");
  if (!fixtureId) warnings.push("Select the match this performance screen belongs to.");
  if (!draft?.markers?.hasName || !draft?.markers?.hasRr || !draft?.markers?.hasGoals || !draft?.markers?.hasAssists) {
    warnings.push("The capture should include the Name, RR, G and AST columns.");
  }
  if (populatedPlayers.length < 5) warnings.push("We could only detect a few player rows. Try a cleaner screenshot or add rows manually.");
  if (numericRatings.length < 3) warnings.push("Too few rating values were detected. Review the RR column manually.");
  if (Number(draft?.missingVisiblePlayerCount) > 0) {
    warnings.push(`Some visible player rows were not scanned. Please manually complete the ${draft.missingVisiblePlayerCount} blank row(s).`);
  }

  const fixture = fixtures.find((item) => String(item.id) === String(fixtureId));
  const normalizedFixtureTeams = fixture ? [fixture.home, fixture.away].map(normalizeTeamKey) : [];
  const normalizedMapped = normalizeTeamKey(mappedParticipantName);
  if (fixture && normalizedMapped && !normalizedFixtureTeams.includes(normalizedMapped)) {
    warnings.push("The selected team is not part of the chosen fixture.");
  }

  const teamExists = participants.some((participant) => {
    const normalizedName = normalizeTeamKey(participant.name);
    return normalizedName === normalizedMapped
      || normalizedName.startsWith(normalizedMapped)
      || normalizedMapped.startsWith(normalizedName)
      || participant.name === mappedParticipantName;
  });
  if (mappedParticipantName && !teamExists) warnings.push("The selected team is not part of this league.");

  return {
    status: warnings.length === 0 ? "ready" : "needs-review",
    warnings,
    detectedPlayerCount: populatedPlayers.length,
  };
}

export function buildBallonDorRanking(submissions = []) {
  const byPlayer = new Map();

  submissions.forEach((submission) => {
    const rows = Array.isArray(submission?.players) ? submission.players : [];
    rows.forEach((player) => {
      const playerName = normalizeLine(player?.name);
      if (!playerName) return;

      const rating = Number(player?.rating);
      const goals = Number(player?.goals || 0);
      const assists = Number(player?.assists || 0);
      const isPlayerOfTheMatch = Boolean(player?.isPlayerOfTheMatch);
      const existing = byPlayer.get(playerName) || {
        playerName,
        totalRating: 0,
        ratingSamples: 0,
        goals: 0,
        assists: 0,
        playerOfTheMatchCount: 0,
        teams: new Set(),
        fixtures: new Set(),
      };

      existing.totalRating += Number.isFinite(rating) ? rating : 0;
      existing.ratingSamples += Number.isFinite(rating) ? 1 : 0;
      existing.goals += Number.isFinite(goals) ? goals : 0;
      existing.assists += Number.isFinite(assists) ? assists : 0;
      existing.playerOfTheMatchCount += isPlayerOfTheMatch ? 1 : 0;
      if (submission?.mappedParticipantName) existing.teams.add(submission.mappedParticipantName);
      if (submission?.fixtureLabel) existing.fixtures.add(submission.fixtureLabel);

      byPlayer.set(playerName, existing);
    });
  });

  return Array.from(byPlayer.values())
    .map((entry) => {
      const averageRating = entry.ratingSamples > 0 ? Number((entry.totalRating / entry.ratingSamples).toFixed(2)) : 0;
      const ballonDorScore = Number((averageRating * 10 + entry.goals * 6 + entry.assists * 4 + entry.playerOfTheMatchCount * 8).toFixed(2));
      return {
        playerName: entry.playerName,
        averageRating,
        goals: entry.goals,
        assists: entry.assists,
        playerOfTheMatchCount: entry.playerOfTheMatchCount,
        submissions: entry.fixtures.size,
        teams: Array.from(entry.teams),
        ballonDorScore,
      };
    })
    .sort((left, right) => {
      if (right.ballonDorScore !== left.ballonDorScore) return right.ballonDorScore - left.ballonDorScore;
      if (right.averageRating !== left.averageRating) return right.averageRating - left.averageRating;
      return left.playerName.localeCompare(right.playerName);
    });
}
