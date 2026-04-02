import React from "react";
import { Spinner } from "../components/Spinner.jsx";
import { BTN } from "../utils/styles.js";
import { apiListResults, apiListSessions, apiSaveAuctionPoints } from "../lib/api.js";
import { LOTS } from "../game/constants.js";
import { downloadSquadImage } from "../utils/squadImage.js";
import { LeaderboardScreen } from "./LeaderboardScreen.jsx";

export function Dashboard({ user, onLogout, onNewSession, onLoadSession, onBack }) {
  const [sessions, setSessions] = React.useState(null);
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedResultId, setExpandedResultId] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("results"); // "results" or "leaderboard"
  const [pointsModal, setPointsModal] = React.useState(null); // { sessionId, participants } or null
  const [participantPoints, setParticipantPoints] = React.useState({});
  const [savingPoints, setSavingPoints] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const [mine, pastResults] = await Promise.all([
          apiListSessions(user.username, user?.token),
          apiListResults(user.username, user?.token),
        ]);
        setSessions(mine.filter((session) => session.status !== "complete"));
        setResults(pastResults);
      } catch (err) {
        setSessions([]);
        setResults([]);
      }
      setLoading(false);
    })();
  }, [user.username, user?.token]);

  const handlePointsModalOpen = (sessionId, participants) => {
    const initialized = {};
    participants.forEach(p => {
      initialized[p.name] = 0;
    });
    setParticipantPoints(initialized);
    setPointsModal({ sessionId, participants });
  };

  const handlePointsModalClose = () => {
    setPointsModal(null);
    setParticipantPoints({});
  };

  const handleSaveParticipantPoints = async () => {
    if (!pointsModal) return;

    const pointsArray = Object.entries(participantPoints)
      .filter(([_, points]) => points > 0)
      .map(([playerName, points]) => ({
        playerId: playerName,
        playerName,
        pointsAwarded: points
      }));

    if (pointsArray.length === 0) {
      alert("Please enter points for at least one participant.");
      return;
    }

    setSavingPoints(true);
    try {
      await apiSaveAuctionPoints(pointsModal.sessionId, pointsArray, user?.token);
      alert("Participant points saved successfully!");
      handlePointsModalClose();
      // Refresh results
      const updated = await apiListResults(user.username, user?.token);
      setResults(updated);
    } catch (err) {
      alert("Failed to save points: " + err.message);
    } finally {
      setSavingPoints(false);
    }
  };

  return React.createElement("div", {
    style:{ minHeight:"100vh", background:"#04060a", color:"#fff" }
  },
    pointsModal && React.createElement("div", {
      style: {
        position: "fixed",
        inset: 0,
        background: "#00000088",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      }
    },
      React.createElement("div", {
        style: {
          background: "#0a0c12",
          border: "1px solid #1e2230",
          borderRadius: 12,
          padding: 24,
          maxWidth: 400,
          maxHeight: "80vh",
          overflow: "auto"
        }
      },
        React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 18, color: "#FFD700", letterSpacing: 2, marginBottom: 16 } }, "ENTER TOURNAMENT POINTS"),
        React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#666", marginBottom: 16 } }, "Award points to tournament participants"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 } },
          (pointsModal.participants || []).map(participant =>
            React.createElement("div", { key: participant.name, style: { display: "flex", alignItems: "center", gap: 12 } },
              React.createElement("div", { style: { flex: 1 } },
                React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 14, color: "#fff" } }, participant.name),
                React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 10, color: "#666" } }, `Squad: ${participant.squad?.length || 0}`)
              ),
              React.createElement("input", {
                type: "number",
                min: 0,
                max: 999,
                value: participantPoints[participant.name] || 0,
                onChange: (e) => setParticipantPoints(prev => ({ ...prev, [participant.name]: Math.max(0, parseInt(e.target.value) || 0) })),
                style: {
                  background: "#0d0f16",
                  border: "1px solid #1e2230",
                  borderRadius: 6,
                  color: "#FFD700",
                  fontFamily: "'Bebas Neue'",
                  fontSize: 16,
                  fontWeight: 700,
                  width: 50,
                  height: 36,
                  textAlign: "center",
                  padding: 0,
                  cursor: "pointer"
                }
              })
            )
          )
        ),
        React.createElement("div", { style: { display: "flex", gap: 10 } },
          React.createElement("button", {
            onClick: handlePointsModalClose,
            style: { ...BTN.ghost, flex: 1 }
          }, "CANCEL"),
          React.createElement("button", {
            onClick: handleSaveParticipantPoints,
            disabled: savingPoints,
            style: { ...BTN.gold, flex: 1, opacity: savingPoints ? 0.6 : 1 }
          }, savingPoints ? "SAVING…" : "✓ SAVE POINTS")
        )
      )
    ),
    React.createElement("div", { style:{ padding:"14px 24px", borderBottom:"1px solid #0f1218",
      display:"flex", justifyContent:"space-between", alignItems:"center", background:"#060810" } },
      React.createElement("div", { style:{ display:"flex", gap:10, alignItems:"center" } },
        onBack && React.createElement("button", { onClick:onBack, style:BTN.ghost }, "← BACK"),
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:22, color:"#FFD700", letterSpacing:2 } }, "THE AUCTION ROOM")
      ),
      React.createElement("div", { style:{ display:"flex", gap:10, alignItems:"center" } },
        React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, `@${user.username}`),
        React.createElement("button", { onClick:onLogout, style:BTN.ghost }, "SIGN OUT")
      )
    ),
    React.createElement("div", { style:{ maxWidth:800, margin:"0 auto", padding:"36px 20px" } },
      React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 } },
        React.createElement("div", null,
          React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:42, letterSpacing:3 } }, "MY AUCTIONS"),
          React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, "Create new or resume a saved session")
        ),
        React.createElement("button", { onClick:onNewSession, style:BTN.gold }, "+ NEW AUCTION")
      ),
      loading
        ? React.createElement("div", { style:{ display:"flex", justifyContent:"center", padding:60 } }, React.createElement(Spinner, null))
        : React.createElement(React.Fragment, null,
            sessions?.length === 0
              ? React.createElement("div", { style:{ textAlign:"center", padding:"40px 0 20px", color:"#333",
                  fontFamily:"'Rajdhani'", fontSize:16 } }, "No active auctions — create one above")
              : React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:10, marginBottom:28 } },
                  sessions.map((s, i) =>
                React.createElement("div", { key:i, style:{
                  background:"#0a0c12", border:"1px solid #1e2230", borderRadius:12,
                  padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center",
                  animation:`rowIn .25s ease ${i*.05}s both`
                }},
                  React.createElement("div", null,
                    React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:18, color:"#fff", letterSpacing:2 } }, s.name || `Auction #${i+1}`),
                    React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12, color:"#555", marginTop:2 } },
                      `${s.participants?.length || 0} players · Lot ${(s.lotIdx||0)+1}/${LOTS} · `,
                      React.createElement("span", { style:{ color: s.status==="complete" ? "#00FF88" : "#FFD700" } },
                        s.status === "complete" ? "✓ Complete" : "In Progress"
                      )
                    )
                  ),
                  React.createElement("button", { onClick: () => onLoadSession(s), style:BTN.gold },
                    "RESUME →"
                  )
                )
              )
              ),
            React.createElement("div", { style:{ marginTop: results.length ? 10 : 0 } },
              React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 } },
                React.createElement("div", { style:{ display:"flex", gap:10 } },
                  React.createElement("button", { 
                    onClick: () => setActiveTab("results"), 
                    style:{
                      background: activeTab === "results" ? "#FFD700" : "#0d0f16",
                      color: activeTab === "results" ? "#000" : "#888",
                      border: `1px solid ${activeTab === "results" ? "#FFD700" : "#1e2028"}`,
                      borderRadius: 8,
                      padding: "8px 16px",
                      cursor: "pointer",
                      fontFamily: "'Bebas Neue'",
                      fontSize: 12,
                      letterSpacing: 1
                    }
                  }, "PAST RESULTS"),
                  React.createElement("button", { 
                    onClick: () => setActiveTab("leaderboard"), 
                    style:{
                      background: activeTab === "leaderboard" ? "#FFD700" : "#0d0f16",
                      color: activeTab === "leaderboard" ? "#000" : "#888",
                      border: `1px solid ${activeTab === "leaderboard" ? "#FFD700" : "#1e2028"}`,
                      borderRadius: 8,
                      padding: "8px 16px",
                      cursor: "pointer",
                      fontFamily: "'Bebas Neue'",
                      fontSize: 12,
                      letterSpacing: 1
                    }
                  }, "🏆 LEADERBOARD")
                )
              ),
              activeTab === "results" && React.createElement(React.Fragment, null,
                results.length === 0
                  ? React.createElement("div", { style:{ textAlign:"center", padding:"30px 0", color:"#333",
                      fontFamily:"'Rajdhani'", fontSize:15 } }, "No completed auctions yet")
                  : React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:10 } },
                      results.map((result, i) =>
                        React.createElement("div", { key:`result-${i}`, style:{
                          background:"#0a0c12", border:"1px solid #1e2230", borderRadius:12,
                          padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center",
                          animation:`rowIn .25s ease ${i*.05}s both`
                        } },
                          React.createElement("div", { style:{ width:"100%" } },
                            React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center" } },
                              React.createElement("div", null,
                                React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:18, color:"#fff", letterSpacing:2 } }, result.name || `Auction #${i+1}`),
                                React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12, color:"#555", marginTop:2 } },
                                  `${result.participants?.length || 0} players · ${result.roomCode || "No room code"} · `,
                                  React.createElement("span", { style:{ color:"#00FF88" } }, "✓ Complete")
                                )
                              ),
                              React.createElement("div", { style:{ display:"flex", gap:8 } },
                                React.createElement("button", {
                                  onClick: () => handlePointsModalOpen(result.sessionId, result.participants || []),
                                  style: { ...BTN.ghost, borderColor: "#FFD70044", color: "#FFD700" }
                                }, "📊 POINTS"),
                                React.createElement("button", {
                                  onClick: () => setExpandedResultId(expandedResultId === result.sessionId ? "" : result.sessionId),
                                  style: BTN.ghost
                                }, expandedResultId === result.sessionId ? "HIDE SQUADS" : "VIEW SQUADS"),
                                React.createElement("button", { onClick: () => onLoadSession(result), style:BTN.gold }, "VIEW RESULTS")
                              )
                            ),
                            expandedResultId === result.sessionId && React.createElement("div", {
                              style:{ marginTop:12, borderTop:"1px solid #1e2230", paddingTop:10, display:"flex", flexDirection:"column", gap:8 }
                            },
                              (result.participants || []).length === 0
                                ? React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12, color:"#666" } }, "No squad data saved")
                                : (result.participants || []).map((entry, idx) =>
                                    React.createElement("div", { key:`sq-${idx}`, style:{
                                      background:"#0d0f16",
                                      border:"1px solid #1e2230",
                                      borderRadius:8,
                                      padding:"8px 10px",
                                      display:"flex",
                                      justifyContent:"space-between",
                                      alignItems:"center"
                                    } },
                                      React.createElement("div", null,
                                        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:14, color:"#fff", letterSpacing:1 } }, entry.name),
                                        React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#666" } }, `${entry?.squad?.length || 0} players · ${entry?.budget || 0}M left`)
                                      ),
                                      React.createElement("button", {
                                        onClick: () => downloadSquadImage(entry, { formation: "4-3-3", title: result.name || "THE AUCTION ROOM" }),
                                        style:{
                                          background:"#0d0f16",
                                          border:"1px solid #00FF8844",
                                          borderRadius:6,
                                          color:"#00FF88",
                                          padding:"4px 10px",
                                          cursor:"pointer",
                                          fontFamily:"'Bebas Neue'",
                                          fontSize:11,
                                          letterSpacing:1
                                        }
                                      }, "DOWNLOAD")
                                    )
                                  )
                            )
                          ),
                        )
                      )
                    )
              ),
              activeTab === "leaderboard" && React.createElement(LeaderboardScreen, {
                user,
                onClose: () => {}
              })
            )
          )
    )
  );
}
