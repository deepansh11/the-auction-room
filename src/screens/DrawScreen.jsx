import React from "react";
import { BTN } from "../utils/styles.js";
import { sfx } from "../utils/sfx.js";
import { apiGetSession, apiUpdateSession } from "../lib/api.js";
import { subscribeToSessionStream } from "../lib/realtime.js";
import { PCOLORS } from "../game/constants.js";
import { shuffleArray } from "../utils/random.js";

export function DrawScreen({ session, onComplete, onAbandon, user }) {
  const [liveSession, setLiveSession] = React.useState(session);
  const syncNowRef = React.useRef(() => {});
  const cols = ["#FFD700","#4FC3F7","#FF6B35","#00FF88","#FF3D71","#C084FC"];
  const isHost = !!user && liveSession.host === user.username;

  React.useEffect(() => {
    setLiveSession(session);
  }, [session]);

  React.useEffect(() => {
    let cancelled = false;
    let timerId = null;
    let failCount = 0;
    const BASE_POLL_MS = 9000;
    const HIDDEN_POLL_MS = 15000;
    const BACKOFF_MS = [3000, 5000, 8000];

    const applyLatest = (latest) => {
      if (!latest || cancelled) return;
      setLiveSession(latest);
      if (latest.status === "active") {
        onComplete();
      }
      if (latest.status === "cancelled") {
        onAbandon();
      }
    };

    const schedule = (ms) => {
      if (cancelled) return;
      const jitter = Math.floor(Math.random() * 161) - 80;
      timerId = setTimeout(() => {
        syncSession(false);
      }, Math.max(350, ms + jitter));
    };

    const syncSession = async (force = false) => {
      if (cancelled) return;
      if (!force && typeof document !== "undefined" && document.hidden) {
        schedule(HIDDEN_POLL_MS);
        return;
      }

      try {
        const latest = await apiGetSession(session.id);
        if (!latest || cancelled) return;
        failCount = 0;
        applyLatest(latest);
        schedule(BASE_POLL_MS);
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("404") || msg.includes("not found")) {
          onAbandon();
          return;
        }
        failCount = Math.min(failCount + 1, BACKOFF_MS.length);
        schedule(BACKOFF_MS[failCount - 1] || 5000);
      }
    };

    syncNowRef.current = () => {
      failCount = 0;
      if (timerId) clearTimeout(timerId);
      syncSession(true);
    };

    const onFocus = () => syncNowRef.current?.();
    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        syncNowRef.current?.();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    const unsubscribeStream = subscribeToSessionStream(session.id, {
      onUpdate: (next) => {
        failCount = 0;
        applyLatest(next);
      },
      onClosed: (next, reason) => {
        if (reason === "cancelled") {
          onAbandon();
          return;
        }
        applyLatest(next);
      },
      onReconnect: () => {
        syncNowRef.current?.();
      },
    });

    syncSession(true);

    return () => {
      cancelled = true;
      unsubscribeStream();
      if (timerId) clearTimeout(timerId);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [session.id, onComplete, onAbandon]);

  const phase = Number(liveSession.drawPhase || 0);
  const shown = phase === 0
    ? liveSession.lotOrder.slice(0, Number(liveSession.revealedLotCount || 0))
    : liveSession.sequence.slice(0, Number(liveSession.revealedPickCount || 0));
  const lotRevealComplete = phase === 0 && shown.length >= (liveSession.lotOrder?.length || 0);

  const persistDrawState = async (patch) => {
    if (!isHost) return;
    await apiUpdateSession(liveSession.id, {
      ...liveSession,
      ...patch,
      status: "draw",
      updatedAt: Date.now(),
    }, user?.token);
    syncNowRef.current?.();
  };

  const next = async () => {
    if (!isHost) return;
    sfx("reveal");
    if (phase === 0) {
      if (shown.length >= liveSession.lotOrder.length) return;
      const nextCount = Math.min(shown.length + 1, liveSession.lotOrder.length);
      await persistDrawState({ revealedLotCount: nextCount });
      if (nextCount === liveSession.lotOrder.length) {
        setTimeout(() => {
          const randomSequence = shuffleArray((liveSession.sequence || []));
          persistDrawState({ drawPhase: 1, revealedPickCount: 0, sequence: randomSequence });
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
    syncNowRef.current?.();
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
          ? lotRevealComplete
            ? React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, "Preparing pick sequence…")
            : React.createElement("button", { style:BTN.gold, onClick:next },
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
