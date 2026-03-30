import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../middleware/userAuth.js";
import { normalizeFirebaseError } from "../services/firebaseErrors.js";
import { getFirebase } from "../services/firebaseService.js";
import { persistCompletedSessionResult } from "../services/sessionPersistence.js";

const router = Router();

const roomCodeSchema = z.string().min(4).max(12);

function isPlaceholderName(name) {
  return /^player\s+\d+$/i.test(String(name || "").trim());
}

function replaceNameInSequence(sequence, oldName, newName) {
  return Array.isArray(sequence)
    ? sequence.map((name) => (name === oldName ? newName : name))
    : sequence;
}

function removeFromSequence(sequence, name) {
  return Array.isArray(sequence)
    ? sequence.filter((entry) => entry !== name)
    : sequence;
}

function withParticipantNames(session) {
  return {
    ...session,
    participantNames: Array.isArray(session?.participants)
      ? session.participants.map((p) => p.name)
      : [],
    updatedAt: Date.now(),
  };
}

async function cleanupLiveSession(db, session) {
  if (!session?.id) return;
  const batch = db.batch();
  const sessionRef = db.collection("sessions").doc(String(session.id));
  batch.delete(sessionRef);
  if (session.roomCode) {
    const roomRef = db.collection("rooms").doc(String(session.roomCode).toUpperCase());
    batch.delete(roomRef);
  }
  await batch.commit();
}

router.post("/rooms", requireUserAuth, async (req, res) => {
  try {
    const session = req.body?.session;
    if (!session?.id || !session?.roomCode) {
      return res.status(400).json({ error: "session.id and session.roomCode are required" });
    }

    const { db } = getFirebase();
    const roomCode = String(session.roomCode).toUpperCase();
    const normalized = withParticipantNames({ ...session, roomCode });

    await db.collection("sessions").doc(String(session.id)).set(normalized, { merge: true });
    await db.collection("rooms").doc(roomCode).set({ sessionId: String(session.id), roomCode, updatedAt: Date.now() }, { merge: true });
    await persistCompletedSessionResult(db, normalized);

    return res.status(201).json({ session: normalized });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to create room", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.get("/rooms/:roomCode", async (req, res) => {
  try {
    const roomCode = roomCodeSchema.parse(String(req.params.roomCode || "").toUpperCase());
    const { db } = getFirebase();

    const roomDoc = await db.collection("rooms").doc(roomCode).get();
    if (!roomDoc.exists) return res.status(404).json({ error: "Room not found" });

    const sessionId = roomDoc.data()?.sessionId;
    const sessionDoc = await db.collection("sessions").doc(String(sessionId)).get();
    if (!sessionDoc.exists) {
      await db.collection("rooms").doc(roomCode).delete();
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ session: sessionDoc.data() });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to fetch room", 400);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/rooms/:roomCode/join", requireUserAuth, async (req, res) => {
  try {
    const roomCode = roomCodeSchema.parse(String(req.params.roomCode || "").toUpperCase());
    const username = String(req.body?.username || "").trim();
    if (!username) return res.status(400).json({ error: "username is required" });

    const { db } = getFirebase();
    const roomDoc = await db.collection("rooms").doc(roomCode).get();
    if (!roomDoc.exists) return res.status(404).json({ error: "Room not found" });

    const sessionRef = db.collection("sessions").doc(String(roomDoc.data()?.sessionId));
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      await db.collection("rooms").doc(roomCode).delete();
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessionSnap.data();
    const participants = Array.isArray(session.participants) ? [...session.participants] : [];
    const baseBudget = Number(session?.budgetPerBidder || 0);

    const exactIdx = participants.findIndex((p) => p.name === username);
    if (exactIdx >= 0) {
      return res.json({ session });
    }

    const caseInsensitiveIdx = participants.findIndex(
      (p) => String(p.name || "").toLowerCase() === username.toLowerCase()
    );
    if (caseInsensitiveIdx >= 0) {
      const previousName = participants[caseInsensitiveIdx].name;
      participants[caseInsensitiveIdx] = { ...participants[caseInsensitiveIdx], name: username };
      const normalized = withParticipantNames({
        ...session,
        participants,
        sequence: replaceNameInSequence(session.sequence, previousName, username),
      });
      await sessionRef.set(normalized, { merge: true });
      return res.json({ session: normalized });
    }

    const placeholderIdx = participants.findIndex((p) => isPlaceholderName(p?.name));
    if (placeholderIdx >= 0) {
      const previousName = participants[placeholderIdx].name;
      participants[placeholderIdx] = { ...participants[placeholderIdx], name: username };
      const normalized = withParticipantNames({
        ...session,
        participants,
        sequence: replaceNameInSequence(session.sequence, previousName, username),
      });
      await sessionRef.set(normalized, { merge: true });
      return res.json({ session: normalized });
    }

    // Host should always be able to rejoin a room they created, even if their participant entry is missing.
    if (session.host === username) {
      const nextParticipants = [...participants, { name: username, budget: baseBudget, squad: [] }];
      const nextSequence = Array.isArray(session.sequence) ? [...session.sequence] : [];
      if (!nextSequence.includes(username)) {
        nextSequence.push(username);
      }
      const normalized = withParticipantNames({
        ...session,
        participants: nextParticipants,
        sequence: nextSequence,
      });
      await sessionRef.set(normalized, { merge: true });
      return res.json({ session: normalized });
    }

    const expectedNames = participants.map((p) => p.name).join(", ");
    return res.status(409).json({
      error: `No open seat for '${username}'. Ask host to add your exact username in setup. Expected participants: ${expectedNames}`,
    });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to join room", 400);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.get("/sessions", requireUserAuth, async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    if (!username) return res.status(400).json({ error: "username query param is required" });

    const { db } = getFirebase();
    const byHostSnap = await db.collection("sessions").where("host", "==", username).get();
    const byParticipantSnap = await db.collection("sessions").where("participantNames", "array-contains", username).get();

    const map = new Map();
    byHostSnap.docs.forEach((d) => map.set(d.id, d.data()));
    byParticipantSnap.docs.forEach((d) => map.set(d.id, d.data()));

    const sessions = Array.from(map.values()).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    return res.json({ sessions });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to list sessions", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.get("/sessions/:id", async (req, res) => {
  try {
    const { db } = getFirebase();
    const snap = await db.collection("sessions").doc(String(req.params.id)).get();
    if (!snap.exists) return res.status(404).json({ error: "Session not found" });
    return res.json({ session: snap.data() });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to fetch session", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.put("/sessions/:id", requireUserAuth, async (req, res) => {
  try {
    const session = req.body?.session;
    if (!session || !session.id) return res.status(400).json({ error: "session payload is required" });

    const { db } = getFirebase();
    const normalized = withParticipantNames(session);
    if (normalized.status === "complete") {
      await persistCompletedSessionResult(db, normalized);
      await cleanupLiveSession(db, normalized);
      return res.status(204).send();
    }

    if (normalized.status === "cancelled") {
      await cleanupLiveSession(db, normalized);
      return res.status(204).send();
    }

    await db.collection("sessions").doc(String(req.params.id)).set(normalized, { merge: true });
    return res.status(204).send();
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to update session", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/sessions/:id/abandon", requireUserAuth, async (req, res) => {
  try {
    const { db } = getFirebase();
    const sessionRef = db.collection("sessions").doc(String(req.params.id));
    const snap = await sessionRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Session not found" });

    const session = snap.data();
    const username = String(req.user?.username || "").trim();
    if (!username) return res.status(400).json({ error: "Invalid user" });

    if (session.status === "complete" || session.status === "cancelled") {
      return res.status(409).json({ error: "Session is already closed" });
    }

    if (session.host === username) {
      const normalized = withParticipantNames({
        ...session,
        status: "cancelled",
        cancelledBy: username,
        cancelledAt: Date.now(),
        participants: [],
        sequence: [],
        passedThisLot: [],
        turnIdx: 0,
      });
      await cleanupLiveSession(db, normalized);
      return res.json({ session: normalized });
    }

    const participants = Array.isArray(session.participants) ? session.participants : [];
    const hasUser = participants.some((p) => p.name === username);
    if (!hasUser) {
      return res.status(404).json({ error: "You are not part of this session" });
    }

    const nextParticipants = participants.filter((p) => p.name !== username);
    const nextSequence = removeFromSequence(session.sequence, username);
    const nextPassed = Array.isArray(session.passedThisLot)
      ? session.passedThisLot.filter((name) => name !== username)
      : [];
    const activePickers = nextSequence.filter((name) => !nextPassed.includes(name));
    const safeTurnIdx = activePickers.length === 0
      ? 0
      : Math.min(Number(session.turnIdx || 0), activePickers.length - 1);

    const normalized = withParticipantNames({
      ...session,
      participants: nextParticipants,
      sequence: nextSequence,
      passedThisLot: nextPassed,
      turnIdx: safeTurnIdx,
      abandonedBy: Array.from(new Set([...(session.abandonedBy || []), username])),
    });

    await sessionRef.set(normalized, { merge: true });
    return res.json({ session: normalized });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to abandon session", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

export default router;
