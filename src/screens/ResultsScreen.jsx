import React from "react";
import { SquadAnalyser } from "../widgets/SquadAnalyser.jsx";
import { BUDGET, PCOLORS, SQUAD_MIN, SQUAD_MAX, TIERS, getTierData, getTierKey } from "../game/constants.js";
import { downloadSquadImage } from "../utils/squadImage.js";
import { apiSaveAuctionPoints } from "../lib/api.js";

export function ResultsScreen({ participants, wishlists, players=[], tiers=TIERS, selectedName, auctionResultId, user, onRefresh }) {
  const [view, setView] = React.useState("squads");
  const [analyserOpen, setAnalyserOpen] = React.useState(false);
  const [pointsData, setPointsData] = React.useState({});
  const [savingPoints, setSavingPoints] = React.useState(false);

  const allPicks = participants.flatMap(p =>
    p.squad.map(pl => ({ ...pl, owner:p.name, ownerIdx:participants.findIndex(x=>x.name===p.name) }))
  );

  // Initialize points data from all players
  React.useEffect(() => {
    const initialized = {};
    allPicks.forEach(pl => {
      initialized[pl.id] = 0;
    });
    setPointsData(initialized);
  }, []);

  const handlePointsChange = (playerId, value) => {
    setPointsData(prev => ({
      ...prev,
      [playerId]: Math.max(0, parseInt(value) || 0)
    }));
  };

  const handleSavePoints = async () => {
    if (!auctionResultId) {
      alert("Auction ID not available. Cannot save points.");
      return;
    }

    const pointsArray = allPicks
      .filter(pl => pointsData[pl.id] > 0)
      .map(pl => ({
        playerId: pl.id,
        playerName: pl.name,
        pointsAwarded: pointsData[pl.id]
      }));

    if (pointsArray.length === 0) {
      alert("Please enter points for at least one player.");
      return;
    }

    setSavingPoints(true);
    try {
      await apiSaveAuctionPoints(auctionResultId, pointsArray, user?.token);
      alert("Points saved successfully!");
      onRefresh && onRefresh();
    } catch (err) {
      alert("Failed to save points: " + err.message);
    } finally {
      setSavingPoints(false);
    }
  };

  return React.createElement("div", { style:{ minHeight:"100vh", background:"#04060a", color:"#fff" } },
    analyserOpen && React.createElement(SquadAnalyser, {
      participants,
      wishlists,
      players,
      tiers,
      selectedName,
      onClose: () => setAnalyserOpen(false),
    }),
    React.createElement("div", { style:{ maxWidth:960, margin:"0 auto", padding:"36px 20px" } },
      React.createElement("div", { style:{ textAlign:"center", marginBottom:26, animation:"fadeUp .5s ease" } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:64, color:"#FFD700",
          letterSpacing:6, textShadow:"0 0 50px #FFD70055" } }, "DRAFT COMPLETE"),
        React.createElement("p", { style:{ fontFamily:"'Rajdhani'", fontSize:14, color:"#555", letterSpacing:2 } },
          `${players.length} players · ${participants.length} teams · GL HF ⚽`)
      ),
      React.createElement("div", { style:{ display:"flex", gap:8, justifyContent:"center", marginBottom:22 } },
        ["squads","history","points"].map(v =>
          React.createElement("button", { key:v, onClick: () => setView(v), style:{
            background: view===v ? "#FFD700" : "#0d0f16", color: view===v ? "#000" : "#888",
            border:`1px solid ${view===v ? "#FFD700" : "#1e2028"}`,
            borderRadius:8, padding:"7px 18px", cursor:"pointer",
            fontFamily:"'Bebas Neue'", fontSize:14, letterSpacing:1
          }}, v==="squads" ? "SQUADS" : v==="history" ? "ALL PICKS" : "🏆 POINTS")
        ),
        React.createElement("button", { onClick: () => setAnalyserOpen(true), style:{
          background:"#FFD70018", color:"#FFD700", border:"1px solid #FFD70044",
          borderRadius:8, padding:"7px 18px", cursor:"pointer",
          fontFamily:"'Bebas Neue'", fontSize:14, letterSpacing:1
        }}, "📊 ANALYSER")
      ),

      view==="squads" && React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 } },
        [...participants].sort((a,b) => b.squad.length-a.squad.length).map((p, i) => {
          const valid = p.squad.length>=SQUAD_MIN && p.squad.length<=SQUAD_MAX;
          const spent = BUDGET - p.budget;
          return React.createElement("div", { key:i, style:{
            background:"#0a0c12", border:`1px solid ${PCOLORS[i]}33`,
            borderRadius:14, padding:16, boxShadow:`0 0 16px ${PCOLORS[i]}08`
          } },
            React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 } },
              React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:20, color:PCOLORS[i] } }, p.name),
              React.createElement("div", { style:{ display:"flex", gap:5, alignItems:"center" } },
                React.createElement("span", { style:{
                  fontFamily:"'Rajdhani'", fontSize:10, fontWeight:700,
                  color: valid?"#00FF88":"#FF3D71",
                  background: valid?"#00FF8814":"#FF3D7114",
                  border:`1px solid ${valid?"#00FF8833":"#FF3D7133"}`,
                  borderRadius:4, padding:"2px 6px"
                }}, `${p.squad.length}p ${valid?"✓":"⚠"}`),
                React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#555" } }, `${spent}M`)
              )
            ),
            React.createElement("div", { style:{ marginBottom:10 } },
              React.createElement("button", {
                onClick: () => downloadSquadImage(p, { formation: "4-3-3", tiers }),
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
              }, "DOWNLOAD SQUAD")
            ),
            React.createElement("div", { style:{ display:"flex", flexWrap:"wrap", gap:3 } },
              p.squad.sort((a,b) => b.rating-a.rating).map(pl => {
                const td = getTierData(pl.rating, tiers);
                return React.createElement("div", { key:pl.id, style:{
                  background:td.bg, border:`1px solid ${td.border}`, borderRadius:5, padding:"2px 6px",
                  fontFamily:"'Rajdhani'", fontSize:10, fontWeight:700,
                  display:"flex", gap:4, alignItems:"center"
                }},
                  React.createElement("span", { style:{ color:td.color } }, pl.rating),
                  React.createElement("span", { style:{ color:"#ccc" } }, pl.name.split(" ").pop()),
                  React.createElement("span", { style:{ color:"#555", fontSize:9 } }, pl.pos)
                );
              })
            )
          );
        })
      ),

      view==="history" && React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:3 } },
        allPicks.sort((a,b) => b.rating-a.rating).map((pl, i) => {
          const td = getTierData(pl.rating, tiers);
          return React.createElement("div", { key:i, style:{
            display:"grid", gridTemplateColumns:"28px 32px 32px 1fr 110px 44px",
            alignItems:"center", gap:10, background:"#0a0c12", borderRadius:7, padding:"7px 12px",
            borderLeft:`3px solid ${td.color}`,
            animation:`rowIn .22s ease ${Math.min(i*.015,.5)}s both`
          }},
            React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", color:"#333", fontSize:12 } }, `#${i+1}`),
            React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:16, color:td.color } }, pl.rating),
            React.createElement("span", { style:{
              fontFamily:"'Rajdhani'", fontSize:9, fontWeight:700,
              color:PCOLORS[pl.ownerIdx], background:`${PCOLORS[pl.ownerIdx]}18`,
              borderRadius:3, textAlign:"center", padding:"2px 0"
            }}, pl.pos),
            React.createElement("span", { style:{ fontFamily:"'Exo 2'", fontSize:12, fontWeight:600, color:"#e0e0e0",
              whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" } }, pl.name),
            React.createElement("span", { style:{ fontFamily:"'Exo 2'", fontSize:11, color:PCOLORS[pl.ownerIdx], fontWeight:700 } }, pl.owner),
            React.createElement("span", { style:{
              fontFamily:"'Rajdhani'", fontSize:10, color:td.color,
              background:td.bg, borderRadius:4, textAlign:"center", padding:"2px 0"
            }}, getTierKey(pl.rating, tiers))
          );
        })
      ),

      view==="points" && React.createElement("div", { style:{ maxWidth:800, margin:"0 auto" } },
        React.createElement("div", { style:{ marginBottom:20 } },
          React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:24, color:"#FFD700", letterSpacing:2, marginBottom:10 } }, "AWARD POINTS TO PLAYERS"),
          React.createElement("p", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, "Enter the championship points for each player. The player with the highest total wins the tournament!")
        ),
        React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:10 } },
          allPicks.sort((a,b) => b.rating-a.rating).map(pl => {
            const td = getTierData(pl.rating, tiers);
            return React.createElement("div", { key:pl.id, style:{
              background:"#0a0c12", border:`1px solid ${td.border}33`, borderRadius:10, padding:14,
              display:"flex", alignItems:"center", justifyContent:"space-between"
            } },
              React.createElement("div", { style:{ minWidth:0, flex:1 } },
                React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:15, color:"#fff", marginBottom:2 } }, pl.name),
                React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#666" } },
                  `${pl.pos} · ${pl.rating} (${getTierKey(pl.rating, tiers)}) · ${pl.owner}`)
              ),
              React.createElement("input", {
                type:"number",
                min:0,
                max:999,
                value:pointsData[pl.id] || 0,
                onChange: (e) => handlePointsChange(pl.id, e.target.value),
                style:{
                  background:"#05070d", border:`1px solid ${td.border}`, borderRadius:6, color:td.color,
                  fontFamily:"'Bebas Neue'", fontSize:18, fontWeight:700,
                  width:60, height:40, textAlign:"center", padding:0,
                  cursor:"pointer"
                }
              })
            );
          })
        ),
        React.createElement("div", { style:{ display:"flex", gap:12, marginTop:24 } },
          React.createElement("button", {
            onClick: () => setView("squads"),
            style:{
              flex:1, background:"#0d0f16", color:"#888", border:"1px solid #1e2028",
              borderRadius:8, padding:10, cursor:"pointer",
              fontFamily:"'Bebas Neue'", fontSize:13, letterSpacing:1
            }
          }, "CANCEL"),
          React.createElement("button", {
            onClick: handleSavePoints,
            disabled: savingPoints,
            style:{
              flex:1, background:"#FFD700", color:"#000", border:"none",
              borderRadius:8, padding:10, cursor:"pointer",
              fontFamily:"'Bebas Neue'", fontSize:13, letterSpacing:1,
              opacity: savingPoints ? 0.6 : 1
            }
          }, savingPoints ? "SAVING…" : "✓ SAVE POINTS")
        )
      )
    )
  );
}
