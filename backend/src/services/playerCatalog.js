import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_CANDIDATES = [
  path.resolve(__dirname, "../../data/FC 26 Players.csv"),
  path.resolve(__dirname, "../../../public/data/FC 26 Players.csv"),
  path.resolve(__dirname, "../../../public/data/FC26 Data Sept 21 2025.csv"),
];

let catalogPromise = null;

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current);
  return out;
}

function parsePrimaryPosition(value) {
  return String(value || "CM")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)[0] || "CM";
}

async function loadCatalogMap() {
  for (const candidate of CSV_CANDIDATES) {
    try {
      const raw = await readFile(candidate, "utf8");
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) continue;

      const header = parseCsvLine(lines[0]);
      const idIndex = header.indexOf("player_id");
      const ratingIndex = header.indexOf("overall");
      const shortNameIndex = header.indexOf("short_name");
      const longNameIndex = header.indexOf("long_name");
      const positionsIndex = header.indexOf("player_positions");

      if (idIndex < 0 || ratingIndex < 0 || positionsIndex < 0) {
        continue;
      }

      const catalog = new Map();
      for (const line of lines.slice(1)) {
        const columns = parseCsvLine(line);
        const id = Number(columns[idIndex]);
        const rating = Number(columns[ratingIndex]);
        if (!Number.isFinite(id) || !Number.isFinite(rating) || rating < 80) continue;

        const name = String(columns[shortNameIndex] || columns[longNameIndex] || "").trim();
        const pos = parsePrimaryPosition(columns[positionsIndex]);
        if (!name || !pos) continue;

        catalog.set(id, { id, name, rating, pos });
      }

      return catalog;
    } catch {
      // Try the next bundled CSV path.
    }
  }

  throw new Error("Failed to load bundled player catalog");
}

export async function getPlayerCatalog() {
  if (!catalogPromise) {
    catalogPromise = loadCatalogMap();
  }
  return catalogPromise;
}

export async function getPlayersByIds(playerIds) {
  const ids = Array.from(new Set((Array.isArray(playerIds) ? playerIds : [])
    .map((value) => Number(value))
    .filter(Number.isFinite)));
  if (ids.length === 0) return [];

  const catalog = await getPlayerCatalog();
  return ids
    .map((id) => catalog.get(id))
    .filter(Boolean)
    .map((player) => ({ ...player }));
}

export async function enrichPlayersWithCatalog(players) {
  const list = Array.isArray(players) ? players : [];
  if (list.length === 0) return [];

  const catalog = await getPlayerCatalog();
  return list.map((player) => {
    const id = Number(player?.id);
    const base = Number.isFinite(id) ? catalog.get(id) : null;
    if (!base) return player;
    return {
      ...base,
      ...player,
      id: base.id,
      name: String(player?.name || base.name).trim() || base.name,
      rating: Number.isFinite(Number(player?.rating)) ? Number(player.rating) : base.rating,
      pos: String(player?.pos || base.pos).trim() || base.pos,
    };
  });
}
