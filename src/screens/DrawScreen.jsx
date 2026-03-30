import React from "react";
import { BTN } from "../utils/styles.js";
import { sfx } from "../utils/sfx.js";
import { apiGetSession, apiUpdateSession } from "../lib/api.js";
import { PCOLORS } from "../game/constants.js";

export function DrawScreen({ session, onComplete, onAbandon, user }) {
  const [liveSession, setLiveSession] = React.useState(session);
  const cols = ["#FFD700","#4FC3F7","#FF6B35","#00FF88","#FF3D71","#C084FC"];
  const isHost = !!user && liveSession.host === user.username;

  React.useEffect(() => {
    setLiveSession(session);
  }, [session]);

  React.useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      try {
        const latest = await apiGetSession(session.id);
        if (!latest || cancelled) return;
        setLiveSession(latest);
        if (latest.status === "active") {
          onComplete();
        }
        if (latest.status === "cancelled") {
          onAbandon();
        }
      } catch (_err) {}
    };

    syncSession();
    const timer = setInterval(syncSession, 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session.id, onComplete, onAbandon]);

  const phase = Number(liveSession.drawPhase || 0);
  const shown = phase === 0
    ? liveSession.lotOrder.slice(0, Number(liveSession.revealedLotCount || 0))
    : liveSession.sequence.slice(0, Number(liveSession.revealedPickCount || 0));

  const persistDrawState = async (patch) => {
    if (!isHost) return;
    await apiUpdateSession(liveSession.id, {
      ...liveSession,
      ...patch,
      status: "draw",
      updatedAt: Date.now(),
    }, user?.token);
  };

  const next = async () => {
    if (!isHost) return;
    sfx("reveal");
    if (phase === 0) {
      const nextCount = Math.min(shown.length + 1, liveSession.lotOrder.length);
      await persistDrawState({ revealedLotCount: nextCount });
      if (nextCount === liveSession.lotOrder.length) {
        setTimeout(() => {
          persistDrawState({ drawPhase: 1, revealedPickCount: 0 });
        }, 600);
      }
    } else {
      const nextCount = Math.min(shown.length + 1, liveSession.sequence.length);
      await persistDrawState({ revealedPickCount: nextCount });
    }
  };

  const done = phase===1 && shown.length===liveSession.sequence.length;

  const startBidding = async () => {
    if (!isHost) return;
    await apiUpdateSession(liveSession.id, {
      ...liveSession,
      status: "active",
      updatedAt: Date.now(),
    }, user?.token);
    onComplete();
  };

  return React.createElement("div", {
    style:{ minHeight:"100vh", background:"#04060a", display:"flex", alignItems:"center",
      justifyContent:"center", padding:20 }
  },
    React.createElement("div", { style:{ width:"100%", maxWidth:560, textAlign:"center", animation:"fadeUp .4s ease" } },
      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:46, color:"#fff", letterSpacing:4, marginBottom:6 } },
        phase===0 ? "LOT ORDER" : "PICK SEQUENCE"),
      React.createElement("p", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555", letterSpacing:2, marginBottom:22 } },
        phase===0 ? "Host reveals each lot position" : "First-pick order per lot"),

      React.createElement("div", { style:{ display:"flex", justifyContent:"center", gap:8, marginBottom:14, flexWrap:"wrap" } },
        liveSession.participants?.map((p, i) =>
          React.createElement("span", { key:p.name, style:{
            fontFamily:"'Rajdhani'", fontSize:11, color:PCOLORS[i % PCOLORS.length],
            background:"#0d0f16", border:"1px solid #1e2230", borderRadius:999,
            padding:"4px 10px"
          } }, p.name)
        )
      ),

      phase===0 && React.createElement("div", { style:{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap", marginBottom:22 } },
        liveSession.lotOrder.map((lot, i) =>
          i < shown.length
            ? React.createElement("div", { key:i, style:{
                width:58, height:58, borderRadius:10, background:cols[i],
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                color:"#000", animation:"flipCard .4s ease both", fontFamily:"'Bebas Neue'"
              }},
                React.createElement("span", { style:{ fontSize:9, letterSpacing:1 } }, "LOT"),
                React.createElement("span", { style:{ fontSize:26, lineHeight:1 } }, lot)
              )
            : React.createElement("div", { key:i, style:{ width:58, height:58, borderRadius:10,
                background:"#0d0f16", border:"2px dashed #1e2028" } })
        )
      ),

      phase===1 && React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:7, marginBottom:22 } },
        liveSession.sequence.map((name, i) =>
          i < shown.length
            ? React.createElement("div", { key:i, style:{
                display:"flex", alignItems:"center", gap:12,
                background:"#0d0f16", border:`1px solid ${PCOLORS[i]}44`,
                borderRadius:9, padding:"10px 14px", animation:"slideR .4s ease both"
              }},
                React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:20, color:PCOLORS[i], width:28 } }, `#${i+1}`),
                React.createElement("span", { style:{ fontFamily:"'Exo 2'", fontSize:15, fontWeight:700, color:"#fff" } }, name),
                i===0 && React.createElement("span", { style:{ marginLeft:"auto", fontFamily:"'Rajdhani'", fontSize:10,
                  color:"#FFD700", fontWeight:700, letterSpacing:1 } }, "OPENS FIRST")
              )
            : null
        )
      ),

      !done
        ? isHost
          ? React.createElement("button", { style:BTN.gold, onClick:next },
              phase===0
                ? shown.length===0 ? "REVEAL LOT 1" : `REVEAL LOT ${shown.length+1}`
                : shown.length===0 ? "REVEAL PICKS" : `REVEAL #${shown.length+1}`
            )
          : React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, "⏳ Waiting for host reveal…")
        : isHost
          ? React.createElement("button", { style:BTN.gold, onClick:startBidding }, "START BIDDING 🔥")
          : React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, "⏳ Waiting for host to start bidding…"),

      React.createElement("div", { style:{ marginTop:14 } },
        React.createElement("button", {
          onClick: onAbandon,
          style:{ ...BTN.ghost, fontSize:11 }
        }, isHost ? "CANCEL GAME" : "ABANDON GAME")
      )
    )
  );
}
