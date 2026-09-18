function omitUndefinedFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
}

function normalizeSquadPlayer(player) {
  if (!player || typeof player !== "object") return player;

  return omitUndefinedFields({
    ...player,
    purchasePrice: Number.isFinite(Number(player.purchasePrice)) ? Number(player.purchasePrice) : player.purchasePrice,
    soldAt: Number.isFinite(Number(player.soldAt)) ? Number(player.soldAt) : player.soldAt,
    salePrice: Number.isFinite(Number(player.salePrice)) ? Number(player.salePrice) : player.salePrice,
    soldInTransferWindow: Boolean(player.soldInTransferWindow),
    viaMystery: Boolean(player.viaMystery),
  });
}

function normalizeParticipant(participant, fallbackBudget = 0) {
  if (!participant || typeof participant !== "object") {
    return { name: "", budget: fallbackBudget, squad: [], soldPlayers: [] };
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

export function normalizeSessionRecord(session) {
  if (!session || typeof session !== "object") return session;

  const budgetPerBidder = Number(session.budgetPerBidder || 0);
  const participants = Array.isArray(session.participants)
    ? session.participants.map((participant) => normalizeParticipant(participant, budgetPerBidder))
    : [];
  const participantNames = Array.isArray(session.participantNames) && session.participantNames.length > 0
    ? session.participantNames.map((name) => String(name || "").trim()).filter(Boolean)
    : participants.map((participant) => participant.name).filter(Boolean);

  return {
    ...session,
    budgetPerBidder,
    participants,
    participantNames,
    lotOrder: normalizeLotOrder(session),
    sequence: Array.isArray(session.sequence) ? session.sequence : participantNames.slice(),
    playerPool: Array.isArray(session.playerPool) ? session.playerPool : [],
    shuffledPlayers: Array.isArray(session.shuffledPlayers) ? session.shuffledPlayers : [],
    passedThisLot: Array.isArray(session.passedThisLot) ? session.passedThisLot : [],
    mysteryEnabled: Boolean(session.mysteryEnabled),
    mysteryCurrent: session.mysteryCurrent && typeof session.mysteryCurrent === "object" ? session.mysteryCurrent : {},
    mysteryUsed: session.mysteryUsed && typeof session.mysteryUsed === "object" ? session.mysteryUsed : {},
    groupsEnabled: Boolean(session.groupsEnabled),
    groupCount: Number(session.groupCount) || 0,
    groups: session.groups && typeof session.groups === "object" ? session.groups : {},
    fixtures: session.fixtures && typeof session.fixtures === "object" ? session.fixtures : {},
    fixtureLeg: session.fixtureLeg === "double" ? "double" : "single",
    knockoutFormat: ["semiFinal", "quarterFinal", "finalOnly"].includes(session.knockoutFormat)
      ? session.knockoutFormat
      : "semiFinal",
    soldPlayerIds: Array.isArray(session.soldPlayerIds) ? session.soldPlayerIds : [],
    expectedBudgets: session.expectedBudgets && typeof session.expectedBudgets === "object" ? session.expectedBudgets : {},
    transferWindow: session.transferWindow && typeof session.transferWindow === "object"
      ? {
          phase: typeof session.transferWindow.phase === "string" ? session.transferWindow.phase : "locked",
          requiredSalesMin: Number(session.transferWindow.requiredSalesMin) || 2,
          requiredSalesMax: Number(session.transferWindow.requiredSalesMax) || 5,
          completedBy: Array.isArray(session.transferWindow.completedBy) ? session.transferWindow.completedBy : [],
          listingDeadlineAt: Number(session.transferWindow.listingDeadlineAt) || null,
          listingDeadlineSetAt: Number(session.transferWindow.listingDeadlineSetAt) || null,
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
          listingDeadlineAt: null,
          listingDeadlineSetAt: null,
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
  };
}

export function normalizeResultRecord(result) {
  if (!result || typeof result !== "object") return result;

  const normalized = normalizeSessionRecord({
    ...result,
    status: "complete",
    shuffledPlayers: result.playerPool,
  });

  return {
    ...result,
    ...normalized,
    sessionId: String(result.sessionId || result.id || ""),
    status: "complete",
    completedAt: Number(result.completedAt) || 0,
    createdAt: Number(result.createdAt) || 0,
  };
}
