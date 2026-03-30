import React from "react";
import { PitchView } from "../components/PitchView.jsx";
import { BTN } from "../utils/styles.js";
import { PCOLORS, FORMATIONS, BUDGET, SQUAD_MIN, SQUAD_MAX, TIERS, getTierKey, getTierData } from "../game/constants.js";
import { downloadSquadImage } from "../utils/squadImage.js";

export function SquadAnalyser({ participants, wishlists, players=[], tiers=TIERS, selectedName, onClose }) {
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

  const handleDownloadSquadImage = () => {
    if (!p) return;
    downloadSquadImage(p, { formation: fmt, tiers });
  };

  return React.createElement("div", {
    onClick: e => e.target === e.currentTarget && onClose(),
    style:{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)",
      zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center",
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
          React.createElement("div", { style:{ marginBottom:10, display:"flex", gap:5, flexWrap:"wrap" } },
            Object.keys(FORMATIONS).map(f =>
              React.createElement("button", { key:f, onClick: () => setFmts(prev => ({...prev,[p.name]:f})), style:{
                background: fmt===f ? `${PCOLORS[pIdx]}22` : "#111",
                border:`1px solid ${fmt===f ? PCOLORS[pIdx] : "#222"}`,
                color: fmt===f ? PCOLORS[pIdx] : "#555",
                borderRadius:6, padding:"3px 10px", cursor:"pointer",
                fontFamily:"'Bebas Neue'", fontSize:12
              }}, f)
            )
          ),
          squad.length > 0
            ? React.createElement(PitchView, { squad, formation:fmt, tiers })
            : React.createElement("div", { style:{ height:160, display:"flex", alignItems:"center",
                justifyContent:"center", color:"#333", fontFamily:"'Rajdhani'", fontSize:14 } }, "No players yet")
        ),
        React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:10 } },
          React.createElement("div", { style:{ background:"#0d0f16", borderRadius:10, padding:12 } },
            React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:"#555", letterSpacing:2, marginBottom:4 } }, "SQUAD SIZE"),
            React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:34,
              color: valid ? "#00FF88" : "#FF3D71", lineHeight:1 } },
              squad.length, React.createElement("span", { style:{ fontSize:14, color:"#555" } }, "/16–17")
            ),
            React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:10, marginTop:3,
              color: squad.length < SQUAD_MIN ? "#FF3D71" : squad.length > SQUAD_MAX ? "#FF3D71" : "#00FF88" } },
              squad.length < SQUAD_MIN ? `Need ${SQUAD_MIN-squad.length} more`
              : squad.length > SQUAD_MAX ? "Over limit ⚠"
              : "✓ Valid squad"
            )
          ),
          React.createElement("div", { style:{ background:"#0d0f16", borderRadius:10, padding:12 } },
            React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:"#555", letterSpacing:2, marginBottom:6 } }, "BUDGET"),
            React.createElement("div", { style:{ height:4, background:"#1a1c22", borderRadius:2, overflow:"hidden", marginBottom:5 } },
              React.createElement("div", { style:{ height:"100%", width:`${(p.budget/BUDGET)*100}%`,
                background:"#FFD700", borderRadius:2, transition:"width .5s" } })
            ),
            React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", fontFamily:"'Rajdhani'", fontSize:11 } },
              React.createElement("span", { style:{ color:"#888" } }, `Spent `, React.createElement("span", { style:{ color:"#FFD700" } }, `${spent}M`)),
              React.createElement("span", { style:{ color:"#888" } }, `Left `, React.createElement("span", { style:{ color:"#00FF88" } }, `${p.budget}M`))
            )
          ),
          React.createElement("div", { style:{ background:"#0d0f16", borderRadius:10, padding:12 } },
            React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:"#555", letterSpacing:2, marginBottom:6 } }, "TIER MIX"),
            Object.entries(tiers).map(([k,t]) => tierCounts[k]
              ? React.createElement("div", { key:k, style:{ display:"flex", justifyContent:"space-between", marginBottom:3 } },
                  React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:12, color:t.color } }, k),
                  React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#888" } }, `${tierCounts[k]}×`)
                )
              : null
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
