import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../middleware/userAuth.js";
import { normalizeFirebaseError } from "../services/firebaseErrors.js";
import { getFirebase } from "../services/firebaseService.js";
import { persistCompletedSessionResult } from "../services/sessionPersistence.js";
import { emitSessionClosed, emitSessionUpdate } from "../services/realtime.js";
import { rerollMysteryCandidates } from "../services/mysteryCard.js";
import { generateAuctionSetup } from "../services/gameSetup.js";
import { isSessionParticipant, sanitizeRoomPreview, sanitizeSessionForViewer } from "../services/sessionView.js";

const router = Router();

const roomCodeSchema = z.string().min(4).max(12);

const tierSchema = z.object({
  min: z.number(),
  max: z.number(),
  price: z.number(),
  color: z.string(),
  bg: z.string(),
  border: z.string(),
});

// What the host's browser is allowed to hand over when creating a room: which players and
// options to use. Everything secret (lot assignment, draw order, pick order, Mystery Card
// pools/candidates, groups/fixtures) is generated server-side from this spec — the host never
// computes or sees any of it themselves, same as every other participant.
const roomSpecSchema = z.object({
  id: z.string().min(1),
  roomCode: roomCodeSchema,
  name: z.string().min(1).max(120),
  budgetPerBidder: z.number().positive(),
  tiers: z.record(tierSchema),
  selectedPlayers: z.array(z.object({
    id: z.number(),
    name: z.string().optional(),
    rating: z.number(),
    pos: z.string(),
  })).min(1),
  participantNames: z.array(z.string().min(1)).min(2),
  mysteryEnabled: z.boolean().optional(),
  groupsEnabled: z.boolean().optional(),
  groupCount: z.number().optional(),
  fixtureLeg: z.enum(["single", "double"]).optional(),
});

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
      ? session.participants
          .map((p) => String(p?.name || "").trim())
          .filter(Boolean)
      : [],
    updatedAt: Date.now(),
  };
}

function renameMysteryKey(map, oldName, newName) {
  if (!map || typeof map !== "object" || !(oldName in map) || oldName === newName) return map;
  const next = { ...map };
  next[newName] = next[oldName];
  delete next[oldName];
  return next;
}

function renameInGroups(groups, oldName, newName) {
  if (!groups || typeof groups !== "object" || oldName === newName) return groups;
  const next = {};
  Object.entries(groups).forEach(([label, members]) => {
    next[label] = Array.isArray(members) ? members.map((m) => (m === oldName ? newName : m)) : members;
  });
  return next;
}

function renameInFixtures(fixtures, oldName, newName) {
  if (!fixtures || typeof fixtures !== "object" || oldName === newName) return fixtures;
  const next = {};
  Object.entries(fixtures).forEach(([label, games]) => {
    next[label] = Array.isArray(games)
      ? games.map((g) => ({
          ...g,
          home: g.home === oldName ? newName : g.home,
          away: g.away === oldName ? newName : g.away,
        }))
      : games;
  });
  return next;
}

function sanitizePlayerRef(player, { includeName = false } = {}) {
  const ref = {};

  const id = Number(player?.id);
  if (Number.isFinite(id)) {
    ref.id = id;
  }

  // Lot count now scales with participant count (one lot per bidder), so there's no fixed
  // upper bound anymore — just guard against nonsensical values.
  const lot = Number(player?.lot);
  if (Number.isFinite(lot) && lot >= 1 && lot <= 100) {
    ref.lot = lot;
  }

  if (includeName) {
    const safeName = String(player?.name || player?.longName || "").trim();
    if (safeName && safeName.toLowerCase() !== "unknown") {
      ref.name = safeName;
    }
  }

  return ref;
}

function sanitizePlayerList(players, { includeName = false } = {}) {
  if (!Array.isArray(players)) return [];

  return players
    .map((player) => sanitizePlayerRef(player, { includeName }))
    .filter((player) => Number.isFinite(player.id));
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
    const spec = roomSpecSchema.parse(req.body?.spec);
    const host = String(req.user?.username || "").trim();
    if (!host) return res.status(400).json({ error: "Invalid user" });

    const roomCode = spec.roomCode.toUpperCase();
    const groupCount = Math.max(1, Math.floor(Number(spec.groupCount) || 1));

    // Every random/secret piece of the auction is generated here, server-side, from the spec —
    // the host's browser never computes (and is never shown) the lot assignment, draw order,
    // pick sequence, or Mystery Card pools/candidates. They receive exactly the same
    // zero-information "draw phase" view as everyone else once this is stored.
    const fixtureLeg = spec.fixtureLeg === "single" ? "single" : "double";
    const setup = generateAuctionSetup({
      selectedPlayers: spec.selectedPlayers,
      tiers: spec.tiers,
      participantNames: spec.participantNames,
      mysteryEnabled: Boolean(spec.mysteryEnabled),
      groupsEnabled: Boolean(spec.groupsEnabled),
      groupCount,
      fixtureLeg,
    });

    const { db } = getFirebase();
    const now = Date.now();
    const session = {
      id: spec.id,
      name: spec.name,
      host,
      roomCode,
      budgetPerBidder: spec.budgetPerBidder,
      participants: setup.sequence.map((n) => ({ name: n, budget: spec.budgetPerBidder, squad: [] })),
      lotOrder: setup.lotOrder,
      sequence: setup.sequence,
      // Store only player IDs/lot/name, not full stat objects (those are hydrated client-side
      // from the public CSV once a lot is actually visible to a given viewer).
      playerPool: sanitizePlayerList(setup.playerPool, { includeName: true }),
      shuffledPlayers: sanitizePlayerList(setup.shuffledPlayers, { includeName: true }),
      tiers: spec.tiers,
      lotIdx: 0,
      lotOpen: false,
      lotClosing: false,
      passedThisLot: [],
      turnIdx: 0,
      drawPhase: 0,
      revealedLotCount: 0,
      revealedPickCount: 0,
      mysteryEnabled: Boolean(spec.mysteryEnabled),
      mysteryPools: setup.mysteryPools,
      mysteryCurrent: setup.mysteryCurrent,
      mysteryUsed: {},
      groupsEnabled: Boolean(spec.groupsEnabled),
      groupCount,
      fixtureLeg,
      groups: setup.groups,
      fixtures: setup.fixtures,
      participantNames: setup.sequence.slice(),
      status: "draw",
      createdAt: now,
      updatedAt: now,
    };

    // Check document size before storing
    const docSize = JSON.stringify(session).length;
    if (docSize > 900000) { // Leave 100KB buffer below 1MB
      return res.status(400).json({
        error: "Session data too large. Please reduce player pool size."
      });
    }

    await db.collection("sessions").doc(String(session.id)).set(session, { merge: true });
    await db.collection("rooms").doc(roomCode).set({ sessionId: String(session.id), roomCode, updatedAt: now }, { merge: true });
    emitSessionUpdate(session);

    return res.status(201).json({ session: sanitizeSessionForViewer(session, host) });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to create room", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.get("/rooms/:roomCode", requireUserAuth, async (req, res) => {
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

    // This endpoint is only ever used to check a room's existence/status *before* joining, so it
    // never needs to (and must not) reveal any player, lot, or Mystery Card data.
    return res.json({ session: sanitizeRoomPreview(sessionDoc.data()) });
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

    // A caller must only ever be able to join/act as their own authenticated identity — otherwise
    // anyone could pass someone else's name in the body and read that participant's session view
    // (including their Mystery Card candidate) without ever proving they own that account.
    const authUsername = String(req.user?.username || "").trim();
    if (!authUsername || authUsername.toLowerCase() !== username.toLowerCase()) {
      return res.status(403).json({ error: "You can only join a room as your own account" });
    }

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
      emitSessionUpdate(session);
      return res.json({ session: sanitizeSessionForViewer(session, username) });
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
        mysteryPools: renameMysteryKey(session.mysteryPools, previousName, username),
        mysteryCurrent: renameMysteryKey(session.mysteryCurrent, previousName, username),
        groups: renameInGroups(session.groups, previousName, username),
        fixtures: renameInFixtures(session.fixtures, previousName, username),
      });
      await sessionRef.set(normalized, { merge: true });
      emitSessionUpdate(normalized);
      return res.json({ session: sanitizeSessionForViewer(normalized, username) });
    }

    const placeholderIdx = participants.findIndex((p) => isPlaceholderName(p?.name));
    if (placeholderIdx >= 0) {
      const previousName = participants[placeholderIdx].name;
      participants[placeholderIdx] = { ...participants[placeholderIdx], name: username };
      const normalized = withParticipantNames({
        ...session,
        participants,
        sequence: replaceNameInSequence(session.sequence, previousName, username),
        mysteryPools: renameMysteryKey(session.mysteryPools, previousName, username),
        mysteryCurrent: renameMysteryKey(session.mysteryCurrent, previousName, username),
        groups: renameInGroups(session.groups, previousName, username),
        fixtures: renameInFixtures(session.fixtures, previousName, username),
      });
      await sessionRef.set(normalized, { merge: true });
      emitSessionUpdate(normalized);
      return res.json({ session: sanitizeSessionForViewer(normalized, username) });
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
      emitSessionUpdate(normalized);
      return res.json({ session: sanitizeSessionForViewer(normalized, username) });
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
    // Always use the authenticated identity — never trust a client-supplied query param, which
    // would otherwise let any logged-in user read another user's session list (and, since each
    // session is now filtered per-viewer, their Mystery Card data too).
    const username = String(req.user?.username || "").trim();
    if (!username) return res.status(400).json({ error: "Invalid user" });

    const { db } = getFirebase();
    const byHostSnap = await db.collection("sessions").where("host", "==", username).get();
    const byParticipantSnap = await db.collection("sessions").where("participantNames", "array-contains", username).get();

    const map = new Map();
    byHostSnap.docs.forEach((d) => map.set(d.id, d.data()));
    byParticipantSnap.docs.forEach((d) => map.set(d.id, d.data()));

    const sessions = Array.from(map.values())
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .map((s) => sanitizeSessionForViewer(s, username));
    return res.json({ sessions });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to list sessions", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.get("/sessions/:id", requireUserAuth, async (req, res) => {
  try {
    const { db } = getFirebase();
    const snap = await db.collection("sessions").doc(String(req.params.id)).get();
    if (!snap.exists) return res.status(404).json({ error: "Session not found" });

    const session = snap.data();
    const username = String(req.user?.username || "").trim();
    if (!isSessionParticipant(session, username)) {
      return res.status(403).json({ error: "You are not part of this session" });
    }

    return res.json({ session: sanitizeSessionForViewer(session, username) });
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
    const sessionRef = db.collection("sessions").doc(String(req.params.id));
    const existingSnap = await sessionRef.get();
    if (!existingSnap.exists) return res.status(404).json({ error: "Session not found" });

    const existing = existingSnap.data();
    const username = String(req.user?.username || "").trim();
    if (!isSessionParticipant(existing, username)) {
      return res.status(403).json({ error: "You are not part of this session" });
    }

    // playerPool / shuffledPlayers / mysteryPools are server-owned from the moment the room is
    // created onward: a client is never allowed to overwrite them (this is what previously let
    // any participant's browser push — and therefore see — the full, unfiltered pool for every
    // lot, opened or not). Only the lot/turn/participant bookkeeping fields come from the client.
    const mergedLotIdx = Number(session.lotIdx ?? existing.lotIdx ?? 0);
    const existingLotIdx = Number(existing.lotIdx ?? 0);
    const mergedStatus = session.status || existing.status;
    const mergedMysteryUsed = session.mysteryUsed && typeof session.mysteryUsed === "object"
      ? session.mysteryUsed
      : (existing.mysteryUsed || {});

    // Mystery Card candidates are re-rolled on lot transition, and also refreshed whenever a
    // participant's own current candidate has been picked by them (deduplication: same user
    // cannot get the same player via regular pick AND mystery card).
    let mysteryCurrent = (existing.mysteryEnabled && mergedStatus === "active" && mergedLotIdx !== existingLotIdx)
      ? rerollMysteryCandidates(existing.mysteryPools || {}, mergedMysteryUsed)
      : { ...(existing.mysteryCurrent || {}) };

    if (existing.mysteryEnabled) {
      const newParticipants = Array.isArray(session.participants) ? session.participants : [];
      newParticipants.forEach((p) => {
        if (mergedMysteryUsed[p.name]) return; // already used card
        const candidateId = mysteryCurrent[p.name];
        if (candidateId == null) return;
        const ownedIds = new Set((p.squad || []).map((pl) => Number(pl.id)));
        if (ownedIds.has(Number(candidateId))) {
          // Their candidate was just picked by them — pick a new one excluding all their squad
          const pool = (existing.mysteryPools?.[p.name] || []).filter(
            (id) => !ownedIds.has(Number(id))
          );
          if (pool.length > 0) {
            mysteryCurrent[p.name] = pool[Math.floor(Math.random() * pool.length)];
          } else {
            delete mysteryCurrent[p.name];
          }
        }
      });
    }

    // lotOrder never changes after creation — it's server-generated once and reused for the
    // whole game, so no client input for it is ever trusted, at any status.
    const lotOrder = existing.lotOrder || [];

    // sequence (pick/turn order) is different: during the draw ceremony it's the same kind of
    // secret as lotOrder (must not be readable before its reveal step), but once bidding is
    // active it becomes legitimate, client-driven gameplay state (rotated every lot). So it's
    // only locked to the server's stored copy while still in the draw phase.
    const sequence = mergedStatus === "draw"
      ? (existing.sequence || [])
      : (Array.isArray(session.sequence) ? session.sequence : (existing.sequence || []));

    // The draw ceremony reveals one extra lot/pick at a time for suspense — clamp both counters
    // so a crafted request can't jump straight to "everything revealed" instead of stepping
    // through it, which would otherwise hand back the *entire* secret array in one response.
    const totalToReveal = (Array.isArray(existing.participants) ? existing.participants.length : 0)
      || lotOrder.length;
    const existingRevealedLotCount = Number(existing.revealedLotCount || 0);
    const revealedLotCount = Math.max(0, Math.min(
      Number(session.revealedLotCount ?? existingRevealedLotCount) || 0,
      existingRevealedLotCount + 1,
      totalToReveal
    ));
    const existingRevealedPickCount = Number(existing.revealedPickCount || 0);
    const revealedPickCount = Math.max(0, Math.min(
      Number(session.revealedPickCount ?? existingRevealedPickCount) || 0,
      existingRevealedPickCount + 1,
      totalToReveal
    ));

    const optimizedSession = {
      ...existing,
      ...session,
      id: existing.id,
      roomCode: existing.roomCode,
      playerPool: existing.playerPool || [],
      shuffledPlayers: existing.shuffledPlayers || [],
      lotOrder,
      sequence,
      revealedLotCount,
      revealedPickCount,
      mysteryEnabled: Boolean(existing.mysteryEnabled),
      mysteryPools: existing.mysteryPools || {},
      mysteryUsed: mergedMysteryUsed,
      mysteryCurrent,
      participantNames: Array.isArray(session?.participants)
        ? session.participants
            .map((p) => String(p?.name || "").trim())
            .filter(Boolean)
        : (existing.participantNames || []),
      updatedAt: Date.now(),
    };

    if (optimizedSession.status === "complete") {
      await persistCompletedSessionResult(db, optimizedSession);
      emitSessionClosed(optimizedSession, "complete");
      await cleanupLiveSession(db, optimizedSession);
      return res.status(204).send();
    }

    if (optimizedSession.status === "cancelled") {
      emitSessionClosed(optimizedSession, "cancelled");
      await cleanupLiveSession(db, optimizedSession);
      return res.status(204).send();
    }

    await sessionRef.set(optimizedSession, { merge: true });
    emitSessionUpdate(optimizedSession);
    return res.status(204).send();
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to update session", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/rooms/:roomCode/readmit", requireUserAuth, async (req, res) => {
  try {
    const roomCode = roomCodeSchema.parse(String(req.params.roomCode || "").toUpperCase());
    const targetUsername = String(req.body?.username || "").trim();
    if (!targetUsername) return res.status(400).json({ error: "username is required" });

    const hostUsername = String(req.user?.username || "").trim();
    const { db } = getFirebase();

    const roomDoc = await db.collection("rooms").doc(roomCode).get();
    if (!roomDoc.exists) return res.status(404).json({ error: "Room not found" });

    const sessionRef = db.collection("sessions").doc(String(roomDoc.data()?.sessionId));
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) return res.status(404).json({ error: "Session not found" });

    const session = sessionSnap.data();
    if (session.host !== hostUsername) {
      return res.status(403).json({ error: "Only the host can readmit players" });
    }

    const participants = Array.isArray(session.participants) ? [...session.participants] : [];
    if (participants.some((p) => p.name === targetUsername)) {
      emitSessionUpdate(session);
      return res.json({ session: sanitizeSessionForViewer(session, hostUsername) });
    }

    const wasAbandoned = Array.isArray(session.abandonedBy) && session.abandonedBy.includes(targetUsername);
    if (!wasAbandoned) {
      return res.status(409).json({ error: `${targetUsername} was not in this session` });
    }

    const baseBudget = Number(session?.budgetPerBidder || 0);
    const nextParticipants = [...participants, { name: targetUsername, budget: baseBudget, squad: [] }];
    const nextSequence = Array.isArray(session.sequence) ? [...session.sequence] : [];
    if (!nextSequence.includes(targetUsername)) nextSequence.push(targetUsername);
    const nextAbandoned = (session.abandonedBy || []).filter((n) => n !== targetUsername);

    const normalized = withParticipantNames({
      ...session,
      participants: nextParticipants,
      sequence: nextSequence,
      abandonedBy: nextAbandoned,
    });
    await sessionRef.set(normalized, { merge: true });
    emitSessionUpdate(normalized);
    return res.json({ session: sanitizeSessionForViewer(normalized, hostUsername) });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to readmit player", 400);
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
      emitSessionClosed(normalized, "cancelled");
      await cleanupLiveSession(db, normalized);
      return res.json({ session: sanitizeSessionForViewer(normalized, username) });
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
    emitSessionUpdate(normalized);
    return res.json({ session: sanitizeSessionForViewer(normalized, username) });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to abandon session", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

export default router;
