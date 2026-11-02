// FC 26 ISL database (not the current real-world ISL season).
// Verified: https://fifaindex.com/leagues/2149-indian-super-league-1/fc26
// and https://www.fifacm.com/26/league/2149/indian-super-league-1
export const ISL_CLUBS = Object.freeze([
  { id: "113302", name: "Bengaluru FC" },
  { id: "113297", name: "Chennaiyin FC" },
  { id: "111629", name: "East Bengal FC" },
  { id: "113298", name: "FC Goa" },
  { id: "114168", name: "Jamshedpur FC" },
  { id: "113299", name: "Kerala Blasters FC" },
  { id: "111633", name: "Mohammedan SC" },
  { id: "113146", name: "Mohun Bagan Super Giant" },
  { id: "113300", name: "Mumbai City FC" },
  { id: "113040", name: "NorthEast United" },
  { id: "113257", name: "Odisha FC" },
  { id: "115202", name: "Punjab FC" },
  { id: "113301", name: "SC Delhi", note: "Hyderabad FC in older squad updates" },
  { id: "132681", name: "United Tigers SC" },
]);

export function islClubName(clubId) {
  return ISL_CLUBS.find(club => club.id === String(clubId))?.name || "";
}
