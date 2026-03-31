import React from "react";
import { sfx } from "../utils/sfx.js";
import { getTierData, getTierKey, TIERS, POS_GROUPS, getPosGroup } from "../game/constants.js";

function numOrDash(value) {
  return Number.isFinite(value) ? value : "--";
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function getStatPairs(player) {
  const pos = String(player?.pos || "").toUpperCase();
  if (pos === "GK") {
    return [
      ["DIV", numOrDash(player?.gkDiving)],
      ["HAN", numOrDash(player?.gkHandling)],
      ["KIC", numOrDash(player?.gkKicking)],
      ["REF", numOrDash(player?.gkReflexes)],
      ["SPD", numOrDash(player?.gkSpeed)],
      ["POS", numOrDash(player?.gkPositioning)],
    ];
  }
  const defenders = ["CB","LB","RB","LWB","RWB"];
  const defMids   = ["CDM","CM"];
  const attMids   = ["CAM","LM","RM","LW","RW"];
  const attackers = ["ST","CF","SS"];
  if (defenders.includes(pos)) {
    return [
      ["DEF", numOrDash(player?.defending)], ["PHY", numOrDash(player?.physic)],
      ["PAC", numOrDash(player?.pace)],       ["PAS", numOrDash(player?.passing)],
      ["DRI", numOrDash(player?.dribbling)],  ["SHO", numOrDash(player?.shooting)],
    ];
  }
  if (defMids.includes(pos)) {
    return [
      ["PAS", numOrDash(player?.passing)],    ["DEF", numOrDash(player?.defending)],
      ["PHY", numOrDash(player?.physic)],      ["PAC", numOrDash(player?.pace)],
      ["DRI", numOrDash(player?.dribbling)],  ["SHO", numOrDash(player?.shooting)],
    ];
  }
  if (attMids.includes(pos)) {
    return [
      ["PAS", numOrDash(player?.passing)],    ["DRI", numOrDash(player?.dribbling)],
      ["PAC", numOrDash(player?.pace)],        ["SHO", numOrDash(player?.shooting)],
      ["DEF", numOrDash(player?.defending)],  ["PHY", numOrDash(player?.physic)],
    ];
  }
  if (attackers.includes(pos)) {
    return [
      ["PAC", numOrDash(player?.pace)],        ["SHO", numOrDash(player?.shooting)],
      ["DRI", numOrDash(player?.dribbling)],  ["PAS", numOrDash(player?.passing)],
      ["PHY", numOrDash(player?.physic)],      ["DEF", numOrDash(player?.defending)],
    ];
  }
  return [
    ["PAC", numOrDash(player?.pace)],        ["SHO", numOrDash(player?.shooting)],
    ["PAS", numOrDash(player?.passing)],     ["DRI", numOrDash(player?.dribbling)],
    ["DEF", numOrDash(player?.defending)],   ["PHY", numOrDash(player?.physic)],
  ];
}

export function PlayerRow({ player, onPick, owned, ownerName, ownerColor, cantAfford, isWishlist, onWishlist, tiers=TIERS, animDelay=0 }) {
  const [faceFailed, setFaceFailed] = React.useState(false);
  const td = getTierData(player.rating, tiers);
  const tk = getTierKey(player.rating, tiers);
  const pg = POS_GROUPS[getPosGroup(player.pos)];
  const positionsText = player.positionsText || player.positions?.join(", ") || player.pos;
  const statPairs = getStatPairs(player);

  return React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "58px 1fr auto",
      alignItems: "center",
      gap: 10,
      padding: "8px 10px",
      borderRadius: 9,
      marginBottom: 4,
      background: owned ? "#08090d" : "#0d0f16",
      border: `1px solid ${owned ? "#111318" : cantAfford ? "#111" : td.border}`,
      opacity: owned ? 0.45 : cantAfford ? 0.5 : 1,
      animation: `rowIn .22s ease ${animDelay}s both`,
    }
  },
    player.playerFaceUrl && !faceFailed
      ? React.createElement("img", {
          src: player.playerFaceUrl,
          alt: player.name,
          referrerPolicy: "no-referrer",
          onError: () => setFaceFailed(true),
          style: {
            width: 56,
            height: 56,
            objectFit: "cover",
            borderRadius: 8,
            border: `1px solid ${td.border}`,
            background: "#0b0f1a",
          }
        })
      : React.createElement("div", {
          style: {
            width: 56,
            height: 56,
            borderRadius: 8,
            border: `1px solid ${td.border}`,
            background: "linear-gradient(145deg,#101725,#1d2333)",
            color: "#d0d5df",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Bebas Neue'",
            fontSize: 18,
            letterSpacing: 1,
          }
        }, initials(player.name)),

    React.createElement("div", { style: { minWidth: 0 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, minWidth: 0 } },
        React.createElement("span", { style: { fontFamily: "'Bebas Neue'", fontSize: 20, color: td.color, lineHeight: 1 } }, player.rating),
        React.createElement("span", { style: {
          fontFamily: "'Rajdhani'",
          fontSize: 10,
          color: pg.color,
          background: `${pg.color}18`,
          borderRadius: 4,
          textAlign: "center",
          padding: "2px 6px",
          letterSpacing: 1,
          flexShrink: 0,
        } }, player.pos),
        React.createElement("span", { style: {
          fontFamily: "'Rajdhani'",
          fontSize: 10,
          color: td.color,
          background: td.bg,
          border: `1px solid ${td.border}`,
          borderRadius: 4,
          padding: "2px 5px",
          flexShrink: 0,
        } }, tk),
        React.createElement("span", { style: {
          fontFamily: "'Rajdhani'",
          fontSize: 11,
          fontWeight: 700,
          color: td.color,
          marginLeft: "auto",
          flexShrink: 0,
        } }, `${td.price}M`)
      ),
      React.createElement("div", { style: {
        fontFamily: "'Exo 2'",
        fontSize: 13,
        fontWeight: 600,
        color: owned ? "#535b69" : "#dde3ee",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        marginTop: 1,
      } }, player.name),
      React.createElement("div", { style: {
        fontFamily: "'Rajdhani'",
        fontSize: 10,
        color: "#7c879b",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      } }, `${positionsText} | ${player.club}`),
      React.createElement("div", { style: {
        fontFamily: "'Rajdhani'",
        fontSize: 10,
        color: "#667189",
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginTop: 2,
      } },
        React.createElement("span", null, `Foot: ${player.preferredFoot || "N/A"}`),
        React.createElement("span", null, `WF: ${numOrDash(player.weakFoot)}`),
        player.pos !== "GK" && React.createElement("span", null, `SM: ${numOrDash(player.skillMoves)}`),
        ...statPairs.map(([label, value]) =>
          React.createElement("span", { key: label }, `${label} ${value}`)
        )
      )
    ),

    React.createElement("div", { style: { textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 } },
      React.createElement("button", {
        onClick: () => { sfx("wishlist"); onWishlist(player.id); },
        style: {
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 15,
          color: isWishlist ? "#FF3D71" : "#333",
          padding: 0,
          lineHeight: 1,
        }
      }, isWishlist ? "❤️" : "🤍"),
      owned
        ? React.createElement("span", { style: { fontFamily: "'Rajdhani'", fontSize: 10, color: ownerColor, fontWeight: 700 } }, `✓ ${ownerName}`)
        : cantAfford
          ? React.createElement("span", { style: { fontFamily: "'Rajdhani'", fontSize: 10, color: "#666" } }, "can't afford")
          : onPick
            ? React.createElement("button", {
                onClick: () => onPick(player),
                style: {
                  background: `linear-gradient(135deg,${td.color},${td.color}aa)`,
                  color: "#000",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "'Bebas Neue'",
                  letterSpacing: 1,
                }
              }, "PICK")
            : React.createElement("span", { style: { color: "#444", fontSize: 12 } }, "—")
    )
  );
}
