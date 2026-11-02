import React from "react";
import { BUDGET, PCOLORS, SQUAD_MIN, SQUAD_MAX, TIERS, getTierData } from "../game/constants.js";
import { TeamBadge, getParticipantAccent, StatusPill } from "../theme/footballTheme.js";
import { getOrderedParticipants } from "../lib/pickOrder.js";

export function BudgetSidebar({ participants, sequence = [], currentTurn, passedSet, onAnalyse, lotIdx, totalLots, tiers=TIERS, budgetPerBidder=BUDGET }) {
  return React.createElement("div", {
    style:{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }
  },
    React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, padding:10, borderBottom:"1px solid #0f1218", flexShrink:0 } },
      React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:13, color:"#b7c5d8", letterSpacing:1 } }, `LOT ${lotIdx+1}/${totalLots} · PICK ORDER`),
      React.createElement("button", { onClick:onAnalyse, style:{ background:"#FFD70014", border:"1px solid #FFD70033",
        color:"#FFD700", borderRadius:6, padding:"3px 9px", cursor:"pointer",
        fontFamily:"'Bebas Neue'", fontSize:11, letterSpacing:1 } }, "📊 ANALYSE")
    ),
    React.createElement("p", { style: { margin: "0 10px 6px", fontFamily: "'Rajdhani'", fontSize: 12, color: "#9baac0" } }, "Order repeats each round. Done teams are skipped."),
    React.createElement("ol", {
      "aria-label": `Lot ${lotIdx + 1} pick order`,
      style:{ display:"flex", flexDirection:"column", gap:8, overflow:"auto", padding:10, margin:0, listStyle:"none", minHeight:0, flex:1 }
    },
    getOrderedParticipants(participants, sequence).map(({ participant: p, colorIndex: i, position }) => {
      const pct = Math.max(0, Math.min(100, (p.budget / (budgetPerBidder || BUDGET)) * 100));
      const barCol = pct > 50 ? "#00FF88" : pct > 25 ? "#FFD700" : "#FF3D71";
      const hasPassed = passedSet?.has(p.name);
      const isPicking = currentTurn === p.name && !hasPassed;

      return React.createElement("li", { key:p.name, "data-participant": p.name, "aria-current": isPicking ? "step" : undefined, style:{
        background:"#0d0f16", borderRadius:9, padding:"9px 11px",
        border:`1px solid ${isPicking ? getParticipantAccent(i)+"66" : hasPassed ? "#0f1015" : "#1a1c22"}`,
        opacity: hasPassed ? .5 : 1,
        boxShadow: isPicking ? `0 0 14px ${getParticipantAccent(i)}22` : "none",
        transition:"all .3s",
      }},
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 } },
          React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:6, minWidth:0 } },
            React.createElement("span", { "aria-label": position === null ? "Pick order pending" : `Pick position ${position}`, style: {
              fontFamily: "'Bebas Neue'", fontSize: 16, color: "#b6c4d7", minWidth: 22, flexShrink: 0,
            } }, position === null ? "—" : `#${position}`),
            React.createElement(TeamBadge, { name: p.name, color: getParticipantAccent(i), size: 22, subtle: true }),
            React.createElement("span", { style:{ fontFamily:"'Exo 2'", fontSize:12, fontWeight:700,
              color: isPicking ? getParticipantAccent(i) : "#ccc", overflowWrap:"anywhere" } }, p.name)
          ),
          React.createElement("div", { style:{ display:"flex", gap:5, alignItems:"center", flexShrink:0, marginLeft:6 } },
            hasPassed && React.createElement(StatusPill, { tone: "red" }, "DONE"),
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
