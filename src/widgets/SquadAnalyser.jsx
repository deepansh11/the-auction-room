import React from "react";
import { PitchView } from "../components/PitchView.jsx";
import { BTN } from "../utils/styles.js";
import { PCOLORS, FORMATIONS, BUDGET, SQUAD_MIN, SQUAD_MAX, TIERS, getTierKey, getTierData } from "../game/constants.js";
import { downloadSquadImage } from "../utils/squadImage.js";

export function SquadAnalyser({ participants, wishlists, players=[], tiers=TIERS, selectedName, onClose,
  hidden=false, mysteryEnabled=false, mysteryCardUsed=false, mysteryCardPrice=20 }) {
  const selfOnlyParticipants = React.useMemo(() => {
    if (!Array.isArray(participants) || participants.length === 0) return [];
    if (selectedName) {
      const own = participants.find((x) => x.name === selectedName);
      if (own) return [own];
    }
    return [participants[0]];
  }, [participants, selectedName]);

  const [sel, setSel] = React.useState(selfOnlyParticipants[0]?.name || "");
  const [fmts, setFmts] = React.useState({});
  const [tab, setTab] = React.useState("pitch");
  const [plannedTargets, setPlannedTargets] = React.useState({});
  const [pitchAssignments, setPitchAssignments] = React.useState({});
  const [tierBuyPlan, setTierBuyPlan] = React.useState({});
  const [reserveMystery, setReserveMystery] = React.useState(false);
  const [benchPinned, setBenchPinned] = React.useState({});

  React.useEffect(() => {
    if (selectedName && selfOnlyParticipants.some((x) => x.name === selectedName)) {
      setSel(selectedName);
      return;
    }
    if (!selfOnlyParticipants.some((x) => x.name === sel)) {
      setSel(selfOnlyParticipants[0]?.name || "");
    }
  }, [selfOnlyParticipants, selectedName, sel]);

  const p = selfOnlyParticipants.find((x) => x.name === sel) || selfOnlyParticipants[0];
  const squad = p?.squad || [];
  const fmt = fmts[p?.name] || "4-3-3";
  const pIdx = participants.findIndex((x) => x.name === sel);
  const spent = BUDGET - (p?.budget || 0);
  const valid = squad.length >= SQUAD_MIN && squad.length <= SQUAD_MAX;
  const wlist = wishlists[sel] || [];
  const wlistPlayers = players.filter(pl => wlist.includes(pl.id));

  const tierCounts = {};
  squad.forEach(pl => { const k = getTierKey(pl.rating, tiers); tierCounts[k] = (tierCounts[k] || 0) + 1; });

  // Planned squad-size target: how many players this bidder intends to end up with. Synced live
  // against how many they've actually bought as the auction progresses.
  const plannedTarget = plannedTargets[p?.name] ?? SQUAD_MAX;
  const remainingSlots = Math.max(plannedTarget - squad.length, 0);

  // Manual pitch placements are kept per participant *and* per formation (slot indices only make
  // sense within a given formation's shape).
  const assignmentsKey = `${p?.name || ""}:${fmt}`;
  const currentAssignments = pitchAssignments[assignmentsKey] || {};

  const myBenchPinned = benchPinned[p?.name] || new Set();

  const handlePitchAssign = (slotKey, playerId) => {
    // Moving to pitch: remove from bench-pinned so auto-fill can see them again
    setBenchPinned((prev) => {
      const s = new Set(prev[p.name] || []);
      s.delete(playerId);
      return { ...prev, [p.name]: s };
    });
    setPitchAssignments((prev) => {
      const existing = { ...(prev[assignmentsKey] || {}) };
      Object.keys(existing).forEach((k) => { if (existing[k] === playerId) delete existing[k]; });
      existing[slotKey] = playerId;
      return { ...prev, [assignmentsKey]: existing };
    });
  };

  const handlePitchUnassign = (playerId) => {
    // Pin to bench so auto-fill never re-assigns them
    setBenchPinned((prev) => {
      const s = new Set(prev[p.name] || []);
      s.add(playerId);
      return { ...prev, [p.name]: s };
    });
    setPitchAssignments((prev) => {
      const existing = { ...(prev[assignmentsKey] || {}) };
      Object.keys(existing).forEach((k) => { if (existing[k] === playerId) delete existing[k]; });
      return { ...prev, [assignmentsKey]: existing };
    });
  };

  // Every tier-count combination that could still fit into the remaining planned slots without
  // Per-tier manual buy planner
  const myPlan = tierBuyPlan[p?.name] || {};
  const planTotal = Object.entries(myPlan).reduce((sum, [key, count]) => {
    return sum + Number(count || 0) * Number(tiers[key]?.price || 0);
  }, 0);
  const planSlots = Object.values(myPlan).reduce((sum, c) => sum + Number(c || 0), 0);
  const mysteryReserved = mysteryEnabled && !mysteryCardUsed && reserveMystery ? mysteryCardPrice : 0;
  const effectiveBudget = (p?.budget || 0) - mysteryReserved;
  const planFits = planTotal <= effectiveBudget;

  const handleDownloadSquadImage = () => {
    if (!p) return;
    downloadSquadImage(p, { formation: fmt, tiers });
  };

  return React.createElement("div", {
    onClick: e => e.target === e.currentTarget && onClose(),
    style:{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)",
      zIndex:1000, display: hidden ? "none" : "flex", alignItems:"center", justifyContent:"center",
      padding:16, backdropFilter:"blur(8px)", animation:"fadeIn .2s ease" }
  },
    React.createElement("div", {
      style:{ background:"#0a0c12", border:"1px solid #1e2230", borderRadius:16,
        width:"100%", maxWidth:860, maxHeight:"92vh", overflow:"auto",
        padding:22, animation:"scaleIn .25s ease" }
    },
      React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 } },
        React.createElement("div", null,
          React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:26, color:"#fff", letterSpacing:3 } }, "SQUAD ANALYSER"),
          React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12, color:"#555", letterSpacing:1 } }, "Pitch view · Wishlist · Formation analysis")
        ),
        React.createElement("div", { style:{ display:"flex", gap:8 } },
          React.createElement("button", {
            onClick: handleDownloadSquadImage,
            style:{ ...BTN.ghost, borderColor:"#00FF8844", color:"#00FF88" }
          }, "DOWNLOAD IMAGE"),
          React.createElement("button", { onClick:onClose, style:{ ...BTN.ghost } }, "CLOSE ✕")
        )
      ),
      p && React.createElement("div", { style:{ marginBottom:14 } },
        React.createElement("span", { style:{
          background: `${PCOLORS[pIdx >= 0 ? pIdx : 0]}22`,
          color: PCOLORS[pIdx >= 0 ? pIdx : 0],
          border:`1px solid ${PCOLORS[pIdx >= 0 ? pIdx : 0]}55`,
          borderRadius:8,
          padding:"5px 14px",
          fontFamily:"'Bebas Neue'",
          fontSize:13,
          letterSpacing:1
        } }, `${p.name} ${p.squad.length}p`)
      ),
      React.createElement("div", { style:{ display:"flex", gap:6, marginBottom:14 } },
        ["pitch","wishlist"].map(t =>
          React.createElement("button", { key:t, onClick: () => setTab(t), style:{
            background: tab===t ? "#FFD70022" : "transparent",
            color: tab===t ? "#FFD700" : "#555",
            border:`1px solid ${tab===t ? "#FFD70044" : "#1e2230"}`,
            borderRadius:7, padding:"4px 14px", cursor:"pointer",
            fontFamily:"'Bebas Neue'", fontSize:13
          }}, t.toUpperCase())
        )
      ),

      tab === "pitch" && React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 200px", gap:18 } },
        React.createElement("div", null,
          React.createElement("div", { style:{ marginBottom:10, display:"flex", alignItems:"center", gap:8 } },
            React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:"#555", letterSpacing:2 } }, "FORMATION"),
            React.createElement("select", {
              value: fmt,
              onChange: (e) => setFmts(prev => ({ ...prev, [p.name]: e.target.value })),
              style:{
                background:"#111", border:`1px solid ${PCOLORS[pIdx]}55`, color:PCOLORS[pIdx],
                borderRadius:6, padding:"5px 10px", cursor:"pointer",
                fontFamily:"'Bebas Neue'", fontSize:13, letterSpacing:1, outline:"none"
              }
            }, Object.keys(FORMATIONS).map(f => React.createElement("option", { key:f, value:f, style:{ background:"#111", color:"#fff" } }, f)))
          ),
          squad.length > 0
            ? React.createElement(PitchView, {
                squad, formation:fmt, tiers, interactive:true,
                assignments: currentAssignments,
                benchPinnedIds: myBenchPinned,
                onAssign: handlePitchAssign,
                onUnassign: handlePitchUnassign,
              })
            : React.createElement("div", { style:{ height:160, display:"flex", alignItems:"center",
                justifyContent:"center", color:"#333", fontFamily:"'Rajdhani'", fontSize:14 } }, "No players yet")
        ),
        React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:0 } },
          // ── Single unified panel ──────────────────────────────────────────────
          React.createElement("div", { style:{ background:"#0d0f16", borderRadius:10, padding:14 } },
            // Row 1: Squad size + validity
            React.createElement("div", { style:{ display:"flex", alignItems:"baseline", gap:6, marginBottom:6 } },
              React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:28,
                color: valid ? "#00FF88" : "#FF3D71", lineHeight:1 } }, squad.length),
              React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:13, color:"#444" } }, "/16"),
              React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:10, fontWeight:700, marginLeft:4,
                color: squad.length < SQUAD_MIN ? "#FF3D71" : squad.length > SQUAD_MAX ? "#FF3D71" : "#00FF88" } },
                squad.length < SQUAD_MIN ? `Need ${SQUAD_MIN-squad.length} more`
                : squad.length > SQUAD_MAX ? "Over limit ⚠" : "✓ Valid squad"
              )
            ),
            // Row 2: Budget bar + labels
            React.createElement("div", { style:{ height:3, background:"#1a1c22", borderRadius:2, overflow:"hidden", marginBottom:4 } },
              React.createElement("div", { style:{ height:"100%", width:`${Math.min(100,(spent/BUDGET)*100)}%`,
                background:"#FFD700", borderRadius:2, transition:"width .5s" } })
            ),
            React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", fontFamily:"'Rajdhani'", fontSize:10, marginBottom:8 } },
              React.createElement("span", { style:{ color:"#666" } }, "Spent ",
                React.createElement("span", { style:{ color:"#FFD700", fontWeight:700 } }, `${spent}M`)),
              React.createElement("span", { style:{ color:"#666" } }, "Left ",
                React.createElement("span", { style:{ color:"#00FF88", fontWeight:700 } }, `${p.budget}M`))
            ),
            // Row 3: Tier mix chips + mystery card if used
            (Object.keys(tierCounts).length > 0 || mysteryCardUsed) && React.createElement("div", {
              style:{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:10, paddingBottom:10, borderBottom:"1px solid #1a1c22" }
            },
              Object.entries(tiers).map(([k,t]) => tierCounts[k]
                ? React.createElement("span", { key:k, style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:t.color,
                    background:t.bg, border:`1px solid ${t.border}`, borderRadius:4, padding:"2px 6px" } },
                    `${k} ${tierCounts[k]}×`)
                : null
              ),
              mysteryCardUsed && React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:"#FFD700",
                background:"#FFD70018", border:"1px solid #FFD70044", borderRadius:4, padding:"2px 6px" } },
                `🎴 ${mysteryCardPrice}M`)
            ),
            // ── Buy planner ────────────────────────────────────────────────────
            React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 } },
              React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:"#555", letterSpacing:2 } }, "PLAN MORE BUYS"),
              React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:6 } },
                mysteryEnabled && !mysteryCardUsed && React.createElement("label", { style:{ display:"flex", alignItems:"center", gap:3, cursor:"pointer" } },
                  React.createElement("input", {
                    type:"checkbox", checked: reserveMystery,
                    onChange: (e) => setReserveMystery(e.target.checked),
                    style:{ accentColor:"#FFD700", width:10, height:10 }
                  }),
                  React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:8, color:"#888" } }, `−${mysteryCardPrice}M 🎴`)
                ),
                React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:4 } },
                  React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#555" } }, "Target"),
                  React.createElement("input", {
                    type:"number", min:1, max:SQUAD_MAX, value: plannedTarget,
                    onChange: (e) => {
                      const next = Math.max(1, Math.min(SQUAD_MAX, Number(e.target.value) || SQUAD_MAX));
                      setPlannedTargets((prev) => ({ ...prev, [p.name]: next }));
                    },
                    style:{ width:36, background:"#05070d", border:"1px solid #1e2028", borderRadius:4,
                      color:"#FFD700", fontFamily:"'Bebas Neue'", fontSize:12, textAlign:"center", padding:"1px 0" }
                  })
                )
              )
            ),
            React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#555", marginBottom:8 } },
              React.createElement("span", { style:{ color:"#00FF88", fontWeight:700 } }, squad.length),
              " bought · ",
              React.createElement("span", { style:{ color: remainingSlots > 0 ? "#FFD700" : "#555", fontWeight:700 } }, remainingSlots),
              " slots left · ",
              React.createElement("span", { style:{ color:"#00FF88", fontWeight:700 } }, `${p.budget}M`),
              " budget"
            ),
            // Tier rows — show already-bought count alongside the "plan more" input
            Object.entries(tiers).map(([key, t]) =>
              React.createElement("div", { key, style:{ display:"grid", gridTemplateColumns:"28px 22px 1fr 28px 38px", alignItems:"center", gap:3, marginBottom:5 } },
                React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:t.color } }, key),
                // Already-bought badge
                React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#555", textAlign:"center" } },
                  tierCounts[key] ? `${tierCounts[key]}×` : ""
                ),
                React.createElement("input", {
                  type:"number", min:0, max:SQUAD_MAX,
                  value: myPlan[key] ?? "",
                  placeholder:"0",
                  onChange: (e) => {
                    const val = Math.max(0, Math.min(SQUAD_MAX, Number(e.target.value) || 0));
                    setTierBuyPlan((prev) => ({ ...prev, [p.name]: { ...(prev[p.name] || {}), [key]: val } }));
                  },
                  style:{ background:"#05070d", border:`1px solid ${t.border}`,
                    borderRadius:4, padding:"3px 5px", color:t.color,
                    fontFamily:"'Bebas Neue'", fontSize:12, textAlign:"center", outline:"none", width:"100%" }
                }),
                React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#555", textAlign:"right" } }, `${t.price}M`),
                React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:t.color, textAlign:"right", fontWeight:700 } },
                  Number(myPlan[key] || 0) > 0 ? `${Number(myPlan[key]) * t.price}M` : "—"
                )
              )
            ),
            // Summary bar
            React.createElement("div", { style:{ borderTop:"1px solid #1a1c22", marginTop:6, paddingTop:6 } },
              React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 } },
                React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#888" } },
                  `${planSlots}p planned · ${planTotal}M`
                ),
                React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color: planFits ? "#00FF88" : "#FF3D71" } },
                  `${effectiveBudget}M usable`
                )
              ),
              React.createElement("div", { style:{ height:3, background:"#1a1c22", borderRadius:2, overflow:"hidden" } },
                React.createElement("div", { style:{
                  height:"100%", borderRadius:2, transition:"width .3s",
                  background: planFits ? "#FFD700" : "#FF3D71",
                  width: `${Math.min(100, effectiveBudget > 0 ? (planTotal / effectiveBudget) * 100 : 0)}%`,
                }})
              ),
              React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:9, marginTop:3, color: planFits ? "#444" : "#FF6B35" } },
                planFits
                  ? (planTotal > 0 ? `${effectiveBudget - planTotal}M remaining after plan` : "Enter player counts above")
                  : `Over budget by ${planTotal - effectiveBudget}M`
              )
            )
          )
        )
      ),

      tab === "wishlist" && React.createElement("div", null,
        wlistPlayers.length === 0
          ? React.createElement("div", { style:{ textAlign:"center", padding:"40px 0", color:"#333",
              fontFamily:"'Rajdhani'", fontSize:15 } }, "No wishlist items yet — tap ❤️ next to any player to add")
          : React.createElement("div", null,
              React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12, color:"#555",
                marginBottom:10, letterSpacing:1 } }, `${wlistPlayers.length} players on wishlist`),
              wlistPlayers.map((pl, i) => {
                const td = getTierData(pl.rating, tiers);
                const inSquad = squad.some(s => s.id === pl.id);
                return React.createElement("div", { key:pl.id, style:{
                  display:"grid", gridTemplateColumns:"36px 1fr 44px 50px 80px",
                  alignItems:"center", gap:8, padding:"7px 10px",
                  background: inSquad ? "#0a1a0a" : "#0d0f16",
                  border:`1px solid ${inSquad ? "#00FF8833" : td.border}`,
                  borderRadius:7, marginBottom:3,
                  animation:`rowIn .22s ease ${i*.03}s both`
                }},
                  React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:18, color:td.color, textAlign:"center" } }, pl.rating),
                  React.createElement("div", null,
                    React.createElement("div", { style:{ fontFamily:"'Exo 2'", fontSize:13, fontWeight:600, color:"#ddd" } }, pl.name),
                    React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:10, color:"#444" } }, `${pl.pos} · ${pl.club}`)
                  ),
                  React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:td.color,
                    background:td.bg, border:`1px solid ${td.border}`, borderRadius:4, textAlign:"center", padding:"2px 4px" } }, getTierKey(pl.rating, tiers)),
                  React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:12, color:td.color, textAlign:"right", fontWeight:700 } }, `${td.price}M`),
                  inSquad
                    ? React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#00FF88", fontWeight:700, textAlign:"right" } }, "✓ In Squad")
                    : React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#888", textAlign:"right" } }, "Not picked yet")
                );
              })
            )
      )
    )
  );
}
