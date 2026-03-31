import React from "react";

function statValue(value) {
  return Number.isFinite(value) ? value : "--";
}

function initialsFromName(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

// Returns the 6-stat pairs [[label, value], ...] relevant for the player's position
function getStatGrid(player) {
  const pos = String(player?.pos || "").toUpperCase();
  const isGK = pos === "GK";

  if (isGK) {
    return [
      ["DIV", statValue(player?.gkDiving)],
      ["HAN", statValue(player?.gkHandling)],
      ["KIC", statValue(player?.gkKicking)],
      ["REF", statValue(player?.gkReflexes)],
      ["SPD", statValue(player?.gkSpeed)],
      ["POS", statValue(player?.gkPositioning)],
    ];
  }

  const defenders = ["CB","LB","RB","LWB","RWB"];
  const defMids   = ["CDM","CM"];
  const attMids   = ["CAM","LM","RM","LW","RW"];
  const attackers = ["ST","CF","SS"];

  if (defenders.includes(pos)) {
    return [
      ["DEF", statValue(player?.defending)],
      ["PHY", statValue(player?.physic)],
      ["PAC", statValue(player?.pace)],
      ["PAS", statValue(player?.passing)],
      ["DRI", statValue(player?.dribbling)],
      ["SHO", statValue(player?.shooting)],
    ];
  }
  if (defMids.includes(pos)) {
    return [
      ["PAS", statValue(player?.passing)],
      ["DEF", statValue(player?.defending)],
      ["PHY", statValue(player?.physic)],
      ["PAC", statValue(player?.pace)],
      ["DRI", statValue(player?.dribbling)],
      ["SHO", statValue(player?.shooting)],
    ];
  }
  if (attMids.includes(pos)) {
    return [
      ["PAS", statValue(player?.passing)],
      ["DRI", statValue(player?.dribbling)],
      ["PAC", statValue(player?.pace)],
      ["SHO", statValue(player?.shooting)],
      ["DEF", statValue(player?.defending)],
      ["PHY", statValue(player?.physic)],
    ];
  }
  if (attackers.includes(pos)) {
    return [
      ["PAC", statValue(player?.pace)],
      ["SHO", statValue(player?.shooting)],
      ["DRI", statValue(player?.dribbling)],
      ["PAS", statValue(player?.passing)],
      ["PHY", statValue(player?.physic)],
      ["DEF", statValue(player?.defending)],
    ];
  }
  // Default
  return [
    ["PAC", statValue(player?.pace)],
    ["SHO", statValue(player?.shooting)],
    ["PAS", statValue(player?.passing)],
    ["DRI", statValue(player?.dribbling)],
    ["DEF", statValue(player?.defending)],
    ["PHY", statValue(player?.physic)],
  ];
}

function faceArea(player, faceFailed, setFaceFailed, compact) {
  const size = compact ? 66 : 84;
  const radius = compact ? 10 : 12;

  if (player?.playerFaceUrl && !faceFailed) {
    return React.createElement("img", {
      src: player.playerFaceUrl,
      alt: player.name,
      referrerPolicy: "no-referrer",
      onError: () => setFaceFailed(true),
      style: {
        width: size,
        height: size,
        borderRadius: radius,
        objectFit: "cover",
        border: "1px solid #ffffff22",
        background: "#0b0f1a",
      },
    });
  }

  return React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: radius,
      border: "1px solid #ffffff22",
      background: "linear-gradient(145deg,#101725,#1d2333)",
      color: "#d0d5df",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Bebas Neue'",
      fontSize: compact ? 22 : 28,
      letterSpacing: 1,
    },
  }, initialsFromName(player?.name));
}

export function FifaPlayerCard({
  player,
  tierData,
  tierKey,
  isWishlisted,
  onToggleWishlist,
  compact = false,
  footerRight = null,
}) {
  const [faceFailed, setFaceFailed] = React.useState(false);

  const positionsText = player?.positionsText || player?.positions?.join(", ") || player?.pos || "N/A";
  const isGK = String(player?.pos || "").toUpperCase() === "GK";
  const statGrid = getStatGrid(player);

  return React.createElement("div", {
    style: {
      background: `linear-gradient(165deg, ${tierData.bg}, #0a0c12 55%)`,
      border: `1px solid ${tierData.border}`,
      borderRadius: compact ? 12 : 14,
      padding: compact ? 10 : 12,
      display: "flex",
      flexDirection: "column",
      gap: compact ? 8 : 10,
      boxShadow: `0 0 20px ${tierData.color}15`,
    },
  },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 } },
      React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 } },
        faceArea(player, faceFailed, setFaceFailed, compact),
        React.createElement("div", { style: { minWidth: 0 } },
          React.createElement("div", { style: {
            fontFamily: "'Bebas Neue'",
            fontSize: compact ? 19 : 22,
            color: "#fff",
            letterSpacing: 1,
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: compact ? 165 : 200,
          } }, player?.name || "Unknown"),
          React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#9aa4b5", marginTop: 3 } },
            `${positionsText} | ${player?.club || "Unknown"}`
          ),
          React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#727e95", marginTop: 2 } },
            `${player?.nation || "Unknown"}${Number.isFinite(player?.age) ? ` | ${player.age} yrs` : ""}`
          )
        )
      ),
      React.createElement("div", { style: { textAlign: "right", minWidth: 66 } },
        React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: compact ? 28 : 34, color: tierData.color, lineHeight: .9 } }, player?.rating ?? "--"),
        React.createElement("div", { style: {
          fontFamily: "'Rajdhani'",
          fontSize: 10,
          color: tierData.color,
          background: tierData.bg,
          border: `1px solid ${tierData.border}`,
          borderRadius: 4,
          padding: "2px 6px",
          display: "inline-block",
          marginTop: 3,
        } }, tierKey)
      )
    ),

    React.createElement("div", { style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 6,
    } },
      statGrid.map(([label, value]) =>
        React.createElement("div", { key: label, style: {
          background: "#05070d",
          border: "1px solid #1d2433",
          borderRadius: 8,
          padding: "5px 6px",
          textAlign: "center",
        } },
          React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 13, color: "#dce2ee", lineHeight: 1 } }, value),
          React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 9, color: "#68738a", marginTop: 1 } }, label)
        )
      )
    ),

    React.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    } },
      React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        React.createElement("span", { style: {
          fontFamily: "'Rajdhani'",
          fontSize: 10,
          color: "#a4afc6",
          border: "1px solid #293145",
          borderRadius: 5,
          padding: "2px 6px",
        } }, `Foot: ${player?.preferredFoot || "N/A"}`),
        React.createElement("span", { style: {
          fontFamily: "'Rajdhani'",
          fontSize: 10,
          color: "#a4afc6",
          border: "1px solid #293145",
          borderRadius: 5,
          padding: "2px 6px",
        } }, `WF: ${Number.isFinite(player?.weakFoot) ? player.weakFoot : "--"}`),
        !isGK && React.createElement("span", { style: {
          fontFamily: "'Rajdhani'",
          fontSize: 10,
          color: "#a4afc6",
          border: "1px solid #293145",
          borderRadius: 5,
          padding: "2px 6px",
        } }, `SM: ${Number.isFinite(player?.skillMoves) ? player.skillMoves : "--"}`)
      ),
      onToggleWishlist
        ? React.createElement("button", {
            onClick: onToggleWishlist,
            style: {
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: compact ? 17 : 19,
              lineHeight: 1,
              opacity: isWishlisted ? 1 : 0.55,
            },
          }, isWishlisted ? "❤️" : "🤍")
        : footerRight || null
    ),

    footerRight && onToggleWishlist && React.createElement("div", null, footerRight)
  );
}
