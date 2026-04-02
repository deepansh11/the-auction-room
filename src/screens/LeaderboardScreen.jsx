import React from "react";
import { Spinner } from "../components/Spinner.jsx";
import { apiGetLeaderboard } from "../lib/api.js";
import { BTN } from "../utils/styles.js";

export function LeaderboardScreen({ user, onClose }) {
  const [leaderboard, setLeaderboard] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    apiGetLeaderboard(user?.token)
      .then(data => setLeaderboard(data))
      .catch(err => {
        console.error("Failed to load leaderboard:", err);
        setLeaderboard([]);
      })
      .finally(() => setLoading(false));
  }, [user?.token]);

  return React.createElement("div", {
    style: { minHeight: "100vh", background: "#04060a", color: "#fff" }
  },
    React.createElement("div", {
      style: {
        padding: "24px",
        borderBottom: "1px solid #0f1218",
        background: "#060810",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }
    },
      React.createElement("div", {
        style: {
          fontFamily: "'Bebas Neue'",
          fontSize: 28,
          color: "#FFD700",
          letterSpacing: 2
        }
      }, "🏆 LEADERBOARD"),
      onClose && React.createElement("button", {
        onClick: onClose,
        style: BTN.ghost
      }, "← BACK")
    ),

    React.createElement("div", {
      style: { maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }
    },
      loading
        ? React.createElement("div", {
          style: {
            display: "flex",
            justifyContent: "center",
            padding: "60px 20px"
          }
        }, React.createElement(Spinner, null))
        : leaderboard.length === 0
          ? React.createElement("div", {
            style: {
              textAlign: "center",
              padding: "60px 20px",
              color: "#444",
              fontFamily: "'Rajdhani'",
              fontSize: 16
            }
          }, "No leaderboard data yet. Complete auctions and enter points to build the leaderboard.")
          : React.createElement("div", {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: 20
            }
          },
            leaderboard.map((entry, idx) =>
              React.createElement("div", {
                key: entry.playerName,
                style: {
                  background: "#0a0c12",
                  border: "1px solid #1e2230",
                  borderRadius: 14,
                  padding: 20,
                  animation: `rowIn .25s ease ${idx * 0.05}s both`,
                  position: "relative"
                }
              },
                React.createElement("div", {
                  style: {
                    position: "absolute",
                    top: 12,
                    right: 12,
                    fontFamily: "'Bebas Neue'",
                    fontSize: 28,
                    opacity: 0.3
                  }
                }, idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : ""),

                React.createElement("div", {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "start",
                    marginBottom: 16
                  }
                },
                  React.createElement("div", null,
                    React.createElement("div", {
                      style: {
                        fontFamily: "'Bebas Neue'",
                        fontSize: 22,
                        color: "#FFD700",
                        letterSpacing: 1,
                        marginBottom: 4
                      }
                    }, `#${idx + 1} ${entry.playerName}`),
                    React.createElement("div", {
                      style: {
                        fontFamily: "'Rajdhani'",
                        fontSize: 12,
                        color: "#555"
                      }
                    }, `@${entry.playerName.toLowerCase()}`)
                  ),
                  React.createElement("div", {
                    style: {
                      background: "#1e2230",
                      borderRadius: 8,
                      padding: "8px 12px",
                      textAlign: "center"
                    }
                  },
                    React.createElement("div", {
                      style: {
                        fontFamily: "'Bebas Neue'",
                        fontSize: 28,
                        color: entry.trophyCount > 0 ? "#FFD700" : "#555"
                      }
                    }, entry.trophyCount),
                    React.createElement("div", {
                      style: {
                        fontFamily: "'Rajdhani'",
                        fontSize: 10,
                        color: "#888",
                        marginTop: 2
                      }
                    }, "TROPHIES")
                  )
                ),

                React.createElement("div", {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    marginBottom: 14
                  }
                },
                  React.createElement("div", {
                    style: {
                      background: "#05070d",
                      border: "1px solid #1d2433",
                      borderRadius: 8,
                      padding: 12,
                      textAlign: "center"
                    }
                  },
                    React.createElement("div", {
                      style: {
                        fontFamily: "'Bebas Neue'",
                        fontSize: 24,
                        color: "#4FC3F7"
                      }
                    }, entry.totalPoints),
                    React.createElement("div", {
                      style: {
                        fontFamily: "'Rajdhani'",
                        fontSize: 10,
                        color: "#666",
                        marginTop: 4
                      }
                    }, "TOTAL POINTS")
                  ),
                  React.createElement("div", {
                    style: {
                      background: "#05070d",
                      border: "1px solid #1d2433",
                      borderRadius: 8,
                      padding: 12,
                      textAlign: "center"
                    }
                  },
                    React.createElement("div", {
                      style: {
                        fontFamily: "'Bebas Neue'",
                        fontSize: 24,
                        color: "#81C784"
                      }
                    }, entry.averagePoints),
                    React.createElement("div", {
                      style: {
                        fontFamily: "'Rajdhani'",
                        fontSize: 10,
                        color: "#666",
                        marginTop: 4
                      }
                    }, "AVG PER TOURNAMENT")
                  )
                ),

                entry.tournaments.length > 0 && React.createElement("div", {
                  style: {
                    borderTop: "1px solid #1e2230",
                    paddingTop: 12
                  }
                },
                  React.createElement("div", {
                    style: {
                      fontFamily: "'Rajdhani'",
                      fontSize: 10,
                      color: "#888",
                      marginBottom: 8
                    }
                  }, `WON ${entry.tournaments.length} TOURNAMENT${entry.tournaments.length !== 1 ? "S" : ""}`),
                  entry.tournaments.map((tournament, idx) =>
                    React.createElement("div", {
                      key: idx,
                      style: {
                        fontFamily: "'Rajdhani'",
                        fontSize: 11,
                        color: "#FFD700",
                        background: "#FFD70011",
                        border: "1px solid #FFD70022",
                        borderRadius: 4,
                        padding: "4px 8px",
                        marginBottom: idx < entry.tournaments.length - 1 ? 4 : 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }
                    }, tournament)
                  )
                )
              )
            )
          )
    )
  );
}
