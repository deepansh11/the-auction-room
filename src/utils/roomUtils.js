// Generate a unique room code (6 alphanumeric characters)
export function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate a shareable session URL
export function generateSessionLink(roomCode) {
  const baseUrl = window.location.origin;
  return `${baseUrl}?join=${roomCode}`;
}

// Extract room code from URL params
export function getRoomCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("join") || params.get("roomCode");
}

export function getBallonDorUploadParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const auctionResultId = params.get("ballonDorUpload") || params.get("resultId") || "";
  const token = params.get("uploadToken") || params.get("token") || "";
  const fixtureId = params.get("fixtureId") || "";
  if (!auctionResultId || !token) return null;
  return { auctionResultId, token, fixtureId };
}

export function generateBallonDorUploadLink(auctionResultId, token, fixtureId = "") {
  const baseUrl = window.location.origin;
  const params = new URLSearchParams();
  params.set("ballonDorUpload", auctionResultId);
  params.set("uploadToken", token);
  if (fixtureId) params.set("fixtureId", fixtureId);
  return `${baseUrl}?${params.toString()}`;
}

// Validate room code format
export function isValidRoomCode(code) {
  return /^[A-Z0-9]{6}$/.test(code);
}
