import React from "react";
import { FORMATIONS, CAN_FILL, TIERS, getTierData } from "../game/constants.js";

export function PitchView({ squad, formation, tiers=TIERS }) {
  const rows = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  const allSlots = rows.flat();
  const assigned = []; const usedIds = new Set();

  allSlots.forEach(slot => {
    const compat = CAN_FILL[slot] || [slot];
    const best = squad
      .filter(p => !usedIds.has(p.id) && compat.includes(p.pos))
      .sort((a, b) => b.rating - a.rating)[0];
    assigned.push({ slot, player: best || null });
    if (best) usedIds.add(best.id);
  });

  const bench = squad.filter(p => !usedIds.has(p.id));
  const missing = assigned.filter(a => !a.player);

  let idx = 0;
  const pitchRows = rows.map(row => row.map(() => assigned[idx++])).reverse();

  const Node = ({ slot, player }) => {
    const td = player ? getTierData(player.rating, tiers) : null;
    return React.createElement("div", {
      style:{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, width:52 }
    },
      React.createElement("div", {
        style:{
          width:40, height:40, borderRadius:"50%",
          background: player ? `radial-gradient(circle,${td.color}28,#0a1a0a)` : "#0a140a",
          border:`2px solid ${player ? td.color : "#1e3020"}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow: player ? `0 0 10px ${td.color}44` : "none",
        }
      }, player
        ? React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:14, color:td.color } }, player.rating)
        : React.createElement("span", { style:{ fontSize:10, color:"#2a3a2a" } }, slot)
      ),
      React.createElement("span", {
        style:{ fontFamily:"'Rajdhani'", fontSize:8, fontWeight:700,
          color: player ? "#bbb" : "#2a3a2a", textAlign:"center",
          maxWidth:50, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }
      }, player ? player.name.split(" ").pop() : slot)
    );
  };

  return React.createElement("div", null,
    React.createElement("div", {
      style:{
        background:"linear-gradient(180deg,#071507 0%,#0d2a10 50%,#071507 100%)",
        borderRadius:10, border:"1px solid #1a3520", padding:"12px 6px",
        position:"relative", overflow:"hidden",
      }
    },
      React.createElement("div", { style:{
        position:"absolute", inset:0, opacity:.05,
        backgroundImage:"linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
        backgroundSize:"36px 36px", pointerEvents:"none"
      }}),
      React.createElement("div", { style:{
        position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
        width:64, height:64, borderRadius:"50%",
        border:"1px solid rgba(255,255,255,.05)", pointerEvents:"none"
      }}),
      pitchRows.map((row, ri) =>
        React.createElement("div", { key:ri, style:{ display:"flex", justifyContent:"center", gap:4,
          marginBottom: ri < pitchRows.length-1 ? 6 : 0 } },
          row.map((a, si) => React.createElement(Node, { key:si, ...a }))
        )
      )
    ),
    missing.length > 0 && React.createElement("div", { style:{ marginTop:8, display:"flex", flexWrap:"wrap", gap:4 } },
      missing.map((a, i) =>
        React.createElement("span", { key:i, style:{
          fontFamily:"'Rajdhani'", fontSize:10, fontWeight:700,
          background:"#FF3D7114", border:"1px solid #FF3D7133",
          color:"#FF3D71", borderRadius:4, padding:"2px 7px"
        }}, `⚠ ${a.slot}`)
      )
    ),
    bench.length > 0 && React.createElement("div", { style:{ marginTop:10 } },
      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:"#444", letterSpacing:2, marginBottom:5 } }, `BENCH (${bench.length})`),
      React.createElement("div", { style:{ display:"flex", flexWrap:"wrap", gap:4 } },
        bench.map(p => {
          const td = getTierData(p.rating, tiers);
          return React.createElement("div", { key:p.id, style:{
            background:td.bg, border:`1px solid ${td.border}`,
            borderRadius:5, padding:"2px 6px",
            fontFamily:"'Rajdhani'", fontSize:10, fontWeight:700,
            display:"flex", gap:4, alignItems:"center"
          }},
            React.createElement("span", { style:{ color:td.color } }, p.rating),
            React.createElement("span", { style:{ color:"#bbb" } }, p.name.split(" ").pop()),
            React.createElement("span", { style:{ color:"#555", fontSize:9 } }, p.pos)
          );
        })
      )
    )
  );
}
