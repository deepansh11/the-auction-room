export const BUDGET = 240;
export const SQUAD_MIN = 16;
export const SQUAD_MAX = 17;
export const LOTS = 6;

export const TIERS = {
  "S+": { min:90, max:99, price:22, color:"#FFD700", bg:"#FFD70018", border:"#FFD70055" },
  "S":  { min:87, max:89, price:18, color:"#E8C547", bg:"#E8C54718", border:"#E8C54755" },
  "A+": { min:84, max:86, price:14, color:"#C0C0C0", bg:"#C0C0C018", border:"#C0C0C055" },
  "A":  { min:82, max:83, price:10, color:"#CD7F32", bg:"#CD7F3218", border:"#CD7F3255" },
  "B":  { min:80, max:81, price: 6, color:"#4FC3F7", bg:"#4FC3F718", border:"#4FC3F755" },
};

export const getTier = (r, tiers = TIERS) =>
  Object.entries(tiers).find(([, t]) => r >= t.min && r <= t.max) || ["B", tiers.B || TIERS.B];

export const getTierKey = (r, tiers = TIERS) => getTier(r, tiers)[0];
export const getTierData = (r, tiers = TIERS) => getTier(r, tiers)[1];

export const POS_GROUPS = {
  GK:  { label:"Goalkeepers", color:"#FFD700", positions:["GK"] },
  DEF: { label:"Defenders",   color:"#4FC3F7", positions:["CB","LB","RB","LWB","RWB"] },
  MID: { label:"Midfielders", color:"#81C784", positions:["CDM","CM","CAM","LM","RM"] },
  ATT: { label:"Attackers",   color:"#FF6B35", positions:["ST","CF","LW","RW","SS"] },
};

export const getPosGroup = (pos) =>
  Object.entries(POS_GROUPS).find(([, g]) => g.positions.includes(pos))?.[0] || "MID";

export const PCOLORS = ["#FFD700", "#4FC3F7", "#FF6B35", "#00FF88", "#FF3D71", "#C084FC", "#F97316", "#38BDF8"];

export const FORMATIONS = {
  "4-3-3":   [["GK"],["LB","CB","CB","RB"],["CM","CM","CM"],["LW","ST","RW"]],
  "4-4-2":   [["GK"],["LB","CB","CB","RB"],["LM","CM","CM","RM"],["ST","ST"]],
  "4-2-3-1": [["GK"],["LB","CB","CB","RB"],["CDM","CDM"],["LW","CAM","RW"],["ST"]],
  "3-5-2":   [["GK"],["CB","CB","CB"],["LM","CDM","CM","CM","RM"],["ST","ST"]],
  "3-4-3":   [["GK"],["CB","CB","CB"],["LM","CM","CM","RM"],["LW","ST","RW"]],
  "5-3-2":   [["GK"],["LWB","CB","CB","CB","RWB"],["CM","CM","CM"],["ST","ST"]],
  "4-5-1":   [["GK"],["LB","CB","CB","RB"],["LM","CM","CDM","CM","RM"],["ST"]],
};

export const CAN_FILL = {
  GK:["GK"], LB:["LB","LWB"], RB:["RB","RWB"], CB:["CB","CDM"],
  LWB:["LWB","LB","LM"], RWB:["RWB","RB","RM"],
  LM:["LM","LWB","LW"], RM:["RM","RWB","RW"],
  CM:["CM","CDM","CAM"], CDM:["CDM","CM"],
  CAM:["CAM","CM","SS"], LW:["LW","LM","CF"],
  RW:["RW","RM","CF"], ST:["ST","CF","SS","LW","RW"],
  CF:["CF","ST","SS"], SS:["SS","CAM","ST"],
};
