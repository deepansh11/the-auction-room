import React from "react";
import { Spinner } from "../components/Spinner.jsx";
import { apiGetLeaderboard } from "../lib/api.js";
import { BTN } from "../utils/styles.js";

export function LeaderboardScreen({ user, onClose }) {
  const [leaderboard, setLeaderboard] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showPositionModal, setShowPositionModal] = React.useState(false);
  const [tournamentName, setTournamentName] = React.useState("");
  const [tournaments, setTournaments] = React.useState({});
  const [tempPositions, setTempPositions] = React.useState({});

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

  const openPositionModal = () => {
    setTournamentName("");
    setTempPositions({});
    setShowPositionModal(true);
  };

  const closePositionModal = () => {
    setShowPositionModal(false);
    setTournamentName("");
    setTempPositions({});
  };

  const saveTournamentPositions = () => {
    if (!tournamentName.trim()) {
      alert("Please enter a tournament name");
      return;
    }
    
    const hasPositions = Object.keys(tempPositions).some(player => tempPositions[player]);
    if (!hasPositions) {
      alert("Please assign at least one position");
      return;
    }

    setTournaments(prev => ({
      ...prev,
      [tournamentName]: tempPositions
    }));
    closePositionModal();
  };

  const setPlayerPosition = (playerName, position) => {
    setTempPositions(prev => ({
      ...prev,
      [playerName]: position ? parseInt(position) : null
    }));
  };

  const getTournamentStanding = (playerName) => {
    for (const [tournName, positions] of Object.entries(tournaments)) {
      if (positions[playerName]) {
        return { tournName, position: positions[playerName] };
      }
    }
    return null;
  };

  const getFirstPlaceWinner = (tournName) => {
    const positions = tournaments[tournName];
    for (const [playerName, position] of Object.entries(positions)) {
      if (position === 1) return playerName;
    }
    return null;
  };

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
      React.createElement("div", null,
        React.createElement("div", {
          style: {
            fontFamily: "'Bebas Neue'",
            fontSize: 28,
            color: "#FFD700",
            letterSpacing: 2
          }
        }, "🏆 LEADERBOARD"),
        React.createElement("div", {
          style: {
            fontFamily: "'Rajdhani'",
            fontSize: 12,
            color: "#888",
            marginTop: 4
          }
        }, "Premier League Style Standings")
      ),
      onClose && React.createElement("button", {
        onClick: onClose,
        style: BTN.ghost
      }, "← BACK")
    ),

    React.createElement("div", {
      style: { maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }
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
          : React.createElement("div", null,
            // Tournament Standings Section
            React.createElement("div", {
              style: {
                marginBottom: 32,
                padding: "16px",
                background: "#0a0c12",
                border: "1px solid #1e2230",
                borderRadius: 8
              }
            },
              React.createElement("div", {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12
                }
              },
                React.createElement("div", {
                  style: {
                    fontFamily: "'Bebas Neue'",
                    fontSize: 16,
                    color: "#FFD700"
                  }
                }, "TOURNAMENT STANDINGS"),
                React.createElement("button", {
                  onClick: openPositionModal,
                  style: {
                    padding: "8px 12px",
                    background: "#FFD700",
                    border: "none",
                    color: "#000",
                    borderRadius: 4,
                    fontFamily: "'Rajdhani'",
                    fontSize: 12,
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseOver: (e) => {
                    e.target.style.background = "#FFF44F";
                  },
                  onMouseLeave: (e) => {
                    e.target.style.background = "#FFD700";
                  }
                }, "+ NEW TOURNAMENT")
              ),
              Object.keys(tournaments).length === 0
                ? React.createElement("div", {
                  style: {
                    fontFamily: "'Rajdhani'",
                    fontSize: 12,
                    color: "#666"
                  }
                }, "No tournaments created yet. Click 'NEW TOURNAMENT' to add one.")
                : React.createElement("div", {
                  style: {
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8
                  }
                },
                  Object.keys(tournaments).map(tournName =>
                    React.createElement("div", {
                      key: tournName,
                      style: {
                        padding: "8px 12px",
                        background: "#1e2230",
                        border: "1px solid #2a3340",
                        borderRadius: 4,
                        fontFamily: "'Rajdhani'",
                        fontSize: 11
                      }
                    },
                      React.createElement("div", {
                        style: { color: "#FFD700", fontWeight: "bold" }
                      }, tournName),
                      React.createElement("div", {
                        style: { color: "#888", fontSize: 10 }
                      }, `🥇 ${getFirstPlaceWinner(tournName)}`)
                    )
                  )
                )
            ),

            // Leaderboard Table
            React.createElement("div", {
              style: {
                overflowX: "auto",
                borderRadius: 8,
                border: "1px solid #1e2230",
                background: "#0a0c12"
              }
            },
              React.createElement("table", {
                style: {
                  width: "100%",
                  borderCollapse: "collapse",
                  fontFamily: "'Rajdhani'"
                }
              },
                React.createElement("thead", null,
                  React.createElement("tr", {
                    style: {
                      background: "#0f1218",
                      borderBottom: "2px solid #1e2230"
                    }
                  },
                    React.createElement("th", {
                      style: {
                        padding: "14px 16px",
                        textAlign: "left",
                        color: "#FFD700",
                        fontWeight: "bold",
                        fontSize: 13,
                        width: "8%"
                      }
                    }, "POS"),
                    React.createElement("th", {
                      style: {
                        padding: "14px 16px",
                        textAlign: "left",
                        color: "#FFD700",
                        fontWeight: "bold",
                        fontSize: 13,
                        width: "30%"
                      }
                    }, "PLAYER"),
                    React.createElement("th", {
                      style: {
                        padding: "14px 16px",
                        textAlign: "center",
                        color: "#FFD700",
                        fontWeight: "bold",
                        fontSize: 13,
                        width: "12%"
                      }
                    }, "P"),
                    React.createElement("th", {
                      style: {
                        padding: "14px 16px",
                        textAlign: "center",
                        color: "#FFD700",
                        fontWeight: "bold",
                        fontSize: 13,
                        width: "12%"
                      }
                    }, "W"),
                    React.createElement("th", {
                      style: {
                        padding: "14px 16px",
                        textAlign: "center",
                        color: "#FFD700",
                        fontWeight: "bold",
                        fontSize: 13,
                        width: "12%"
                      }
                    }, "PTS"),
                    React.createElement("th", {
                      style: {
                        padding: "14px 16px",
                        textAlign: "center",
                        color: "#FFD700",
                        fontWeight: "bold",
                        fontSize: 13,
                        width: "14%"
                      }
                    }, "TOURNAMENT"),
                    React.createElement("th", {
                      style: {
                        padding: "14px 16px",
                        textAlign: "center",
                        color: "#FFD700",
                        fontWeight: "bold",
                        fontSize: 13,
                        width: "12%"
                      }
                    }, "🏅")
                  )
                ),
                React.createElement("tbody", null,
                  leaderboard.map((entry, idx) =>
                    React.createElement("tr", {
                      key: entry.playerName,
                      style: {
                        borderBottom: "1px solid #1a2230",
                        background: idx % 2 === 0 ? "transparent" : "#05070d",
                        transition: "background 0.2s"
                      },
                      onMouseOver: (e) => {
                        e.currentTarget.style.background = "#0f1621";
                      },
                      onMouseLeave: (e) => {
                        e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "#05070d";
                      }
                    },
                      React.createElement("td", {
                        style: {
                          padding: "14px 16px",
                          fontFamily: "'Bebas Neue'",
                          fontSize: 18,
                          color: idx === 0 ? "#FFD700" : idx === 1 ? "#C0C0C0" : idx === 2 ? "#CD7F32" : "#fff",
                          fontWeight: "bold"
                        }
                      }, `${idx + 1}${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : ""}`),
                      React.createElement("td", {
                        style: {
                          padding: "14px 16px",
                          fontFamily: "'Bebas Neue'",
                          fontSize: 15,
                          color: "#fff",
                          fontWeight: "500"
                        }
                      }, entry.playerName),
                      React.createElement("td", {
                        style: {
                          padding: "14px 16px",
                          textAlign: "center",
                          color: "#4FC3F7"
                        }
                      }, entry.tournaments?.length || 0),
                      React.createElement("td", {
                        style: {
                          padding: "14px 16px",
                          textAlign: "center",
                          color: "#FFD700",
                          fontWeight: "bold"
                        }
                      }, entry.trophyCount || 0),
                      React.createElement("td", {
                        style: {
                          padding: "14px 16px",
                          textAlign: "center",
                          color: "#81C784",
                          fontWeight: "bold",
                          fontSize: 15
                        }
                      }, entry.totalPoints),
                      React.createElement("td", {
                        style: {
                          padding: "14px 16px",
                          textAlign: "center",
                          color: "#64B5F6"
                        }
                      }, 
                        (() => {
                          const standing = getTournamentStanding(entry.playerName);
                          return standing 
                            ? `${standing.tournName} (${standing.position}🥇)`
                            : "-";
                        })()
                      ),
                      React.createElement("td", {
                        style: {
                          padding: "14px 16px",
                          textAlign: "center",
                          fontSize: 18
                        }
                      }, entry.trophyCount > 0 ? "⭐".repeat(Math.min(entry.trophyCount, 5)) : "-")
                    )
                  )
                )
              )
            )
          )
    ),

    // Position Modal
    showPositionModal && React.createElement("div", {
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      },
      onClick: closePositionModal
    },
      React.createElement("div", {
        style: {
          background: "#0a0c12",
          border: "2px solid #1e2230",
          borderRadius: 12,
          padding: 24,
          maxWidth: 700,
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.8)"
        },
        onClick: (e) => e.stopPropagation()
      },
        React.createElement("div", {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20
          }
        },
          React.createElement("div", {
            style: {
              fontFamily: "'Bebas Neue'",
              fontSize: 20,
              color: "#FFD700"
            }
          }, "SET TOURNAMENT STANDINGS"),
          React.createElement("button", {
            onClick: closePositionModal,
            style: {
              background: "none",
              border: "none",
              color: "#888",
              fontSize: 24,
              cursor: "pointer"
            }
          }, "✕")
        ),

        // Tournament Name Input
        React.createElement("div", {
          style: {
            marginBottom: 20
          }
        },
          React.createElement("label", {
            style: {
              fontFamily: "'Rajdhani'",
              fontSize: 12,
              color: "#FFD700",
              fontWeight: "bold",
              display: "block",
              marginBottom: 6
            }
          }, "TOURNAMENT NAME"),
          React.createElement("input", {
            type: "text",
            value: tournamentName,
            onChange: (e) => setTournamentName(e.target.value),
            placeholder: "e.g., Spring Tournament 2025",
            style: {
              width: "100%",
              padding: "10px 12px",
              background: "#05070d",
              border: "1px solid #1e2230",
              color: "#fff",
              borderRadius: 6,
              fontFamily: "'Rajdhani'",
              fontSize: 13,
              boxSizing: "border-box"
            }
          })
        ),

        React.createElement("div", {
          style: {
            fontFamily: "'Rajdhani'",
            fontSize: 11,
            color: "#888",
            marginBottom: 12
          }
        }, "Enter position for each player (leave blank if not participating):"),

        // Player Position Inputs
        React.createElement("div", {
          style: {
            display: "grid",
            gap: 10
          }
        },
          leaderboard.map((entry) =>
            React.createElement("div", {
              key: entry.playerName,
              style: {
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                background: "#05070d",
                border: "1px solid #1a2230",
                borderRadius: 6
              }
            },
              React.createElement("div", {
                style: {
                  flex: 1,
                  fontFamily: "'Rajdhani'",
                  fontSize: 13,
                  color: "#fff",
                  fontWeight: "500"
                }
              }, entry.playerName),
              React.createElement("div", {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 6
                }
              },
                React.createElement("input", {
                  type: "number",
                  min: "1",
                  placeholder: "#",
                  value: tempPositions[entry.playerName] || "",
                  onChange: (e) => setPlayerPosition(entry.playerName, e.target.value),
                  style: {
                    width: 60,
                    padding: "6px 8px",
                    background: "#0f1621",
                    border: "1px solid #1e2230",
                    color: "#FFD700",
                    borderRadius: 4,
                    fontFamily: "'Rajdhani'",
                    fontSize: 13,
                    textAlign: "center"
                  }
                }),
                React.createElement("span", {
                  style: {
                    fontFamily: "'Rajdhani'",
                    fontSize: 12,
                    color: "#888",
                    width: 20,
                    textAlign: "center"
                  }
                }, tempPositions[entry.playerName] ? "✓" : "")
              )
            )
          )
        ),

        React.createElement("div", {
          style: {
            display: "flex",
            gap: 12,
            marginTop: 20
          }
        },
          React.createElement("button", {
            onClick: saveTournamentPositions,
            style: {
              ...BTN.primary,
              flex: 1
            }
          }, "✓ SAVE TOURNAMENT"),
          React.createElement("button", {
            onClick: closePositionModal,
            style: {
              ...BTN.ghost,
              flex: 1
            }
          }, "CANCEL")
        )
      )
    )
  );
}
