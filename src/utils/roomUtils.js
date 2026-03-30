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

// Validate room code format
export function isValidRoomCode(code) {
  return /^[A-Z0-9]{6}$/.test(code);
}
