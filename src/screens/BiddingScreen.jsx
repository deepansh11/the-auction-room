import React, { useCallback } from "react";
import { Toast } from "../components/Toast.jsx";
import { PlayerRow } from "../components/PlayerRow.jsx";
import { loadPlayersFromCsv } from "../data/csvPlayerLoader.js";
import { BudgetSidebar } from "../components/BudgetSidebar.jsx";
import { MysteryCard, MysteryScratchModal } from "../components/MysteryCard.jsx";
import { SquadAnalyser } from "../widgets/SquadAnalyser.jsx";
import { BTN } from "../utils/styles.js";
import { sfx } from "../utils/sfx.js";
import { PCOLORS, POS_GROUPS, getPosGroup, TIERS, SQUAD_MAX, LOTS, MYSTERY_CARD_PRICE, getTierData, getTierKey } from "../game/constants.js";
import { apiAbandonSession, apiGetSession, apiUpdateSession, apiReadmitPlayer } from "../lib/api.js";
import { subscribeToSessionStream } from "../lib/realtime.js";
import { rotateArray } from "../utils/random.js";
import { trackEvent } from "../lib/analytics.js";

export function BiddingScreen({ session: initSession, user, wishlists, onWishlist, onEnd, onAbandon }) {
  const baseSessionRef = React.useRef(initSession);
  const [participants, setParticipants] = React.useState(Array.isArray(initSession?.participants) ? initSession.participants : []);
  const [lotIdx, setLotIdx] = React.useState(initSession.lotIdx || 0);
  const [passedThisLot, setPassedThisLot] = React.useState(new Set(initSession.passedThisLot || []));
  const [turnIdx, setTurnIdx] = React.useState(initSession.turnIdx || 0);
  const [sequence, setSequence] = React.useState(Array.isArray(initSession?.sequence) ? initSession.sequence : []);
  const [lotOrder, setLotOrder] = React.useState(
    Array.isArray(initSession?.lotOrder) && initSession.lotOrder.length > 0 ? initSession.lotOrder : [1, 2, 3, 4, 5, 6]
  );
  const [activePlayers, setActivePlayers] = React.useState(initSession.shuffledPlayers || initSession.playerPool || []);
  const [activeTiers, setActiveTiers] = React.useState(initSession.tiers || TIERS);
  const [playerFaceMap, setPlayerFaceMap] = React.useState(new Map());
  const [playerDataMap, setPlayerDataMap] = React.useState(new Map());
  const [toast, setToast] = React.useState(null);
  const [analyserOpen, setAnalyserOpen] = React.useState(false);
  const [lotClosing, setLotClosing] = React.useState(Boolean(initSession.lotClosing));
  const [search, setSearch] = React.useState("");
  const [groupFilter, setGroupFilter] = React.useState("ALL");
  const [lotOpen, setLotOpen] = React.useState(Boolean(initSession.lotOpen));
  const [actionPending, setActionPending] = React.useState(false);
  const [actionLabel, setActionLabel] = React.useState("");
  const [actionKind, setActionKind] = React.useState("idle");
  const [showWaitingOverlayDebounced, setShowWaitingOverlayDebounced] = React.useState(false);
  const [roomCode, setRoomCode] = React.useState(initSession.roomCode || "");
  const [mysteryEnabled, setMysteryEnabled] = React.useState(Boolean(initSession.mysteryEnabled));
  const [mysteryCurrent, setMysteryCurrent] = React.useState(initSession.mysteryCurrent || {});
  const [mysteryUsed, setMysteryUsed] = React.useState(initSession.mysteryUsed || {});
  const [mysteryModalOpen, setMysteryModalOpen] = React.useState(false);
  const [mysteryDisclaimerOpen, setMysteryDisclaimerOpen] = React.useState(false);
  const [abandonedBy, setAbandonedBy] = React.useState(Array.isArray(initSession?.abandonedBy) ? initSession.abandonedBy : []);
  const [readmitOpen, setReadmitOpen] = React.useState(false);
  const [readmitPending, setReadmitPending] = React.useState(false);
  const lastPickEventRef = React.useRef(initSession.lastPickEvent?.id || null);
  const syncNowRef = React.useRef(() => {});
  const lastAutoSkippedRef = React.useRef(null);
  const saveSessionRef = React.useRef(null);


  // Load face URL map from CSV so images show for all users regardless of what's in Firestore
  React.useEffect(() => {
    (async () => {
      try {
        const csvPlayers = await loadPlayersFromCsv();
        const dataMap = new Map();
        const map = new Map();
        csvPlayers.forEach((p) => {
          dataMap.set(p.id, p);
          if (p.playerFaceUrl) map.set(p.id, p.playerFaceUrl);
        });
        setPlayerDataMap(dataMap);
        setPlayerFaceMap(map);
      } catch (_) {}
    })();
  }, []);

  const hydratePlayers = React.useCallback((players) => {
    if (!Array.isArray(players)) return [];

    return players.map((player) => {
      const base = playerDataMap.get(player?.id);
      if (!base) return player;

      // Keep server authoritative values where available and fill missing details from CSV.
      const resolvedName = String(player?.name || "").trim().toLowerCase() === "unknown"
        ? base.name
        : player.name;

      const resolvedLot = Number.isFinite(Number(player?.lot)) ? Number(player?.lot) : Number(base?.lot);
      return {
        ...base,
        ...player,
        name: resolvedName || base.name,
        lot: normalizeLotValue(resolvedLot) || 1,
      };
    });
    // ensure at least a lot exists in all entries
  }, [playerDataMap]);

  React.useEffect(() => {
    if (playerDataMap.size === 0) return;
    setActivePlayers((prev) => hydratePlayers(prev));
  }, [playerDataMap, hydratePlayers]);

  const normalizeLotValue = (lot) => {
    const numeric = Number(lot);
    const totalLots = lotOrder.length || LOTS;
    if (!Number.isFinite(numeric) || numeric < 1 || numeric > totalLots) {
      return null;
    }
    return Math.floor(numeric);
  };

  const normalizePlayersLot = (players) => {
    if (!Array.isArray(players)) return [];
    const totalLots = lotOrder.length || LOTS;

    // if at least one player has a valid lot, keep as-is, otherwise fallback assign evenly by index.
    const hasValidLot = players.some((p) => normalizeLotValue(p.lot) !== null);
    if (hasValidLot) {
      return players.map((p) => ({
        ...p,
        lot: normalizeLotValue(p.lot) ?? 1,
      }));
    }

    return players.map((player, index) => ({
      ...player,
      lot: (index % totalLots) + 1,
    }));
  };

  // Enrich a player object with face URL from the CSV cache if session data is missing it
  const enrichPlayer = React.useCallback((p) => {
    if (p.playerFaceUrl || playerFaceMap.size === 0) return p;
    const url = playerFaceMap.get(p.id);
    return url ? { ...p, playerFaceUrl: url } : p;
  }, [playerFaceMap]);

  const isHost = user.username === initSession.host;
  const currentLotNum = lotOrder[Math.min(lotIdx, lotOrder.length - 1)] || lotOrder[0];
  const lotPlayers = activePlayers.filter(p => p.lot === currentLotNum).map(enrichPlayer);

  const ownedIds = new Set(participants.flatMap(p => p.squad.map(pl => pl.id)));
  const availablePlayers = lotPlayers.filter(p => !ownedIds.has(p.id));
  const activePickers = sequence.filter(n => !passedThisLot.has(n));
  const currentPickerKey = activePickers.length > 0 ? activePickers[turnIdx % Math.max(activePickers.length,1)] : null;
  const currentPickerSeqIdx = sequence.findIndex((name) => name === currentPickerKey);
  const currentPickerName = (() => {
    if (!currentPickerKey) return null;
    if (participants.some((p) => p.name === currentPickerKey)) return currentPickerKey;
    if (currentPickerSeqIdx >= 0 && participants[currentPickerSeqIdx]?.name) return participants[currentPickerSeqIdx].name;
    return currentPickerKey;
  })();
  const currentParticipant = participants.find((p) => p.name === currentPickerName)
    || participants.find((p) => p.name === currentPickerKey)
    || null;
  const userCanAct = Boolean(currentPickerName && currentPickerName === user.username);

  const myParticipant = participants.find((p) => p.name === user.username) || null;
  const myMysteryUsed = Boolean(mysteryUsed?.[user.username]);
  const myMysteryCandidateId = mysteryCurrent?.[user.username];
  const myMysteryCandidate = myMysteryCandidateId != null
    ? (playerDataMap.get(myMysteryCandidateId) || activePlayers.find((p) => p.id === myMysteryCandidateId) || null)
    : null;
  // The backend never sends anyone's Mystery Card pool contents to any client — the server tells
  // us whether we have a candidate available at all (mysteryCurrent[user.username]), that's all
  // a client should ever know or need to know.
  const myMysteryAffordable = Boolean(myParticipant) && Number(myParticipant.budget || 0) >= MYSTERY_CARD_PRICE;
  const myMysterySquadHasRoom = Boolean(myParticipant) && myParticipant.squad.length < SQUAD_MAX;
  // Mystery card is only available on your own turn while the lot is open.
  const mysteryAvailable = Boolean(
    mysteryEnabled && !myMysteryUsed && myMysteryCandidate
    && myMysteryAffordable && myMysterySquadHasRoom
    && lotOpen && !lotClosing && userCanAct
  );

  const showToast = (msg, color="#FFD700") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2400);
  };

  const beginActionLock = (label, kind = "generic") => {
    if (actionPending) return false;
    setActionPending(true);
    setActionLabel(label || "Syncing action…");
    setActionKind(kind);
    return true;
  };

  const endActionLock = () => {
    setActionPending(false);
    setActionLabel("");
    setActionKind("idle");
  };

  const saveSession = useCallback(async (
    updatedParticipants,
    newLotIdx,
    newTurnIdx,
    newPassed,
    status = "active",
    nextLotOpen = lotOpen,
    nextLotClosing = lotClosing,
    extras = {},
    nextSequence = sequence,
    nextLotOrder = lotOrder
  ) => {
    const base = baseSessionRef.current || initSession;
    const updated = {
      ...base,
      participants: updatedParticipants,
      lotIdx: newLotIdx,
      turnIdx: newTurnIdx,
      lotOpen: nextLotOpen,
      lotClosing: nextLotClosing,
      sequence: nextSequence,
      lotOrder: nextLotOrder,
      tiers: activeTiers,
      passedThisLot: [...newPassed],
      status,
      mysteryUsed,
      updatedAt: Date.now(),
      ...extras,
    };
    try {
      await apiUpdateSession(initSession.id, updated, user?.token);
      baseSessionRef.current = updated;
      syncNowRef.current?.();
      return true;
    } catch (err) {
      showToast("Sync failed. Retrying…", "#FF6B35");
      return false;
    }
  }, [initSession, lotOpen, lotClosing, user?.token, sequence, lotOrder, activePlayers, activeTiers, mysteryUsed]);

  React.useEffect(() => {
    let cancelled = false;
    let timerId = null;
    let failCount = 0;
    const BASE_POLL_MS = 9000;
    const HIDDEN_POLL_MS = 15000;
    const BACKOFF_MS = [3000, 5000, 8000];

    const applyLatest = (latest) => {
      if (!latest || cancelled) return;

      baseSessionRef.current = latest;

      setParticipants(latest.participants || []);
      setLotIdx(latest.lotIdx || 0);
      setTurnIdx(latest.turnIdx || 0);
      setPassedThisLot(new Set(latest.passedThisLot || []));
      setLotOpen(Boolean(latest.lotOpen));
      setLotClosing(Boolean(latest.lotClosing));
      setSequence(Array.isArray(latest.sequence) ? latest.sequence : []);
      setLotOrder(Array.isArray(latest.lotOrder) && latest.lotOrder.length > 0 ? latest.lotOrder : [1, 2, 3, 4, 5, 6]);
      setActivePlayers(normalizePlayersLot(hydratePlayers(latest.shuffledPlayers || latest.playerPool || [])));
      setActiveTiers(latest.tiers || TIERS);
      setRoomCode(latest.roomCode || "");
      setMysteryEnabled(Boolean(latest.mysteryEnabled));
      setMysteryCurrent(latest.mysteryCurrent || {});
      setMysteryUsed(latest.mysteryUsed || {});
      setAbandonedBy(Array.isArray(latest.abandonedBy) ? latest.abandonedBy : []);

      const latestPickEventId = latest.lastPickEvent?.id || null;
      if (latestPickEventId && latestPickEventId !== lastPickEventRef.current) {
        lastPickEventRef.current = latestPickEventId;
        if (latest.lastPickEvent?.picker && latest.lastPickEvent?.playerName) {
          if (latest.lastPickEvent?.viaMystery) {
            showToast(`🎴 ${latest.lastPickEvent.picker} revealed ${latest.lastPickEvent.playerName} via Mystery Card!`, "#FFD700");
          } else {
            showToast(`⚽ ${latest.lastPickEvent.picker} picked ${latest.lastPickEvent.playerName}!`, "#00FF88");
          }
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

      let latest = null;
      try {
        latest = await apiGetSession(initSession.id, user?.token);
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("404") || msg.includes("not found")) {
          if (cancelled) return;
          // Retry once after 5 seconds — handles transient server blips where the session
          // exists but briefly returned 404. If it still fails, treat as game ended.
          showToast("⚠️ Connection lost, retrying…", "#FF6B35");
          setTimeout(async () => {
            if (cancelled) return;
            try {
              const retry = await apiGetSession(initSession.id, user?.token);
              if (retry && !cancelled) {
                failCount = 0;
                applyLatest(retry);
                schedule(BASE_POLL_MS);
              } else if (!cancelled) {
                showToast("Game has ended", "#FF3D71");
                onAbandon();
              }
            } catch (_) {
              if (!cancelled) {
                showToast("Game has ended", "#FF3D71");
                onAbandon();
              }
            }
          }, 5000);
          return;
        }
        failCount = Math.min(failCount + 1, BACKOFF_MS.length);
        schedule(BACKOFF_MS[failCount - 1] || 5000);
        return;
      }
      if (cancelled || !latest) return;
      failCount = 0;
      applyLatest(latest);

      schedule(BASE_POLL_MS);
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

    const unsubscribeStream = subscribeToSessionStream(initSession.id, {
      onUpdate: (next) => {
        failCount = 0;
        applyLatest(next);
      },
      onClosed: (next, reason) => {
        if (reason === "complete") {
          onEnd(next?.participants || baseSessionRef.current?.participants || []);
          return;
        }
        showToast("Game was cancelled by host", "#FF3D71");
        onAbandon();
      },
      onReconnect: () => {
        syncNowRef.current?.();
      },
    }, user.username);

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
  }, [initSession.id, onEnd, onAbandon, hydratePlayers, user.username, user?.token]);

  // Always keep saveSessionRef pointing at the latest saveSession closure
  React.useEffect(() => { saveSessionRef.current = saveSession; });

  // Auto-skip any picker who cannot afford any available player or whose squad is full
  React.useEffect(() => {
    if (!lotOpen || lotClosing || !currentPickerKey || actionPending) return;

    // If this lot has no active target players (invalid assignment), and game still live,
    // we recover instead of repeatedly auto-skipping everyone.
    if (lotPlayers.length === 0 && activePlayers.length > 0) {
      showToast("⚠️ Lots look malformed; reassigning players into lots to continue", "#FFAA00");
      const reassigned = normalizePlayersLot(activePlayers);
      setActivePlayers(reassigned);
      if (isHost) {
        saveSessionRef.current?.(participants, lotIdx, turnIdx, passedThisLot, "active", lotOpen, lotClosing, {
          playerPool: reassigned,
          shuffledPlayers: reassigned,
        }, sequence, lotOrder);
      }
      return;
    }

    const skipKey = `${lotIdx}-${currentPickerKey}`;
    if (lastAutoSkippedRef.current === skipKey) return;

    const part = currentParticipant;
    if (!part) return;

    const squadFull = part.squad.length >= SQUAD_MAX;
    const canAfford = availablePlayers.some(p => {
      const price = Number(getTierData(p.rating, activeTiers)?.price || 0);
      return part.budget >= price;
    });

    if (!squadFull && canAfford) return; // eligible — normal turn

    lastAutoSkippedRef.current = skipKey;
    showToast(`⏭️ ${part.name} auto-skipped (no affordable players)`, "#888");
    const newPassed = new Set([...passedThisLot, currentPickerKey]);
    setPassedThisLot(newPassed);
    const active = sequence.filter(n => !newPassed.has(n));

    if (active.length === 0 || availablePlayers.length === 0) {
      setLotOpen(false);
      setLotClosing(true);
      if (isHost) {
        saveSessionRef.current?.(participants, lotIdx, 0, newPassed, "active", false, true, {}, sequence, lotOrder);
      }
      return;
    }

    const newTurnIdx = turnIdx % active.length;
    setTurnIdx(newTurnIdx);
    if (isHost) {
      saveSessionRef.current?.(participants, lotIdx, newTurnIdx, newPassed, "active", true, false, {}, sequence, lotOrder);
    }
  }, [lotOpen, lotClosing, currentPickerKey, lotIdx, lotPlayers, activePlayers, currentParticipant, passedThisLot, participants, turnIdx, sequence, lotOrder, activeTiers, actionPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeLot = () => setLotClosing(true);

  const handleOpenLot = async () => {
    if (!isHost) return;
    if (!beginActionLock("Opening lot…", "open")) return;
    sfx("open");
    try {
      setLotOpen(true);
      setLotClosing(false);
      await saveSession(participants, lotIdx, turnIdx, passedThisLot, "active", true, false);
      trackEvent("lot_opened", { lotNum: currentLotNum, lotIdx });
      showToast(`🔓 Lot ${currentLotNum} is now open!`, "#FFD700");
    } finally {
      endActionLock();
    }
  };

  const handlePick = async (player) => {
    if (!userCanAct) return;
    if (!currentParticipant || !lotOpen) return;
    const part = currentParticipant;
    if (!part) return;
    const td = getTierData(player.rating, activeTiers);
    if (part.budget < td.price) { showToast("❌ Not enough budget!", "#FF3D71"); return; }
    if (part.squad.length >= SQUAD_MAX) { showToast("❌ Squad full (max 16)!", "#FF3D71"); return; }
    if (!beginActionLock(`Registering pick: ${player.name}`, "pick")) return;

    sfx("pick");
    trackEvent("player_picked", { lotNum: currentLotNum, price: td.price, tier: getTierKey(player.rating, activeTiers) });

    const pickedAt = Date.now();
    const pickedPlayer = { ...player, pickedAt };

    const updatedParticipants = participants.map(x => x.name === part.name
      ? { ...x, budget: x.budget - td.price, squad: [...x.squad, pickedPlayer] }
      : x
    );
    setParticipants(updatedParticipants);
    showToast(`⚽ ${part.name} picks ${player.name}!`, "#00FF88");

    const newPassed = new Set(passedThisLot);
    const active = sequence.filter(n => !newPassed.has(n));
    const newAvail = availablePlayers.filter(p => p.id !== player.id);
    const newTurnIdx = active.length > 0 ? (turnIdx + 1) % active.length : 0;
    const pickEvent = {
      id: `${pickedAt}-${player.id}`,
      picker: part.name,
      playerId: player.id,
      playerName: player.name,
      at: pickedAt,
    };
    lastPickEventRef.current = pickEvent.id;

    try {
      if (active.length === 0 || newAvail.length === 0) {
        setTurnIdx(0);
        setLotOpen(false);
        setLotClosing(true);
        await saveSession(updatedParticipants, lotIdx, 0, newPassed, "active", false, true, {
          lastPickEvent: pickEvent,
        });
        setTimeout(closeLot, 300);
        return;
      }
      setTurnIdx(newTurnIdx);
      await saveSession(updatedParticipants, lotIdx, newTurnIdx, newPassed, "active", lotOpen, lotClosing, {
        lastPickEvent: pickEvent,
      });
    } finally {
      endActionLock();
    }
  };

  // Shows the disclaimer first; then the scratch-card modal after the user accepts.
  const handleOpenMysteryCard = () => {
    if (!mysteryAvailable || actionPending) return;
    sfx("open");
    setMysteryDisclaimerOpen(true);
  };

  const handleConfirmMysteryReveal = async () => {
    if (!myParticipant || !myMysteryCandidate) { setMysteryModalOpen(false); return; }
    // Only block if the card was already used — don't re-check mysteryAvailable here because
    // a sync arriving mid-scratch could flip userCanAct and silently cancel a committed reveal.
    if (myMysteryUsed) { setMysteryModalOpen(false); return; }
    if (!beginActionLock(`Revealing Mystery Card: ${myMysteryCandidate.name}`, "mystery")) return;

    sfx("pick");
    trackEvent("mystery_card_used", { lotIdx });
    const revealedPlayer = { ...myMysteryCandidate, viaMystery: true };

    const updatedParticipants = participants.map((x) => x.name === myParticipant.name
      ? { ...x, budget: x.budget - MYSTERY_CARD_PRICE, squad: [...x.squad, revealedPlayer] }
      : x
    );
    const newMysteryUsed = { ...mysteryUsed, [user.username]: true };

    setParticipants(updatedParticipants);
    setMysteryUsed(newMysteryUsed);
    showToast(`🎴 ${myParticipant.name} scratched the Mystery Card and revealed ${revealedPlayer.name}!`, "#FFD700");

    const pickEvent = {
      id: `mystery-${Date.now()}-${revealedPlayer.id}`,
      picker: myParticipant.name,
      playerId: revealedPlayer.id,
      playerName: revealedPlayer.name,
      viaMystery: true,
      at: Date.now(),
    };
    lastPickEventRef.current = pickEvent.id;

    const newPassed = new Set(passedThisLot);
    const active = sequence.filter((n) => !newPassed.has(n));
    const newTurnIdx = active.length > 0 ? (turnIdx + 1) % active.length : 0;

    try {
      if (active.length === 0 || availablePlayers.length === 0) {
        setTurnIdx(0);
        setLotOpen(false);
        setLotClosing(true);
        await saveSession(updatedParticipants, lotIdx, 0, newPassed, "active", false, true, {
          mysteryUsed: newMysteryUsed,
          lastPickEvent: pickEvent,
        }, sequence, lotOrder);
        setTimeout(closeLot, 300);
      } else {
        setTurnIdx(newTurnIdx);
        await saveSession(updatedParticipants, lotIdx, newTurnIdx, newPassed, "active", lotOpen, lotClosing, {
          mysteryUsed: newMysteryUsed,
          lastPickEvent: pickEvent,
        }, sequence, lotOrder);
      }
      setMysteryModalOpen(false);
      syncNowRef.current?.();
    } finally {
      endActionLock();
    }
  };

  const handleAbandonClick = async () => {
    try {
      await apiAbandonSession(initSession.id, user?.token);
    } catch (_err) {}
    onAbandon();
  };

  const handleReadmit = async (username) => {
    if (!roomCode || !username || readmitPending) return;
    setReadmitPending(true);
    try {
      await apiReadmitPlayer(roomCode, username, user?.token);
      showToast(`✅ ${username} has been re-admitted`, "#00FF88");
      syncNowRef.current?.();
    } catch (err) {
      showToast(`Failed to readmit: ${err.message}`, "#FF3D71");
    } finally {
      setReadmitPending(false);
    }
  };

  const handlePass = async () => {
    if (!userCanAct) return;
    if (!currentPickerKey) return;
    if (!beginActionLock("Registering pass…", "pass")) return;
    sfx("pass");
    trackEvent("bid_passed", { lotIdx });
    const newPassed = new Set([...passedThisLot, currentPickerKey]);
    setPassedThisLot(newPassed);
    showToast(`${currentPickerName} is done for this lot`, "#888");
    const active = sequence.filter(n => !newPassed.has(n));
    try {
      if (active.length === 0 || availablePlayers.length === 0) {
        setLotOpen(false);
        setLotClosing(true);
        await saveSession(participants, lotIdx, turnIdx, newPassed, "active", false, true);
        closeLot();
        return;
      }
      const newTurnIdx = turnIdx % active.length;
      setTurnIdx(newTurnIdx);
      await saveSession(participants, lotIdx, newTurnIdx, newPassed);
    } finally {
      endActionLock();
    }
  };

  // Host-only: force-skip the current picker when they're absent or unresponsive.
  const handleHostForceSkip = async () => {
    if (!isHost || !currentPickerKey || !lotOpen || lotClosing) return;
    if (!beginActionLock(`Skipping ${currentPickerName}…`, "pass")) return;
    sfx("pass");
    trackEvent("host_force_skip", { skipped: currentPickerKey, lotIdx });
    const newPassed = new Set([...passedThisLot, currentPickerKey]);
    setPassedThisLot(newPassed);
    showToast(`⏭️ Host skipped ${currentPickerName}`, "#FF6B35");
    const active = sequence.filter((n) => !newPassed.has(n));
    try {
      if (active.length === 0 || availablePlayers.length === 0) {
        setLotOpen(false);
        setLotClosing(true);
        await saveSession(participants, lotIdx, 0, newPassed, "active", false, true);
        closeLot();
        return;
      }
      const newTurnIdx = turnIdx % active.length;
      setTurnIdx(newTurnIdx);
      await saveSession(participants, lotIdx, newTurnIdx, newPassed);
    } finally {
      endActionLock();
    }
  };

  const handleNextLot = async () => {
    if (!isHost) return;
    if (!beginActionLock("Opening next lot…", "next-lot")) return;
    const rotated = rotateArray(sequence, 1);
    try {
      if (lotIdx + 1 >= lotOrder.length) {
        trackEvent("auction_finalized", { lotCount: lotOrder.length });
        await saveSession(participants, lotIdx, 0, new Set(), "complete", false, false, {}, rotated, lotOrder);
        onEnd(participants);
      } else {
        sfx("open");
        const newLotIdx = lotIdx + 1;
        trackEvent("lot_advanced", { newLotIdx });
        setLotIdx(newLotIdx);
        setSequence(rotated);
        setPassedThisLot(new Set());
        setTurnIdx(0);
        setLotClosing(false);
        setLotOpen(false);
        setSearch("");
        setGroupFilter("ALL");
        // The backend owns Mystery Card pools and recomputes mysteryCurrent itself whenever
        // lotIdx changes — the client never has the pool data needed to do this anymore, so we
        // just let the server-side reroll happen and pick up the result on the next sync.
        await saveSession(participants, newLotIdx, 0, new Set(), "active", false, false, {}, rotated, lotOrder);
      }
    } finally {
      endActionLock();
    }
  };

  const displayGroups = groupFilter === "ALL" ? Object.keys(POS_GROUPS) : [groupFilter];
  const filterP = ps => ps.filter(p =>
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.pos.toLowerCase().includes(search.toLowerCase()))
    && (groupFilter === "ALL" || getPosGroup(p.pos) === groupFilter)
  );

  const isAtCap = currentParticipant && currentParticipant.squad.length >= SQUAD_MAX;
  const showSelfPickLoader = Boolean(userCanAct && actionPending && actionKind === "pick");
  const showWaitingOverlay = Boolean(lotOpen && !lotClosing && currentPickerName && !userCanAct);
  const recentPicks = participants
    .flatMap(p => p.squad.map(pl => ({ ...pl, owner:p.name, ownerIdx:participants.findIndex(x=>x.name===p.name) })))
    .sort((a, b) => {
      const aPickedAt = Number(a?.pickedAt);
      const bPickedAt = Number(b?.pickedAt);
      const aRecent = Number.isFinite(aPickedAt) ? aPickedAt : Number(a?.id) || 0;
      const bRecent = Number.isFinite(bPickedAt) ? bPickedAt : Number(b?.id) || 0;
      return bRecent - aRecent;
    })
    .slice(0, 6);

  React.useEffect(() => {
    let timerId = null;
    if (showWaitingOverlay) {
      timerId = setTimeout(() => setShowWaitingOverlayDebounced(true), 250);
    } else {
      setShowWaitingOverlayDebounced(false);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [showWaitingOverlay]);

  // Check whether any participant can still buy in any future lot.
  // Future-lot players are intentionally stripped from the client payload by the server (fairness),
  // so we cannot inspect their actual contents. Instead we check the weaker but sufficient condition:
  // future lots exist AND at least one participant has enough budget for the cheapest tier.
  const futureLotNums = lotOrder.slice(lotIdx + 1);
  const cheapestTierPrice = Object.values(activeTiers).reduce(
    (min, t) => Math.min(min, Number(t?.price) || Infinity), Infinity
  );
  const canAnyoneBuyInFuture = futureLotNums.length > 0 && participants.some(entry => {
    const squadSize = Array.isArray(entry?.squad) ? entry.squad.length : 0;
    return squadSize < SQUAD_MAX && Number(entry?.budget || 0) >= cheapestTierPrice;
  });

  const handleEndGame = async () => {
    if (!isHost) return;
    if (!beginActionLock("Ending game…", "end-game")) return;
    const rotated = rotateArray(sequence, 1);
    try {
      await saveSession(participants, lotIdx, 0, new Set(), "complete", false, false, {}, rotated, lotOrder);
      onEnd(participants);
    } finally {
      endActionLock();
    }
  };

  return React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 272px", height:"100vh", background:"#04060a", overflow:"hidden" } },
    toast && React.createElement(Toast, toast),
    React.createElement(SquadAnalyser, {
      participants,
      wishlists,
      players: activePlayers,
      tiers: activeTiers,
      selectedName: user.username,
      onClose: () => setAnalyserOpen(false),
      hidden: !analyserOpen,
      mysteryEnabled,
      mysteryCardUsed: myMysteryUsed,
      mysteryCardPrice: MYSTERY_CARD_PRICE,
    }),
    mysteryDisclaimerOpen && React.createElement("div", {
      style: {
        position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      },
      onClick: (e) => { if (e.target === e.currentTarget) setMysteryDisclaimerOpen(false); },
    },
      React.createElement("div", {
        style: {
          background: "linear-gradient(160deg,#131008,#0a0c12)",
          border: "1px solid #FFD70055",
          borderRadius: 16,
          padding: "28px 28px 24px",
          maxWidth: 380,
          width: "100%",
          boxShadow: "0 0 40px #FFD70018",
          animation: "scaleIn .3s ease",
          textAlign: "center",
        },
      },
        React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 26, color: "#FFD700", letterSpacing: 4, marginBottom: 14, textShadow: "0 0 20px #FFD70055" } }, "MYSTERY CARD"),
        React.createElement("div", {
          style: {
            background: "#0e0c02", border: "1px solid #FFD70033", borderRadius: 10,
            padding: "14px 16px", marginBottom: 18, textAlign: "left",
          },
        },
          React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 11, color: "#FFD700", letterSpacing: 2, marginBottom: 8 } }, "⚠️ DISCLAIMER"),
          React.createElement("ul", { style: { fontFamily: "'Rajdhani'", fontSize: 13, color: "#bbb", margin: 0, paddingLeft: 18, lineHeight: 1.7 } },
            React.createElement("li", null, `Costs a flat ${MYSTERY_CARD_PRICE}M regardless of which player is revealed.`),
            React.createElement("li", null, "You cannot back out once you start scratching the card."),
            React.createElement("li", null, "The revealed player is added to your squad immediately."),
            React.createElement("li", null, "Each bidder can only use the Mystery Card once per auction."),
          )
        ),
        React.createElement("div", { style: { display: "flex", gap: 10 } },
          React.createElement("button", {
            onClick: () => setMysteryDisclaimerOpen(false),
            style: { ...BTN.ghost, flex: 1 },
          }, "CANCEL"),
          React.createElement("button", {
            onClick: () => { setMysteryDisclaimerOpen(false); setMysteryModalOpen(true); },
            style: { ...BTN.gold, flex: 1, fontSize: 13, letterSpacing: 1 },
          }, `CONFIRM — SPEND ${MYSTERY_CARD_PRICE}M`)
        )
      )
    ),
    readmitOpen && isHost && React.createElement("div", {
      style: { position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
      onClick: (e) => { if (e.target === e.currentTarget) setReadmitOpen(false); },
    },
      React.createElement("div", {
        style: { background: "#0a0c12", border: "1px solid #FFD70044", borderRadius: 14,
          padding: "24px 24px 20px", maxWidth: 340, width: "100%",
          boxShadow: "0 0 40px #00000066" },
      },
        React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: "#FFD700", letterSpacing: 3, marginBottom: 14 } }, "RE-ADMIT PLAYERS"),
        abandonedBy.length === 0
          ? React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 13, color: "#555", marginBottom: 16 } }, "No abandoned players.")
          : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 } },
              abandonedBy.map((name) =>
                React.createElement("div", { key: name, style: { display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#0d0f16", borderRadius: 8, padding: "8px 12px" } },
                  React.createElement("span", { style: { fontFamily: "'Exo 2'", fontSize: 13, color: "#ccc" } }, name),
                  React.createElement("button", {
                    onClick: () => handleReadmit(name),
                    disabled: readmitPending,
                    style: { background: "#00FF8818", color: "#00FF88", border: "1px solid #00FF8844",
                      borderRadius: 6, padding: "4px 12px", cursor: readmitPending ? "default" : "pointer",
                      fontFamily: "'Bebas Neue'", fontSize: 11, letterSpacing: 1,
                      opacity: readmitPending ? 0.6 : 1 }
                  }, "RE-ADMIT")
                )
              )
            ),
        React.createElement("button", {
          onClick: () => setReadmitOpen(false),
          style: { width: "100%", background: "#0d0f16", color: "#888", border: "1px solid #1e2028",
            borderRadius: 8, padding: "8px 0", cursor: "pointer",
            fontFamily: "'Bebas Neue'", fontSize: 12, letterSpacing: 1 }
        }, "CLOSE")
      )
    ),
    mysteryModalOpen && React.createElement(MysteryScratchModal, {
      player: myMysteryCandidate,
      tiers: activeTiers,
      price: MYSTERY_CARD_PRICE,
      revealing: actionPending && actionKind === "mystery",
      onScratchComplete: handleConfirmMysteryReveal,
      onClose: () => setMysteryModalOpen(false),
    }),
    showWaitingOverlayDebounced && React.createElement("div", {
      style:{
        position:"fixed",
        inset:0,
        background:"#00000066",
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
        zIndex:900,
        pointerEvents:"none"
      }
    },
      React.createElement("div", {
        style:{
          minWidth:320,
          maxWidth:420,
          background:"#0a0c12",
          border:"1px solid #1e2230",
          borderRadius:12,
          padding:"16px 20px",
          boxShadow:"0 20px 40px #00000055",
          textAlign:"center"
        }
      },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:18, letterSpacing:2, color:"#FFD700", marginBottom:6 } },
          "WAITING FOR PICKER"
        ),
        React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#bbb" } },
          `${currentPickerName} is currently picking. Your turn will unlock automatically.`
        )
      )
    ),
    React.createElement("style", null, "@keyframes biddingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"),

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
            roomCode && React.createElement("div", { style:{
              background:"#0d0f16",
              border:"1px solid #1e2028",
              borderRadius:7,
              padding:"5px 10px",
              fontFamily:"'Bebas Neue'",
              fontSize:14,
              letterSpacing:2,
              color:"#FFD700"
            } }, `ROOM ${roomCode}`),
            roomCode && React.createElement("button", {
              onClick: async () => {
                try {
                  await navigator.clipboard.writeText(roomCode);
                  showToast("Room code copied", "#00FF88");
                } catch (_err) {
                  showToast("Copy failed", "#FF6B35");
                }
              },
              style:{ ...BTN.ghost, fontSize:11 }
            }, "COPY CODE"),
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
              disabled: actionPending,
              style:{ ...BTN.ghost, fontSize:11, color:isHost ? "#FF6B35" : "#FFD700", borderColor:isHost ? "#FF6B3544" : "#FFD70044" }
            }, isHost ? "CANCEL GAME" : "ABANDON"),
            isHost && abandonedBy.length > 0 && React.createElement("button", {
              onClick: () => setReadmitOpen(true),
              style:{ ...BTN.ghost, fontSize:11, color:"#FF6B35", borderColor:"#FF6B3544" }
            }, `👥 ABANDONED (${abandonedBy.length})`),
            !lotClosing && !lotOpen && isHost && React.createElement("button", {
              onClick:handleOpenLot,
              disabled: actionPending,
              style:{ ...BTN.gold, opacity: actionPending ? .65 : 1 }
            }, actionPending ? "SYNCING…" : "🔓 OPEN LOT"),
            !lotClosing && lotOpen && currentPickerKey && React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:8 } },
              isAtCap && React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#FF6B35", fontWeight:700 } }, "SQUAD FULL"),
              React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#888" } },
                "Picking: ", React.createElement("span", { style:{ color:PCOLORS[Math.max(sequence.indexOf(currentPickerKey), 0)], fontWeight:700 } }, currentPickerName || currentPickerKey)
              ),
              actionPending && React.createElement("span", { style:{
                fontFamily:"'Rajdhani'", fontSize:11, color:"#FFD700", fontWeight:700
              } }, `⏳ ${actionLabel || "Registering action…"}`),
              showSelfPickLoader && React.createElement("span", { style:{ display:"inline-flex", alignItems:"center", gap:6 } },
                React.createElement("span", { style:{
                  width:12,
                  height:12,
                  borderRadius:"50%",
                  border:"2px solid #FFD70044",
                  borderTopColor:"#FFD700",
                  animation:"biddingSpin .8s linear infinite"
                } }),
                React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#FFD700", fontWeight:700 } }, "REGISTERING PICK…")
              ),
              userCanAct
                ? React.createElement("button", {
                    onClick:handlePass,
                    disabled: actionPending,
                    style:{ background:"transparent", color:"#FF6B35", border:"1px solid #FF6B3533",
                      borderRadius:7, padding:"5px 12px", fontSize:11, cursor: actionPending ? "not-allowed" : "pointer",
                      opacity: actionPending ? .65 : 1,
                      fontFamily:"'Bebas Neue'", letterSpacing:1 }
                  }, actionPending ? "REGISTERING…" : "PASS / DONE FOR LOT")
                : React.createElement(React.Fragment, null,
                    React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#555", fontWeight:700 } },
                      currentPickerName ? `WAITING · ${currentPickerName} IS PICKING` : "WAITING FOR PICKER"),
                    isHost && currentPickerKey && /^player\s+\d+$/i.test(String(currentPickerName || "").trim()) && React.createElement("button", {
                      onClick: handleHostForceSkip,
                      disabled: actionPending,
                      style:{ background:"#FF6B3518", color:"#FF6B35", border:"1px solid #FF6B3544",
                        borderRadius:7, padding:"5px 12px", fontSize:11,
                        cursor: actionPending ? "not-allowed" : "pointer",
                        opacity: actionPending ? .65 : 1,
                        fontFamily:"'Bebas Neue'", letterSpacing:1 }
                    }, `⏭ SKIP ${currentPickerName}`)
                  )
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
        isHost && React.createElement(React.Fragment, null,
          lotIdx + 1 >= lotOrder.length
            ? React.createElement("button", { style:BTN.gold, onClick:handleNextLot }, "🏆 FINAL SQUADS")
            : canAnyoneBuyInFuture
              ? React.createElement("button", {
                  style:{ ...BTN.gold, opacity: actionPending ? .65 : 1 },
                  onClick:handleNextLot,
                  disabled: actionPending
                }, actionPending ? "SYNCING…" : `OPEN LOT ${lotOrder[lotIdx+1]} →`)
              : React.createElement(React.Fragment, null,
                  React.createElement("div", { style:{ maxWidth:400, textAlign:"center", padding:"14px 20px",
                    background:"#1a0408", border:"1px solid #FF3D7144", borderRadius:10, marginBottom:4,
                    fontFamily:"'Rajdhani'", fontSize:14, color:"#FF6B9D", lineHeight:1.6 }
                  }, "⚠️ No player can afford anyone in the remaining lots — the game cannot continue."),
                  React.createElement("button", {
                    style:{ ...BTN.gold, background:"#2a0812", borderColor:"#FF3D71", color:"#FF3D71", opacity: actionPending ? .65 : 1 },
                    disabled: actionPending,
                    onClick:handleEndGame
                  }, actionPending ? "ENDING…" : "🏁 END GAME")
                )
        ),
        !isHost && React.createElement("span", { style:{
          fontFamily:"'Rajdhani'", fontSize:13,
          color: (!canAnyoneBuyInFuture && lotIdx+1 < lotOrder.length) ? "#FF6B9D" : "#555"
        }},
          (!canAnyoneBuyInFuture && lotIdx+1 < lotOrder.length)
            ? "⚠️ No affordable players remain in any lot"
            : "⏳ Waiting for host…"
        )
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
              const canPick = !owned && lotOpen && !lotClosing && userCanAct && !cantAfford && !isAtCap && !actionPending;
              const wl = (wishlists[currentPickerName||""]||[]).includes(p.id);
              return React.createElement(PlayerRow, {
                key:p.id, player:p,
                onPick: canPick ? handlePick : null,
                owned, ownerName:owner?.name,
                ownerColor: ownerIdx>=0 ? PCOLORS[ownerIdx] : "#888",
                cantAfford: cantAfford && !owned,
                isWishlist: wl,
                onWishlist: id => onWishlist(currentPickerName||user.username, id),
                tiers: activeTiers,
                animDelay: i*.02,
                wishlists: wishlists,
                participants: participants,
                currentUserName: user.username
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
          currentTurn:currentPickerName || currentPickerKey,
          passedSet:passedThisLot,
          onAnalyse: () => setAnalyserOpen(true),
          lotIdx,
          totalLots:lotOrder.length,
          tiers: activeTiers,
        })
      ),
      mysteryEnabled && React.createElement("div", { style:{ borderTop:"1px solid #0f1218", padding:"10px", flexShrink:0 } },
        React.createElement(MysteryCard, {
          available: mysteryAvailable,
          used: myMysteryUsed,
          revealedPlayer: myParticipant?.squad?.find((p) => p.viaMystery) || null,
          price: MYSTERY_CARD_PRICE,
          hasPool: Boolean(myMysteryCandidate),
          affordable: myMysteryAffordable,
          squadHasRoom: myMysterySquadHasRoom,
          onClick: handleOpenMysteryCard,
        })
      ),
      React.createElement("div", { style:{ borderTop:"1px solid #0f1218", padding:"8px 10px", flexShrink:0 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:10, color:"#333", letterSpacing:3, marginBottom:5 } }, "RECENT"),
        React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:2, maxHeight:120, overflowY:"auto" } },
          recentPicks.map((pl) => {
            const td = getTierData(pl.rating, activeTiers);
            return React.createElement("div", { key:`${pl.owner}-${pl.id}-${pl.pickedAt || 0}`, style:{
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
