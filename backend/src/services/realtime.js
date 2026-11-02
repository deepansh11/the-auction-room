import { Server } from "socket.io";
import { collectSessionRecipients, isSessionParticipant, sanitizeSessionForViewer } from "./sessionView.js";
import { verifyUserToken } from "./authToken.js";
import { getFirebase } from "./firebaseService.js";
import { observe, structuredLog } from "./metrics.js";

let io = null;
export const auctionRoomName = id => `auction:${id}`;
const personalRoomName = (id, username) => `session:${id}:${username.toLowerCase()}`;
const errorPayload = error => ({ ok: false, error: error.status ? error.message : "Session operation failed", code: error.code || "REQUEST_FAILED", status: error.status || 503 });

export function initRealtime(httpServer, { corsOrigins = [], verifyToken = verifyUserToken,
  readSession = async id => {
    const snap = await getFirebase().db.collection("sessions").doc(id).get();
    if (!snap.exists) throw Object.assign(new Error("Session not found"), { status: 404 });
    return snap.data();
  }, executeAction } = {}) {
  io = new Server(httpServer, {
    maxHttpBufferSize: 65536,
    cors: {
      origin(origin, callback) {
        callback(!origin || corsOrigins.length === 0 || corsOrigins.includes(origin) ? null : new Error("CORS blocked"), true);
      },
      methods: ["GET", "POST"], credentials: false,
    },
  });
  const server = io;
  server.use((socket, next) => {
    try { socket.data.user = verifyToken(socket.handshake.auth?.token); next(); }
    catch (error) { const denied = new Error(error.message); denied.data = errorPayload(error); next(denied); }
  });
  server.on("connection", socket => {
    let joinedId = null;
    let roomWork = Promise.resolve();
    let windowStart = Date.now();
    let operations = 0;
    const check = () => {
      socket.data.user = verifyToken(socket.handshake.auth?.token);
      if (Date.now() - windowStart > 10000) { windowStart = Date.now(); operations = 0; }
      if (++operations > 60) throw Object.assign(new Error("Too many session operations; retry shortly"), { status: 429, code: "RATE_LIMITED" });
    };
    const getId = payload => {
      const id = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
      if (!id || id.length > 160 || id.includes("/")) throw Object.assign(new Error("Invalid session ID"), { status: 400, code: "INVALID_COMMAND" });
      return id;
    };
    const authorize = session => {
      if (!isSessionParticipant(session, socket.data.user.username)) throw Object.assign(new Error("You are not part of this session"), { status: 403, code: "FORBIDDEN" });
    };
    const leave = async () => {
      if (!joinedId) return;
      await socket.leave(auctionRoomName(joinedId));
      await socket.leave(personalRoomName(joinedId, socket.data.user.username));
      joinedId = null;
    };
    const sync = async payload => {
      check();
      const id = getId(payload);
      authorize(await readSession(id));
      if (!socket.connected) throw Object.assign(new Error("Disconnected"), { status: 503 });
      if (joinedId !== id) {
        await leave();
        await socket.join(auctionRoomName(id));
        await socket.join(personalRoomName(id, socket.data.user.username));
        joinedId = id;
      }
      // Read after joining: a mutation between the membership read and room join is not lost.
      const latest = await readSession(id);
      try { authorize(latest); } catch (error) { await leave(); throw error; }
      return { ok: true, session: sanitizeSessionForViewer(latest, socket.data.user.username), serverTimestamp: Date.now() };
    };
    for (const event of ["session:join", "session:sync"]) {
      socket.on(event, (payload, ack = () => {}) => {
        if (typeof ack !== "function") return;
        roomWork = roomWork.then(() => sync(payload)).then(ack, error => ack(errorPayload(error)));
      });
    }
    socket.on("session:leave", (payload, ack = () => {}) => {
      roomWork = roomWork.then(async () => {
        check();
        if (getId(payload) === joinedId) await leave();
        if (typeof ack === "function") ack({ ok: true });
      }).catch(error => { if (typeof ack === "function") ack(errorPayload(error)); });
    });
    socket.on("session:action", async (payload, ack = () => {}) => {
      if (typeof ack !== "function") return;
      try {
        check();
        const id = getId(payload);
        if (id !== joinedId) throw Object.assign(new Error("Join the session before acting"), { status: 403, code: "FORBIDDEN" });
        if (!executeAction) throw Object.assign(new Error("Session commands are unavailable"), { status: 503 });
        const result = await executeAction({ sessionId: id, user: socket.data.user, command: payload.command });
        emitSessionAction(result);
        ack({ ok: true, event: result.event, privateState: privateState(result.session, socket.data.user.username) });
      } catch (error) { ack(errorPayload(error)); }
    });
    const expiresIn = Number(socket.data.user.exp) * 1000 - Date.now();
    const expiryTimer = Number.isFinite(expiresIn) ? setTimeout(() => socket.disconnect(true), Math.max(0, Math.min(expiresIn, 2147483647))) : null;
    expiryTimer?.unref();
    structuredLog("socket_connected", { socketId: socket.id, transport: socket.conn.transport.name, activeSockets: server.engine.clientsCount });
    socket.conn.on("upgrade", transport => structuredLog("socket_transport", { socketId: socket.id, transport: transport.name }));
    socket.on("disconnect", reason => {
      clearTimeout(expiryTimer);
      structuredLog("socket_disconnected", { socketId: socket.id, reason });
    });
  });
  return server;
}

function privateState(session, name) {
  return { sessionId: session.id, revision: Number(session.revision || 0),
    mysteryCurrent: session.mysteryCurrent?.[name] == null ? {} : { [name]: session.mysteryCurrent[name] } };
}

export function emitSessionAction({ session, event, privateChanges = [], duplicate = false }) {
  if (!io || duplicate) return;
  const initiatedAt = Date.now();
  io.to(auctionRoomName(session.id)).emit("session:state", event);
  privateChanges.forEach(name => io.to(personalRoomName(session.id, name)).emit("session:private", privateState(session, name)));
  observe("broadcast_ms", Date.now() - initiatedAt);
  structuredLog("action_broadcast", { requestId: event.eventId, auctionId: session.id, revision: event.revision, broadcast_initiated_at: initiatedAt });
}

// Administrative/legacy routes use filtered snapshots until their command migration is complete.
export function emitSessionUpdate(session) {
  if (!io || !session?.id) return;
  collectSessionRecipients(session).forEach(name => {
    io.to(personalRoomName(session.id, name)).emit("session:update", { session: sanitizeSessionForViewer(session, name) });
  });
  // Immediately revoke abandoned participants, including sockets still connected elsewhere.
  const recipients = new Set([...collectSessionRecipients(session)].map(name => name.toLowerCase()));
  for (const socketId of io.sockets.adapter.rooms.get(auctionRoomName(session.id)) || []) {
    const socket = io.sockets.sockets.get(socketId);
    const name = socket?.data.user?.username;
    if (name && !recipients.has(name.toLowerCase())) {
      socket.emit("session:revoked", { sessionId: session.id });
      socket.leave(auctionRoomName(session.id));
      socket.leave(personalRoomName(session.id, name));
    }
  }
}

export function emitSessionClosed(session, reason = "complete") {
  if (!io || !session?.id) return;
  collectSessionRecipients(session).forEach(name => io.to(personalRoomName(session.id, name)).emit("session:closed", { session: sanitizeSessionForViewer(session, name), reason }));
}
