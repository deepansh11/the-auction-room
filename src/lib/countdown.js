export function deadlinePassed(deadlineAt, now = Date.now()) {
  return Number.isFinite(deadlineAt) && deadlineAt > 0 && now >= deadlineAt;
}

export function formatCountdown(ms) {
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "00:00:00:00";
  const seconds = Math.floor(ms / 1000);
  const parts = [Math.floor(seconds / 86400), Math.floor((seconds % 86400) / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  return (parts[0] > 0 ? parts : parts.slice(1)).map(value => String(value).padStart(2, "0")).join(":");
}
