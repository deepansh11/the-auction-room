const OUTFIELD = {
  PAC: ["pace", "Pace"], SHO: ["shooting", "Shooting"], PAS: ["passing", "Passing"],
  DRI: ["dribbling", "Dribbling"], DEF: ["defending", "Defending"], PHY: ["physic", "Physical"],
};
const GOALKEEPER = {
  DIV: ["gkDiving", "Diving"], HAN: ["gkHandling", "Handling"], KIC: ["gkKicking", "Kicking"],
  REF: ["gkReflexes", "Reflexes"], SPD: ["gkSpeed", "Speed"], POS: ["gkPositioning", "Positioning"],
};

export function getPlayerAttributes(player) {
  const position = String(player?.pos || "").toUpperCase();
  const goalkeeper = position === "GK";
  let order = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"];
  if (["CB", "LB", "RB", "LWB", "RWB"].includes(position)) order = ["DEF", "PHY", "PAC", "PAS", "DRI", "SHO"];
  else if (["CDM", "CM"].includes(position)) order = ["PAS", "DEF", "PHY", "PAC", "DRI", "SHO"];
  else if (["CAM", "LM", "RM", "LW", "RW"].includes(position)) order = ["PAS", "DRI", "PAC", "SHO", "DEF", "PHY"];
  else if (["ST", "CF", "SS"].includes(position)) order = ["PAC", "SHO", "DRI", "PAS", "PHY", "DEF"];
  if (goalkeeper) order = Object.keys(GOALKEEPER);
  return order.map(short => {
    const [key, label] = (goalkeeper ? GOALKEEPER : OUTFIELD)[short];
    const value = Number.isFinite(player?.[key]) ? player[key] : null;
    return { key, short, label, value, tone: value === null ? "missing" : value >= 90 ? "exceptional" : value >= 80 ? "strong" : value >= 70 ? "solid" : "lower" };
  });
}

export function formatStarRating(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5 ? `${value} / 5` : "Not available";
}
