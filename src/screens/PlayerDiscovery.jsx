import React from "react";
import { BTN } from "../utils/styles.js";
import { loadPlayersFromCsv } from "../data/players.js";
import { PCOLORS, POS_GROUPS, getTierKey, getTierData, TIERS, getPosGroup } from "../game/constants.js";

export function PlayerDiscovery({ user, wishlists, onNewGame, onJoinByCode, onWishlist }) {
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

  const playerWishlist = wishlists[user.username] || [];
  const allClubs = Array.from(new Set(allPlayers.map(p => p.club)));
  const ratingRanges = ["ALL", "90+", "85-89", "82-84", "80-81", "75-79", "70-74", "<70"];

  const filteredPlayers = allPlayers.filter(p => {
    const matchesSearch = !searchTerm || 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.club.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPos = selectedPos === "ALL" || getPosGroup(p.pos) === selectedPos;
    const matchesClub = selectedClub === "ALL" || p.club === selectedClub;
    const matchesRating = selectedRating === "ALL" || 
      (selectedRating === "90+" ? p.rating >= 90 :
       selectedRating === "85-89" ? p.rating >= 85 && p.rating < 90 :
       selectedRating === "82-84" ? p.rating >= 82 && p.rating < 85 :
       selectedRating === "80-81" ? p.rating >= 80 && p.rating < 82 :
       selectedRating === "75-79" ? p.rating >= 75 && p.rating < 80 :
       selectedRating === "70-74" ? p.rating >= 70 && p.rating < 75 :
       p.rating < 70);
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

  return React.createElement("div", {
    style:{ minHeight:"100vh", background:"#04060a", color:"#fff" }
  },
    React.createElement("div", { style:{ padding:"14px 24px", borderBottom:"1px solid #0f1218",
      display:"flex", justifyContent:"space-between", alignItems:"center", background:"#060810" } },
      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:22, color:"#FFD700", letterSpacing:2 } }, "THE AUCTION ROOM"),
      React.createElement("div", { style:{ display:"flex", gap:10, alignItems:"center" } },
        React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, `@${user.username}`),
        React.createElement("button", { onClick:onNewGame, style:BTN.gold }, "+ CREATE GAME"),
        React.createElement("button", {
          onClick: () => setShowJoinModal(true),
          style:{ ...BTN.ghost, marginLeft:8 }
        }, "JOIN BY CODE")
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

    React.createElement("div", { style:{ maxWidth:1200, margin:"0 auto", padding:"24px" } },
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
              range === "90+" ? "Elite (90+)" :
              range === "85-89" ? "S Tier (85-89)" :
              range === "82-84" ? "A+ (82-84)" :
              range === "80-81" ? "A (80-81)" :
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

      React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:12 } },
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
          
          return React.createElement("div", { key:player.id, style:{
            background:"#0a0c12", border:"1px solid #1e2028", borderRadius:10,
            padding:14, display:"flex", flexDirection:"column", gap:10,
            animation:`rowIn .25s ease ${(idx%8)*.05}s both`,
            transition:"all .2s"
          }},
            React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"start" } },
              React.createElement("div", null,
                React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:16, letterSpacing:1, marginBottom:4 } }, player.name),
                React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#555" } }, `${player.pos} · ${player.club}`)
              ),
              React.createElement("button", {
                onClick: () => handleWishlist(player.id),
                style:{ background:"transparent", border:"none", fontSize:20, cursor:"pointer",
                  opacity: isWishlisted ? 1 : .5, transition:"opacity .2s" }
              }, isWishlisted ? "❤️" : "🤍")
            ),
            React.createElement("div", { style:{ display:"flex", gap:8, alignItems:"center" } },
              React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:6, flex:1 } },
                React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:18, color:tierData.color } }, player.rating),
                React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:10, color:tierData.color,
                  background:tierData.bg, border:`1px solid ${tierData.border}`,
                  borderRadius:3, padding:"2px 6px" } }, tierKey)
              ),
              React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#555" } }, `${player.nation}`)
            )
          );
        })
      )
    )
  );

  function handleWishlist(playerId) {
    onWishlist?.(playerId);
  }
}
