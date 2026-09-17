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
  const compact = value.replace(/[^A-Za-z]/g, "").toLowerCase();
  if (/^(playerperformance|name|back|sort|scroll|summary|possession|shooting|passing|defending|goalkeeping|overallposition|overallrating|ovr|totalrating|goals|assists|shots|shotaccuracy|passes|passaccuracy|dribbles|dribblesuccess|tackles|tacklesuccess|offsides|foulscommitted|possessionwon|possessionlost|minutesplayed|distancecovered|distancesprinted)$/i.test(compact)) {
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

export function normalizePlayerKey(value = "") {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function normalizeComparisonName(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function splitComparisonName(value = "") {
  return normalizeComparisonName(value).split(" ").filter(Boolean);
}

function tokenMatches(leftToken = "", rightToken = "") {
  const left = normalizeComparisonName(leftToken);
  const right = normalizeComparisonName(rightToken);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length === 1) return right.startsWith(left);
  if (right.length === 1) return left.startsWith(right);
  return left.startsWith(right) || right.startsWith(left);
}

function initialsForTokens(tokens = []) {
  return tokens.map((token) => token[0] || "").join("");
}

function getPlayerNameMatchScore(left = "", right = "") {
  const a = normalizePlayerKey(left);
  const b = normalizePlayerKey(right);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const leftTokens = splitComparisonName(left);
  const rightTokens = splitComparisonName(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const leftLast = leftTokens[leftTokens.length - 1];
  const rightLast = rightTokens[rightTokens.length - 1];
  if (!tokenMatches(leftLast, rightLast)) return 0;

  const leftGiven = leftTokens.slice(0, -1);
  const rightGiven = rightTokens.slice(0, -1);
  if (leftGiven.length === 0 || rightGiven.length === 0) return 60;

  const leftInitials = initialsForTokens(leftGiven);
  const rightInitials = initialsForTokens(rightGiven);
  if (leftInitials && rightInitials && leftInitials === rightInitials) return 95;
  if (leftInitials && rightInitials && (leftInitials.startsWith(rightInitials) || rightInitials.startsWith(leftInitials))) return 85;

  const comparedLength = Math.min(leftGiven.length, rightGiven.length);
  let matches = 0;
  for (let index = 0; index < comparedLength; index += 1) {
    if (tokenMatches(leftGiven[index], rightGiven[index])) {
      matches += 1;
    } else {
      break;
    }
  }

  if (matches === 0) return 40;
  const tokenScore = 40 + (matches * 10);
  return Math.min(tokenScore, 90);
}

function isCompatiblePlayerKey(left = "", right = "") {
  return getPlayerNameMatchScore(left, right) > 0;
}

export function scorePerformanceCapturePlayerMatch(left = "", right = "") {
  return getPlayerNameMatchScore(left, right);
}

export function scorePerformanceCaptureRoster(players = [], rosterPlayers = []) {
  const ocrRows = Array.isArray(players) ? players : [];
  const roster = Array.isArray(rosterPlayers) ? rosterPlayers : [];
  const usedRosterIds = new Set();
  let score = 0;

  ocrRows.forEach((ocrRow) => {
    if (!ocrRow || !normalizeLine(ocrRow.name)) return;
    let best = null;
    let bestScore = 0;
    for (const rosterPlayer of roster) {
      const rosterName = rosterPlayer?.name || rosterPlayer?.longName || "";
      const rosterId = rosterPlayer?.id ?? rosterPlayer?.player_id ?? rosterPlayer?.name;
      if (!rosterName || usedRosterIds.has(rosterId)) continue;
      const candidateScore = getPlayerNameMatchScore(ocrRow.name, rosterName);
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        best = rosterPlayer;
      }
    }
    if (best && bestScore > 0) {
      const rosterId = best?.id ?? best?.player_id ?? best?.name;
      usedRosterIds.add(rosterId);
      score += bestScore;
    }
  });

  return score;
}

export function mergePerformanceCaptureWithRoster(players = [], rosterPlayers = []) {
  const ocrRows = Array.isArray(players) ? players : [];
  const roster = (Array.isArray(rosterPlayers) ? rosterPlayers : [])
    .map((player, index) => ({
      id: player?.id ?? `roster-${index + 1}`,
      name: normalizeLine(player?.name || player?.longName || ""),
      rating: "",
      goals: "",
      assists: "",
      isPlayerOfTheMatch: false,
      isRosterFallback: true,
      rosterIndex: index,
      rosterSource: player,
    }))
    .filter((player) => player.name);

  const matchedRosterIds = new Set();
  const matchedByOcrOrder = [];

  ocrRows.forEach((ocrRow, ocrIndex) => {
    if (!ocrRow || !normalizeLine(ocrRow.name)) return;
    let matchedRoster = null;
    let matchedScore = 0;
    for (const rosterPlayer of roster) {
      if (matchedRosterIds.has(rosterPlayer.id)) continue;
      const score = getPlayerNameMatchScore(ocrRow.name, rosterPlayer.name);
      if (score > matchedScore) {
        matchedScore = score;
        matchedRoster = rosterPlayer;
      }
    }
    if (matchedRoster) {
      matchedRosterIds.add(matchedRoster.id);
      const rowName = normalizeLine(ocrRow.name);
      matchedByOcrOrder.push({
        ...matchedRoster,
        ...ocrRow,
        name: matchedRoster.name,
        ocrName: rowName && rowName !== matchedRoster.name ? rowName : "",
        isRosterFallback: false,
        isOcrOnly: false,
        scanOrder: ocrIndex,
        matchScore: matchedScore,
      });
      return;
    }

    matchedByOcrOrder.push({
      ...ocrRow,
      isRosterFallback: false,
      isOcrOnly: true,
      scanOrder: ocrIndex,
    });
  });

  const leftoverRosterRows = roster
    .filter((player) => !matchedRosterIds.has(player.id))
    .map((player, index) => ({
      ...player,
      isRosterFallback: true,
      rosterIndex: player.rosterIndex ?? index,
      fallbackOrder: index,
    }));

  return {
    players: [...matchedByOcrOrder, ...leftoverRosterRows],
    rosterFallbackPlayerCount: leftoverRosterRows.length,
    matchedRosterPlayerCount: matchedByOcrOrder.filter((player) => !player.isOcrOnly).length,
    unmatchedOcrPlayerCount: matchedByOcrOrder.filter((player) => player.isOcrOnly).length,
  };
}

function isNoisePlayerName(value = "") {
  const compact = String(value || "").replace(/[^A-Za-z]/g, "").toLowerCase();
  return /^(playerperformance|summary|possessionwon|possessionlost|minutesplayed|distancecovered|distancesprinted|shotaccuracy|passaccuracy|dribblesuccess|tacklesuccess|overallposition|overallrating|totalrating|goals|assists|ovr)$/i.test(compact);
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

function normalizeDetectedPlayerName(value) {
  let normalized = normalizeLine(value);
  normalized = normalized.replace(/^(?:OVR|Overall(?:\s+Rating)?|Rating|Summary)\s+/i, "");
  normalized = normalized.replace(/\s+(?:Total Rating|Player of the Match|Summary).*$/i, "");
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length <= 1) return normalized;

  const shouldDropLeadingToken = (token) => {
    const compact = String(token || "").replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    const raw = String(token || "");
    if (!compact) return true;
    if (/^(OVR|OVERALL|RATING|TOTAL|SUMMARY)$/i.test(compact)) return true;
    if (/^OVR/i.test(compact)) return true;
    if (/^[^A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(raw)) return true;
    if (compact.length <= 1 && !raw.includes(".")) return true;
    if (/^[A-Z]{2,3}$/.test(compact) && raw.includes(".") === false && /^(LY|SV|VR)$/i.test(compact)) return true;
    return false;
  };

  const nextTokens = [...tokens];
  while (nextTokens.length > 1 && shouldDropLeadingToken(nextTokens[0])) {
    nextTokens.shift();
  }
  while (nextTokens.length > 1) {
    const last = nextTokens[nextTokens.length - 1];
    const alphaOnly = last.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    const first = nextTokens[0];
    if (/^(?:OVR|Overall|Rating)$/i.test(first)) {
      nextTokens.shift();
      continue;
    }
    const hasStableEarlierToken = nextTokens.slice(0, -1).some((token) => token.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "").length >= 3);
    const looksLikeTrailingNoise = alphaOnly.length <= 1
      || ((alphaOnly.length <= 2 || /^[A-Z]{1,2}$/.test(alphaOnly)) && hasStableEarlierToken && !last.includes("."));
    if (!looksLikeTrailingNoise) break;
    nextTokens.pop();
  }

  return normalizeLine(nextTokens.join(" "));
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

function stripSummarySuffix(line) {
  const summaryKeywords = /(shot accuracy|pass accuracy|dribble success|tackle success|fouls committed|possession won|possession lost|distance covered|distance sprinted|ball recovery time|yellow cards|interceptions|corners|offsides|free kicks|penalty kicks|expected goals|passes|tackles|minutes played|goals|assists|summary|player of the match)/i;
  const matchIndex = line.search(summaryKeywords);
  return matchIndex >= 0 ? line.slice(0, matchIndex).trim() : line.trim();
}

function parsePlayerRowLine(line) {
  const cleaned = stripSummarySuffix(normalizeLine(line));
  if (!cleaned) return null;

  const regexRow = cleaned.match(/^(?:[A-Z]{2,4}\s+)?([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.\-'’ ]{2,})\s+([0-9]{1,2}(?:\.\d)?)\s+([0-9]{1,2})\s*(?:[^0-9A-Za-zÀ-ÖØ-öø-ÿ]{0,3})\s*([0-9]{1,2})?/i);
  if (regexRow) {
    const [, name, ratingText, goalsText, assistsText] = regexRow;
    const rating = parseRatingToken(ratingText);
    const goals = parseStatToken(goalsText);
    const assists = parseStatToken(assistsText);
    const normalizedName = normalizeDetectedPlayerName(name);
    if (
      rating !== null
      && normalizedName
      && normalizedName.length >= 4
      && !looksLikeTeamName(normalizedName)
      && !/(ovr|overall rating|total rating|player of the match|goal|assist|summary)/i.test(normalizedName)
    ) {
      return {
        name: normalizedName,
        rating,
        goals: goals ?? "",
        assists: assists ?? "",
      };
    }
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;

  let ratingIndex = -1;
  let rating = null;
  const numericCandidates = [];

  tokens.forEach((token, index) => {
    const raw = sanitizeOcrToken(token);
    if (!raw || /[%]/.test(raw)) return;
    const value = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(value) || value < 0) return;
    numericCandidates.push({ index, token, value, numeric: raw.replace(/[^0-9.]/g, "") });
    if (ratingIndex === -1) {
      const maybeRating = parseRatingToken(token);
      if (maybeRating !== null) {
        rating = maybeRating;
        ratingIndex = index;
      }
    }
  });

  if (ratingIndex === -1) {
    const positionToken = normalizePositionToken(tokens[0]);
    if (!POSITION_TOKENS.has(positionToken)) return null;
    const positionAdjusted = tokens.slice(1);
    const positionRatingIndex = positionAdjusted.findIndex((token) => parseRatingToken(token) !== null);
    if (positionRatingIndex === -1) return null;
    ratingIndex = positionRatingIndex + 1;
    rating = parseRatingToken(positionAdjusted[positionRatingIndex]);
  }

  const rawNameTokens = tokens.slice(0, ratingIndex);
  while (rawNameTokens.length > 0) {
    const next = rawNameTokens[0];
    const normalized = normalizePositionToken(next);
    const letterOnly = next.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    if (POSITION_TOKENS.has(normalized) || /^[A-Z]$/.test(letterOnly) || /^[-=:@|/\\]+$/.test(next)) {
      rawNameTokens.shift();
      continue;
    }
    break;
  }

  const nameSource = rawNameTokens
    .join(" ")
    .replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ]+/, "")
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ.\-'’ ]+$/g, "")
    .trim();

  const name = normalizeDetectedPlayerName(nameSource);
  const alphaOnlyName = name.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  const compactName = alphaOnlyName.toLowerCase();
  if (!name || alphaOnlyName.length < 4 || looksLikeTeamName(name)) return null;
  if (/^(ovr|overallrating|totalrating|playerperformance|summary|possessionwon|possessionlost|minutesplayed|distancecovered|distancesprinted|shotaccuracy|passaccuracy|dribblesuccess|tacklesuccess)$/i.test(compactName)) return null;

  const trailingStats = numericCandidates
    .filter((entry) => entry.index > ratingIndex && entry.value <= 20 && !/%/.test(entry.token))
    .map((entry) => entry.value);

  const goals = trailingStats[0] ?? 0;
  const assists = trailingStats[1] ?? (trailingStats.length > 0 ? 0 : "");

  return {
    name,
    rating: rating ?? "",
    goals,
    assists,
  };
}

function collectLikelyPlayerRows(lines) {
  const rosterStart = lines.findIndex((line) => /\bPOSA\b/i.test(line) && /\bName\b/i.test(line));
  const rosterEnd = lines.findIndex((line, index) => index > rosterStart && /overall position|back|sort|scroll/i.test(line));
  const headerScopedLines = lines.slice(rosterStart >= 0 ? rosterStart + 1 : 0, rosterEnd > rosterStart ? rosterEnd : lines.length);

  const rows = [
    ...headerScopedLines.map(parsePlayerRowLine).filter(Boolean),
    ...lines
      .filter((line) => !/summary|overall position|back|sort|scroll|fouls committed|pass accuracy|shot accuracy|dribble success|tackle success|distance covered|distance sprinted|minutes played/i.test(line))
      .map(parsePlayerRowLine)
      .filter(Boolean),
  ];

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

export function extractFeaturedPlayerCard(rawText = "", lines = []) {
  const normalizedText = String(rawText || "").replace(/\s+/g, " ").trim();
  const cardMatch = normalizedText.match(/\b\d{2}\s+([A-Za-zÀ-ÖØ-öø-ÿ.'’-]+)\s+OVR.*?([A-Za-zÀ-ÖØ-öø-ÿ.'’-]+)\s+POSA\b/i);
  if (cardMatch) {
    return {
      name: normalizeDetectedPlayerName(`${cardMatch[1]} ${cardMatch[2]}`),
      rating: null,
    };
  }

  const headerIndex = lines.findIndex((line) => /\bPOSA\b/i.test(line) && /\bName\b/i.test(line));
  const prefix = lines.slice(0, headerIndex > 0 ? headerIndex : Math.min(lines.length, 14));
  for (let index = 0; index < prefix.length; index += 1) {
    if (!looksLikePlayerName(prefix[index]) || looksLikeTeamName(prefix[index])) continue;

    const nameLines = [prefix[index]];
    let cursor = index + 1;
    while (cursor < prefix.length && looksLikePlayerName(prefix[cursor]) && !looksLikeTeamName(prefix[cursor])) {
      nameLines.push(prefix[cursor]);
      cursor += 1;
    }

    const candidateName = normalizeDetectedPlayerName(nameLines.join(" "));
    if (!candidateName || candidateName.length < 4 || looksLikeTeamName(candidateName)) continue;

    const rating = prefix
      .slice(cursor, Math.min(prefix.length, cursor + 4))
      .flatMap((line) => normalizeLine(line).split(" ").filter(Boolean))
      .map((token) => parseRatingToken(token))
      .find((token) => token !== null);
    if (rating == null) continue;

    return { name: candidateName, rating };
  }

  return null;
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
  const featuredPlayerCard = extractFeaturedPlayerCard(rawText, lines);
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

  if (!fuzzyPlayerRows.length && featuredPlayerCard && featuredPlayerCard.name && !/(ovr|overall|rating|summary)/i.test(featuredPlayerCard.name)) {
    const featuredKey = normalizePlayerKey(featuredPlayerCard.name);
    const resolvedKeys = resolvedNames.map((name) => normalizePlayerKey(name));
    if (featuredKey && !resolvedKeys.includes(featuredKey)) {
      resolvedNames.unshift(featuredPlayerCard.name);
      resolvedRatings.unshift(featuredPlayerCard.rating);
      resolvedGoals.unshift(0);
      resolvedAssists.unshift(0);
    }
  }

  const playerCount = Math.max(resolvedNames.length, resolvedRatings.length, resolvedGoals.length, resolvedAssists.length);
  const parsedPlayers = Array.from({ length: playerCount }, (_, index) => ({
    id: `scan-${index + 1}`,
    name: resolvedNames[index] || "",
    rating: Number.isFinite(resolvedRatings[index]) ? resolvedRatings[index] : "",
    goals: Number.isFinite(resolvedGoals[index]) ? resolvedGoals[index] : 0,
    assists: Number.isFinite(resolvedAssists[index]) ? resolvedAssists[index] : 0,
    isPlayerOfTheMatch: false,
  })).filter((player) => !isNoisePlayerName(player.name));
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
  if (Number(draft?.rosterFallbackPlayerCount) > 0) {
    warnings.push(`We filled ${draft.rosterFallbackPlayerCount} player row(s) from the selected team roster. Review RR, G and AST for those rows.`);
  }
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
