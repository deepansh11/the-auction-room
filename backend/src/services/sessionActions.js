import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { normalizeSessionDocument } from "./sessionState.js";
import { isSessionParticipant, sanitizeSessionForViewer } from "./sessionView.js";
import { getPlayerCatalog } from "./playerCatalog.js";
import { buildCompletedSessionResult } from "./sessionPersistence.js";
import { observe, structuredLog } from "./metrics.js";

const commandSchema = z.object({
  requestId: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  expectedRevision: z.number().int().nonnegative(),
  type: z.enum(["pick", "mystery", "pass", "open-lot", "next-lot", "end", "force-skip", "reveal-draw", "start", "transfer-list", "transfer-toggle"]),
  playerId: z.number().int().positive().optional(),
  playerIds: z.array(z.number().int().positive()).max(5).optional(),
  listed: z.boolean().optional(),
});

function fail(message, code = "INVALID_COMMAND", status = 409) {
  throw Object.assign(new Error(message), { code, status });
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function buildSessionEvent(previous, session, command) {
  const before = sanitizeSessionForViewer(previous, "");
  const after = sanitizeSessionForViewer(session, "");
  const fields = {};
  for (const key of ["status", "lotIdx", "turnIdx", "lotOpen", "lotClosing", "sequence", "passedThisLot", "revealedPickCount",
    "mysteryUsed", "transferWindow", "soldPlayerIds", "carriedBudgets", "expectedBudgets", "lastPickEvent", "playerPool", "shuffledPlayers"]) {
    if (!equal(before[key], after[key]) && after[key] !== undefined) fields[key] = after[key];
  }
  return {
    sessionId: session.id, eventId: command.requestId, revision: session.revision, type: command.type,
    timestamp: session.updatedAt, fields,
    participants: session.participants.filter(participant => !equal(participant, previous.participants.find(p => p.name === participant.name))),
    removedParticipants: previous.participants.filter(p => !session.participants.some(next => next.name === p.name)).map(p => p.name),
  };
}

// Pure state transition. The transaction supplies the durable state and authenticated actor.
export function applySessionCommand(previous, user, command, catalog, now = Date.now(), random = Math.random) {
  const session = normalizeSessionDocument(structuredClone(previous));
  if (!isSessionParticipant(session, user.username)) fail("You are not part of this session", "FORBIDDEN", 403);
  if (["complete", "cancelled"].includes(session.status)) fail("Session is already closed", "SESSION_CLOSED");
  if (Number(session.revision || 0) !== command.expectedRevision) fail("Auction state changed. Synchronize and try again.", "STALE_REVISION");
  const host = String(session.host).toLowerCase() === String(user.username).toLowerCase();
  const participant = session.participants.find(p => p.name.toLowerCase() === user.username.toLowerCase());
  const active = () => session.sequence.filter(name => !session.passedThisLot.includes(name) && session.participants.some(p => p.name === name));
  const current = () => active()[session.turnIdx % Math.max(1, active().length)];
  const owned = () => new Set(session.participants.flatMap(p => p.squad.map(player => Number(player.id))));
  const available = () => session.playerPool.filter(player => Number(player.lot) === session.lotOrder[session.lotIdx] && !owned().has(Number(player.id)));
  const priceOf = player => {
    const rating = catalog.get(Number(player.id))?.rating;
    const tier = Object.values(session.tiers).find(t => rating >= t.min && rating <= t.max);
    if (!tier || !Number.isFinite(tier.price) || tier.price <= 0) fail("Player has no valid price tier", "INELIGIBLE_PLAYER");
    return tier.price;
  };
  const requireHost = () => { if (!host) fail("Only the host can perform this action", "FORBIDDEN", 403); };
  const requireOpen = () => { if (session.status !== "active" || !session.lotOpen || session.lotClosing) fail("Lot is not open", "LOT_CLOSED"); };
  const requireTurn = () => { requireOpen(); if (!participant || current() !== participant.name) fail("It is not your turn", "NOT_YOUR_TURN", 403); };
  const close = () => { session.lotOpen = false; session.lotClosing = true; session.turnIdx = 0; };
  const advance = () => {
    const players = available();
    while (active().length) {
      const picker = session.participants.find(p => p.name === current());
      if (players.length && picker.squad.length < 16 && players.some(player => picker.budget >= priceOf(player))) return;
      session.passedThisLot.push(picker.name);
      session.turnIdx %= Math.max(1, active().length);
    }
    close();
  };
  switch (command.type) {
    case "reveal-draw":
      requireHost();
      if (session.status !== "draw") fail("Draw has already finished");
      session.revealedPickCount = Math.min(session.participants.length, session.revealedPickCount + 1);
      break;
    case "start":
      requireHost();
      if (session.status !== "draw" || session.revealedPickCount < session.participants.length) fail("Reveal all picks before starting");
      session.status = "active";
      break;
    case "open-lot":
      requireHost();
      if (session.status !== "active" || session.lotOpen || session.lotClosing) fail("Lot cannot be opened");
      session.lotOpen = true;
      advance();
      break;
    case "pick":
    case "mystery": {
      requireTurn();
      const mystery = command.type === "mystery";
      const id = mystery ? Number(session.mysteryCurrent[participant.name]) : command.playerId;
      if (mystery && (!session.mysteryEnabled || session.mysteryUsed[participant.name] || !session.mysteryPools[participant.name]?.includes(id))) fail("Mystery Card is unavailable", "INELIGIBLE_PLAYER");
      const reference = mystery ? { id } : available().find(player => Number(player.id) === id);
      const player = catalog.get(id);
      if (!reference || !player || participant.squad.some(p => Number(p.id) === id)) fail("Player is unavailable or already owned", "INELIGIBLE_PLAYER");
      const price = mystery ? 20 : priceOf(reference);
      if (participant.budget < price) fail("Not enough budget", "INSUFFICIENT_BUDGET");
      if (participant.squad.length >= 16) fail("Squad is full", "SQUAD_FULL");
      participant.budget -= price;
      participant.squad.push({ ...player, ...(reference.lot ? { lot: reference.lot } : {}), pickedAt: now, purchasePrice: price, viaMystery: mystery });
      session.lastPickEvent = { id: command.requestId, picker: participant.name, playerId: id, playerName: player.name, at: now, viaMystery: mystery };
      if (mystery) session.mysteryUsed[participant.name] = true;
      const candidate = session.mysteryCurrent[participant.name];
      if (!session.mysteryUsed[participant.name] && participant.squad.some(p => p.id === candidate)) {
        const options = (session.mysteryPools[participant.name] || []).filter(id => !participant.squad.some(p => p.id === id));
        if (options.length) session.mysteryCurrent[participant.name] = options[Math.floor(random() * options.length)];
        else delete session.mysteryCurrent[participant.name];
      }
      session.turnIdx = (session.turnIdx + 1) % Math.max(1, active().length);
      advance();
      break;
    }
    case "pass":
    case "force-skip":
      if (command.type === "pass") requireTurn(); else { requireHost(); requireOpen(); }
      if (!current()) fail("No active picker");
      session.passedThisLot.push(current());
      session.turnIdx %= Math.max(1, active().length);
      advance();
      break;
    case "next-lot":
      requireHost();
      if (session.status !== "active" || !session.lotClosing) fail("Close the current lot before advancing");
      if (session.lotIdx + 1 >= session.lotOrder.length) { session.status = "complete"; break; }
      session.lotIdx++;
      session.sequence = [...session.sequence.slice(1), session.sequence[0]];
      session.turnIdx = 0;
      session.passedThisLot = [];
      session.lotOpen = false;
      session.lotClosing = false;
      for (const [name, pool] of Object.entries(session.mysteryPools)) {
        const options = pool.filter(id => !session.participants.find(p => p.name === name)?.squad.some(p => p.id === id));
        if (!session.mysteryUsed[name] && options.length) session.mysteryCurrent[name] = options[Math.floor(random() * options.length)];
      }
      break;
    case "end":
      requireHost();
      if (session.status !== "active") fail("Auction is not active");
      session.status = "complete";
      session.lotOpen = false;
      break;
    case "transfer-toggle": {
      if (session.status !== "transfer" || session.transferWindow.phase !== "selling" || !participant) fail("Transfer listing is unavailable");
      if (session.transferWindow.listingDeadlineAt && now >= session.transferWindow.listingDeadlineAt) fail("Transfer listing deadline has passed", "DEADLINE_PASSED");
      const list = command.listed;
      if (typeof list !== "boolean") fail("Listing status is required");
      const player = (list ? participant.squad : participant.soldPlayers).find(p => Number(p.id) === command.playerId);
      if (!player) fail("Player is unavailable for this listing", "INELIGIBLE_PLAYER");
      if (list && participant.soldPlayers.length >= session.transferWindow.requiredSalesMax) fail("Maximum transfer listings reached");
      const price = Number(player.purchasePrice ?? (player.viaMystery ? 20 : priceOf(player)));
      if (!Number.isFinite(price) || price < 0) fail("Invalid acquisition price");
      session.carriedBudgets[participant.name] ??= participant.budget;
      if (list) {
        participant.budget += price;
        participant.squad = participant.squad.filter(p => p.id !== player.id);
        participant.soldPlayers.push({ ...player, soldAt: now, salePrice: price, soldInTransferWindow: true });
      } else {
        if (participant.budget < price || participant.squad.length >= 16) fail("Cannot restore this player");
        participant.budget -= price;
        participant.soldPlayers = participant.soldPlayers.filter(p => p.id !== player.id);
        const { soldAt, salePrice, ...restored } = player;
        participant.squad.push({ ...restored, soldInTransferWindow: false });
      }
      session.transferWindow.completedBy = session.participants.filter(p => p.soldPlayers.length >= session.transferWindow.requiredSalesMin && p.soldPlayers.length <= session.transferWindow.requiredSalesMax).map(p => p.name);
      session.soldPlayerIds = session.participants.flatMap(p => p.soldPlayers.map(player => player.id));
      session.expectedBudgets = Object.fromEntries(session.participants.map(p => [p.name, p.budget]));
      break;
    }
    case "transfer-list": {
      if (session.status !== "transfer" || session.transferWindow.phase !== "selling" || !participant) fail("Transfer listing is unavailable");
      if (session.transferWindow.listingDeadlineAt && now >= session.transferWindow.listingDeadlineAt) fail("Transfer listing deadline has passed", "DEADLINE_PASSED");
      if (session.transferWindow.completedBy.includes(participant.name)) fail("Listings already submitted");
      const ids = [...new Set(command.playerIds || [])];
      if (ids.length < session.transferWindow.requiredSalesMin || ids.length > session.transferWindow.requiredSalesMax) fail("Invalid number of transfer listings");
      const players = ids.map(id => participant.squad.find(p => p.id === id));
      if (players.some(player => !player)) fail("Player is not in your squad", "INELIGIBLE_PLAYER");
      session.carriedBudgets[participant.name] ??= participant.budget;
      for (const player of players) {
        const price = Number(player.purchasePrice ?? (player.viaMystery ? 20 : priceOf(player)));
        if (!Number.isFinite(price) || price < 0) fail("Invalid acquisition price");
        participant.budget += price;
        participant.soldPlayers.push({ ...player, soldAt: now, salePrice: price, soldInTransferWindow: true });
      }
      participant.squad = participant.squad.filter(p => !ids.includes(p.id));
      session.transferWindow.completedBy.push(participant.name);
      session.soldPlayerIds = [...new Set([...session.soldPlayerIds, ...ids])];
      session.expectedBudgets = Object.fromEntries(session.participants.map(p => [p.name, p.budget]));
      break;
    }
    default: fail("Unknown command", "INVALID_COMMAND", 400);
  }
  session.revision = Number(previous.revision || 0) + 1;
  session.lastActionId = command.requestId;
  session.updatedAt = now;
  return session;
}

export async function processSessionAction({ db, sessionId, user, command: input, catalog: suppliedCatalog, now = Date.now, random = Math.random }) {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success || !sessionId || sessionId.length > 160 || sessionId.includes("/")) fail("Invalid session command", "INVALID_COMMAND", 400);
  const command = parsed.data;
  const receivedAt = now();
  const started = performance.now();
  const catalog = suppliedCatalog || await getPlayerCatalog();
  const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const ref = db.collection("sessions").doc(sessionId);
  const receipt = ref.collection("requests").doc(command.requestId);
  let validatedAt;
  const transactionStarted = performance.now();
  const result = await db.runTransaction(async transaction => {
    const [snapshot, previousReceipt] = await Promise.all([transaction.get(ref), transaction.get(receipt)]);
    if (!snapshot.exists) fail("Session not found", "SESSION_NOT_FOUND", 404);
    const previous = normalizeSessionDocument(snapshot.data());
    if (!isSessionParticipant(previous, user.username)) fail("You are not part of this session", "FORBIDDEN", 403);
    if (previousReceipt.exists) {
      const saved = previousReceipt.data();
      if (saved.uid !== user.uid || saved.fingerprint !== fingerprint) fail("Request ID was already used for another command", "REQUEST_ID_CONFLICT");
      return { session: previous, event: saved.event, duplicate: true };
    }
    const session = applySessionCommand(previous, user, command, catalog, now(), random);
    validatedAt = now();
    const event = buildSessionEvent(previous, session, command);
    const sourceId = session.transferWindow?.sourceResultId;
    const sourceRef = session.status === "complete" && sourceId ? db.collection("auctionResults").doc(sourceId) : null;
    const source = sourceRef ? await transaction.get(sourceRef) : null;
    // Static catalogue/fixture data is not rewritten on each pick.
    const changes = {};
    for (const [key, value] of Object.entries(session)) if (!equal(previous[key], value)) changes[key] = value;
    transaction.update(ref, changes);
    transaction.set(receipt, { uid: user.uid, fingerprint, event, createdAt: session.updatedAt });
    if (session.status === "complete") {
      transaction.set(db.collection("auctionResults").doc(sessionId), buildCompletedSessionResult(session), { merge: true });
      if (session.roomCode) transaction.delete(db.collection("rooms").doc(session.roomCode.toUpperCase()));
      if (source?.exists && source.data().transferWindow?.activeSessionId === sessionId) {
        transaction.set(sourceRef, { transferWindow: { ...source.data().transferWindow, activeSessionId: "", phase: "locked", closedAt: session.updatedAt }, updatedAt: session.updatedAt }, { merge: true });
      }
    }
    const privateChanges = session.participants.filter(p => !equal(previous.mysteryCurrent?.[p.name], session.mysteryCurrent?.[p.name])).map(p => p.name);
    return { session, event, privateChanges, duplicate: false };
  }).catch(error => {
    observe("action_ms", performance.now() - started);
    structuredLog("session_action_rejected", { requestId: command.requestId, auctionId: sessionId, userId: user.uid,
      bid_received_at: receivedAt, validation_completed_at: validatedAt || now(), code: error.code || "PERSISTENCE_FAILED", durationMs: performance.now() - started });
    throw error;
  });
  observe("firebase_transaction_ms", performance.now() - transactionStarted);
  observe("action_ms", performance.now() - started);
  structuredLog("session_action", { requestId: command.requestId, auctionId: sessionId, userId: user.uid, type: command.type,
    bid_received_at: receivedAt, validation_completed_at: validatedAt || receivedAt, firebase_commit_completed_at: now(),
    durationMs: performance.now() - started, revision: result.session.revision, duplicate: result.duplicate });
  return result;
}
