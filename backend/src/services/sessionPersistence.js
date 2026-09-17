import { normalizeSessionDocument } from "./sessionState.js";

export async function persistCompletedSessionResult(db, session) {
  if (!session || session.status !== "complete" || !session.id) return;
  const normalizedSession = normalizeSessionDocument(session);

  const resultPayload = {
    sessionId: String(normalizedSession.id),
    roomCode: normalizedSession.roomCode || "",
    name: normalizedSession.name || "Auction Result",
    host: normalizedSession.host || "",
    budgetPerBidder: Number(normalizedSession.budgetPerBidder || 0),
    participants: Array.isArray(normalizedSession.participants) ? normalizedSession.participants : [],
    participantNames: Array.isArray(normalizedSession.participantNames) ? normalizedSession.participantNames : [],
    tiers: normalizedSession.tiers || {},
    playerPool: normalizedSession.playerPool || normalizedSession.shuffledPlayers || [],
    mysteryEnabled: Boolean(normalizedSession.mysteryEnabled),
    groupsEnabled: Boolean(normalizedSession.groupsEnabled),
    groupCount: Number(normalizedSession.groupCount) || 0,
    fixtureLeg: normalizedSession.fixtureLeg || "single",
    knockoutFormat: normalizedSession.knockoutFormat || "semiFinal",
    groups: normalizedSession.groups || {},
    fixtures: normalizedSession.fixtures || {},
    soldPlayerIds: normalizedSession.soldPlayerIds || [],
    transferWindow: normalizedSession.transferWindow || {},
    carriedBudgets: normalizedSession.carriedBudgets || {},
    seasonInfo: normalizedSession.seasonInfo || {},
    completedAt: normalizedSession.updatedAt || Date.now(),
    createdAt: normalizedSession.createdAt || Date.now(),
    status: "complete",
  };

  await db.collection("auctionResults").doc(String(normalizedSession.id)).set(resultPayload, { merge: true });
}
