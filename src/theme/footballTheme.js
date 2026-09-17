import React from "react";
import { PCOLORS } from "../game/constants.js";

export const FOOTBALL_THEME = {
  background: "radial-gradient(circle at top, #143726 0%, #09150f 45%, #050a08 100%)",
  panel: "linear-gradient(180deg,#10271b,#0a1711)",
  panelAlt: "#0d1d14",
  line: "#234034",
  text: "#e5edf8",
  muted: "#8ea0ba",
  gold: "#8fe7c0",
  cyan: "#4FC3F7",
  green: "#00FF88",
  orange: "#FF6B35",
  red: "#FF3D71",
};

export function getParticipantAccent(index = 0) {
  return PCOLORS[Math.abs(index) % PCOLORS.length] || FOOTBALL_THEME.gold;
}

export function createSurfaceStyle({ padding = 20, radius = 20, elevated = false } = {}) {
  return {
    background: elevated ? "linear-gradient(180deg,#122b1e,#0a1711)" : FOOTBALL_THEME.panel,
    border: `1px solid ${FOOTBALL_THEME.line}`,
    borderRadius: radius,
    boxShadow: elevated ? "0 24px 70px #06211155" : "0 18px 50px #04160e28",
    padding,
  };
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export function TeamBadge({ name, color, size = 34, subtle = false }) {
  const accent = color || FOOTBALL_THEME.gold;
  const badgeSize = size;

  return React.createElement("div", {
    style: {
      width: badgeSize,
      height: badgeSize,
      borderRadius: 999,
      background: subtle
        ? `radial-gradient(circle at 30% 30%, ${accent}88, #0f1b14 78%)`
        : `radial-gradient(circle at 30% 30%, ${accent}cc, #0f1b14 75%)`,
      border: `1px solid ${accent}77`,
      boxShadow: `0 0 18px ${accent}22`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontFamily: "'Bebas Neue'",
      fontSize: badgeSize <= 28 ? 13 : 15,
      letterSpacing: 1,
      flexShrink: 0,
    }
  }, initials(name));
}

export function StatusPill({ children, tone = "neutral" }) {
  const tones = {
    neutral: { color: "#cbd5e1", bg: "#94a3b814", border: "#94a3b833" },
    gold: { color: FOOTBALL_THEME.gold, bg: "#8fe7c014", border: "#8fe7c033" },
    cyan: { color: FOOTBALL_THEME.cyan, bg: "#4FC3F714", border: "#4FC3F733" },
    green: { color: FOOTBALL_THEME.green, bg: "#00FF8814", border: "#00FF8833" },
    red: { color: FOOTBALL_THEME.red, bg: "#FF3D7114", border: "#FF3D7133" },
    orange: { color: FOOTBALL_THEME.orange, bg: "#FF6B3514", border: "#FF6B3533" },
  };
  const style = tones[tone] || tones.neutral;

  return React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      border: `1px solid ${style.border}`,
      color: style.color,
      background: style.bg,
      padding: "2px 8px",
      fontFamily: "'Rajdhani'",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 1,
    }
  }, children);
}
