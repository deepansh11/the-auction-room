import { CAN_FILL, FORMATIONS, TIERS } from "../game/constants.js";

function assignLineupForFormation(squad, formationKey) {
  const rows = FORMATIONS[formationKey] || FORMATIONS["4-3-3"];
  const allSlots = rows.flat();
  const usedIds = new Set();
  const starters = [];

  allSlots.forEach((slot) => {
    const compat = CAN_FILL[slot] || [slot];
    const picked = (squad || [])
      .filter((pl) => !usedIds.has(pl.id) && compat.includes(pl.pos))
      .sort((a, b) => b.rating - a.rating)[0] || null;
    if (picked) {
      usedIds.add(picked.id);
    }
    starters.push({ slot, player: picked });
  });

  const bench = (squad || []).filter((pl) => !usedIds.has(pl.id));
  return { starters, bench };
}

export function downloadSquadImage(participant, {
  formation = "4-3-3",
  title = "THE AUCTION ROOM",
  tiers = TIERS,
} = {}) {
  if (!participant || typeof document === "undefined") return;
  const squad = Array.isArray(participant.squad) ? participant.squad : [];
  const { starters, bench } = assignLineupForFormation(squad, formation);

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#060a12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 56px Arial";
  ctx.fillText(title, 50, 90);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px Arial";
  ctx.fillText(`${participant.name} SQUAD`, 50, 160);

  ctx.fillStyle = "#9aa4b2";
  ctx.font = "28px Arial";
  ctx.fillText(`Formation: ${formation}    Budget Left: ${participant.budget || 0}M    Squad: ${squad.length}`, 50, 205);

  ctx.fillStyle = "#1a2233";
  ctx.fillRect(50, 240, 1100, 700);

  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 32px Arial";
  ctx.fillText("STARTING XI", 70, 290);

  let y = 340;
  starters.forEach((entry) => {
    const pl = entry.player;
    const line = pl
      ? `${entry.slot}  -  ${pl.name} (${pl.pos})  ${pl.rating}`
      : `${entry.slot}  -  EMPTY`;
    ctx.fillStyle = pl ? "#e6edf7" : "#7f8aa3";
    ctx.font = "26px Arial";
    ctx.fillText(line, 80, y);
    y += 48;
  });

  ctx.fillStyle = "#1a2233";
  ctx.fillRect(50, 980, 1100, 450);

  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 32px Arial";
  ctx.fillText(`BENCH (${bench.length})`, 70, 1030);

  let by = 1080;
  if (bench.length === 0) {
    ctx.fillStyle = "#7f8aa3";
    ctx.font = "26px Arial";
    ctx.fillText("No bench players", 80, by);
  } else {
    bench.forEach((pl) => {
      ctx.fillStyle = "#e6edf7";
      ctx.font = "26px Arial";
      ctx.fillText(`${pl.name} (${pl.pos})  ${pl.rating}`, 80, by);
      by += 44;
    });
  }

  const link = document.createElement("a");
  link.download = `${String(participant.name || "my").replace(/\s+/g, "-").toLowerCase()}-squad.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
