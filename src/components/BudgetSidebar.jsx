import React from "react";
import { BUDGET, PCOLORS, SQUAD_MIN, SQUAD_MAX, TIERS, getTierData } from "../game/constants.js";

export function BudgetSidebar({ participants, currentTurn, passedSet, onAnalyse, lotIdx, totalLots, tiers=TIERS }) {
  return React.createElement("div", {
    style:{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }
  },
    React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, padding:10, borderBottom:"1px solid #0f1218", flexShrink:0 } },
      React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#444", letterSpacing:3 } }, `LOT ${lotIdx+1}/${totalLots}`),
      React.createElement("button", { onClick:onAnalyse, style:{ background:"#FFD70014", border:"1px solid #FFD70033",
        color:"#FFD700", borderRadius:6, padding:"3px 9px", cursor:"pointer",
        fontFamily:"'Bebas Neue'", fontSize:11, letterSpacing:1 } }, "📊 ANALYSE")
    ),
    React.createElement("div", {
      style:{ display:"flex", flexDirection:"column", gap:8, overflow:"auto", padding:10, minHeight:0, flex:1 }
    },
    participants.map((p, i) => {
      const pct = (p.budget / BUDGET) * 100;
      const barCol = pct > 50 ? "#00FF88" : pct > 25 ? "#FFD700" : "#FF3D71";
      const isPicking = currentTurn === p.name;
      const hasPassed = passedSet?.has(p.name);

      return React.createElement("div", { key:i, style:{
        background:"#0d0f16", borderRadius:9, padding:"9px 11px",
        border:`1px solid ${isPicking ? PCOLORS[i]+"66" : hasPassed ? "#0f1015" : "#1a1c22"}`,
        opacity: hasPassed ? .5 : 1,
        boxShadow: isPicking ? `0 0 14px ${PCOLORS[i]}22` : "none",
        transition:"all .3s",
      }},
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 } },
          React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:6 } },
            React.createElement("div", { style:{ width:7, height:7, borderRadius:"50%", background:PCOLORS[i],
              boxShadow: isPicking ? `0 0 8px ${PCOLORS[i]}` : "none" } }),
            React.createElement("span", { style:{ fontFamily:"'Exo 2'", fontSize:12, fontWeight:700,
              color: isPicking ? PCOLORS[i] : "#ccc" } }, p.name)
          ),
          React.createElement("div", { style:{ display:"flex", gap:5, alignItems:"center" } },
            hasPassed && React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#FF3D71", fontWeight:700 } }, "DONE"),
            isPicking && React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:"#00FF88", fontWeight:700, animation:"pulse 1s ease infinite" } }, "●"),
            React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:13, color:barCol } }, `${p.budget}M`)
          )
        ),
        React.createElement("div", { style:{ height:3, background:"#1a1c22", borderRadius:2, overflow:"hidden", marginBottom:5 } },
          React.createElement("div", { style:{ height:"100%", width:`${pct}%`, background:barCol, borderRadius:2, transition:"width .5s" } })
        ),
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center" } },
          React.createElement("div", { style:{ display:"flex", flexWrap:"wrap", gap:2, flex:1 } },
            p.squad.slice(-3).map(pl => {
              const td = getTierData(pl.rating, tiers);
              return React.createElement("span", { key:pl.id, style:{
                fontFamily:"'Rajdhani'", fontSize:9, fontWeight:700,
                color:td.color, background:td.bg, border:`1px solid ${td.border}`,
                borderRadius:3, padding:"1px 3px"
              }}, pl.name.split(" ").pop());
            }),
            p.squad.length > 3 && React.createElement("span", { style:{ fontSize:9, color:"#444" } }, `+${p.squad.length-3}`)
          ),
          React.createElement("div", { style:{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 } },
            React.createElement("span", { style:{
              fontFamily:"'Rajdhani'", fontSize:10, fontWeight:700,
              color: p.squad.length >= SQUAD_MIN && p.squad.length <= SQUAD_MAX ? "#00FF88"
                : p.squad.length > SQUAD_MAX ? "#FF3D71" : "#666"
            }}, `${p.squad.length}p`)
          )
        )
      );
    })    )  );
}
