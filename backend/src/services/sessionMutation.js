import { normalizeSessionDocument } from "./sessionState.js";

// Administrative writers share Firestore's conflict detection with gameplay commands.
export async function mutateSession(db, id, change) {
  const ref = db.collection("sessions").doc(String(id));
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw Object.assign(new Error("Session not found"), { status: 404 });
    const previous = normalizeSessionDocument(snapshot.data());
    if (["complete", "cancelled"].includes(previous.status)) throw Object.assign(new Error("Session is already closed"), { status: 409 });
    const next = await change(structuredClone(previous), transaction);
    if (JSON.stringify(previous) === JSON.stringify(next)) return previous;
    next.revision = Number(previous.revision || 0) + 1;
    next.updatedAt = Date.now();
    const fields = Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(previous[key]) !== JSON.stringify(value)));
    transaction.update(ref, fields);
    return next;
  });
}
