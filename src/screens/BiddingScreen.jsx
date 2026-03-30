import React, { useCallback } from "react";
import { Toast } from "../components/Toast.jsx";
import { Confetti } from "../components/Confetti.jsx";
import { PlayerRow } from "../components/PlayerRow.jsx";
import { BudgetSidebar } from "../components/BudgetSidebar.jsx";
import { SquadAnalyser } from "../widgets/SquadAnalyser.jsx";
import { BTN } from "../utils/styles.js";
import { sfx } from "../utils/sfx.js";
import { PCOLORS, POS_GROUPS, getPosGroup, TIERS, SQUAD_MAX, getTierData, getTierKey } from "../game/constants.js";
import { apiAbandonSession, apiGetSession, apiUpdateSession } from "../lib/api.js";

export function BiddingScreen({ session: initSession, user, wishlists, onWishlist, onEnd, onAbandon }) {
  const [participants, setParticipants] = React.useState(Array.isArray(initSession?.participants) ? initSession.participants : []);
  const [lotIdx, setLotIdx] = React.useState(initSession.lotIdx || 0);
  const [passedThisLot, setPassedThisLot] = React.useState(new Set(initSession.passedThisLot || []));
  const [turnIdx, setTurnIdx] = React.useState(initSession.turnIdx || 0);
  const [toast, setToast] = React.useState(null);
  const [confetti, setConfetti] = React.useState(false);
  const [analyserOpen, setAnalyserOpen] = React.useState(false);
  const [lotClosing, setLotClosing] = React.useState(Boolean(initSession.lotClosing));
  const [search, setSearch] = React.useState("");
  const [groupFilter, setGroupFilter] = React.useState("ALL");
  const [lotOpen, setLotOpen] = React.useState(Boolean(initSession.lotOpen));
  const lastPickEventRef = React.useRef(initSession.lastPickEvent?.id || null);

  const activeTiers = initSession.tiers || TIERS;
  const activePlayers = initSession.shuffledPlayers || initSession.playerPool || [];
  const lotOrder = Array.isArray(initSession.lotOrder) && initSession.lotOrder.length > 0
    ? initSession.lotOrder
    : [1, 2, 3, 4, 5, 6];
  const sequence = Array.isArray(initSession.sequence) && initSession.sequence.length > 0
    ? initSession.sequence
    : participants.map((p) => p.name);

  const isHost = user.username === initSession.host;
  const currentLotNum = lotOrder[Math.min(lotIdx, lotOrder.length - 1)] || lotOrder[0];
  const lotPlayers = activePlayers.filter(p => p.lot === currentLotNum);

  const ownedIds = new Set(participants.flatMap(p => p.squad.map(pl => pl.id)));
  const availablePlayers = lotPlayers.filter(p => !ownedIds.has(p.id));
  const activePickers = sequence.filter(n => !passedThisLot.has(n));
  const currentPicker = activePickers.length > 0 ? activePickers[turnIdx % Math.max(activePickers.length,1)] : null;
  const currentParticipant = participants.find(p => p.name === currentPicker);

  const showToast = (msg, color="#FFD700") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2400);
  };

  const saveSession = useCallback(async (updatedParticipants, newLotIdx, newTurnIdx, newPassed, status="active", nextLotOpen=lotOpen, nextLotClosing=lotClosing, extras={}) => {
    const updated = {
      ...initSession,
      participants: updatedParticipants,
      lotIdx: newLotIdx,
      turnIdx: newTurnIdx,
      lotOpen: nextLotOpen,
      lotClosing: nextLotClosing,
      passedThisLot: [...newPassed],
      status,
      updatedAt: Date.now(),
      ...extras,
    };
    try {
      await apiUpdateSession(initSession.id, updated, user?.token);
    } catch (err) {
      showToast("Sync failed. Retrying…", "#FF6B35");
    }
  }, [initSession, lotOpen, lotClosing, user?.token]);

  React.useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      let latest = null;
      try {
        latest = await apiGetSession(initSession.id);
      } catch (_err) {
        return;
      }
      if (cancelled || !latest) return;

      setParticipants(latest.participants || []);
      setLotIdx(latest.lotIdx || 0);
      setTurnIdx(latest.turnIdx || 0);
      setPassedThisLot(new Set(latest.passedThisLot || []));
      setLotOpen(Boolean(latest.lotOpen));
      setLotClosing(Boolean(latest.lotClosing));

      const latestPickEventId = latest.lastPickEvent?.id || null;
      if (latestPickEventId && latestPickEventId !== lastPickEventRef.current) {
        lastPickEventRef.current = latestPickEventId;
        setConfetti(true);
        setTimeout(() => setConfetti(false), 2200);
        if (latest.lastPickEvent?.picker && latest.lastPickEvent?.playerName) {
          showToast(`⚽ ${latest.lastPickEvent.picker} picked ${latest.lastPickEvent.playerName}!`, "#00FF88");
        }
      }

      if (latest.status === "complete") {
        onEnd(latest.participants || []);
      }
      if (latest.status === "cancelled") {
        showToast("Game was cancelled by host", "#FF3D71");
        onAbandon();
      }
    };

    syncSession();
    const timer = setInterval(syncSession, 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [initSession.id, onEnd, onAbandon]);

  const closeLot = () => setLotClosing(true);

  const handleOpenLot = () => {
    if (!isHost) return;
    sfx("open");
    setLotOpen(true);
    setLotClosing(false);
    saveSession(participants, lotIdx, turnIdx, passedThisLot, "active", true, false);
    showToast(`🔓 Lot ${currentLotNum} is now open!`, "#FFD700");
  };

  const handlePick = (player) => {
    if (currentPicker !== user.username) return;
    if (!currentPicker || !lotOpen) return;
    const part = participants.find(x => x.name === currentPicker);
    if (!part) return;
    const td = getTierData(player.rating, activeTiers);
    if (part.budget < td.price) { showToast("❌ Not enough budget!", "#FF3D71"); return; }
    if (part.squad.length >= SQUAD_MAX) { showToast("❌ Squad full (max 17)!", "#FF3D71"); return; }

    const currentSplus = part.squad.filter(p => getTierKey(p.rating, activeTiers) === "S+").length;
    if (getTierKey(player.rating, activeTiers) === "S+" && currentSplus >= 2) {
      showToast("❌ Max 2 S+ players per squad!", "#FF3D71"); return;
    }

    sfx("pick");
    setConfetti(true); setTimeout(() => setConfetti(false), 2500);

    const updatedParticipants = participants.map(x => x.name === currentPicker
      ? { ...x, budget: x.budget - td.price, squad: [...x.squad, player] }
      : x
    );
    setParticipants(updatedParticipants);
    showToast(`⚽ ${currentPicker} picks ${player.name}!`, "#00FF88");

    const newPassed = passedThisLot;
    const active = sequence.filter(n => !newPassed.has(n));
    const newAvail = availablePlayers.filter(p => p.id !== player.id);
    const newTurnIdx = active.length > 0 ? (turnIdx + 1) % active.length : 0;
    const pickEvent = {
      id: `${Date.now()}-${player.id}`,
      picker: currentPicker,
      playerId: player.id,
      playerName: player.name,
      at: Date.now(),
    };
    lastPickEventRef.current = pickEvent.id;

    if (active.length === 0 || newAvail.length === 0) {
      setTurnIdx(0);
      setLotOpen(false);
      setLotClosing(true);
      saveSession(updatedParticipants, lotIdx, 0, newPassed, "active", false, true, {
        lastPickEvent: pickEvent,
      });
      setTimeout(closeLot, 300);
      return;
    }
    setTurnIdx(newTurnIdx);
    saveSession(updatedParticipants, lotIdx, newTurnIdx, newPassed, "active", lotOpen, lotClosing, {
      lastPickEvent: pickEvent,
    });
  };

  const handleAbandonClick = async () => {
    try {
      await apiAbandonSession(initSession.id, user?.token);
    } catch (_err) {}
    onAbandon();
  };

  const handlePass = () => {
    if (currentPicker !== user.username) return;
    if (!currentPicker) return;
    sfx("pass");
    const newPassed = new Set([...passedThisLot, currentPicker]);
    setPassedThisLot(newPassed);
    showToast(`${currentPicker} is done for this lot`, "#888");
    const active = sequence.filter(n => !newPassed.has(n));
    if (active.length === 0 || availablePlayers.length === 0) {
      setLotOpen(false);
      setLotClosing(true);
      saveSession(participants, lotIdx, turnIdx, newPassed, "active", false, true);
      closeLot();
      return;
    }
    const newTurnIdx = turnIdx % active.length;
    setTurnIdx(newTurnIdx);
    saveSession(participants, lotIdx, newTurnIdx, newPassed);
  };

  const handleNextLot = () => {
    if (!isHost) return;
    if (lotIdx + 1 >= lotOrder.length) {
      saveSession(participants, lotIdx, 0, new Set(), "complete", false, false);
      onEnd(participants);
    } else {
      sfx("open");
      const newLotIdx = lotIdx + 1;
      setLotIdx(newLotIdx);
      setPassedThisLot(new Set());
      setTurnIdx(0);
      setLotClosing(false);
      setLotOpen(false);
      setSearch("");
      setGroupFilter("ALL");
      saveSession(participants, newLotIdx, 0, new Set(), "active", false, false);
    }
  };

  const displayGroups = groupFilter === "ALL" ? Object.keys(POS_GROUPS) : [groupFilter];
  const filterP = ps => ps.filter(p =>
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.pos.toLowerCase().includes(search.toLowerCase()))
    && (groupFilter === "ALL" || getPosGroup(p.pos) === groupFilter)
  );

  const isAtCap = currentParticipant && currentParticipant.squad.length >= SQUAD_MAX;
  const splusAtMax = currentParticipant && currentParticipant.squad.filter(p => getTierKey(p.rating, activeTiers)==="S+").length >= 2;

  return React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 272px", height:"100vh", background:"#04060a", overflow:"hidden" } },
    React.createElement(Confetti, { active:confetti }),
    toast && React.createElement(Toast, toast),
    analyserOpen && React.createElement(SquadAnalyser, {
      participants,
      wishlists,
      players: activePlayers,
      tiers: activeTiers,
      selectedName: user.username,
      onClose: () => setAnalyserOpen(false),
    }),

    React.createElement("div", { style:{ display:"flex", flexDirection:"column", overflow:"hidden", minHeight:0 } },
      React.createElement("div", { style:{ padding:"10px 16px", borderBottom:"1px solid #0f1218",
        background:"#060810", flexShrink:0 } },
        React.createElement("div", { style:{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 } },
          React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:12 } },
            React.createElement("div", { style:{
              background: lotOpen ? "#FFD70018" : "#0d0f16",
              border:`1px solid ${lotOpen ? "#FFD70044" : "#1e2028"}`,
              borderRadius:7, padding:"5px 14px",
              fontFamily:"'Bebas Neue'", fontSize:20,
              color: lotOpen ? "#FFD700" : "#444", letterSpacing:3
            }}, `LOT ${currentLotNum}`),
            React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } },
              `${lotIdx+1}/${lotOrder.length} · ${availablePlayers.length}/${lotPlayers.length} available`),
            React.createElement("div", { style:{ display:"flex", gap:4 } },
              Object.entries(activeTiers).map(([k,t]) => {
                const cnt = lotPlayers.filter(p => getTierKey(p.rating, activeTiers)===k).length;
                return cnt ? React.createElement("span", { key:k, style:{
                  fontFamily:"'Bebas Neue'", fontSize:11, color:t.color,
                  background:t.bg, border:`1px solid ${t.border}`,
                  borderRadius:4, padding:"2px 6px"
                }}, `${cnt}× ${k}`) : null;
              })
            )
          ),
          React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:10 } },
            React.createElement("button", {
              onClick: handleAbandonClick,
              style:{ ...BTN.ghost, fontSize:11, color:isHost ? "#FF6B35" : "#FFD700", borderColor:isHost ? "#FF6B3544" : "#FFD70044" }
            }, isHost ? "CANCEL GAME" : "ABANDON"),
            !lotClosing && !lotOpen && isHost && React.createElement("button", { onClick:handleOpenLot, style:BTN.gold }, "🔓 OPEN LOT"),
            !lotClosing && lotOpen && currentPicker && React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:8 } },
              isAtCap && React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#FF6B35", fontWeight:700 } }, "SQUAD FULL"),
              splusAtMax && React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#FFD700", fontWeight:700 } }, "S+ MAX"),
              React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#888" } },
                "Picking: ", React.createElement("span", { style:{ color:PCOLORS[Math.max(sequence.indexOf(currentPicker), 0)], fontWeight:700 } }, currentPicker)
              ),
              currentPicker === user.username
                ? React.createElement("button", {
                    onClick:handlePass,
                    style:{ background:"transparent", color:"#FF6B35", border:"1px solid #FF6B3533",
                      borderRadius:7, padding:"5px 12px", fontSize:11, cursor:"pointer",
                      fontFamily:"'Bebas Neue'", letterSpacing:1 }
                  }, "PASS / DONE FOR LOT")
                : React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#555", fontWeight:700 } }, "WAITING FOR PICKER")
            ),
            !lotClosing && !lotOpen && !isHost && React.createElement("span", { style:{
              fontFamily:"'Rajdhani'", fontSize:13, color:"#555", letterSpacing:1 } },
              "⏳ Waiting for host to open lot…"
            )
          )
        ),
        lotOpen && !lotClosing && React.createElement("div", { style:{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" } },
          React.createElement("input", {
            value:search, onChange: e => setSearch(e.target.value),
            placeholder:"Search name or position…",
            style:{ background:"#0d0f16", border:"1px solid #1e2028", borderRadius:7,
              padding:"6px 12px", color:"#fff", fontSize:13, fontFamily:"'Exo 2'",
              outline:"none", width:190 }
          }),
          ["ALL",...Object.keys(POS_GROUPS)].map(g =>
            React.createElement("button", { key:g, onClick: () => setGroupFilter(g), style:{
              background: groupFilter===g ? (g==="ALL" ? "#FFD700" : POS_GROUPS[g]?.color) : "#0d0f16",
              color: groupFilter===g ? "#000" : "#666",
              border:`1px solid ${groupFilter===g ? (g==="ALL" ? "#FFD700" : POS_GROUPS[g]?.color) : "#1e2028"}`,
              borderRadius:6, padding:"5px 10px", cursor:"pointer",
              fontFamily:"'Bebas Neue'", fontSize:12, letterSpacing:1
            }}, g==="ALL" ? "ALL" : POS_GROUPS[g].label)
          )
        )
      ),

      !lotOpen && !lotClosing && React.createElement("div", { style:{ flex:1, display:"flex", alignItems:"center",
        justifyContent:"center", flexDirection:"column", gap:16, animation:"fadeIn .4s ease" } },
        React.createElement("div", { style:{ fontSize:60 } }, "🔒"),
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:36, color:"#333", letterSpacing:3 } }, `LOT ${currentLotNum} NOT YET OPEN`),
        React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:14, color:"#444" } },
          isHost ? "You are the host — click 'OPEN LOT' above to reveal the players" : "Waiting for host to open this lot…"
        )
      ),

      lotClosing && React.createElement("div", { style:{ flex:1, display:"flex", alignItems:"center",
        justifyContent:"center", flexDirection:"column", gap:18, animation:"fadeIn .4s ease" } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:58, color:"#FFD700",
          letterSpacing:4, textShadow:"0 0 40px #FFD70055" } }, `LOT ${currentLotNum} CLOSED`),
        React.createElement("p", { style:{ fontFamily:"'Rajdhani'", fontSize:14, color:"#666" } },
          `${availablePlayers.length} player${availablePlayers.length!==1?"s":""} unclaimed`),
        isHost && React.createElement("button", { style:BTN.gold, onClick:handleNextLot },
          lotIdx+1 < lotOrder.length
            ? `OPEN LOT ${lotOrder[lotIdx+1]} →`
            : "🏆 FINAL SQUADS"
        ),
        !isHost && React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, "⏳ Waiting for host…")
      ),

      lotOpen && !lotClosing && React.createElement("div", { style:{ flex:1, overflow:"auto", padding:"12px 16px", minHeight:0 } },
        displayGroups.map(gk => {
          const pg = POS_GROUPS[gk];
          const players = filterP(lotPlayers.filter(p => getPosGroup(p.pos)===gk));
          if (!players.length) return null;
          return React.createElement("div", { key:gk, style:{ marginBottom:14 } },
            React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:8, marginBottom:6 } },
              React.createElement("div", { style:{ width:3, height:13, borderRadius:2, background:pg.color } }),
              React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:12, color:pg.color, letterSpacing:3 } }, pg.label),
              React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:10, color:"#333" } },
                `${players.filter(p=>!ownedIds.has(p.id)).length} available`)
            ),
            players.map((p, i) => {
              const owned = ownedIds.has(p.id);
              const owner = owned ? participants.find(x => x.squad.some(s => s.id===p.id)) : null;
              const ownerIdx = owner ? participants.findIndex(x => x.name===owner.name) : -1;
              const cantAfford = !owned && currentParticipant && getTierData(p.rating, activeTiers).price > currentParticipant.budget;
              const splusPick = !owned && getTierKey(p.rating, activeTiers)==="S+" && splusAtMax;
              const canPick = !owned && lotOpen && !lotClosing && currentPicker === user.username && !cantAfford && !isAtCap && !splusPick;
              const wl = (wishlists[currentPicker||""]||[]).includes(p.id);
              return React.createElement(PlayerRow, {
                key:p.id, player:p,
                onPick: canPick ? handlePick : null,
                owned, ownerName:owner?.name,
                ownerColor: ownerIdx>=0 ? PCOLORS[ownerIdx] : "#888",
                cantAfford: (cantAfford || splusPick) && !owned,
                isWishlist: wl,
                onWishlist: id => onWishlist(currentPicker||user.username, id),
                tiers: activeTiers,
                animDelay: i*.02
              });
            })
          );
        }),
        filterP(lotPlayers).length===0 && React.createElement("div", {
          style:{ textAlign:"center", padding:"40px 0", color:"#333",
            fontFamily:"'Rajdhani'", fontSize:14 } }, "No players match your filter")
      )
    ),

    React.createElement("div", { style:{ borderLeft:"1px solid #0f1218", background:"#060810",
      display:"flex", flexDirection:"column", overflow:"hidden", minHeight:0, width:272 } },
      React.createElement("div", { style:{ flex:1, overflow:"auto", minHeight:0 } },
        React.createElement(BudgetSidebar, {
          participants,
          currentTurn:currentPicker,
          passedSet:passedThisLot,
          onAnalyse: () => setAnalyserOpen(true),
          lotIdx,
          totalLots:lotOrder.length,
          tiers: activeTiers,
        })
      ),
      React.createElement("div", { style:{ borderTop:"1px solid #0f1218", padding:"8px 10px", flexShrink:0 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:"#333", letterSpacing:3, marginBottom:5 } }, "RECENT"),
        React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:2, maxHeight:120, overflowY:"auto" } },
          participants.flatMap(p => p.squad.map(pl => ({ ...pl, owner:p.name, ownerIdx:participants.findIndex(x=>x.name===p.name) })))
            .sort((a,b) => b.id-a.id).slice(0,6).map((pl, i) => {
            const td = getTierData(pl.rating, activeTiers);
            return React.createElement("div", { key:i, style:{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"3px 6px", background:"#0a0c10", borderRadius:4
            }},
              React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:10, color:"#bbb", fontWeight:600,
                maxWidth:88, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" } }, pl.name.split(" ").pop()),
              React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:PCOLORS[pl.ownerIdx], flex:1, textAlign:"center" } }, pl.owner),
              React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:td.color } }, `${td.price}M`)
            );
          })
        )
      )
    )
  );
}
