export async function persistCompletedSessionResult(db, session) {
  if (!session || session.status !== "complete" || !session.id) return;

  const resultPayload = {
    sessionId: String(session.id),
    roomCode: session.roomCode || "",
    name: session.name || "Auction Result",
    host: session.host || "",
    participants: Array.isArray(session.participants) ? session.participants : [],
    participantNames: Array.isArray(session.participants)
      ? session.participants.map((p) => p.name)
      : [],
    tiers: session.tiers || {},
    playerPool: session.playerPool || session.shuffledPlayers || [],
    completedAt: session.updatedAt || Date.now(),
    createdAt: session.createdAt || Date.now(),
    status: "complete",
  };

  await db.collection("auctionResults").doc(String(session.id)).set(resultPayload, { merge: true });
}
