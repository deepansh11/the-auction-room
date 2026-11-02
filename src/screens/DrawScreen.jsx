import React from "react";
import { BTN } from "../utils/styles.js";
import { sfx } from "../utils/sfx.js";
import { submitSessionAction } from "../lib/realtime.js";
import { useSessionRealtime } from "../lib/useSessionRealtime.js";
import { PCOLORS } from "../game/constants.js";
import { TeamBadge, getParticipantAccent } from "../theme/footballTheme.js";

export function DrawScreen({ session, onComplete, onAbandon, user }) {
  const [liveSession, setLiveSession] = React.useState(session);
  const isHost = !!user && liveSession.host === user.username;
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    setLiveSession(session);
  }, [session]);

  useSessionRealtime(session.id, user, {
    onUpdate: latest => { setLiveSession(latest); if (latest.status === "active") onComplete(latest); },
    onClosed: () => onAbandon(),
    onError: error => setError(error.message),
  });

  const participantNames = Array.isArray(liveSession.participantNames) && liveSession.participantNames.length > 0
    ? liveSession.participantNames
    : (Array.isArray(liveSession.participants) ? liveSession.participants.map((participant) => participant.name) : []);
  const totalCount = participantNames.length || liveSession.participants?.length || 0;
  const shown = Array.isArray(liveSession.sequence) ? liveSession.sequence : [];
  const participantAccentMap = new Map(
    participantNames.map((name, index) => [name, getParticipantAccent(index)])
  );
  const participantStripNames = participantNames.length > 0 && participantNames.every((name, index) => name === shown[index])
    ? [...participantNames].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    : participantNames;

  const runAction = async type => {
    if (!isHost || pending) return;
    setPending(true);
    setError("");
    try { await submitSessionAction(liveSession.id, { type }, user.token, Number(liveSession.revision || 0)); }
    catch (error) { setError(error.message); }
    finally { setPending(false); }
  };
  const next = () => runAction("reveal-draw");

  const done = shown.length===totalCount;

  const startBidding = () => runAction("start");

  return React.createElement("div", {
    style:{ minHeight:"100vh", background:"transparent", display:"flex", alignItems:"center",
      justifyContent:"center", padding:20 }
  },
    React.createElement("div", { style:{ width:"100%", maxWidth:560, textAlign:"center", animation:"fadeUp .4s ease" } },
      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:46, color:"#fff", letterSpacing:4, marginBottom:6 } },
        "PICK SEQUENCE"),
      React.createElement("p", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555", letterSpacing:2, marginBottom:22 } },
        "The host reveals the first-pick order while lot numbers stay in normal order."),
      liveSession.roomCode && React.createElement("div", { style:{
        display:"inline-block",
        background:"#0d0f16",
        border:"1px solid #1e2230",
        borderRadius:8,
        padding:"6px 12px",
        marginBottom:14,
        fontFamily:"'Bebas Neue'",
        fontSize:14,
        letterSpacing:2,
        color:"#FFD700"
      } }, `ROOM ${liveSession.roomCode}`),

      React.createElement("div", { style:{ display:"flex", justifyContent:"center", gap:8, marginBottom:14, flexWrap:"wrap" } },
        participantStripNames.map((name) =>
          React.createElement("span", { key:name, style:{
            fontFamily:"'Rajdhani'", fontSize:11, color:participantAccentMap.get(name) || "#8fe7c0",
            background:"#0d0f16", border:`1px solid ${(participantAccentMap.get(name) || "#8fe7c0")}44`, borderRadius:999,
            padding:"4px 10px", display:"inline-flex", alignItems:"center", gap:6
          } },
            React.createElement(TeamBadge, { name, color: participantAccentMap.get(name) || "#8fe7c0", size: 20, subtle: true }),
            name
          )
        )
      ),

      React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:7, marginBottom:22 } },
        Array.from({ length: totalCount }, (_, i) =>
          i < shown.length
            ? React.createElement("div", { key:i, style:{
                display:"flex", alignItems:"center", gap:12,
              background:"#0d0f16", border:`1px solid ${(participantAccentMap.get(shown[i]) || getParticipantAccent(i))}44`,
                borderRadius:9, padding:"10px 14px", animation:"slideR .4s ease both"
              }},
              React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:20, color:participantAccentMap.get(shown[i]) || getParticipantAccent(i), width:28 } }, `#${i+1}`),
                React.createElement("span", { style:{ fontFamily:"'Exo 2'", fontSize:15, fontWeight:700, color:"#fff" } }, shown[i]),
                i===0 && React.createElement("span", { style:{ marginLeft:"auto", fontFamily:"'Rajdhani'", fontSize:10,
                  color:"#FFD700", fontWeight:700, letterSpacing:1 } }, "OPENS FIRST")
              )
            : React.createElement("div", { key:i, style:{
                display:"flex", alignItems:"center", gap:12,
                background:"#0d0f16", border:"1px dashed #1e2230",
                borderRadius:9, padding:"10px 14px", opacity:0.6
              }},
              React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:20, color:"#5b677c", width:28 } }, `#${i+1}`),
              React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#5b677c" } }, "Hidden until revealed")
            )
        )
      ),

      !done
        ? isHost
          ? React.createElement("button", { style:BTN.gold, onClick:next, disabled:pending },
              shown.length===0 ? "REVEAL PICKS" : `REVEAL #${shown.length+1}`
            )
          : React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, "⏳ Waiting for host reveal…")
        : isHost
          ? React.createElement("button", { style:BTN.gold, onClick:startBidding, disabled:pending }, "START BIDDING 🔥")
          : React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, "⏳ Waiting for host to start bidding…"),

      error && React.createElement("div", { style:{ color:"#FF6B35", marginTop:10 } }, error),
      React.createElement("div", { style:{ marginTop:14 } },
        React.createElement("button", {
          onClick: onAbandon,
          style:{ ...BTN.ghost, fontSize:11 }
        }, isHost ? "CANCEL GAME" : "ABANDON GAME")
      )
    )
  );
}
