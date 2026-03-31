import React from "react";
import { BTN } from "../utils/styles.js";
import { getTierData, getTierKey, TIERS } from "../game/constants.js";

function statValue(value) {
  return Number.isFinite(value) ? value : "--";
}

function initialsFromName(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export function PlayerDetailScreen({ player, onClose, isWishlisted, onToggleWishlist }) {
  const [faceFailed, setFaceFailed] = React.useState(false);
  const tierData = getTierData(player.rating, TIERS);
  const tierKey = getTierKey(player.rating, TIERS);
  const positionsText = player?.positionsText || player?.positions?.join(", ") || player?.pos || "N/A";
  const isGK = String(player?.pos || "").toUpperCase() === "GK";

  const statsData = isGK
    ? [
        { label: "DIVING",      value: statValue(player?.gkDiving) },
        { label: "HANDLING",    value: statValue(player?.gkHandling) },
        { label: "KICKING",     value: statValue(player?.gkKicking) },
        { label: "REFLEXES",    value: statValue(player?.gkReflexes) },
        { label: "SPEED",       value: statValue(player?.gkSpeed) },
        { label: "POSITIONING", value: statValue(player?.gkPositioning) },
      ]
    : [
        { label: "PACE",      value: statValue(player?.pace) },
        { label: "SHOOTING",  value: statValue(player?.shooting) },
        { label: "PASSING",   value: statValue(player?.passing) },
        { label: "DRIBBLING", value: statValue(player?.dribbling) },
        { label: "DEFENDING", value: statValue(player?.defending) },
        { label: "PHYSIC",    value: statValue(player?.physic) },
      ];

  const infoLeft = [
    { label: "Energy", value: "100%" },
    { label: "Foot", value: player?.preferredFoot || "N/A" },
    { label: "Acceleration Type", value: "Controlled" },
    { label: "Role", value: player?.positions?.[0] || "N/A" },
  ];

  const faceNode = React.createElement("div", null,
    player?.playerFaceUrl && !faceFailed
      ? React.createElement("img", {
          src: player.playerFaceUrl,
          alt: player.name,
          referrerPolicy: "no-referrer",
          onError: () => setFaceFailed(true),
          style: {
            width: 160,
            height: 200,
            borderRadius: 12,
            objectFit: "cover",
            border: `2px solid ${tierData.color}`,
          },
        })
      : React.createElement("div", {
          style: {
            width: 160,
            height: 200,
            borderRadius: 12,
            border: `2px solid ${tierData.color}`,
            background: `linear-gradient(145deg, ${tierData.bg}, #1d2333)`,
            color: "#d0d5df",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Bebas Neue'",
            fontSize: 56,
            letterSpacing: 2,
          },
        }, initialsFromName(player?.name))
  );

  return React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "#04060a",
      color: "#fff",
    },
  },
    React.createElement("div", {
      style: {
        padding: "14px 24px",
        borderBottom: "1px solid #0f1218",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#060810",
      },
    },
      React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: "#FFD700", letterSpacing: 2 } }, "THE AUCTION ROOM"),
      React.createElement("button", {
        onClick: onClose,
        style: {
          ...BTN.ghost,
          borderColor: "#FFD70055",
          color: "#FFD700",
        },
      }, "← BACK TO DISCOVERY")
    ),

    React.createElement("div", {
      style: {
        padding: "24px",
        maxWidth: 1200,
        margin: "0 auto",
      },
    },
    React.createElement("div", {
      style: {
        background: `linear-gradient(165deg, ${tierData.bg}, #0a0c12)`,
        border: `2px solid ${tierData.border}`,
        borderRadius: 16,
        width: "100%",
        maxWidth: 900,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: `0 0 40px ${tierData.color}22`,
        margin: "0 auto",
      },
    },
      // Header with close
      React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 24px",
          borderBottom: `1px solid ${tierData.border}22`,
        },
      },
        React.createElement("div", null,
          React.createElement("div", {
            style: {
              fontFamily: "'Bebas Neue'",
              fontSize: 24,
              color: "#fff",
              letterSpacing: 2,
            },
          }, player?.name || "Unknown"),
          React.createElement("div", {
            style: {
              fontFamily: "'Rajdhani'",
              fontSize: 12,
              color: "#9aa4b5",
              marginTop: 4,
            },
          }, `${player?.nation || ""} • ${player?.club || ""}`)
        ),
        React.createElement("button", {
          onClick: onClose,
          style: {
            ...BTN.ghost,
            padding: "6px 12px",
            minWidth: 0,
          },
        }, "BACK")
      ),

      // Content
      React.createElement("div", {
        style: {
          flex: 1,
          overflow: "auto",
          padding: "24px",
        },
      },
        // Top section: Image + Rating + Info
        React.createElement("div", {
          style: {
            display: "flex",
            gap: 24,
            marginBottom: 32,
          },
        },
          // Face image
          React.createElement("div", {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            },
          },
            faceNode,
            React.createElement("div", {
              style: {
                textAlign: "center",
              },
            },
              React.createElement("div", {
                style: {
                  fontFamily: "'Bebas Neue'",
                  fontSize: 48,
                  color: tierData.color,
                  lineHeight: 1,
                },
              }, player?.rating ?? "--"),
              React.createElement("div", {
                style: {
                  fontFamily: "'Rajdhani'",
                  fontSize: 11,
                  color: tierData.color,
                  background: tierData.bg,
                  border: `1px solid ${tierData.border}`,
                  borderRadius: 6,
                  padding: "4px 10px",
                  marginTop: 8,
                  display: "inline-block",
                },
              }, tierKey)
            )
          ),

          // Info columns
          React.createElement("div", {
            style: {
              flex: 1,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px 20px",
            },
          },
            React.createElement("div", {
              style: {
                gridColumn: "1 / -1",
                marginBottom: 12,
              },
            },
              React.createElement("div", {
                style: {
                  fontFamily: "'Bebas Neue'",
                  fontSize: 14,
                  color: "#dce2ee",
                  letterSpacing: 1,
                  marginBottom: 4,
                },
              }, "PLAYER INFO"),
              React.createElement("div", {
                style: {
                  height: 1,
                  background: `linear-gradient(90deg, ${tierData.color}44, transparent)`,
                },
              })
            ),

            // Left column
            React.createElement("div", null,
              infoLeft.map(({ label, value }) =>
                React.createElement("div", {
                  key: label,
                  style: {
                    marginBottom: 16,
                  },
                },
                  React.createElement("div", {
                    style: {
                      fontFamily: "'Rajdhani'",
                      fontSize: 11,
                      color: "#9aa4b5",
                      marginBottom: 4,
                    },
                  }, label),
                  React.createElement("div", {
                    style: {
                      fontFamily: "'Bebas Neue'",
                      fontSize: 14,
                      color: "#fff",
                      letterSpacing: 1,
                    },
                  }, value)
                )
              )
            ),

            // Right column - Main stats
            React.createElement("div", null,
              statsData.slice(0, 3).map(({ label, value }) =>
                React.createElement("div", {
                  key: label,
                  style: {
                    marginBottom: 16,
                  },
                },
                  React.createElement("div", {
                    style: {
                      fontFamily: "'Rajdhani'",
                      fontSize: 11,
                      color: "#9aa4b5",
                      marginBottom: 4,
                    },
                  }, label),
                  React.createElement("div", {
                    style: {
                      fontFamily: "'Bebas Neue'",
                      fontSize: 14,
                      color: value === "--" ? "#9aa4b5" : "inherit",
                      letterSpacing: 1,
                    },
                  }, value)
                )
              )
            )
          )
        ),

        // Additional stats grid
        React.createElement("div", {
          style: {
            marginBottom: 24,
          },
        },
          React.createElement("div", {
            style: {
              fontFamily: "'Bebas Neue'",
              fontSize: 12,
              color: "#dce2ee",
              letterSpacing: 1,
              marginBottom: 12,
            },
          }, "FULL STATS"),
          React.createElement("div", {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            },
          },
            statsData.map(({ label, value }) =>
              React.createElement("div", {
                key: label,
                style: {
                  background: "#05070d",
                  border: `1px solid ${tierData.border}22`,
                  borderRadius: 10,
                  padding: 16,
                  textAlign: "center",
                },
              },
                React.createElement("div", {
                  style: {
                    fontFamily: "'Bebas Neue'",
                    fontSize: 24,
                    color: value === "--" ? "#9aa4b5" : "#dce2ee",
                    lineHeight: 1,
                    marginBottom: 6,
                  },
                }, value),
                React.createElement("div", {
                  style: {
                    fontFamily: "'Rajdhani'",
                    fontSize: 10,
                    color: "#68738a",
                  },
                }, label)
              )
            )
          )
        ),

        // Additional attributes
        React.createElement("div", {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
          },
        },
          [
            { label: "Weak Foot", value: statValue(player?.weakFoot) },
            ...(!isGK ? [{ label: "Skill Moves", value: statValue(player?.skillMoves) }] : []),
            { label: "Height (cm)", value: player?.heightCm || "N/A" },
            { label: "Weight (kg)", value: player?.weightKg || "N/A" },
            { label: "Positions", value: positionsText },
            { label: "Age", value: Number.isFinite(player?.age) ? `${player.age} yrs` : "N/A" },
          ].map(({ label, value }) =>
            React.createElement("div", {
              key: label,
              style: {
                background: "#05070d",
                border: `1px solid ${tierData.border}22`,
                borderRadius: 10,
                padding: 12,
              },
            },
              React.createElement("div", {
                style: {
                  fontFamily: "'Rajdhani'",
                  fontSize: 10,
                  color: "#9aa4b5",
                  marginBottom: 4,
                },
              }, label),
              React.createElement("div", {
                style: {
                  fontFamily: "'Bebas Neue'",
                  fontSize: 13,
                  color: "#dce2ee",
                  letterSpacing: 0.5,
                },
              }, value)
            )
          )
        )
      ),

      // Footer with wishlist button
      React.createElement("div", {
        style: {
          display: "flex",
          gap: 10,
          padding: "16px 24px",
          borderTop: `1px solid ${tierData.border}22`,
          background: "#05070d",
        },
      },
        React.createElement("button", {
          onClick: onToggleWishlist,
          style: {
            flex: 1,
            ...BTN.primary,
            background: isWishlisted ? tierData.color : "transparent",
            color: isWishlisted ? "#0a0c12" : tierData.color,
            border: `1px solid ${tierData.color}`,
            borderRadius: 8,
            padding: "10px 16px",
            fontFamily: "'Bebas Neue'",
            fontSize: 12,
            cursor: "pointer",
            letterSpacing: 1,
            transition: "all .2s",
          },
        }, isWishlisted ? "❤️ WISHLISTED" : "🤍 ADD TO WISHLIST"),
        React.createElement("button", {
          onClick: onClose,
          style: {
            ...BTN.ghost,
            flex: 1,
          },
        }, "BACK TO LIST")
      )
    )
    )
  );
}
