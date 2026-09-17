import React from "react";
import { BTN } from "../utils/styles.js";
import { loadPlayersFromCsv } from "../data/players.js";
import { PCOLORS, POS_GROUPS, getTierKey, getTierData, TIERS, getPosGroup } from "../game/constants.js";
import { apiDeleteResult, apiListResults, apiListSessions, apiSaveAuctionPoints } from "../lib/api.js";
import { Spinner } from "../components/Spinner.jsx";
import { FifaPlayerCard } from "../components/FifaPlayerCard.jsx";
import { PlayerDetailScreen } from "./PlayerDetailScreen.jsx";
import { LOTS } from "../game/constants.js";
import { downloadSquadImage } from "../utils/squadImage.js";
import { TeamBadge, StatusPill, createSurfaceStyle, getParticipantAccent } from "../theme/footballTheme.js";
import homeStartImg from "../assets/a560ead7123ef1ef98c30b6cae5ede6a.jpg";
import homeLeagueImg from "../assets/dcb83d31a7726a149bb781e4d6c5db59.jpg";
import homeResultsImg from "../assets/2ab993fda4bcc451e63958ef7236bd86.jpg";

function flattenLeagueFixtures(fixtures) {
  return Object.entries(fixtures || {}).flatMap(([groupKey, groupFixtures]) => {
    if (groupKey === "_knockout" || !Array.isArray(groupFixtures)) return [];
    return groupFixtures;
  });
}

function isPlayedFixture(fixture) {
  return Number.isFinite(Number(fixture?.homeGoals)) && Number.isFinite(Number(fixture?.awayGoals));
}

function getLatestFixtureActivity(result) {
  return flattenLeagueFixtures(result?.fixtures).reduce((latest, fixture) => (
    Math.max(latest, Number(fixture?.scoreUpdatedAt) || 0)
  ), 0);
}

function getOngoingLeagueSummary(result) {
  const fixtures = flattenLeagueFixtures(result?.fixtures);
  const totalFixtures = fixtures.length;
  const playedFixtures = fixtures.filter(isPlayedFixture).length;
  return {
    fixtures,
    totalFixtures,
    playedFixtures,
    isOngoing: totalFixtures > 0 && playedFixtures < totalFixtures,
    latestActivityAt: Math.max(
      getLatestFixtureActivity(result),
      Number(result?.completedAt) || 0,
      Number(result?.createdAt) || 0
    ),
  };
}

export function PlayerDiscovery({ user, wishlists, onNewGame, onJoinByCode, onWishlist, onLogout, onRejoinLast, lastRoomCode, onLoadSession, onRestoreBackup }) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedPos, setSelectedPos] = React.useState("ALL");
  const [selectedClub, setSelectedClub] = React.useState("ALL");
  const [selectedRating, setSelectedRating] = React.useState("ALL");
  const [sortBy, setSortBy] = React.useState("default");
  const [showJoinModal, setShowJoinModal] = React.useState(false);
  const [roomCode, setRoomCode] = React.useState("");
  const [joinError, setJoinError] = React.useState("");
  const [joinLoading, setJoinLoading] = React.useState(false);
  const [allPlayers, setAllPlayers] = React.useState([]);
  const [loadingPlayers, setLoadingPlayers] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("browse");
  const [pastResults, setPastResults] = React.useState([]);
  const [loadingResults, setLoadingResults] = React.useState(false);
  const [expandedResultId, setExpandedResultId] = React.useState("");
  const [selectedPlayer, setSelectedPlayer] = React.useState(null);
  const [sessions, setSessions] = React.useState([]);
  const [pointsModal, setPointsModal] = React.useState(null);
  const [participantPoints, setParticipantPoints] = React.useState({});
  const [savingPoints, setSavingPoints] = React.useState(false);
  const [deletingResultId, setDeletingResultId] = React.useState("");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [restoringBackup, setRestoringBackup] = React.useState(false);
  const backupInputRef = React.useRef(null);

  // Load players from CSV on mount
  React.useEffect(() => {
    (async () => {
      try {
        const players = await loadPlayersFromCsv();
        setAllPlayers(players);
      } catch (err) {
        console.error("Failed to load players from CSV:", err);
        setAllPlayers([]);
      } finally {
        setLoadingPlayers(false);
      }
    })();
  }, []);

  // Load sessions and past results on mount
  React.useEffect(() => {
    (async () => {
      setLoadingResults(true);
      try {
        const [mySessions, results] = await Promise.all([
          apiListSessions(user.username, user?.token),
          apiListResults(user.username, user?.token),
        ]);
        setSessions(mySessions.filter((session) => session.status !== "complete"));
        setPastResults(Array.isArray(results) ? results : []);
      } catch (err) {
        setSessions([]);
        setPastResults([]);
      } finally {
        setLoadingResults(false);
      }
    })();
  }, [user.username, user?.token]);

  const playerWishlist = wishlists[user.username] || [];
  const allClubs = Array.from(new Set(allPlayers.map(p => p.club)));
  const ratingRanges = ["ALL", "89+", "87-88", "84-86", "80-83"];
  const isHomeView = activeTab === "browse";
  const isOngoingView = activeTab === "ongoing" || activeTab === "leaderboard";
  const pagePadding = { maxWidth: 1040, margin: "0 auto", padding: "20px 18px 34px" };
  const ongoingLeagueResults = React.useMemo(() => (
    [...pastResults]
      .map((result) => ({ result, summary: getOngoingLeagueSummary(result) }))
      .filter(({ summary }) => summary.isOngoing)
      .sort((left, right) => right.summary.latestActivityAt - left.summary.latestActivityAt)
  ), [pastResults]);
  const latestOngoingLeague = ongoingLeagueResults[0] || null;
  const homeCards = [
    {
      title: "START\nNEW\nAUCTION",
      image: homeStartImg,
      action: onNewGame,
      width: 248,
      height: 338,
      overlay: "linear-gradient(180deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.42) 100%)",
    },
    {
      title: "ONGOING\nLEAGUE\nSTAT",
      image: homeLeagueImg,
      action: () => setActiveTab("ongoing"),
      width: 248,
      height: 338,
    },
    {
      title: "PAST\nRESULTS",
      image: homeResultsImg,
      action: () => setActiveTab("results"),
      width: 248,
      height: 338,
      overlay: "linear-gradient(180deg, rgba(0,0,0,.1) 0%, rgba(0,0,0,.35) 100%)",
    }
  ];

  const filteredPlayers = allPlayers.filter(p => {
    const matchesSearch = !searchTerm || 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.club.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPos = selectedPos === "ALL" || getPosGroup(p.pos) === selectedPos;
    const matchesClub = selectedClub === "ALL" || p.club === selectedClub;
    const matchesRating = selectedRating === "ALL" ||
      (selectedRating === "89+" ? p.rating >= 89 :
       selectedRating === "87-88" ? p.rating >= 87 && p.rating <= 88 :
       selectedRating === "84-86" ? p.rating >= 84 && p.rating <= 86 :
       p.rating >= 80 && p.rating <= 83);
    return matchesSearch && matchesPos && matchesClub && matchesRating;
  });

  // Apply sorting
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    switch (sortBy) {
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "rating-high":
        return b.rating - a.rating;
      case "rating-low":
        return a.rating - b.rating;
      case "club":
        return a.club.localeCompare(b.club);
      case "pos":
        return a.pos.localeCompare(b.pos);
      default:
        return b.rating - a.rating;
    }
  });

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      setJoinError("Please enter a room code");
      return;
    }
    setJoinLoading(true);
    setJoinError("");
    try {
      await onJoinByCode(roomCode.toUpperCase());
      setShowJoinModal(false);
      setRoomCode("");
    } catch (err) {
      setJoinError(err.message || "Failed to join room. Check the code and try again.");
    } finally {
      setJoinLoading(false);
    }
  };

  const handleRejoinClick = async () => {
    if (!lastRoomCode) return;
    setJoinLoading(true);
    setJoinError("");
    try {
      if (onRejoinLast) {
        await onRejoinLast();
      } else {
        await onJoinByCode(lastRoomCode);
      }
    } catch (err) {
      setJoinError(err?.message || "Failed to rejoin last room. Try Join by Code.");
    } finally {
      setJoinLoading(false);
    }
  };

  const openBackupPicker = () => {
    if (restoringBackup) return;
    backupInputRef.current?.click();
  };

  const handleBackupSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onRestoreBackup) return;

    setRestoringBackup(true);
    try {
      const raw = await file.text();
      const backup = JSON.parse(raw);
      await onRestoreBackup(backup);
      setMenuOpen(false);
    } catch (err) {
      window.alert(`Failed to restore backup: ${err.message}`);
    } finally {
      setRestoringBackup(false);
    }
  };

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
      const updated = await apiListResults(user.username, user?.token);
      setPastResults(updated);
    } catch (err) {
      alert("Failed to save points: " + err.message);
    } finally {
      setSavingPoints(false);
    }
  };

  const handleDeleteResult = async (result) => {
    const resultId = String(result?.sessionId || result?.id || "");
    if (!resultId || deletingResultId) return;
    if (!window.confirm(`Delete "${result?.name || "this past game"}"? This cannot be undone.`)) return;

    setDeletingResultId(resultId);
    try {
      await apiDeleteResult(resultId, user?.token);
      const [updatedSessions, updatedResults] = await Promise.all([
        apiListSessions(user.username, user?.token),
        apiListResults(user.username, user?.token),
      ]);
      setSessions(updatedSessions.filter((session) => session.status !== "complete"));
      setPastResults(Array.isArray(updatedResults) ? updatedResults : []);
      if (expandedResultId === resultId) setExpandedResultId("");
    } catch (err) {
      alert("Failed to delete game: " + err.message);
    } finally {
      setDeletingResultId("");
    }
  };

  const openJoinModal = () => {
    setMenuOpen(false);
    setShowJoinModal(true);
  };

  const sectionBackButton = !isHomeView && React.createElement("button", {
    type: "button",
    onClick: () => { setActiveTab("browse"); setMenuOpen(false); },
    style: { ...BTN.ghost, padding: "9px 16px", fontSize: 13 }
  }, "← HOME");

  if (selectedPlayer) {
    return React.createElement(PlayerDetailScreen, {
      player: selectedPlayer,
      onClose: () => setSelectedPlayer(null),
      isWishlisted: playerWishlist.includes(selectedPlayer.id),
      onToggleWishlist: () => handleWishlist(selectedPlayer.id)
    });
  }

  if (isOngoingView) {
    return React.createElement("div", { style:{ minHeight:"100vh", background:"transparent", color:"#fff" } },
      React.createElement("div", { style: pagePadding },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, gap:16, flexWrap:"wrap" } },
          React.createElement("div", { style:{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" } },
            sectionBackButton,
            React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#8ea0ba" } }, `@${user.username}`)
          ),
          React.createElement("button", { onClick:onLogout, style:BTN.ghost }, "SIGN OUT")
        ),
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24, gap:16, flexWrap:"wrap" } },
          React.createElement("div", null,
            React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:42, letterSpacing:3 } }, "ONGOING LEAGUE"),
            React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#8ea0ba" } }, "The latest league table where fixture scores are still incomplete")
          ),
          React.createElement("button", { onClick:onNewGame, style:BTN.gold }, "+ NEW AUCTION")
        ),
        loadingResults
          ? React.createElement("div", { style:{ display:"flex", justifyContent:"center", padding:60 } }, React.createElement(Spinner, null))
          : React.createElement(React.Fragment, null,
              latestOngoingLeague
                ? React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:10, marginBottom:28 } },
                    React.createElement("div", { style:{
                      ...createSurfaceStyle({ padding: 16, radius: 18, elevated: true }),
                      background:"rgba(8,18,13,.86)",
                      padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center",
                      gap:16, flexWrap:"wrap"
                    }},
                      React.createElement("div", null,
                        React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:10 } },
                          React.createElement(TeamBadge, { name: latestOngoingLeague.result.host || latestOngoingLeague.result.name || "League", color: getParticipantAccent(0), size: 24, subtle: true }),
                          React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:22, color:"#fff", letterSpacing:2 } }, latestOngoingLeague.result.name || "League Table")
                        ),
                        React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#8ea0ba", marginTop:4, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" } },
                          `${latestOngoingLeague.summary.playedFixtures}/${latestOngoingLeague.summary.totalFixtures} matches scored · ${latestOngoingLeague.result.participants?.length || 0} teams`,
                          React.createElement(StatusPill, { tone: "gold" }, "ONGOING")
                        )
                      ),
                      React.createElement("button", { onClick: () => onLoadSession(latestOngoingLeague.result), style:BTN.gold },
                        "VIEW TABLE →"
                      )
                    )
                  )
                : React.createElement("div", { style:{ textAlign:"center", padding:"40px 0 20px", color:"#8ea0ba",
                    fontFamily:"'Rajdhani'", fontSize:16 } }, "No ongoing league table yet — once fixture scoring starts and remains incomplete, it will appear here.")
            )
      )
    );
  }

  const renderHomeCard = (card, idx) => {
    const cardStyle = {
      width: card.width,
      height: card.height,
      position: "relative",
      overflow: "hidden",
      borderRadius: 2,
      boxShadow: "0 30px 70px rgba(0,0,0,.35)",
      cursor: "pointer",
      background: "#0a0f18",
      transition: "transform .2s ease, box-shadow .2s ease",
      animation: `scaleIn .35s ease ${idx * .08}s both`,
    };

    return React.createElement("div", {
      key: card.title,
      role: "button",
      tabIndex: 0,
      onClick: card.action,
      onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && card.action?.(),
      style: cardStyle,
      onMouseEnter: (e) => {
        e.currentTarget.style.transform = "translateY(-6px) scale(1.01)";
        e.currentTarget.style.boxShadow = "0 40px 90px rgba(0,0,0,.45)";
      },
      onMouseLeave: (e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = cardStyle.boxShadow;
      }
    },
      React.createElement(React.Fragment, null,
        React.createElement("div", {
          style: {
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${card.image})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "saturate(1.05) contrast(1.05)"
          }
        }),
        React.createElement("div", {
          style: {
            position: "absolute",
            inset: 0,
            background: card.overlay || "linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.5))"
          }
        }),
        React.createElement("div", {
          style: {
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "#fff",
            fontFamily: "'Bebas Neue'",
            fontSize: 36,
            lineHeight: 0.9,
            letterSpacing: 1,
            textShadow: "0 4px 14px rgba(0,0,0,.9)",
            whiteSpace: "pre-line",
            padding: 18,
          }
        }, card.title)
      )
    );
  };

  return React.createElement("div", {
    style:{ minHeight:"100vh", background:"transparent", color:"#fff" }
  },
    React.createElement("input", {
      ref: backupInputRef,
      type: "file",
      accept: "application/json,.json",
      onChange: handleBackupSelected,
      style: { display: "none" },
    }),
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
            React.createElement(TeamBadge, { name: participant.name, color: getParticipantAccent((pointsModal.participants || []).findIndex((p) => p.name === participant.name)), size: 26, subtle: true }),
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

    React.createElement("div", { style:{ padding:"16px 18px 0",
    display:"flex", justifyContent:"space-between", alignItems:"center", background:"transparent", position:"relative", zIndex:5, gap:12 } },
    sectionBackButton || React.createElement("div", { style:{ width:1, height:1 } }),
      React.createElement("div", { style:{ display:"flex", gap:10, alignItems:"center" } },
        React.createElement("button", {
          type:"button",
          onClick: () => setMenuOpen((prev) => !prev),
          style:{ ...BTN.ghost, padding:"8px 14px", fontSize:16, lineHeight:1, minWidth:48 }
        }, "☰")
      ),
      menuOpen && React.createElement("div", {
        style:{
          position:"absolute",
          top:"calc(100% + 10px)",
          right:18,
          width:260,
          zIndex:20,
          ...createSurfaceStyle({ padding: 10, radius: 18, elevated: true }),
          background:"rgba(8,18,13,.96)"
        }
      },
        React.createElement("div", {
          style:{ padding:"6px 10px 12px", borderBottom:"1px solid rgba(255,255,255,.08)", marginBottom:8 }
        },
          React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:20, color:"#e8f7ef", letterSpacing:2 } }, "THE AUCTION ROOM"),
          React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12, color:"#8ea0ba", marginTop:4 } }, `@${user.username}`)
        ),
        [
          { label: "+ CREATE GAME", action: () => { setMenuOpen(false); onNewGame(); }, tone: "primary" },
          { label: "JOIN BY CODE", action: openJoinModal },
          lastRoomCode ? { label: joinLoading ? "REJOINING…" : `REJOIN ${lastRoomCode}`, action: handleRejoinClick, disabled: joinLoading } : null,
          onRestoreBackup ? { label: restoringBackup ? "RESTORING BACKUP…" : "RESTORE BACKUP", action: openBackupPicker, disabled: restoringBackup } : null,
          { label: "ONGOING AUCTIONS", action: () => { setMenuOpen(false); setActiveTab("ongoing"); } },
          { label: "MY WISHLIST", action: () => { setMenuOpen(false); setActiveTab("wishlist"); } },
          { label: "PLAYERS", action: () => { setMenuOpen(false); setActiveTab("players"); } },
          { label: "PAST RESULTS", action: () => { setMenuOpen(false); setActiveTab("results"); } },
          { label: "SIGN OUT", action: () => { setMenuOpen(false); onLogout(); }, tone: "danger" },
        ].filter(Boolean).map((item) => React.createElement("button", {
              key: item.label,
              type:"button",
              onClick: item.action,
              disabled: item.disabled,
              style:{
                width:"100%",
                textAlign:"left",
                marginBottom:6,
                background: item.tone === "primary" ? "linear-gradient(135deg,#4FC3F7,#8fe7c0)" : item.tone === "danger" ? "#FF3D7118" : "rgba(255,255,255,.03)",
                color: item.tone === "primary" ? "#051018" : item.tone === "danger" ? "#ff8aa9" : "#e8f7ef",
                border:`1px solid ${item.tone === "primary" ? "rgba(79,195,247,.35)" : item.tone === "danger" ? "#FF3D7144" : "rgba(255,255,255,.08)"}`,
                borderRadius:12,
                padding:"10px 12px",
                cursor: item.disabled ? "default" : "pointer",
                opacity: item.disabled ? 0.6 : 1,
                fontFamily:"'Bebas Neue'",
                fontSize:14,
                letterSpacing:1,
              }
            }, item.label)
        )
      )
    ),

    showJoinModal && React.createElement("div", {
      style:{ position:"fixed", inset:0, background:"#00000066", display:"flex", alignItems:"center", justifyContent:"center", zIndex:500 }
    },
      React.createElement("div", {
        style:{ background:"#0a0c12", border:"1px solid #1e2230", borderRadius:12, padding:32, maxWidth:400 }
      },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:18, marginBottom:16, letterSpacing:2 } }, "JOIN AUCTION BY CODE"),
        React.createElement("input", {
          value:roomCode,
          onChange: e => setRoomCode(e.target.value.toUpperCase()),
          placeholder:"Enter 6-letter code…",
          maxLength:6,
          style:{ background:"#060810", border:"1px solid #1e2028", borderRadius:7,
            padding:"10px 12px", color:"#fff", fontSize:14, fontFamily:"'Rajdhani'",
            outline:"none", width:"100%", marginBottom:8, letterSpacing:2, textAlign:"center" }
        }),
        joinError && React.createElement("div", { style:{ color:"#FF3D71", fontFamily:"'Rajdhani'", fontSize:12, marginBottom:12 } }, joinError),
        React.createElement("div", { style:{ display:"flex", gap:10 } },
          React.createElement("button", {
            onClick: () => { setShowJoinModal(false); setRoomCode(""); setJoinError(""); },
            style:BTN.ghost
          }, "CANCEL"),
          React.createElement("button", {
            onClick:handleJoinRoom,
            disabled:joinLoading,
            style:{ ...BTN.gold, opacity: joinLoading ? .6 : 1 }
          }, joinLoading ? "JOINING…" : "JOIN")
        )
      )
    ),

    activeTab === "browse" && React.createElement("div", { style:{ maxWidth:1050, margin:"0 auto", padding:"28px 18px 24px" } },
      React.createElement("div", {
        style:{
          display:"flex",
          justifyContent:"center",
          gap:42,
          alignItems:"flex-start",
          flexWrap:"wrap",
          paddingTop: 12
        }
      }, homeCards.map(renderHomeCard)),
      null
    ),

    activeTab === "players" && React.createElement("div", { style:{ maxWidth:1200, margin:"0 auto", padding:"18px" } },
      React.createElement("div", { style:{ marginBottom:24 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:32, letterSpacing:3, marginBottom:4 } }, "MY WISHLIST"),
        React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } },
          playerWishlist.length > 0
            ? `${playerWishlist.length} player${playerWishlist.length!==1?"s":""} wishlisted`
            : "Browse players and click ❤️ to wishlist them"
        )
      ),

      React.createElement("div", { style:{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" } },
        React.createElement("input", {
          value:searchTerm,
          onChange: e => setSearchTerm(e.target.value),
          placeholder:"Search player or club…",
          style:{ background:"#0a0c12", border:"1px solid #1e2028", borderRadius:7,
            padding:"8px 12px", color:"#fff", fontSize:12, fontFamily:"'Rajdhani'",
            outline:"none", minWidth:200 }
        }),
        React.createElement("select", {
          value:selectedPos,
          onChange: e => setSelectedPos(e.target.value),
          style:{ background:"#0a0c12", border:"1px solid #1e2028", borderRadius:7,
            padding:"8px 12px", color:"#fff", fontSize:12, fontFamily:"'Rajdhani'", outline:"none" }
        },
          React.createElement("option", { value:"ALL" }, "All Positions"),
          Object.keys(POS_GROUPS).map(pos =>
            React.createElement("option", { key:pos, value:pos }, pos)
          )
        ),
        React.createElement("select", {
          value:selectedClub,
          onChange: e => setSelectedClub(e.target.value),
          style:{ background:"#0a0c12", border:"1px solid #1e2028", borderRadius:7,
            padding:"8px 12px", color:"#fff", fontSize:12, fontFamily:"'Rajdhani'", outline:"none" }
        },
          React.createElement("option", { value:"ALL" }, "All Clubs"),
          allClubs.map(club =>
            React.createElement("option", { key:club, value:club }, club)
          )
        ),
        React.createElement("select", {
          value:selectedRating,
          onChange: e => setSelectedRating(e.target.value),
          style:{ background:"#0a0c12", border:"1px solid #1e2028", borderRadius:7,
            padding:"8px 12px", color:"#fff", fontSize:12, fontFamily:"'Rajdhani'", outline:"none" }
        },
          ratingRanges.map(range =>
            React.createElement("option", { key:range, value:range }, 
              range === "ALL" ? "All Ratings" :
              range === "89+" ? "S+ (89+)" :
              range === "87-88" ? "S (87-88)" :
              range === "84-86" ? "A+ (84-86)" :
              range === "80-83" ? "A (80-83)" :
              `${range}`
            )
          )
        ),
        React.createElement("select", {
          value:sortBy,
          onChange: e => setSortBy(e.target.value),
          style:{ background:"#0a0c12", border:"1px solid #1e2028", borderRadius:7,
            padding:"8px 12px", color:"#fff", fontSize:12, fontFamily:"'Rajdhani'", outline:"none", marginLeft:"auto" }
        },
          React.createElement("option", { value:"default" }, "Sort by…"),
          React.createElement("option", { value:"name-asc" }, "Name (A-Z)"),
          React.createElement("option", { value:"name-desc" }, "Name (Z-A)"),
          React.createElement("option", { value:"rating-high" }, "Rating (High-Low)"),
          React.createElement("option", { value:"rating-low" }, "Rating (Low-High)"),
          React.createElement("option", { value:"club" }, "Club (A-Z)"),
          React.createElement("option", { value:"pos" }, "Position (A-Z)")
        )
      ),

      React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:16 } },
        loadingPlayers ? React.createElement("div", {
          style:{ gridColumn:"1/-1", textAlign:"center", padding:"60px 20px", color:"#666",
            fontFamily:"'Rajdhani'", fontSize:14 }
        }, "Loading players from dataset…") :
        sortedPlayers.length === 0 ? React.createElement("div", {
          style:{ gridColumn:"1/-1", textAlign:"center", padding:"60px 20px", color:"#333",
            fontFamily:"'Rajdhani'", fontSize:14 }
        }, "No players match your filters") :
        sortedPlayers.map((player, idx) => {
          const tierData = getTierData(player.rating, TIERS);
          const isWishlisted = playerWishlist.includes(player.id);
          const tierKey = getTierKey(player.rating, TIERS);
          
          return React.createElement("div", { 
            key: player.id,
            onClick: () => setSelectedPlayer(player),
            style: {
              cursor: "pointer",
              animation: `rowIn .25s ease ${(idx%8)*.05}s both`,
              transition: "transform .2s, box-shadow .2s",
            },
            onMouseOver: (e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = `0 8px 24px ${tierData.color}33`;
            },
            onMouseOut: (e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }
          },
            React.createElement(FifaPlayerCard, {
              player,
              tierData,
              tierKey,
              isWishlisted,
              onToggleWishlist: () => handleWishlist(player.id)
            })
          );
        })
      )
    ),

    activeTab === "wishlist" && React.createElement("div", { style:{ maxWidth:1200, margin:"0 auto", padding:"18px" } },
      React.createElement("div", { style:{ marginBottom:24 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:32, letterSpacing:3, marginBottom:4 } }, "MY WISHLIST"),
        React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } },
          playerWishlist.length > 0
            ? `${playerWishlist.length} player${playerWishlist.length!==1?"s":""} wishlisted`
            : "Browse players and click ❤️ to wishlist them"
        )
      ),
      (() => {
        const wlPlayers = allPlayers.filter(p => playerWishlist.includes(p.id));

        if (wlPlayers.length === 0) {
          return React.createElement("div", { style:{ textAlign:"center", padding:"60px 20px", color:"#444",
            fontFamily:"'Rajdhani'", fontSize:16 } },
            "No players wishlisted yet. Browse players and click 🤍 to add them."
          );
        }
        return React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:16 } },
          wlPlayers.map((player, idx) => {
            const tierData = getTierData(player.rating, TIERS);
            const tierKey = getTierKey(player.rating, TIERS);
            const isWishlisted = playerWishlist.includes(player.id);
            
            return React.createElement("div", { 
              key: player.id,
              onClick: () => setSelectedPlayer(player),
              style: {
                cursor: "pointer",
                animation: `rowIn .25s ease ${(idx%8)*.05}s both`,
                transition: "transform .2s, box-shadow .2s",
              },
              onMouseOver: (e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = `0 8px 24px ${tierData.color}33`;
              },
              onMouseOut: (e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }
            },
              React.createElement(FifaPlayerCard, {
                player,
                tierData,
                tierKey,
                isWishlisted,
                onToggleWishlist: () => handleWishlist(player.id)
              })
            );
          })
        );
      })()
    ),

    activeTab === "results" && React.createElement("div", { style:{ maxWidth:860, margin:"0 auto", padding:"18px 18px 34px" } },
      React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 } },
        React.createElement("div", null,
          React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:42, letterSpacing:3 } }, "PAST RESULTS"),
          React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#8ea0ba" } }, "Open completed auctions, award points, or delete old seasons")
        ),
        React.createElement("button", { onClick:onNewGame, style:BTN.gold }, "+ NEW AUCTION")
      ),
      loadingResults
        ? React.createElement("div", { style:{ display:"flex", justifyContent:"center", padding:60 } }, React.createElement(Spinner, null))
        : React.createElement(React.Fragment, null,
            sessions.length === 0
              ? React.createElement("div", { style:{ textAlign:"center", padding:"40px 0 20px", color:"#333",
                  fontFamily:"'Rajdhani'", fontSize:16 } }, "No active auctions — create one above")
              : React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:10, marginBottom:28 } },
                  sessions.map((s, i) =>
                React.createElement("div", { key:s.id || s.roomCode || i, style:{
                  background:"#0a0c12", border:"1px solid #1e2230", borderRadius:12,
                  padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center",
                  animation:`rowIn .25s ease ${i*.05}s both`
                }},
                  React.createElement("div", null,
                    React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:18, color:"#fff", letterSpacing:2 } }, s.name || `Auction #${i+1}`),
                    React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12, color:"#555", marginTop:2 } },
                      `${s.participants?.length || 0} players · Lot ${(s.lotIdx||0)+1}/${s.lotOrder?.length || LOTS} · `,
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
            pastResults.length > 0 && React.createElement("div", { style:{ marginTop: sessions.length > 0 ? 20 : 0 } },
              React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, gap:10, flexWrap:"wrap" } },
                React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:20, letterSpacing:2 } }, "PAST RESULTS")
              ),
              React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:10 } },
                pastResults.map((result, i) =>
                  React.createElement("div", { key:`result-${String(result.sessionId || result.id || i)}`, style:{
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
                        React.createElement("div", { style:{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" } },
                          result.host === user.username && React.createElement("button", {
                            onClick: () => handleDeleteResult(result),
                            disabled: deletingResultId === String(result.sessionId || result.id || ""),
                            style: { ...BTN.ghost, borderColor: "#FF6B3544", color: "#FF6B35", opacity: deletingResultId === String(result.sessionId || result.id || "") ? 0.6 : 1 }
                          }, deletingResultId === String(result.sessionId || result.id || "") ? "DELETING…" : "🗑 DELETE"),
                          React.createElement("button", {
                            onClick: () => handlePointsModalOpen(String(result.sessionId || result.id || ""), result.participants || []),
                            style: { ...BTN.ghost, borderColor: "#FFD70044", color: "#FFD700" }
                          }, "📊 POINTS"),
                          React.createElement("button", {
                            onClick: () => setExpandedResultId(expandedResultId === String(result.sessionId || result.id || "") ? "" : String(result.sessionId || result.id || "")),
                            style: BTN.ghost
                          }, expandedResultId === String(result.sessionId || result.id || "") ? "HIDE SQUADS" : "VIEW SQUADS"),
                          React.createElement("button", { onClick: () => onLoadSession(result), style:BTN.gold }, "VIEW RESULTS")
                        )
                      ),
                      expandedResultId === String(result.sessionId || result.id || "") && React.createElement("div", {
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
                    )
                  )
                )
              )
            )
          )
    ),

  );

  function handleWishlist(playerId) {
    onWishlist?.(playerId);
  }
}
