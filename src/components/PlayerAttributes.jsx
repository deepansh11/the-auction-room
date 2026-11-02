import React from "react";
import { formatStarRating, getPlayerAttributes } from "../lib/playerAttributes.js";
import "../styles/playerAttributes.css";

export function PlayerAttributes({ player, tier, id }) {
  const positions = player.positionsText || player.positions?.join(", ") || player.pos || "Not available";
  const metadata = [
    ["Preferred foot", player.preferredFoot || "Not available"],
    ["Weak foot", formatStarRating(player.weakFoot)],
    ...(String(player.pos).toUpperCase() !== "GK" ? [["Skill moves", formatStarRating(player.skillMoves)]] : []),
    ["Price tier", tier],
  ];
  return React.createElement("section", { id, className: "player-attributes", "aria-label": `Attributes for ${player.name}` },
    React.createElement("dl", { className: "player-attributes__identity" },
      [["Club", player.club], ["Nation", player.nation], ["Positions", positions]].map(([label, value]) =>
        React.createElement("div", { key: label }, React.createElement("dt", null, label), React.createElement("dd", null, value || "Not available")))
    ),
    React.createElement("dl", { className: "player-attributes__stats", "aria-label": "Player ratings out of 99" },
      getPlayerAttributes(player).map(stat => React.createElement("div", { key: stat.key, className: `player-attribute player-attribute--${stat.tone}` },
        React.createElement("dt", null, stat.label),
        React.createElement("dd", { "aria-label": `${stat.label}: ${stat.value === null ? "not available" : stat.value}` }, stat.value ?? "—"),
        stat.value !== null && React.createElement("div", { className: "player-attribute__track", "aria-hidden": true },
          React.createElement("span", { style: { width: `${Math.max(0, Math.min(100, stat.value / 99 * 100))}%` } }))
      ))
    ),
    React.createElement("dl", { className: "player-attributes__metadata" }, metadata.map(([label, value]) =>
      React.createElement("div", { key: label },
        React.createElement("dt", null, label),
        React.createElement("dd", null, value, ["Weak foot", "Skill moves"].includes(label) && value !== "Not available"
          ? React.createElement("span", { className: "player-attributes__star", "aria-hidden": true }, " ★") : null)
      )))
  );
}
