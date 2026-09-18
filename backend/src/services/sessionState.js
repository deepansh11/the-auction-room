function omitUndefinedFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
}

function normalizeSquadPlayer(player) {
  if (!player || typeof player !== "object") return player;

  const id = Number(player.id);
  const rating = Number(player.rating);
  const lot = Number(player.lot);
  const pickedAt = Number(player.pickedAt);
  const purchasePrice = Number(player.purchasePrice);
  const soldAt = Number(player.soldAt);
  const salePrice = Number(player.salePrice);

  return omitUndefinedFields({
    ...player,
    id: Number.isFinite(id) ? id : player.id,
    rating: Number.isFinite(rating) ? rating : player.rating,
    lot: Number.isFinite(lot) ? lot : player.lot,
    pickedAt: Number.isFinite(pickedAt) ? pickedAt : player.pickedAt,
    purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : player.purchasePrice,
    soldAt: Number.isFinite(soldAt) ? soldAt : player.soldAt,
    salePrice: Number.isFinite(salePrice) ? salePrice : player.salePrice,
    soldInTransferWindow: Boolean(player.soldInTransferWindow),
    viaMystery: Boolean(player.viaMystery),
  });
}

function normalizeParticipant(participant, fallbackBudget = 0) {
  if (!participant || typeof participant !== "object") {
    return { name: "", budget: fallbackBudget, squad: [] };
  }

  const budget = Number(participant.budget);
  return {
    ...participant,
    name: String(participant.name || "").trim(),
    budget: Number.isFinite(budget) ? budget : fallbackBudget,
    squad: Array.isArray(participant.squad) ? participant.squad.map(normalizeSquadPlayer) : [],
    soldPlayers: Array.isArray(participant.soldPlayers) ? participant.soldPlayers.map(normalizeSquadPlayer) : [],
  };
}

function normalizeFixtureMap(fixtures) {
  if (!fixtures || typeof fixtures !== "object" || Array.isArray(fixtures)) return {};
  return fixtures;
}

function normalizeGroups(groups) {
  if (!groups || typeof groups !== "object" || Array.isArray(groups)) return {};
  return groups;
}

function normalizeLotOrder(session) {
  const rawOrder = Array.isArray(session?.lotOrder)
    ? session.lotOrder.map((value) => Number(value)).filter(Number.isFinite)
    : [];
  const playerLots = [...(Array.isArray(session?.playerPool) ? session.playerPool : []), ...(Array.isArray(session?.shuffledPlayers) ? session.shuffledPlayers : [])]
    .map((player) => Number(player?.lot))
    .filter(Number.isFinite);
  const totalLots = Math.max(rawOrder.length, playerLots.length > 0 ? Math.max(...playerLots) : 0);
  return totalLots > 0 ? Array.from({ length: totalLots }, (_, index) => index + 1) : [];
}

export function normalizeSessionDocument(session) {
  if (!session || typeof session !== "object") return session;

  const budgetPerBidder = Number(session.budgetPerBidder || 0);
  const participants = Array.isArray(session.participants)
    ? session.participants.map((participant) => normalizeParticipant(participant, budgetPerBidder))
    : [];
  const participantNames = Array.isArray(session.participantNames) && session.participantNames.length > 0
    ? session.participantNames.map((name) => String(name || "").trim()).filter(Boolean)
    : participants.map((participant) => participant.name).filter(Boolean);
  const lotOrder = normalizeLotOrder(session);
  const sequence = Array.isArray(session.sequence) ? session.sequence : participantNames.slice();
  const now = Date.now();

  return {
    ...session,
    participants,
    participantNames,
    budgetPerBidder,
    lotOrder,
    sequence,
    playerPool: Array.isArray(session.playerPool) ? session.playerPool : [],
    shuffledPlayers: Array.isArray(session.shuffledPlayers) ? session.shuffledPlayers : [],
    passedThisLot: Array.isArray(session.passedThisLot) ? session.passedThisLot : [],
    mysteryEnabled: Boolean(session.mysteryEnabled),
    mysteryPools: session.mysteryPools && typeof session.mysteryPools === "object" ? session.mysteryPools : {},
    mysteryCurrent: session.mysteryCurrent && typeof session.mysteryCurrent === "object" ? session.mysteryCurrent : {},
    mysteryUsed: session.mysteryUsed && typeof session.mysteryUsed === "object" ? session.mysteryUsed : {},
    groupsEnabled: Boolean(session.groupsEnabled),
    groupCount: Number(session.groupCount) || 0,
    groups: normalizeGroups(session.groups),
    fixtures: normalizeFixtureMap(session.fixtures),
    fixtureLeg: session.fixtureLeg === "double" ? "double" : "single",
    knockoutFormat: ["semiFinal", "quarterFinal", "finalOnly"].includes(session.knockoutFormat)
      ? session.knockoutFormat
      : "semiFinal",
    lotIdx: Number(session.lotIdx) || 0,
    turnIdx: Number(session.turnIdx) || 0,
    drawPhase: Number(session.drawPhase) || 0,
    revealedLotCount: Number(session.revealedLotCount) || 0,
    revealedPickCount: Number(session.revealedPickCount) || 0,
    lotOpen: Boolean(session.lotOpen),
    lotClosing: Boolean(session.lotClosing),
    status: typeof session.status === "string" ? session.status : "draw",
    soldPlayerIds: Array.isArray(session.soldPlayerIds) ? session.soldPlayerIds : [],
    expectedBudgets: session.expectedBudgets && typeof session.expectedBudgets === "object" ? session.expectedBudgets : {},
    transferWindow: session.transferWindow && typeof session.transferWindow === "object"
      ? {
          phase: typeof session.transferWindow.phase === "string" ? session.transferWindow.phase : "locked",
          requiredSalesMin: Number(session.transferWindow.requiredSalesMin) || 2,
          requiredSalesMax: Number(session.transferWindow.requiredSalesMax) || 5,
          completedBy: Array.isArray(session.transferWindow.completedBy) ? session.transferWindow.completedBy : [],
          openedAt: Number(session.transferWindow.openedAt) || null,
          closedAt: Number(session.transferWindow.closedAt) || null,
          sourceResultId: String(session.transferWindow.sourceResultId || ""),
          sourceSessionId: String(session.transferWindow.sourceSessionId || ""),
          saleTargetSize: Number(session.transferWindow.saleTargetSize) || 16,
          activeSessionId: String(session.transferWindow.activeSessionId || ""),
          unsoldCarryCount: Number(session.transferWindow.unsoldCarryCount) || 0,
        }
      : {
          phase: "locked",
          requiredSalesMin: 2,
          requiredSalesMax: 5,
          completedBy: [],
          openedAt: null,
          closedAt: null,
          sourceResultId: "",
          sourceSessionId: "",
          saleTargetSize: 16,
          activeSessionId: "",
          unsoldCarryCount: 0,
        },
    carriedBudgets: session.carriedBudgets && typeof session.carriedBudgets === "object" ? session.carriedBudgets : {},
    seasonInfo: session.seasonInfo && typeof session.seasonInfo === "object"
      ? {
          seasonNumber: Number(session.seasonInfo.seasonNumber) || 1,
          leagueName: String(session.seasonInfo.leagueName || "Elite League"),
          phase: String(session.seasonInfo.phase || "first-leg"),
        }
      : {
          seasonNumber: 1,
          leagueName: "Elite League",
          phase: "first-leg",
        },
    createdAt: Number(session.createdAt) || now,
    updatedAt: Number(session.updatedAt) || now,
  };
}

export function normalizeAuctionResultDocument(result) {
  if (!result || typeof result !== "object") return result;

  const normalizedSession = normalizeSessionDocument({
    ...result,
    participantNames: result.participantNames,
    participants: result.participants,
    budgetPerBidder: result.budgetPerBidder,
    playerPool: result.playerPool,
    shuffledPlayers: result.playerPool,
    groups: result.groups,
    fixtures: result.fixtures,
    mysteryEnabled: result.mysteryEnabled,
    groupsEnabled: result.groupsEnabled,
    groupCount: result.groupCount,
    fixtureLeg: result.fixtureLeg,
    knockoutFormat: result.knockoutFormat,
    status: "complete",
  });

  return {
    ...result,
    ...normalizedSession,
    sessionId: String(result.sessionId || result.id || ""),
    name: String(result.name || "Auction Result"),
    host: String(result.host || ""),
    completedAt: Number(result.completedAt) || normalizedSession.updatedAt,
    createdAt: Number(result.createdAt) || normalizedSession.createdAt,
    status: "complete",
  };
}

export function buildSessionBackupPayload(session) {
  const normalized = normalizeSessionDocument(session);
  return {
    exportVersion: 1,
    exportedAt: Date.now(),
    type: "fc-bidding-room-session-backup",
    session: normalized,
  };
}
