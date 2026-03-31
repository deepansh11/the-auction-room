import React from "react";
import { BTN } from "../utils/styles.js";
import { loadPlayersFromCsv } from "../data/players.js";
import { PCOLORS, POS_GROUPS, getTierKey, getTierData, TIERS, getPosGroup } from "../game/constants.js";
import { apiListResults } from "../lib/api.js";
import { Spinner } from "../components/Spinner.jsx";
import { FifaPlayerCard } from "../components/FifaPlayerCard.jsx";
import { PlayerDetailScreen } from "./PlayerDetailScreen.jsx";

export function PlayerDiscovery({ user, wishlists, onNewGame, onJoinByCode, onWishlist, onLogout, onRejoinLast, lastRoomCode, onLoadSession }) {
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

  // Load past results when results tab is active
  React.useEffect(() => {
    if (activeTab !== "results") return;
    setLoadingResults(true);
    apiListResults(user.username, user?.token)
      .then(r => setPastResults(Array.isArray(r) ? r : []))
      .catch(() => setPastResults([]))
      .finally(() => setLoadingResults(false));
  }, [activeTab, user.username, user?.token]);

  const playerWishlist = wishlists[user.username] || [];
  const allClubs = Array.from(new Set(allPlayers.map(p => p.club)));
  const ratingRanges = ["ALL", "89+", "87-88", "84-86", "80-83", "79", "75-78", "<75"];

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
       selectedRating === "80-83" ? p.rating >= 80 && p.rating <= 83 :
       selectedRating === "79" ? p.rating === 79 :
       selectedRating === "75-78" ? p.rating >= 75 && p.rating <= 78 :
       p.rating < 75);
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
        return b.rating - a.rating; // Default: sort by rating high to low
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

  if (selectedPlayer) {
    return React.createElement(PlayerDetailScreen, {
      player: selectedPlayer,
      onClose: () => setSelectedPlayer(null),
      isWishlisted: playerWishlist.includes(selectedPlayer.id),
      onToggleWishlist: () => {
        handleWishlist(selectedPlayer.id);
      }
    });
  }

  return React.createElement("div", {
    style:{ minHeight:"100vh", background:"#04060a", color:"#fff" }
  },
    React.createElement("div", { style:{ padding:"14px 24px", borderBottom:"1px solid #0f1218",
      display:"flex", justifyContent:"space-between", alignItems:"center", background:"#060810" } },
      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:22, color:"#FFD700", letterSpacing:2 } }, "THE AUCTION ROOM"),
      React.createElement("div", { style:{ display:"flex", gap:10, alignItems:"center" } },
        React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, `@${user.username}`),
        React.createElement("button", { onClick:onLogout, style:BTN.ghost }, "SIGN OUT"),
        React.createElement("button", { onClick:onNewGame, style:BTN.gold }, "+ CREATE GAME"),
        lastRoomCode && React.createElement("button", {
          onClick: handleRejoinClick,
          disabled: joinLoading,
          style:{ ...BTN.ghost, borderColor:"#00FF8844", color:"#00FF88", opacity: joinLoading ? .6 : 1 }
        }, joinLoading ? "REJOINING…" : `REJOIN ${lastRoomCode}`),
        React.createElement("button", {
          onClick: () => setShowJoinModal(true),
          style:{ ...BTN.ghost, marginLeft:8 }
        }, "JOIN BY CODE")
      )
    ),

    joinError && !showJoinModal && React.createElement("div", {
      style:{
        maxWidth:1200,
        margin:"10px auto 0",
        padding:"8px 24px",
        fontFamily:"'Rajdhani'",
        fontSize:12,
        color:"#FF6B35"
      }
    }, joinError),

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

    React.createElement("div", { style:{ borderBottom:"1px solid #0f1218", background:"#060810", display:"flex", padding:"0 24px" } },
      ["browse","wishlist","results"].map(tab =>
        React.createElement("button", { key:tab, onClick:() => setActiveTab(tab), style:{
          background:"transparent", border:"none",
          borderBottom: activeTab===tab ? "2px solid #FFD700" : "2px solid transparent",
          color: activeTab===tab ? "#FFD700" : "#555",
          padding:"10px 20px", cursor:"pointer",
          fontFamily:"'Bebas Neue'", fontSize:13, letterSpacing:2,
          marginBottom:-1, transition:"all .2s"
        }}, tab==="browse" ? "BROWSE PLAYERS" : tab==="wishlist" ? "❤️ MY WISHLIST" : "🏆 PAST RESULTS")
      )
    ),

    activeTab === "browse" && React.createElement("div", { style:{ maxWidth:1200, margin:"0 auto", padding:"24px" } },
      React.createElement("div", { style:{ marginBottom:24 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:32, letterSpacing:3, marginBottom:4 } }, "BROWSE PLAYERS"),
        React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, `Wishlist and discover players for your next auction`)
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

    activeTab === "wishlist" && React.createElement("div", { style:{ maxWidth:1200, margin:"0 auto", padding:"24px" } },
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

    activeTab === "results" && React.createElement("div", { style:{ maxWidth:1200, margin:"0 auto", padding:"24px" } },
      React.createElement("div", { style:{ marginBottom:24 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:32, letterSpacing:3, marginBottom:4 } }, "PAST RESULTS"),
        React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, "Your completed auction history")
      ),
      loadingResults
        ? React.createElement("div", { style:{ display:"flex", justifyContent:"center", padding:60 } }, React.createElement(Spinner, null))
        : pastResults.length === 0
          ? React.createElement("div", { style:{ textAlign:"center", padding:"60px 20px", color:"#444",
              fontFamily:"'Rajdhani'", fontSize:16 } }, "No completed auctions yet")
          : React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:10 } },
              pastResults.map((result, i) =>
                React.createElement("div", { key:i, style:{
                  background:"#0a0c12", border:"1px solid #1e2230", borderRadius:12,
                  padding:"16px 20px", animation:`rowIn .25s ease ${i*.05}s both`
                } },
                  React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center" } },
                    React.createElement("div", null,
                      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:18, color:"#fff", letterSpacing:2 } }, result.name || `Auction #${i+1}`),
                      React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12, color:"#555", marginTop:2 } },
                        `${result.participants?.length || 0} players · ${result.roomCode || ""} · `,
                        React.createElement("span", { style:{ color:"#00FF88" } }, "✓ Complete")
                      )
                    ),
                    React.createElement("div", { style:{ display:"flex", gap:8 } },
                      onLoadSession && React.createElement("button", {
                        onClick: () => onLoadSession(result),
                        style: BTN.gold
                      }, "VIEW RESULTS →")
                    )
                  ),
                  expandedResultId === result.sessionId && React.createElement("div", {
                    style:{ marginTop:12, borderTop:"1px solid #1e2230", paddingTop:10, display:"flex", flexDirection:"column", gap:8 }
                  },
                    (result.participants || []).length === 0
                      ? React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12, color:"#666" } }, "No squad data saved")
                      : (result.participants || []).map((entry, idx) =>
                          React.createElement("div", { key:`sq-${idx}`, style:{
                            background:"#0d0f16", border:"1px solid #1e2230", borderRadius:8,
                            padding:"8px 10px", display:"flex", justifyContent:"space-between", alignItems:"center"
                          } },
                            React.createElement("div", null,
                              React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:14, color:"#fff", letterSpacing:1 } }, entry.name),
                              React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#666" } },
                                `${entry?.squad?.length || 0} players · ${entry?.budget || 0}M left`)
                            )
                          )
                        )
                  )
                )
              )
            )
    )
  );

  function handleWishlist(playerId) {
    onWishlist?.(playerId);
  }
}
