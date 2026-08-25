import React from "react";
import { BTN } from "../utils/styles.js";
import { sfx } from "../utils/sfx.js";
import { assignPlayersToLots, loadPlayersFromCsv } from "../data/csvPlayerLoader.js";
import { BUDGET, MYSTERY_CARD_PRICE, PCOLORS, TIERS, getTierKey } from "../game/constants.js";
import { cloneTierConfig, normalizeTiers } from "../game/tierUtils.js";
import { generateRoomCode } from "../utils/roomUtils.js";
import { ShareScreen } from "./ShareScreen.jsx";

export function SetupScreen({ user, onStart }) {
  const [sessionName, setSessionName] = React.useState(`${user.username}'s Auction`);
  const [count, setCount] = React.useState(5);
  const [names, setNames] = React.useState(Array.from({length:5}, (_,i) => i===0 ? user.username : `Player ${i+1}`));
  const [roomCode, setRoomCode] = React.useState(generateRoomCode);
  const [basePlayers, setBasePlayers] = React.useState([]);
  const [loadingPool, setLoadingPool] = React.useState(true);
  const [poolError, setPoolError] = React.useState("");
  const [excludedIds, setExcludedIds] = React.useState(new Set());
  const [search, setSearch] = React.useState("");
  const [tierConfig, setTierConfig] = React.useState(cloneTierConfig(TIERS));
  const [budget, setBudget] = React.useState(BUDGET);
  const [mysteryEnabled, setMysteryEnabled] = React.useState(true);
  const [groupsEnabled, setGroupsEnabled] = React.useState(true);
  const [groupCount, setGroupCount] = React.useState(2);
  const [fixtureLeg, setFixtureLeg] = React.useState("double");
  const [showShare, setShowShare] = React.useState(false);
  const [sessionData, setSessionData] = React.useState(null);
  const [copyStatus, setCopyStatus] = React.useState("");
  const [creatingRoom, setCreatingRoom] = React.useState(false);
  const PLAYERS_PER_PERSON = 26;
  const shareLink = `${window.location.origin}?join=${roomCode}`;

  const copyValue = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied`);
      setTimeout(() => setCopyStatus(""), 1800);
    } catch (_err) {
      setCopyStatus("Copy failed");
      setTimeout(() => setCopyStatus(""), 1800);
    }
  };

  // Auto-select top 26*count players on initial load
  React.useEffect(() => {
    if (basePlayers.length > 0 && excludedIds.size === 0) {
      const requiredPlayers = count * PLAYERS_PER_PERSON;
      const allBasePlayers = basePlayers.filter(p => p.rating >= 80);
      const sortedByRating = [...allBasePlayers].sort((a, b) => b.rating - a.rating);
      const topPlayerIds = new Set(sortedByRating.slice(0, requiredPlayers).map(p => p.id));
      const newExcluded = new Set(allBasePlayers.filter(p => !topPlayerIds.has(p.id)).map(p => p.id));
      setExcludedIds(newExcluded);
    }
  }, [basePlayers]);

  React.useEffect(() => {
    (async () => {
      try {
        const players = await loadPlayersFromCsv();
        setBasePlayers(players);
      } catch (err) {
        setPoolError("Failed to load FC26 CSV player dataset");
        setBasePlayers([]);
      } finally {
        setLoadingPool(false);
      }
    })();
  }, []);

  const updateCount = n => {
    setCount(n);
    setNames(prev => {
      const a = [...prev];
      while (a.length < n) a.push(`Player ${a.length+1}`);
      return a.slice(0, n);
    });
    
    // Auto-select top 26*n players by rating
    const requiredPlayers = n * PLAYERS_PER_PERSON;
    const allBasePlayers = basePlayers.filter(p => p.rating >= 80);
    const sortedByRating = [...allBasePlayers].sort((a, b) => b.rating - a.rating);
    const topPlayerIds = new Set(sortedByRating.slice(0, requiredPlayers).map(p => p.id));
    const newExcluded = new Set(allBasePlayers.filter(p => !topPlayerIds.has(p.id)).map(p => p.id));
    setExcludedIds(newExcluded);
  };

  const toggleExcluded = (id) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };



  const updateTier = (key, field, rawValue) => {
    setTierConfig(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: field === "color" ? rawValue : Number(rawValue),
      },
    }));
  };

  const selectedBasePlayers = basePlayers.filter((p) => !excludedIds.has(p.id));
  const selectedPlayers = selectedBasePlayers.filter((p) => p.rating >= 80);
  const normalizedTiers = normalizeTiers(tierConfig);

  // A group needs at least 2 teams to have any fixtures; cap the picker at 5 groups for sanity.
  const maxGroupOptions = React.useMemo(() => {
    const maxGroups = Math.max(1, Math.min(5, Math.floor(count / 2)));
    return Array.from({ length: maxGroups }, (_, i) => i + 1);
  }, [count]);

  React.useEffect(() => {
    const maxAllowed = maxGroupOptions[maxGroupOptions.length - 1] || 1;
    if (groupCount > maxAllowed) setGroupCount(maxAllowed);
  }, [maxGroupOptions, groupCount]);

  // Fixed pool size: 26 per person
  const targetPoolSize = count * PLAYERS_PER_PERSON;
  const poolHealthy = selectedPlayers.length === targetPoolSize;
  const tierStats = {};
  Object.keys(normalizedTiers).forEach((k) => {
    tierStats[k] = selectedPlayers.filter((p) => getTierKey(p.rating, normalizedTiers) === k).length;
  });

  if (showShare && sessionData) {
    return React.createElement(ShareScreen, {
      roomCode: sessionData.roomCode,
      onContinue: () => {
        // Session already exists; continue directly to draw screen.
        setShowShare(false);
        onStart(sessionData, { skipCreate: true });
      }
    });
  }

  return React.createElement("div", {
    style:{ minHeight:"100vh", background:"#04060a", display:"flex", alignItems:"center",
      justifyContent:"center", padding:20 }
  },
    React.createElement("div", { style:{ width:"100%", maxWidth:480, animation:"fadeUp .5s ease" } },
      React.createElement("div", { style:{ textAlign:"center", marginBottom:32 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:56, color:"#fff", letterSpacing:5, lineHeight:.9 } }, "NEW AUCTION"),
        React.createElement("div", { style:{ width:50, height:2, background:"#FFD700", margin:"12px auto 0", borderRadius:1 } })
      ),
      React.createElement("div", { style:{ marginBottom:18 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555", letterSpacing:3, marginBottom:5 } }, "AUCTION NAME"),
        React.createElement("input", {
          value: sessionName, onChange: e => setSessionName(e.target.value),
          style:{ width:"100%", background:"#0d0f16", border:"1px solid #1e2230",
            borderRadius:8, padding:"10px 14px", color:"#fff", fontSize:14,
            fontFamily:"'Exo 2'", outline:"none" }
        })
      ),
      React.createElement("div", { style:{ marginBottom:18, background:"#0a0c12", border:"1px solid #1e2230", borderRadius:10, padding:10 } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 } },
          React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555", letterSpacing:3 } }, "ROOM CODE"),
          copyStatus && React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#00FF88", fontWeight:700 } }, copyStatus)
        ),
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, marginBottom:8 } },
          React.createElement("div", { style:{ background:"#0d0f16", border:"2px solid #FFD700", borderRadius:8, padding:"8px 10px",
            fontFamily:"'Bebas Neue'", fontSize:22, color:"#FFD700", letterSpacing:3, textAlign:"center" } }, roomCode),
          React.createElement("button", {
            type:"button",
            onClick: () => copyValue(roomCode, "Code"),
            style:{ ...BTN.ghost, padding:"8px 10px", fontSize:11 }
          }, "COPY"),
          React.createElement("button", {
            type:"button",
            onClick: () => setRoomCode(generateRoomCode()),
            style:{ ...BTN.ghost, padding:"8px 10px", fontSize:11 }
          }, "REGEN")
        ),
        React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#666", marginBottom:6 } },
          "Share this code before starting. The room becomes joinable as soon as you continue and spin the draw."
        ),
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr auto", gap:8 } },
          React.createElement("div", { style:{ background:"#0d0f16", border:"1px solid #1e2230", borderRadius:8, padding:"8px 10px", fontFamily:"'Rajdhani'", fontSize:11, color:"#888", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" } }, shareLink),
          React.createElement("button", {
            type:"button",
            onClick: () => copyValue(shareLink, "Link"),
            style:{ ...BTN.ghost, padding:"8px 10px", fontSize:11 }
          }, "COPY LINK")
        )
      ),
      React.createElement("div", { style:{ marginBottom:18 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555", letterSpacing:3, marginBottom:6 } }, "PARTICIPANTS"),
        React.createElement("div", { style:{ display:"flex", gap:5 } },
          [2,3,4,5,6,7,8,9,10].map(n =>
            React.createElement("button", { key:n, onClick: () => updateCount(n), style:{
              flex:1, background: count===n ? "#FFD700" : "#0d0f16",
              color: count===n ? "#000" : "#888",
              border:`1px solid ${count===n ? "#FFD700" : "#1e2028"}`,
              borderRadius:7, padding:"8px 0", cursor:"pointer",
              fontFamily:"'Bebas Neue'", fontSize:15
            }}, n)
          )
        ),
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", fontFamily:"'Rajdhani'", fontSize:11, color:"#444", marginTop:5 } },
          React.createElement("div", null,
            `${selectedPlayers.length} players · ~${Math.round(Math.max(selectedPlayers.length,1)/count)} per person · ${count} lots`),
          React.createElement("div", { style:{ color: poolHealthy ? "#00FF88" : "#FF6B35" } })
        )
      ),
      React.createElement("div", { style:{ marginBottom:18 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555", letterSpacing:3, marginBottom:6 } }, "TOTAL BUDGET PER BIDDER"),
        React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:10 } },
          React.createElement("input", {
            type:"number", value:budget, onChange: e => setBudget(Math.max(1, Number(e.target.value))),
            style:{ flex:1, background:"#0d0f16", border:"1px solid #1e2230",
              borderRadius:8, padding:"10px 14px", color:"#fff", fontSize:14,
              fontFamily:"'Exo 2'", outline:"none" }
          }),
          React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:14, color:"#FFD700", letterSpacing:2 } }, "M")
        )
      ),
      React.createElement("div", { style:{ marginBottom:18, background:"#0a0c12", border:`1px solid ${mysteryEnabled ? "#FFD70044" : "#1e2230"}`, borderRadius:10, padding:12 } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center" } },
          React.createElement("div", null,
            React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:13, color:"#FFD700", letterSpacing:2, marginBottom:3 } }, "MYSTERY CARD"),
            React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#666", maxWidth:300 } },
              `Each bidder can spend ${MYSTERY_CARD_PRICE}M once to reveal a random S/S+ tier player, unique to them.`)
          ),
          React.createElement("button", {
            type:"button",
            onClick: () => setMysteryEnabled(v => !v),
            style:{
              width:52, height:28, borderRadius:14, border:"none", cursor:"pointer", position:"relative",
              background: mysteryEnabled ? "#FFD700" : "#1e2230", flexShrink:0, transition:"background .2s"
            }
          },
            React.createElement("span", { style:{
              position:"absolute", top:3, left: mysteryEnabled ? 27 : 3, width:22, height:22, borderRadius:"50%",
              background:"#04060a", transition:"left .2s"
            } })
          )
        )
      ),
      React.createElement("div", { style:{ marginBottom:18, background:"#0a0c12", border:`1px solid ${groupsEnabled ? "#4FC3F744" : "#1e2230"}`, borderRadius:10, padding:12 } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: groupsEnabled ? 10 : 0 } },
          React.createElement("div", null,
            React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:13, color:"#4FC3F7", letterSpacing:2, marginBottom:3 } }, "🏆 GROUP STAGE"),
            React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#666", maxWidth:300 } },
              "Split bidders into groups with randomised round-robin fixtures, played after the draft.")
          ),
          React.createElement("button", {
            type:"button",
            onClick: () => setGroupsEnabled(v => !v),
            style:{
              width:52, height:28, borderRadius:14, border:"none", cursor:"pointer", position:"relative",
              background: groupsEnabled ? "#4FC3F7" : "#1e2230", flexShrink:0, transition:"background .2s"
            }
          },
            React.createElement("span", { style:{
              position:"absolute", top:3, left: groupsEnabled ? 27 : 3, width:22, height:22, borderRadius:"50%",
              background:"#04060a", transition:"left .2s"
            } })
          )
        ),
        groupsEnabled && React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" } },
          React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#666" } }, "NUMBER OF GROUPS"),
          React.createElement("div", { style:{ display:"flex", gap:5 } },
            maxGroupOptions.map(n =>
              React.createElement("button", { key:n, type:"button", onClick: () => setGroupCount(n), style:{
                background: groupCount===n ? "#4FC3F7" : "#0d0f16",
                color: groupCount===n ? "#000" : "#888",
                border:`1px solid ${groupCount===n ? "#4FC3F7" : "#1e2028"}`,
                borderRadius:6, padding:"4px 12px", cursor:"pointer",
                fontFamily:"'Bebas Neue'", fontSize:13
              }}, n===1 ? "SINGLE" : n)
            )
          ),
          React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#444" } },
            `≈${Math.ceil(count / groupCount)} teams per group`),
          React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:8, marginTop:8, width:"100%" } },
            React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#666" } }, "FIXTURE LEGS"),
            ["single", "double"].map((leg) =>
              React.createElement("button", { key:leg, type:"button", onClick: () => setFixtureLeg(leg), style:{
                background: fixtureLeg===leg ? "#4FC3F7" : "#0d0f16",
                color: fixtureLeg===leg ? "#000" : "#888",
                border:`1px solid ${fixtureLeg===leg ? "#4FC3F7" : "#1e2028"}`,
                borderRadius:6, padding:"4px 12px", cursor:"pointer",
                fontFamily:"'Bebas Neue'", fontSize:13
              }}, leg === "single" ? "1 LEG" : "2 LEGS")
            ),
            React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#444" } },
              fixtureLeg === "double" ? "Home + Away for every match" : "One match per pair")
          )
        )
      ),
      React.createElement("div", { style:{ marginBottom:18, background:"#0a0c12", border:"1px solid #1e2230", borderRadius:10, padding:10 } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 } },
          React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555", letterSpacing:2 } }, "PLAYER POOL (80+ RATED)"),
          React.createElement("div", { style:{ display:"flex", gap:8, alignItems:"center" } },
            React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#888" } }, `${selectedBasePlayers.length} selected`),
            React.createElement("button", {
              onClick: () => {
                const allEligible = basePlayers.filter(p => p.rating >= 80);
                if (selectedBasePlayers.length === allEligible.length) {
                  // Deselect all
                  setExcludedIds(new Set(allEligible.map(p => p.id)));
                } else {
                  // Select all
                  setExcludedIds(new Set());
                }
              },
              style:{ background:"#FFD70022", border:"1px solid #FFD70044", color:"#FFD700", borderRadius:6, padding:"3px 8px", 
                cursor:"pointer", fontFamily:"'Rajdhani'", fontSize:10, fontWeight:700 }
            }, selectedBasePlayers.length === basePlayers.filter(p => p.rating >= 80).length ? "DESELECT ALL" : "SELECT ALL")
          )
        ),
        React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" } },
          (() => {
            const posGroups = {
              GK: selectedBasePlayers.filter(p => p.pos === "GK").length,
              DEF: selectedBasePlayers.filter(p => ["CB","LB","RB","LWB","RWB"].includes(p.pos)).length,
              MID: selectedBasePlayers.filter(p => ["CDM","CM","CAM","LM","RM"].includes(p.pos)).length,
              ATT: selectedBasePlayers.filter(p => ["ST","CF","LW","RW","SS"].includes(p.pos)).length,
            };
            return Object.entries(posGroups).map(([pos, count]) =>
              React.createElement("div", { key:pos, style:{ background:"#0d0f16", border:"1px solid #1e2030", borderRadius:6, padding:"4px 8px", fontFamily:"'Rajdhani'", fontSize:10, color:"#888" } },
                `${pos}: ${count}`)
            );
          })()
        ),
        loadingPool && React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#666", marginBottom:8 } }, "Loading FC26 dataset…"),
        poolError && React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#FF3D71", marginBottom:8 } }, poolError),
        React.createElement("input", {
          value:search,
          onChange: e => setSearch(e.target.value),
          placeholder:"Search players to include/exclude",
          style:{ width:"100%", background:"#0d0f16", border:"1px solid #1e2230", borderRadius:7,
            padding:"8px 10px", color:"#fff", fontFamily:"'Exo 2'", fontSize:12, marginBottom:8 }
        }),
        React.createElement("div", { style:{ maxHeight:240, overflowY:"auto", border:"1px solid #1a1c22", borderRadius:7, padding:6, marginBottom:8 } },
          basePlayers.filter(p => p.rating >= 80 && (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.pos.toLowerCase().includes(search.toLowerCase())))
            .sort((a, b) => b.rating - a.rating)
            .map((p) => {
              const posGroup = Object.entries({GK:["GK"],DEF:["CB","LB","RB","LWB","RWB"],MID:["CDM","CM","CAM","LM","RM"],ATT:["ST","CF","LW","RW","SS"]}).find(([,positions]) => positions.includes(p.pos))?.[0] || "MID";
              return React.createElement("label", { key:p.id, style:{ display:"grid", gridTemplateColumns:"16px 1fr 28px 36px", gap:6, alignItems:"center", marginBottom:3, cursor:"pointer" } },
                React.createElement("input", {
                  type:"checkbox",
                  checked: !excludedIds.has(p.id),
                  onChange: () => toggleExcluded(p.id)
                }),
                React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#ccc", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" } }, `${p.name} (${p.pos})`),
                React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#555", background:"#1a1c22", borderRadius:3, padding:"2px 4px", textAlign:"center" } }, posGroup),
                React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:12, color:"#888", textAlign:"right" } }, p.rating)
              );
            })
        )
      ),
      React.createElement("div", { style:{ marginBottom:18, background:"#0a0c12", border:"1px solid #1e2230", borderRadius:10, padding:10 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555", letterSpacing:2, marginBottom:8 } }, "TIER RULES"),
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"40px 50px 50px 50px 50px 44px", gap:6, alignItems:"center", marginBottom:8, paddingBottom:8, borderBottom:"1px solid #1a1c22" } },
          React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#444", fontWeight:700 } }, "TIER"),
          React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#444", fontWeight:700 } }, "MIN"),
          React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#444", fontWeight:700 } }, "MAX"),
          React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#444", fontWeight:700 } }, "PRICE"),
          React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#444", fontWeight:700, textAlign:"right" } }, "COUNT")
        ),
        Object.entries(tierConfig).map(([key, t]) =>
          React.createElement("div", { key:key, style:{ display:"grid", gridTemplateColumns:"40px 50px 50px 50px 50px 44px", gap:6, alignItems:"center", marginBottom:6 } },
            React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", color:t.color, fontSize:12 } }, key),
            React.createElement("input", { type:"number", min:0, max:100, value:t.min, onChange:e => updateTier(key, "min", e.target.value),
              style:{ background:"#0d0f16", border:"1px solid #1e2230", borderRadius:6, padding:"4px 6px", color:"#fff", fontSize:11, width:"100%" } }),
            React.createElement("input", { type:"number", min:0, max:100, value:t.max, onChange:e => updateTier(key, "max", e.target.value),
              style:{ background:"#0d0f16", border:"1px solid #1e2230", borderRadius:6, padding:"4px 6px", color:"#fff", fontSize:11, width:"100%" } }),
            React.createElement("input", { type:"number", value:t.price, onChange:e => updateTier(key, "price", e.target.value),
              style:{ background:"#0d0f16", border:"1px solid #1e2230", borderRadius:6, padding:"4px 6px", color:"#fff", fontSize:11, width:"100%" } }),
            React.createElement("input", { type:"color", value:t.color, onChange:e => updateTier(key, "color", e.target.value),
              style:{ background:"#0d0f16", border:"1px solid #1e2230", borderRadius:6, padding:"2px", cursor:"pointer", width:40, height:30 } }),
            React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:12, color:t.color, textAlign:"right" } }, tierStats[key] || 0)
          )
        )
      ),
      React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:8 } },
        names.map((n, i) =>
          React.createElement("div", { key:i, style:{ display:"flex", alignItems:"center", gap:10 } },
            React.createElement("div", { style:{ width:30, height:30, borderRadius:"50%", flexShrink:0,
              background:PCOLORS[i], display:"flex", alignItems:"center", justifyContent:"center",
              fontFamily:"'Bebas Neue'", fontSize:14, color:"#000" } }, i===0 ? "👑" : i+1),
            React.createElement("input", {
              value:n, onChange: e => { const a=[...names]; a[i]=e.target.value; setNames(a); },
              style:{ flex:1, background:"#0d0f16", border:"1px solid #1e2028",
                borderRadius:8, padding:"10px 12px", color:"#fff", fontSize:13,
                fontFamily:"'Exo 2'", outline:"none" },
              onFocus: e => e.target.style.borderColor = PCOLORS[i],
              onBlur: e => e.target.style.borderColor = "#1e2028"
            }),
            i === 0 && React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:"#FFD700",
              letterSpacing:1, whiteSpace:"nowrap" } }, "HOST")
          )
        )
      ),
      React.createElement("button", {
        style:{ ...BTN.gold, width:"100%", marginTop:22, opacity: loadingPool || selectedPlayers.length === 0 || creatingRoom ? .5 : 1 },
        onClick: async () => {
          if (loadingPool || selectedPlayers.length === 0 || creatingRoom) return;

          setCreatingRoom(true);
          setPoolError("");
          const sessionId = `session:${Date.now()}`;
          // Only the auction *spec* is built here — which players/options to use. Lot
          // assignment, draw order, pick order, and Mystery Card pools/candidates are all
          // generated server-side so the host has exactly zero foresight, same as everyone else.
          const roomSpec = {
            id: sessionId,
            roomCode,
            name: sessionName,
            budgetPerBidder: budget,
            tiers: normalizedTiers,
            selectedPlayers,
            participantNames: names.slice(0, count),
            mysteryEnabled,
            groupsEnabled,
            groupCount,
            fixtureLeg,
          };

          try {
            const persisted = await onStart(roomSpec, { deferNavigation: true });
            setSessionData(persisted);
            setShowShare(true);
          } catch (err) {
            setPoolError(err?.message || "Failed to create room. Please try again.");
          } finally {
            setCreatingRoom(false);
          }
        }
      }, creatingRoom ? "CREATING ROOM…" : (loadingPool ? "LOADING DATASET…" : selectedPlayers.length === 0 ? "NO PLAYERS SELECTED" : "CONTINUE →"))
    )
  );
}
