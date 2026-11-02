import React from "react";
import { Toast } from "../components/Toast.jsx";
import { PlayerRow } from "../components/PlayerRow.jsx";
import { loadPlayersFromCsv } from "../data/csvPlayerLoader.js";
import { BudgetSidebar } from "../components/BudgetSidebar.jsx";
import { MysteryCard, MysteryScratchModal } from "../components/MysteryCard.jsx";
import { SquadAnalyser } from "../widgets/SquadAnalyser.jsx";
import { BTN } from "../utils/styles.js";
import { sfx } from "../utils/sfx.js";
import { PCOLORS, POS_GROUPS, getPosGroup, TIERS, SQUAD_MAX, LOTS, MYSTERY_CARD_PRICE, getTierData, getTierKey } from "../game/constants.js";
import { apiGetSessionBackup, apiOpenTransferMarket, apiReadmitPlayer } from "../lib/api.js";
import { acceptSessionSnapshot, getPendingSessionAction, submitSessionAction, synchronizeSession } from "../lib/realtime.js";
import { useSessionRealtime } from "../lib/useSessionRealtime.js";
import { CountdownText, useDeadlinePassed } from "../components/Countdown.jsx";
import { trackEvent } from "../lib/analytics.js";
import { TeamBadge, StatusPill, getParticipantAccent } from "../theme/footballTheme.js";
import { AuctionRoomMenu } from "../components/AuctionRoomMenu.jsx";
import { ResponsiveAuctionPanel } from "../components/ResponsiveAuctionPanel.jsx";
import "../styles/auction.css";

function getPlayerAcquisitionPrice(player, tiers) {
  const explicitPrice = Number(player?.purchasePrice);
  if (Number.isFinite(explicitPrice)) return explicitPrice;
  if (player?.viaMystery) return MYSTERY_CARD_PRICE;
  return Number(getTierData(Number(player?.rating), tiers)?.price || 0);
}

export function BiddingScreen({ session: initSession, user, wishlists, onWishlist, onEnd, onAbandon }) {
  const baseSessionRef = React.useRef(initSession);
  const [participants, setParticipants] = React.useState(Array.isArray(initSession?.participants) ? initSession.participants : []);
  const [sessionStatus, setSessionStatus] = React.useState(initSession?.status || "active");
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
  const [streamHealthy, setStreamHealthy] = React.useState(false);
  const [actionLabel, setActionLabel] = React.useState("");
  const [actionKind, setActionKind] = React.useState("idle");
  const [showPicked, setShowPicked] = React.useState(false);
  const [panelTab, setPanelTab] = React.useState("teams");
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState(null);
  const [actionError, setActionError] = React.useState("");
  const actionLockRef = React.useRef(false);
  const [roomCode, setRoomCode] = React.useState(initSession.roomCode || "");
  const [mysteryEnabled, setMysteryEnabled] = React.useState(Boolean(initSession.mysteryEnabled));
  const [mysteryCurrent, setMysteryCurrent] = React.useState(initSession.mysteryCurrent || {});
  const [mysteryUsed, setMysteryUsed] = React.useState(initSession.mysteryUsed || {});
  const [transferWindow, setTransferWindow] = React.useState(initSession.transferWindow || {});
  const [mysteryModalOpen, setMysteryModalOpen] = React.useState(false);
  const [mysteryScratchStarted, setMysteryScratchStarted] = React.useState(false);
  const [mysteryDisclaimerOpen, setMysteryDisclaimerOpen] = React.useState(false);
  const [abandonedBy, setAbandonedBy] = React.useState(Array.isArray(initSession?.abandonedBy) ? initSession.abandonedBy : []);
  const [readmitOpen, setReadmitOpen] = React.useState(false);
  const [readmitPending, setReadmitPending] = React.useState(false);
  const [backupPending, setBackupPending] = React.useState(false);
  const [selectedSales, setSelectedSales] = React.useState(new Set());
  const [saleSubmitting, setSaleSubmitting] = React.useState(false);
  const [openingTransferMarket, setOpeningTransferMarket] = React.useState(false);
  const lastPickEventRef = React.useRef(initSession.lastPickEvent?.id || null);
  const toastTimerRef = React.useRef(null);


  // Load face URL map from CSV so images show for all users regardless of what's in Firestore
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const csvPlayers = await loadPlayersFromCsv();
        const dataMap = new Map();
        const map = new Map();
        csvPlayers.forEach((p) => {
          dataMap.set(p.id, p);
          if (p.playerFaceUrl) map.set(p.id, p.playerFaceUrl);
        });
        if (!cancelled) { setPlayerDataMap(dataMap); setPlayerFaceMap(map); }
      } catch (_) {}
    })();
    return () => { cancelled = true; clearTimeout(toastTimerRef.current); };
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
    setParticipants(prev => prev.map(p => ({ ...p, squad: hydratePlayers(p.squad), soldPlayers: hydratePlayers(p.soldPlayers) })));
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
  const inTransferWindow = sessionStatus === "transfer";
  const transferDeadlineAt = Number(transferWindow?.listingDeadlineAt || 0);
  const transferDeadlineValid = Number.isFinite(transferDeadlineAt) && transferDeadlineAt > 0;
  const transferDeadlinePassed = useDeadlinePassed(transferDeadlineAt);
  const transferDeadlineText = React.createElement(CountdownText, { deadlineAt: transferDeadlineAt });
  const transferSaleMin = Number(transferWindow?.requiredSalesMin || 2);
  const transferSaleMax = Number(transferWindow?.requiredSalesMax || 5);
  const myTransferCompleted = Array.isArray(transferWindow?.completedBy) && transferWindow.completedBy.includes(user.username);
  const selectedSalePlayers = myParticipant
    ? myParticipant.squad.filter((player) => selectedSales.has(player.id))
    : [];
  const selectedSaleBudgetGain = selectedSalePlayers.reduce(
    (sum, player) => sum + getPlayerAcquisitionPrice(player, activeTiers),
    0
  );
  const everyoneCompletedTransferSales = inTransferWindow
    && Array.isArray(transferWindow?.completedBy)
    && participants.length > 0
    && transferWindow.completedBy.length >= participants.length;
  const canOpenTransferMarketNow = everyoneCompletedTransferSales && (transferDeadlinePassed || !transferDeadlineValid || everyoneCompletedTransferSales);
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

  React.useEffect(() => {
    if (!myParticipant) {
      setSelectedSales(new Set());
      return;
    }
    setSelectedSales((prev) => {
      const next = new Set();
      prev.forEach((id) => {
        if (myParticipant.squad.some((player) => player.id === id)) {
          next.add(id);
        }
      });
      return next.size === prev.size && [...next].every(id => prev.has(id)) ? prev : next;
    });
  }, [myParticipant]);

  const showToast = (msg, color="#FFD700") => {
    setToast({ msg, color });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  };

  const beginActionLock = (label, kind = "generic") => {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    setActionPending(true);
    setActionLabel(label || "Syncing action…");
    setActionKind(kind);
    return true;
  };

  const endActionLock = () => {
    actionLockRef.current = false;
    setActionPending(false);
    setActionLabel("");
    setActionKind("idle");
  };

  const applyLatest = (latest) => {
    if (!latest || Number(latest.revision || 0) < Number(baseSessionRef.current.revision || 0)) return;
    const previous = baseSessionRef.current;
    baseSessionRef.current = latest;
    if (latest.participants !== previous.participants) {
      setParticipants(current => (latest.participants || []).map(p => previous.participants.includes(p)
        ? current.find(existing => existing.name === p.name) || p
        : { ...p, squad: hydratePlayers(p.squad), soldPlayers: hydratePlayers(p.soldPlayers) }));
    }
    setSessionStatus(latest.status || "active");
    setLotIdx(latest.lotIdx || 0);
    setTurnIdx(latest.turnIdx || 0);
    if (latest.passedThisLot !== previous.passedThisLot) setPassedThisLot(new Set(latest.passedThisLot || []));
    setLotOpen(Boolean(latest.lotOpen));
    setLotClosing(Boolean(latest.lotClosing));
    setSequence(latest.sequence || []);
    setLotOrder(latest.lotOrder || []);
    if (latest.shuffledPlayers !== previous.shuffledPlayers || latest.playerPool !== previous.playerPool) {
      setActivePlayers(normalizePlayersLot(hydratePlayers(latest.shuffledPlayers || latest.playerPool || [])));
    }
    setActiveTiers(latest.tiers || TIERS);
    setRoomCode(latest.roomCode || "");
    setMysteryEnabled(Boolean(latest.mysteryEnabled));
    setMysteryCurrent(latest.mysteryCurrent || {});
    setMysteryUsed(latest.mysteryUsed || {});
    setTransferWindow(latest.transferWindow || {});
    setAbandonedBy(latest.abandonedBy || []);
    const pick = latest.lastPickEvent;
    if (pick?.id && pick.id !== lastPickEventRef.current) {
      lastPickEventRef.current = pick.id;
      // Picks already update the rows, budgets and activity panel; no repeated room-wide toast.
    }
  };
  useSessionRealtime(initSession.id, user, {
    onUpdate: applyLatest,
    onStatus: setStreamHealthy,
    onPending: command => { setPendingAction(command); if (!command) setActionError(""); },
    onClosed: (latest, reason) => {
      if (reason === "complete") {
        const hydrated = (latest?.participants || []).map(p => ({ ...p, squad: hydratePlayers(p.squad), soldPlayers: hydratePlayers(p.soldPlayers) }));
        onEnd(hydrated, latest);
      } else onAbandon();
    },
    onError: error => { if (error.status === 403 || error.status === 404) showToast(error.message, "#FF6B35"); },
  });

  const runAction = async (command, label, kind = "generic") => {
    if (!beginActionLock(label, kind)) return false;
    setActionError("");
    try {
      await submitSessionAction(initSession.id, command, user.token, Number(baseSessionRef.current.revision || 0));
      return true;
    } catch (error) {
      const unknown = getPendingSessionAction(initSession.id);
      setActionError(unknown ? "Still checking your last action. Your budget and squad have not been changed locally."
        : error.code === "STALE_REVISION" ? "The room updated. Your view is refreshing—please choose again."
        : `Action not accepted: ${error.message}`);
      return false;
    } finally { endActionLock(); }
  };

  const handleOpenLot = async () => {
    if (!isHost) return;
    if (await runAction({ type: "open-lot" }, "Opening lot…", "open")) {
      sfx("open");
      trackEvent("lot_opened", { lotNum: currentLotNum, lotIdx });
    }
  };

  const handlePick = async (player) => {
    if (!userCanAct || !lotOpen) return;
    if (await runAction({ type: "pick", playerId: player.id }, `Registering pick: ${player.name}`, "pick")) {
      sfx("pick");
      trackEvent("player_picked", { lotNum: currentLotNum, tier: getTierKey(player.rating, activeTiers) });
    }
  };

  // Shows the disclaimer first; then the scratch-card modal after the user accepts.
  const handleOpenMysteryCard = () => {
    if (!mysteryAvailable || actionBusy) return;
    sfx("open");
    setMysteryScratchStarted(false);
    setMysteryDisclaimerOpen(true);
  };

  const handleConfirmMysteryReveal = async () => {
    if (myMysteryUsed) return;
    const accepted = await runAction({ type: "mystery" }, "Revealing Mystery Card…", "mystery");
    if (accepted) { sfx("pick"); trackEvent("mystery_card_used", { lotIdx }); }
    // A rejection/unknown outcome must not trap the user in a non-closeable scratched modal.
    setMysteryModalOpen(false);
    setMysteryScratchStarted(false);
  };

  const handleDownloadBackup = async () => {
    if (!isHost || !initSession?.id || backupPending) return;
    setBackupPending(true);
    try {
      const backup = await apiGetSessionBackup(initSession.id, user?.token);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(initSession.name || "auction-room").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}-${initSession.id}-backup.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded", "#00FF88");
    } catch (err) {
      showToast(`Backup failed: ${err.message}`, "#FF6B35");
    } finally {
      setBackupPending(false);
    }
  };

  const toggleSaleSelection = (playerId) => {
    if (!myParticipant || myTransferCompleted || saleSubmitting || transferDeadlinePassed || actionBusy) return;
    setSelectedSales((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
        return next;
      }
      if (next.size >= transferSaleMax) return prev;
      next.add(playerId);
      return next;
    });
  };

  const handleSubmitSales = async () => {
    if (!myParticipant || myTransferCompleted || saleSubmitting || actionBusy) return;
    if (transferDeadlinePassed) {
      showToast("⏰ Transfer listing deadline has passed", "#FFB84D");
      return;
    }
    if (selectedSalePlayers.length < transferSaleMin || selectedSalePlayers.length > transferSaleMax) {
      showToast(`List ${transferSaleMin}-${transferSaleMax} players to continue`, "#FF6B35");
      return;
    }

    setSaleSubmitting(true);
    try {
      if (await runAction({ type: "transfer-list", playerIds: selectedSalePlayers.map(p => p.id) }, "Submitting transfer listings…")) {
        setSelectedSales(new Set());
        showToast("Transfer listings submitted", "#00FF88");
      }
    } finally {
      setSaleSubmitting(false);
    }
  };

  const handleOpenTransferMarket = async () => {
    if (!isHost || !initSession?.id || openingTransferMarket || actionBusy) return;
    if (!everyoneCompletedTransferSales) {
      showToast(`Wait until every participant submits ${transferSaleMin}-${transferSaleMax} listings`, "#FFB84D");
      return;
    }
    if (!transferDeadlinePassed && transferDeadlineValid && !everyoneCompletedTransferSales) {
      showToast("Wait until the listing deadline ends before opening the market", "#FFB84D");
      return;
    }
    setOpeningTransferMarket(true);
    try {
      const latest = await apiOpenTransferMarket(initSession.id, user?.token);
      acceptSessionSnapshot(initSession.id, latest);
      showToast("Transfer market is ready", "#4FC3F7");
    } catch (err) {
      showToast(`Failed to open market: ${err.message}`, "#FF6B35");
    } finally {
      setOpeningTransferMarket(false);
    }
  };

  const handleAbandonClick = async () => {
    onAbandon();
  };

  const handleReadmit = async (username) => {
    if (!roomCode || !username || readmitPending) return;
    setReadmitPending(true);
    try {
      const latest = await apiReadmitPlayer(roomCode, username, user?.token);
      acceptSessionSnapshot(initSession.id, latest);
      showToast(`✅ ${username} has been re-admitted`, "#00FF88");
    } catch (err) {
      showToast(`Failed to readmit: ${err.message}`, "#FF3D71");
    } finally {
      setReadmitPending(false);
    }
  };

  const handlePass = async () => {
    if (!userCanAct) return;
    if (await runAction({ type: "pass" }, "Registering pass…", "pass")) { sfx("pass"); trackEvent("bid_passed", { lotIdx }); }
  };

  // Host-only: force-skip the current picker when they're absent or unresponsive.
  const handleHostForceSkip = async () => {
    if (!isHost || !currentPickerKey || !lotOpen || lotClosing) return;
    if (await runAction({ type: "force-skip" }, `Skipping ${currentPickerName}…`, "pass")) { sfx("pass"); trackEvent("host_force_skip", { skipped: currentPickerKey, lotIdx }); }
  };

  const handleNextLot = async () => {
    if (!isHost) return;
    if (await runAction({ type: "next-lot" }, "Opening next lot…", "next-lot")) { setSearch(""); setGroupFilter("ALL"); }
  };

  const displayGroups = groupFilter === "ALL" ? Object.keys(POS_GROUPS) : [groupFilter];
  const filterP = ps => ps.filter(p =>
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.pos.toLowerCase().includes(search.toLowerCase()))
    && (groupFilter === "ALL" || getPosGroup(p.pos) === groupFilter)
  );

  const isAtCap = currentParticipant && currentParticipant.squad.length >= SQUAD_MAX;
  const actionBusy = actionPending || Boolean(pendingAction);
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
    await runAction({ type: "end" }, "Ending game…", "end-game");
  };

  const actionFeedback = (actionPending || pendingAction || actionError) && React.createElement("div", {
    className: "auction-action-feedback", role: "status", "aria-live": "polite",
  },
    React.createElement("p", null, actionPending ? actionLabel : pendingAction ? "Still checking your last action. Please resolve it before choosing again." : actionError),
    !actionPending && pendingAction && React.createElement(React.Fragment, null,
      React.createElement("button", { type: "button", onClick: () => synchronizeSession(initSession.id) }, "Check status"),
      React.createElement("button", { type: "button", onClick: () => runAction(pendingAction, "Checking your previous action…", "retry") }, "Retry pending action")
    ),
    !actionPending && !pendingAction && React.createElement("button", { type: "button", onClick: () => setActionError("") }, "Dismiss")
  );

  if (inTransferWindow) {
    const unsoldCarryCount = Number(transferWindow?.unsoldCarryCount || 0);
    const soldPool = participants.flatMap((participant, participantIdx) =>
      (participant.soldPlayers || []).map((player) => ({
        ...player,
        seller: participant.name,
        sellerIdx: participantIdx,
      }))
    );

    return React.createElement("div", {
      style: { minHeight: "100vh", background: "#04060a", color: "#fff", padding: 24 }
    },
      toast && React.createElement(Toast, toast),
      actionFeedback,
      React.createElement("div", { style: { maxWidth: 1200, margin: "0 auto" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" } },
          React.createElement("div", null,
            React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 44, letterSpacing: 4, color: "#FFD700" } }, "MID-SEASON TRANSFER WINDOW"),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 14, color: "#777" } },
              `List ${transferSaleMin}-${transferSaleMax} players for re-auction before the market opens. Their exact original purchase price is returned to your budget.`),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 13, color: "#4FC3F7", marginTop: 6 } },
              `${unsoldCarryCount} unsold players from the previous auction will also enter the mid-season market automatically.`),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 13, color: transferDeadlinePassed ? "#FFB84D" : "#8fe7c0", marginTop: 6, fontWeight: 700 } }, transferDeadlineText)
          ),
          React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
            roomCode && React.createElement("div", { style:{
              background:"#0d0f16", border:"1px solid #1e2028", borderRadius:8, padding:"8px 12px",
              fontFamily:"'Bebas Neue'", fontSize:14, letterSpacing:2, color:"#FFD700"
            } }, `ROOM ${roomCode}`),
            isHost && React.createElement("button", {
              onClick: handleDownloadBackup,
              disabled: backupPending,
              style:{ ...BTN.ghost, color:"#4FC3F7", borderColor:"#4FC3F744", opacity: backupPending ? 0.6 : 1 }
            }, backupPending ? "DOWNLOADING…" : "⬇ BACKUP"),
            React.createElement("button", {
              onClick: handleAbandonClick,
              style:{ ...BTN.ghost, color:isHost ? "#FF6B35" : "#FFD700", borderColor:isHost ? "#FF6B3544" : "#FFD70044" }
            }, isHost ? "CANCEL GAME" : "ABANDON")
          )
        ),
        React.createElement("div", { className: "auction-transfer-grid" },
          React.createElement("div", { style: { background: "#0a0c12", border: "1px solid #1e2230", borderRadius: 16, padding: 18 } },
            React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 } },
              participants.map((participant, idx) => {
                const saleCount = (participant.soldPlayers || []).length;
                const done = (transferWindow.completedBy || []).includes(participant.name);
                return React.createElement("div", {
                  key: participant.name,
                  style: {
                    minWidth: 160,
                    background: "#0d0f16",
                    border: `1px solid ${done ? "#00FF8844" : `${getParticipantAccent(idx)}33`}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                  }
                },
                  React.createElement("div", { style: { display:"flex", alignItems:"center", gap:8, marginBottom:4 } },
                    React.createElement(TeamBadge, { name: participant.name, color: getParticipantAccent(idx), size: 24, subtle: true }),
                    React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 16, color: getParticipantAccent(idx), letterSpacing: 1 } }, participant.name)
                  ),
                  React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#888" } }, `${participant.squad.length} in squad · ${participant.budget}M available`),
                  React.createElement("div", { style: { display:"flex", alignItems:"center", gap:6, marginTop:4 } },
                  done ? React.createElement(StatusPill, { tone: "green" }, "SUBMITTED") : React.createElement(StatusPill, { tone: "gold" }, "LIST 2-5"),
                    React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: done ? "#00FF88" : "#FFD700", fontWeight: 700 } },
                    done ? `Submitted ${saleCount} listings` : `${saleCount}/${transferSaleMin}-${transferSaleMax} listed`)
                  )
                );
              })
            ),
            myParticipant && React.createElement(React.Fragment, null,
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" } },
                React.createElement("div", null,
                  React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 24, color: "#fff", letterSpacing: 2 } }, `${myParticipant.name} SQUAD`),
                  React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 13, color: "#777" } },
                    myTransferCompleted
                    ? `Submitted. Waiting for the host to open the market. Expected opening budget: ${myParticipant.budget}M`
                    : transferDeadlinePassed
                      ? `Listing deadline has passed. Expected opening budget: ${myParticipant.budget}M`
                      : `Choose ${transferSaleMin}-${transferSaleMax} players to put back into auction. Current budget: ${myParticipant.budget}M · Budget after selected listings: ${myParticipant.budget + selectedSaleBudgetGain}M`)
                ),
                !myTransferCompleted && React.createElement("button", {
                  onClick: handleSubmitSales,
                  disabled: actionBusy || saleSubmitting || transferDeadlinePassed || selectedSalePlayers.length < transferSaleMin || selectedSalePlayers.length > transferSaleMax,
                  style: { ...BTN.gold, opacity: saleSubmitting || transferDeadlinePassed || selectedSalePlayers.length < transferSaleMin || selectedSalePlayers.length > transferSaleMax ? 0.6 : 1 }
                }, saleSubmitting ? "SUBMITTING…" : `SUBMIT ${selectedSalePlayers.length} LISTINGS`)
              ),
              React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
                myParticipant.squad
                  .slice()
                  .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
                  .map((player) => {
                    const selected = selectedSales.has(player.id);
                    const price = getPlayerAcquisitionPrice(player, activeTiers);
                    return React.createElement("div", {
                      key: player.id,
                      style: {
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        background: selected ? "#FFD70012" : "#0d0f16",
                        border: `1px solid ${selected ? "#FFD70055" : "#1e2230"}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                      }
                    },
                      React.createElement("div", { style: { minWidth: 0 } },
                        React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 16, color: "#fff" } }, `${player.name} · ${player.rating}`),
                        React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#777" } }, `${player.pos} · Bought for ${price}M · Returns to the transfer pool if listed`)
                      ),
                      React.createElement("button", {
                        onClick: () => toggleSaleSelection(player.id),
                        disabled: actionBusy || myTransferCompleted || saleSubmitting || transferDeadlinePassed || (!selected && selectedSales.size >= transferSaleMax),
                        style: selected
                          ? { ...BTN.gold, padding: "8px 14px", fontSize: 12 }
                          : { ...BTN.ghost, padding: "8px 14px", fontSize: 12, color: "#FF6B35", borderColor: "#FF6B3544" }
                      }, selected ? "LISTED" : "PUT UP")
                    );
                  })
              )
            )
          ),
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 18 } },
            React.createElement("div", { style: { background: "#0a0c12", border: "1px solid #1e2230", borderRadius: 16, padding: 18 } },
              React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: "#4FC3F7", letterSpacing: 2, marginBottom: 12 } }, "TRANSFER ENTRIES"),
              soldPool.length === 0
                ? React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 13, color: "#666" } }, "No one has listed players yet. Unsold carry-over players are added automatically when the host opens the market.")
                : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
                    soldPool.map((player, idx) =>
                      React.createElement(PlayerRow, {
                        key: `${player.seller}-${player.id}-${idx}`,
                        player,
                        sold: true,
                        unavailableLabel: `SOLD BY ${player.seller}`,
                        ownerColor: PCOLORS[player.sellerIdx % PCOLORS.length],
                        isWishlist: false,
                        onWishlist: () => {},
                        tiers: activeTiers,
                        participants,
                        currentUserName: user.username,
                      })
                    )
                  )
            ),
            isHost && React.createElement("div", { style: { background: "#0a0c12", border: "1px solid #1e2230", borderRadius: 16, padding: 18 } },
              React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: "#FFD700", letterSpacing: 2, marginBottom: 10 } }, "HOST CONTROL"),
              React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 13, color: "#888", lineHeight: 1.6, marginBottom: 14 } },
              transferDeadlinePassed
                ? `The listing deadline has ended. The host can now open the market when ready.`
                : everyoneCompletedTransferSales
                ? `Everyone has submitted the required listings. You can open the market now without waiting for the deadline. Opening the market will randomize ${unsoldCarryCount} unsold carry-over players plus the listed players into new lots and refresh Mystery Card candidates.`
                : `Wait until every participant submits ${transferSaleMin}-${transferSaleMax} listings before opening the transfer market.`),
              React.createElement("button", {
              onClick: handleOpenTransferMarket,
              disabled: actionBusy || !everyoneCompletedTransferSales || openingTransferMarket || !canOpenTransferMarketNow,
              style: { ...BTN.gold, width: "100%", opacity: !everyoneCompletedTransferSales || openingTransferMarket || !canOpenTransferMarketNow ? 0.6 : 1 }
              }, openingTransferMarket ? "OPENING MARKET…" : !everyoneCompletedTransferSales ? "WAIT FOR LISTINGS" : "OPEN TRANSFER MARKET")
            )
          )
        )
      )
    );
  }

  return React.createElement("div", { className: "auction-room" },
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
            onClick: () => { setMysteryDisclaimerOpen(false); setMysteryScratchStarted(false); setMysteryModalOpen(true); },
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
      onScratchStart: () => setMysteryScratchStarted(true),
      onScratchComplete: handleConfirmMysteryReveal,
      disableClose: mysteryScratchStarted,
      onClose: () => {
        if (mysteryScratchStarted) return;
        setMysteryModalOpen(false);
        setMysteryScratchStarted(false);
      },
    }),
    React.createElement("main", { className: "auction-main", "aria-label": "Player draft" },
      React.createElement("header", { className: "auction-header" },
        React.createElement("div", { className: "auction-topline" },
          React.createElement("span", { className: "auction-lot" }, `LOT ${currentLotNum} / ${lotOrder.length}`),
          React.createElement("span", { className: "auction-muted" }, `${availablePlayers.length} available`),
          !streamHealthy && React.createElement(StatusPill, { tone: "gold" }, "RECONNECTING"),
          React.createElement("span", { className: "auction-personal" }, `${myParticipant?.budget ?? 0}M left · ${myParticipant?.squad.length || 0}/${SQUAD_MAX} players`),
          React.createElement(AuctionRoomMenu, {
            roomCode, isHost, busy: actionBusy, backupPending, abandonedCount: abandonedBy.length,
            onCopy: async () => { try { await navigator.clipboard.writeText(roomCode); showToast("Room code copied", "#00FF88"); } catch { showToast("Copy failed", "#FF6B35"); } },
            onBackup: handleDownloadBackup, onReadmit: () => setReadmitOpen(true), onLeave: handleAbandonClick,
            onSkip: isHost && lotOpen && !lotClosing && /^player\s+\d+$/i.test(currentPickerName || "") ? handleHostForceSkip : null,
            pickerName: currentPickerName,
          })
        ),
        React.createElement("div", { className: `auction-turn${userCanAct && lotOpen && !lotClosing ? " auction-turn--self" : ""}`, role: "status", "aria-live": "polite" },
          React.createElement("span", null, lotClosing ? "Lot complete" : !lotOpen ? "Waiting for the host to open this lot"
            : userCanAct ? "Your turn — choose a player" : `${currentPickerName || "Another participant"} is picking. You can keep browsing.`),
          !lotClosing && !lotOpen && isHost && React.createElement("button", { style: BTN.gold, onClick: handleOpenLot, disabled: actionBusy }, "OPEN LOT"),
          !lotClosing && lotOpen && userCanAct && React.createElement("button", { style: BTN.ghost, onClick: handlePass, disabled: actionBusy }, "DONE FOR THIS LOT")
        ),
        actionFeedback,
        lotOpen && !lotClosing && React.createElement("div", { className: "auction-filters" },
          React.createElement("input", { type: "search", value: search, onChange: event => setSearch(event.target.value), placeholder: "Search players…", "aria-label": "Search players by name or position" }),
          ["ALL", ...Object.keys(POS_GROUPS)].map(group => React.createElement("button", { type: "button", key: group, "aria-pressed": groupFilter === group, onClick: () => setGroupFilter(group) }, group === "ALL" ? "All" : POS_GROUPS[group].label)),
          React.createElement("label", { className: "auction-picked-toggle" },
            React.createElement("input", { type: "checkbox", checked: showPicked, onChange: event => setShowPicked(event.target.checked) }), "Show picked")
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
            ? React.createElement("button", { style:BTN.gold, onClick:handleNextLot, disabled: actionBusy }, "🏆 FINAL SQUADS")
            : canAnyoneBuyInFuture
              ? React.createElement("button", {
                  style:{ ...BTN.gold, opacity: actionPending ? .65 : 1 },
                  onClick:handleNextLot,
                  disabled: actionBusy
                }, actionPending ? "SYNCING…" : `OPEN LOT ${lotOrder[lotIdx+1]} →`)
              : React.createElement(React.Fragment, null,
                  React.createElement("div", { style:{ maxWidth:400, textAlign:"center", padding:"14px 20px",
                    background:"#1a0408", border:"1px solid #FF3D7144", borderRadius:10, marginBottom:4,
                    fontFamily:"'Rajdhani'", fontSize:14, color:"#FF6B9D", lineHeight:1.6 }
                  }, "⚠️ No player can afford anyone in the remaining lots — the game cannot continue."),
                  React.createElement("button", {
                    style:{ ...BTN.gold, background:"#2a0812", borderColor:"#FF3D71", color:"#FF3D71", opacity: actionPending ? .65 : 1 },
                    disabled: actionBusy,
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
          const players = filterP(lotPlayers.filter(p => getPosGroup(p.pos)===gk && (showPicked || !ownedIds.has(p.id))));
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
              const cantAfford = !owned && myParticipant && getTierData(p.rating, activeTiers).price > myParticipant.budget;
              const canPick = !owned && lotOpen && !lotClosing && userCanAct && !cantAfford && !isAtCap && !actionBusy;
              const wl = (wishlists[user.username] || []).includes(p.id);
              return React.createElement(PlayerRow, {
                key:p.id, player:p,
                onPick: canPick ? handlePick : null,
                owned, ownerName:owner?.name,
                ownerColor: ownerIdx>=0 ? PCOLORS[ownerIdx] : "#888",
                cantAfford: cantAfford && !owned,
                isWishlist: wl,
                onWishlist: id => onWishlist(user.username, id),
                compact: true,
                tiers: activeTiers,
                animDelay: i*.02,
                wishlists: wishlists,
                participants: participants,
                currentUserName: user.username
              });
            })
          );
        }),
        filterP(lotPlayers.filter(p => showPicked || !ownedIds.has(p.id))).length===0 && React.createElement("div", {
          style:{ textAlign:"center", padding:"40px 0", color:"#9baac0",
            fontFamily:"'Rajdhani'", fontSize:14 } }, "No available players match. Try another filter or show picked players.")
      )
    ),

    React.createElement(ResponsiveAuctionPanel, { open: panelOpen, onClose: () => setPanelOpen(false) },
      React.createElement("nav", { className: "auction-panel-tabs", "aria-label": "Auction information" },
        [["squad", "My squad"], ["teams", "Pick order"], ["activity", "Activity"]].map(([tab, label]) =>
          React.createElement("button", { type: "button", key: tab, "aria-pressed": panelTab === tab, onClick: () => setPanelTab(tab) }, label))
      ),
      panelTab === "squad" && React.createElement("div", { className: "auction-panel-content" },
        React.createElement("div", { className: "auction-muted" }, `${myParticipant?.budget ?? 0}M left · ${myParticipant?.squad.length || 0}/${SQUAD_MAX} players`),
        React.createElement("button", { style: { ...BTN.ghost, marginTop: 10 }, onClick: () => { setPanelOpen(false); setAnalyserOpen(true); } }, "Formation & planner"),
        myParticipant?.squad.length
          ? React.createElement("ul", { className: "auction-squad-list" }, myParticipant.squad.map(player => React.createElement("li", { key: player.id },
            React.createElement("strong", { style: { color: getTierData(player.rating, activeTiers).color } }, `${player.rating} · ${player.pos} `), player.name)))
          : React.createElement("p", { className: "auction-muted" }, "Your picks will appear here."),
        React.createElement("details", { className: "auction-mystery-section" },
          React.createElement("summary", null, "Lot & price guide"),
          Object.entries(activeTiers).map(([key, tier]) => React.createElement("p", { key, className: "auction-muted" },
            `${key} · ${tier.price}M · ${lotPlayers.filter(p => getTierKey(p.rating, activeTiers) === key).length} in this lot`))
        ),
        mysteryEnabled && React.createElement("details", { className: "auction-mystery-section", open: mysteryAvailable || undefined },
          React.createElement("summary", null, myMysteryUsed ? "Mystery Card · used" : `Mystery Card · ${MYSTERY_CARD_PRICE}M`),
          React.createElement(MysteryCard, {
            available: mysteryAvailable && !actionBusy,
            used: myMysteryUsed,
            revealedPlayer: myParticipant?.squad?.find(p => p.viaMystery) || null,
            price: MYSTERY_CARD_PRICE,
            hasPool: Boolean(myMysteryCandidate), affordable: myMysteryAffordable, squadHasRoom: myMysterySquadHasRoom,
            onClick: () => { setPanelOpen(false); handleOpenMysteryCard(); },
          })
        )
      ),
      panelTab === "teams" && React.createElement("div", { style:{ flex:1, overflow:"auto", minHeight:0 } },
        React.createElement(BudgetSidebar, {
          participants,
          sequence,
          currentTurn: lotOpen && !lotClosing ? currentPickerName || currentPickerKey : null,
          passedSet:passedThisLot,
          onAnalyse: () => { setPanelOpen(false); setAnalyserOpen(true); },
          lotIdx,
          totalLots:lotOrder.length,
          tiers: activeTiers,
          budgetPerBidder: initSession.budgetPerBidder,
        })
      ),
      panelTab === "activity" && React.createElement("div", { className: "auction-panel-content", "aria-label": "Recent picks" },
        React.createElement("div", { className: "auction-muted" }, "Recent picks"),
        recentPicks.length === 0 && React.createElement("p", { className: "auction-muted" }, "No picks yet."),
        React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:8, marginTop:10 } },
          recentPicks.map((pl) => {
            const td = getTierData(pl.rating, activeTiers);
            return React.createElement("div", { key:`${pl.owner}-${pl.id}-${pl.pickedAt || 0}`, style:{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"3px 6px", background:"#0a0c10", borderRadius:4
            }},
              React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:10, color:"#bbb", fontWeight:600,
                maxWidth:150, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" } }, pl.name),
              React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:9, color:PCOLORS[pl.ownerIdx], flex:1, textAlign:"center" } }, pl.owner),
              React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:td.color } }, `${getPlayerAcquisitionPrice(pl, activeTiers)}M`)
            );
          })
        )
      )
    ),
    React.createElement("footer", { className: "auction-mobile-bar" },
      React.createElement("span", null, `${myParticipant?.budget ?? 0}M · ${myParticipant?.squad.length || 0}/${SQUAD_MAX}`),
      React.createElement("button", { type: "button", onClick: () => { setPanelTab("squad"); setPanelOpen(true); } }, "Squad & room"),
      userCanAct && lotOpen && !lotClosing && React.createElement("button", { type: "button", disabled: actionBusy, onClick: handlePass }, "Done / pass")
    )
  );
}
