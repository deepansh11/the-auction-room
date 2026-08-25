/**
 * Controls exactly what a session document is allowed to reveal to a given viewer.
 *
 * Two secrets must never leak over the network to a client that isn't entitled to them:
 *  1. Which players sit in lots that haven't been opened yet (playerPool / shuffledPlayers).
 *  2. Anyone's Mystery Card pool or another participant's currently-rolled candidate.
 *
 * Every read path (REST responses and realtime broadcasts) must funnel through
 * `sanitizeSessionForViewer` before the payload leaves the server.
 */

/**
 * @returns {Set<number>} the set of lot numbers (as they appear in each player's `lot` field)
 * that the given session currently allows anyone to see the contents of.
 */
export function getVisibleLotSet(session) {
  const lotOrder = Array.isArray(session?.lotOrder) ? session.lotOrder : [];
  const status = session?.status;

  // Once an auction is finished (or cancelled) there is nothing left to hide.
  if (status === "complete" || status === "cancelled") {
    return new Set(lotOrder);
  }

  // During the draw ceremony, no lot's contents should be visible to anyone yet.
  if (status !== "active") {
    return new Set();
  }

  const lotIdx = Number(session?.lotIdx || 0);
  const visible = lotOrder.slice(0, Math.max(0, lotIdx)); // lots already fully completed
  const currentLotNum = lotOrder[lotIdx];
  const currentLotRevealed = Boolean(session?.lotOpen || session?.lotClosing);

  if (currentLotRevealed && currentLotNum != null) {
    visible.push(currentLotNum);
  }

  return new Set(visible);
}

function filterPlayersByVisibleLots(players, visibleLotSet) {
  if (!Array.isArray(players)) return [];
  return players.filter((p) => visibleLotSet.has(Number(p?.lot)));
}

/**
 * The draw ceremony's entire purpose is a progressive reveal of `lotOrder` (draw order) and
 * `sequence` (pick order) — so, just like unopened lots, the *undrawn* portion of these two
 * arrays must never reach any client, including the host who created them.
 */
export function getRevealedDrawState(session) {
  const lotOrder = Array.isArray(session?.lotOrder) ? session.lotOrder : [];
  const sequence = Array.isArray(session?.sequence) ? session.sequence : [];

  // Once the draw ceremony has finished (or the game is over), both arrays are fully public.
  if (session?.status !== "draw") {
    return { lotOrder, sequence };
  }

  const phase = Number(session?.drawPhase || 0);
  if (phase === 0) {
    const revealedLotCount = Number(session?.revealedLotCount || 0);
    return { lotOrder: lotOrder.slice(0, revealedLotCount), sequence: [] };
  }

  const revealedPickCount = Number(session?.revealedPickCount || 0);
  return { lotOrder, sequence: sequence.slice(0, revealedPickCount) };
}

/**
 * Returns true if `username` is the host or a current participant of `session`
 * (case-insensitive, since usernames are matched case-insensitively elsewhere too).
 */
export function isSessionParticipant(session, username) {
  if (!session || !username) return false;
  const needle = String(username).toLowerCase();
  if (String(session.host || "").toLowerCase() === needle) return true;
  const participants = Array.isArray(session.participants) ? session.participants : [];
  return participants.some((p) => String(p?.name || "").toLowerCase() === needle);
}

/**
 * Produces the session document as `viewerUsername` is allowed to see it: unopened lots are
 * stripped out entirely (not just renamed/redacted — removed, so id+lot pairing can't be
 * cross-referenced against the public players CSV), Mystery Card pools are never exposed, and
 * mysteryCurrent is collapsed down to only the viewer's own candidate.
 */
export function sanitizeSessionForViewer(session, viewerUsername) {
  if (!session) return session;

  const visibleLotSet = getVisibleLotSet(session);
  const { lotOrder, sequence } = getRevealedDrawState(session);
  const sanitized = {
    ...session,
    lotOrder,
    sequence,
    playerPool: filterPlayersByVisibleLots(session.playerPool, visibleLotSet),
    shuffledPlayers: filterPlayersByVisibleLots(session.shuffledPlayers, visibleLotSet),
  };

  delete sanitized.mysteryPools;

  const currentMap = session.mysteryCurrent;
  if (viewerUsername && currentMap && typeof currentMap === "object" && viewerUsername in currentMap) {
    sanitized.mysteryCurrent = { [viewerUsername]: currentMap[viewerUsername] };
  } else {
    sanitized.mysteryCurrent = {};
  }

  return sanitized;
}

/**
 * Minimal, non-game-data view used before a user has joined a session (room lookup /
 * existence check). Never includes player, lot, or mystery data regardless of status.
 */
export function sanitizeRoomPreview(session) {
  if (!session) return session;
  return {
    id: session.id,
    roomCode: session.roomCode,
    name: session.name,
    host: session.host,
    status: session.status,
    budgetPerBidder: session.budgetPerBidder,
    participantNames: Array.isArray(session.participantNames) ? session.participantNames : [],
    totalLots: Array.isArray(session.lotOrder) ? session.lotOrder.length : 0,
    mysteryEnabled: Boolean(session.mysteryEnabled),
    groupsEnabled: Boolean(session.groupsEnabled),
    groupCount: Number(session.groupCount) || 0,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Every username that should receive updates about this session (host + all participants).
 */
export function collectSessionRecipients(session) {
  const names = new Set();
  if (session?.host) names.add(session.host);
  (Array.isArray(session?.participants) ? session.participants : []).forEach((p) => {
    if (p?.name) names.add(p.name);
  });
  return names;
}
