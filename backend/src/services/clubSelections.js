import { ISL_CLUBS } from "../../shared/islClubs.js";

function authorize(result, username) {
  if (!username || (result.host !== username && !(result.participantNames || []).includes(username))) {
    throw Object.assign(new Error("You are not part of this auction."), { status: 403 });
  }
}

export async function readClubSelections(db, resultId, username) {
  const snap = await db.collection("auctionResults").doc(resultId).get();
  if (!snap.exists) throw Object.assign(new Error("Auction result not found"), { status: 404 });
  const result = snap.data();
  authorize(result, username);
  return result.clubSelections || {};
}

export async function saveClubSelection(db, resultId, username, clubId) {
  if (typeof clubId !== "string" || (clubId && !ISL_CLUBS.some(club => club.id === clubId))) throw Object.assign(new Error("Choose a club from the FC 26 ISL list."), { status: 400 });
  const ref = db.collection("auctionResults").doc(resultId);
  return db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw Object.assign(new Error("Auction result not found"), { status: 404 });
    const result = snap.data();
    authorize(result, username);
    if (!(result.participants || []).some(participant => participant.name === username)) throw Object.assign(new Error("Only a squad owner can select their own club."), { status: 403 });
    const selections = clubId ? { ...(result.clubSelections || {}), [username]: clubId } : { ...(result.clubSelections || {}) };
    if (!clubId) delete selections[username];
    const sessionId = result.transferWindow?.activeSessionId;
    const sessionRef = sessionId ? db.collection("sessions").doc(sessionId) : null;
    const sessionSnap = sessionRef ? await transaction.get(sessionRef) : null;
    const updatedAt = Date.now();
    transaction.set(ref, { clubSelections: selections, updatedAt }, { merge: true });
    let live = null;
    if (sessionSnap?.exists && !["complete", "cancelled"].includes(sessionSnap.data().status)) {
      const session = sessionSnap.data();
      live = { ...session, clubSelections: selections, updatedAt, revision: Number(session.revision || 0) + 1 };
      transaction.update(sessionRef, { clubSelections: selections, updatedAt, revision: live.revision });
    }
    return { clubSelections: selections, live };
  });
}
