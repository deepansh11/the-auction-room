import Papa from "papaparse";
import { getPosGroup, LOTS } from "../game/constants.js";

export const DEFAULT_CSV_PATH = "/data/FC 26 Players.csv";
const FALLBACK_CSV_PATH = "/data/FC26 Data Sept 21 2025.csv";

function parsePositions(playerPositions) {
  const parsed = String(playerPositions || "CM")
    .split(",")
    .map((pos) => pos.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : ["CM"];
}

function parsePrimaryPosition(playerPositions) {
  return parsePositions(playerPositions)[0];
}

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadPlayersFromCsv(csvPath = DEFAULT_CSV_PATH) {
  let res = await fetch(csvPath);
  if (!res.ok && csvPath === DEFAULT_CSV_PATH) {
    res = await fetch(FALLBACK_CSV_PATH);
  }
  if (!res.ok) {
    throw new Error("Failed to load player CSV");
  }

  const text = await res.text();
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => String(header || "").trim(),
  });

  const seen = new Set();
  const out = [];

  for (const row of parsed.data || []) {
    const id = Number(row.player_id);
    const rating = Number(row.overall);
    const name = String(row.short_name || row.long_name || "").trim();
    const pos = parsePrimaryPosition(row.player_positions);
    const positions = parsePositions(row.player_positions);
    const nation = String(row.nationality_name || "Unknown").trim() || "Unknown";
    const club = String(row.club_name || "Unknown").trim() || "Unknown";
    const preferredFoot = String(row.preferred_foot || "Unknown").trim() || "Unknown";
    const weakFoot = toNullableNumber(row.weak_foot);
    const skillMoves = toNullableNumber(row.skill_moves);
    const playerFaceUrl = String(row.player_face_url || "").trim() || "";

    if (!id || seen.has(id) || !name || !pos || Number.isNaN(rating) || rating < 80) {
      continue;
    }

    seen.add(id);
    out.push({
      id,
      name,
      longName: String(row.long_name || "").trim() || name,
      pos,
      positions,
      positionsText: positions.join(", "),
      rating,
      nation,
      club,
      age: toNullableNumber(row.age),
      heightCm: toNullableNumber(row.height_cm),
      weightKg: toNullableNumber(row.weight_kg),
      preferredFoot,
      weakFoot,
      skillMoves,
      pace: toNullableNumber(row.pace),
      shooting: toNullableNumber(row.shooting),
      passing: toNullableNumber(row.passing),
      dribbling: toNullableNumber(row.dribbling),
      defending: toNullableNumber(row.defending),
      physic: toNullableNumber(row.physic),
      // Goalkeeper-specific stats
      gkDiving: toNullableNumber(row.goalkeeping_diving),
      gkHandling: toNullableNumber(row.goalkeeping_handling),
      gkKicking: toNullableNumber(row.goalkeeping_kicking),
      gkPositioning: toNullableNumber(row.goalkeeping_positioning),
      gkReflexes: toNullableNumber(row.goalkeeping_reflexes),
      gkSpeed: toNullableNumber(row.goalkeeping_speed),
      playerFaceUrl,
      lot: 0,
    });
  }

  return out;
}

export function assignPlayersToLots(players, totalLots = LOTS) {
  const gk = players.filter((p) => getPosGroup(p.pos) === "GK").sort((a, b) => b.rating - a.rating);
  const rest = players.filter((p) => getPosGroup(p.pos) !== "GK").sort((a, b) => b.rating - a.rating);

  const lots = Array.from({ length: totalLots }, () => []);

  gk.forEach((p, idx) => {
    lots[idx % totalLots].push(p);
  });

  const shuffledRest = [...rest].sort(() => Math.random() - 0.5);
  shuffledRest.forEach((p, idx) => {
    lots[idx % totalLots].push(p);
  });

  const withLot = [];
  for (let lotIdx = 0; lotIdx < lots.length; lotIdx += 1) {
    for (const p of lots[lotIdx]) {
      withLot.push({ ...p, lot: lotIdx + 1 });
    }
  }

  return withLot;
}
