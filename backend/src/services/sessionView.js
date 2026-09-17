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
  const normalizedSession = normalizeSessionDocument(session);
  const lotOrder = Array.isArray(normalizedSession?.lotOrder) ? normalizedSession.lotOrder : [];
  const status = normalizedSession?.status;

  // Once an auction is finished (or cancelled) there is nothing left to hide.
  if (status === "complete" || status === "cancelled") {
    return new Set(lotOrder);
  }

  // During the draw ceremony, no lot's contents should be visible to anyone yet.
  if (status !== "active") {
    return new Set();
  }

  const lotIdx = Number(normalizedSession?.lotIdx || 0);
  const visible = lotOrder.slice(0, Math.max(0, lotIdx)); // lots already fully completed
  const currentLotNum = lotOrder[lotIdx];
  const currentLotRevealed = Boolean(normalizedSession?.lotOpen || normalizedSession?.lotClosing);

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
 * During the draw screen only the pick sequence stays hidden. Lot order is fixed sequentially,
 * so it can be sent in full even before bidding starts.
 */
export function getRevealedDrawState(session) {
  const normalizedSession = normalizeSessionDocument(session);
  const lotOrder = Array.isArray(normalizedSession?.lotOrder) ? normalizedSession.lotOrder : [];
  const sequence = Array.isArray(normalizedSession?.sequence) ? normalizedSession.sequence : [];

  // Once bidding starts (or the game is over), the whole pick sequence is public.
  if (normalizedSession?.status !== "draw") {
    return { lotOrder, sequence };
  }

  const revealedPickCount = Number(normalizedSession?.revealedPickCount || 0);
  return { lotOrder, sequence: sequence.slice(0, revealedPickCount) };
}

/**
 * Returns true if `username` is the host or a current participant of `session`
 * (case-insensitive, since usernames are matched case-insensitively elsewhere too).
 */
export function isSessionParticipant(session, username) {
  if (!session || !username) return false;
  const normalizedSession = normalizeSessionDocument(session);
  const needle = String(username).toLowerCase();
  if (String(normalizedSession.host || "").toLowerCase() === needle) return true;
  const participants = Array.isArray(normalizedSession.participants) ? normalizedSession.participants : [];
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
  const normalizedSession = normalizeSessionDocument(session);

  const visibleLotSet = getVisibleLotSet(normalizedSession);
  const { lotOrder, sequence } = getRevealedDrawState(normalizedSession);
  const sanitized = {
    ...normalizedSession,
    lotOrder,
    sequence,
    playerPool: filterPlayersByVisibleLots(normalizedSession.playerPool, visibleLotSet),
    shuffledPlayers: filterPlayersByVisibleLots(normalizedSession.shuffledPlayers, visibleLotSet),
  };

  delete sanitized.mysteryPools;

  const currentMap = normalizedSession.mysteryCurrent;
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
  const normalizedSession = normalizeSessionDocument(session);
  return {
    id: normalizedSession.id,
    roomCode: normalizedSession.roomCode,
    name: normalizedSession.name,
    host: normalizedSession.host,
    status: normalizedSession.status,
    budgetPerBidder: normalizedSession.budgetPerBidder,
    participantNames: Array.isArray(normalizedSession.participantNames) ? normalizedSession.participantNames : [],
    totalLots: Array.isArray(normalizedSession.lotOrder) ? normalizedSession.lotOrder.length : 0,
    mysteryEnabled: Boolean(normalizedSession.mysteryEnabled),
    groupsEnabled: Boolean(normalizedSession.groupsEnabled),
    groupCount: Number(normalizedSession.groupCount) || 0,
    createdAt: normalizedSession.createdAt,
    updatedAt: normalizedSession.updatedAt,
  };
}

/**
 * Every username that should receive updates about this session (host + all participants).
 */
export function collectSessionRecipients(session) {
  const normalizedSession = normalizeSessionDocument(session);
  const names = new Set();
  if (normalizedSession?.host) names.add(normalizedSession.host);
  (Array.isArray(normalizedSession?.participants) ? normalizedSession.participants : []).forEach((p) => {
    if (p?.name) names.add(p.name);
  });
  return names;
}
import { normalizeSessionDocument } from "./sessionState.js";
