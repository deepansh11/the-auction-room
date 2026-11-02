import { applySessionEvent, shouldApplySnapshot } from "./sessionEvents.js";

export function createSocketManager({ connect, url, normalize = value => value, httpAction, onAuthExpired = () => {}, metric = () => {} }) {
  let socket = null;
  let token = "";
  const sessions = new Map();
  const pending = new Map();
  const pendingInput = id => pending.get(id)?.input || null;
  const clearPending = id => {
    pending.delete(id);
    const record = sessions.get(id);
    if (record) notify(record, "onPending", null);
  };
  const notify = (record, key, ...args) => record.handlers.forEach(handler => handler[key]?.(...args));
  const errorFrom = reply => Object.assign(new Error(reply.error || "Session operation failed"), { status: reply.status || 503, code: reply.code || "REQUEST_FAILED" });
  const deliver = record => {
    if (record.snapshot.status === "complete" || record.snapshot.status === "cancelled") {
      if (record.closedRevision !== record.snapshot.revision) {
        record.closedRevision = record.snapshot.revision;
        notify(record, "onClosed", record.snapshot, record.snapshot.status);
      }
    }
    else notify(record, "onUpdate", record.snapshot);
  };
  const snapshot = (record, next) => {
    next = normalize(next);
    if (pending.get(record.id)?.command.requestId === next.lastActionId) clearPending(record.id);
    if (shouldApplySnapshot(record.snapshot, next)) { record.snapshot = next; deliver(record); }
    for (const [revision, event] of [...record.queue].sort(([a], [b]) => a - b)) {
      if (revision <= Number(record.snapshot?.revision || 0)) record.queue.delete(revision);
      else if (revision === Number(record.snapshot?.revision || 0) + 1) consume(record, event);
      else break; // Never recursively sync a snapshot that is still behind the queued event.
    }
  };
  const sync = record => {
    if (!socket?.connected || record.syncing) return;
    record.syncing = true;
    socket.timeout(10000).emit("session:sync", { sessionId: record.id }, (error, reply) => {
      record.syncing = false;
      if (sessions.get(record.id) !== record) return;
      if (error || !reply?.ok) { notify(record, "onStatus", false); notify(record, "onError", error || errorFrom(reply || {})); return; }
      snapshot(record, reply.session);
      notify(record, "onStatus", true);
    });
  };
  const consume = (record, event) => {
    if (pending.get(record.id)?.command.requestId === event.eventId) clearPending(record.id);
    const result = applySessionEvent(record.snapshot, event);
    if (result.gap) {
      if (record.queue.size < 100) record.queue.set(event.revision, event);
      sync(record);
      return;
    }
    record.queue.delete(event.revision);
    if (result.session !== record.snapshot) { record.snapshot = result.session; deliver(record); notify(record, "onStatus", true); }
  };
  const consumePrivate = (record, state) => {
    if (!record.snapshot || state.revision < Number(record.snapshot.revision || 0) || state.revision < record.privateRevision) return;
    if (JSON.stringify(record.snapshot.mysteryCurrent || {}) !== JSON.stringify(state.mysteryCurrent || {})) {
      record.snapshot = { ...record.snapshot, mysteryCurrent: state.mysteryCurrent || {} };
      deliver(record);
    }
    record.privateRevision = state.revision;
  };
  const getSocket = authToken => {
    if (socket && token !== authToken) {
      socket.disconnect();
      socket.removeAllListeners();
      socket = null;
      sessions.clear();
      pending.clear();
    }
    token = authToken;
    if (!socket) {
      socket = connect(url, { auth: { token }, transports: ["websocket", "polling"], tryAllTransports: true,
        autoConnect: false, reconnection: true, reconnectionAttempts: Infinity,
        reconnectionDelay: 2000, reconnectionDelayMax: 60000, randomizationFactor: 0.4 });
      socket.on("connect", () => { metric("socket_connect", 1); sessions.forEach(record => { record.syncing = false; sync(record); }); });
      socket.on("disconnect", () => sessions.forEach(record => { record.syncing = false; notify(record, "onStatus", false); }));
      socket.on("connect_error", error => {
        if (error.data?.status === 401) { socket.disconnect(); onAuthExpired(); }
        sessions.forEach(record => { notify(record, "onStatus", false); notify(record, "onError", error); });
      });
      socket.on("session:update", payload => {
        const record = sessions.get(payload?.session?.id);
        if (record) snapshot(record, payload.session);
      });
      socket.on("session:closed", payload => {
        const record = sessions.get(payload?.session?.id);
        if (record) snapshot(record, payload.session);
      });
      socket.on("session:state", event => {
        const receivedAt = performance.now();
        const record = sessions.get(event?.sessionId);
        if (record) consume(record, event);
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => metric("event_to_next_frame_ms", performance.now() - receivedAt));
      });
      socket.on("session:private", state => {
        const record = sessions.get(state?.sessionId);
        if (record) consumePrivate(record, state);
      });
      socket.on("session:revoked", payload => {
        const record = sessions.get(payload?.sessionId);
        if (record) { notify(record, "onError", Object.assign(new Error("You are no longer part of this session"), { status: 403 })); notify(record, "onClosed", record.snapshot, "revoked"); }
      });
    }
    return socket;
  };
  return {
    subscribe(id, handlers, authToken) {
      const connection = getSocket(authToken);
      let record = sessions.get(id);
      if (!record) {
        record = { id, handlers: new Set(), snapshot: null, syncing: false, privateRevision: 0, queue: new Map() };
        sessions.set(id, record);
      }
      record.handlers.add(handlers);
      handlers.onPending?.(pendingInput(id));
      if (record.snapshot) deliver(record);
      if (connection.connected) sync(record); else connection.connect();
      return () => {
        record.handlers.delete(handlers);
        if (record.handlers.size) return;
        sessions.delete(id);
        if (connection.connected) connection.emit("session:leave", { sessionId: id });
        if (!sessions.size) connection.disconnect();
      };
    },
    acceptSnapshot(id, next) { const record = sessions.get(id); if (record) snapshot(record, next); },
    sync(id) { const record = sessions.get(id); if (record) sync(record); },
    getPending: pendingInput,
    async submit(id, input, authToken, expectedRevision) {
      const started = performance.now();
      const record = sessions.get(id);
      const signature = JSON.stringify({ id, input });
      const existing = pending.get(id);
      if (existing && existing.signature !== signature) throw Object.assign(new Error("Previous action outcome is unknown. Retry that same action before submitting another."), { status: 409, code: "ACTION_PENDING" });
      let command = existing?.command;
      if (!command) {
        command = { ...input, expectedRevision: expectedRevision ?? Number(record?.snapshot?.revision || 0),
          requestId: globalThis.crypto?.randomUUID?.() || `request-${Date.now()}-${Math.random().toString(36).slice(2)}` };
        pending.set(id, { signature, command, input: { ...input } });
        if (record) notify(record, "onPending", pendingInput(id));
      }
      try {
        const reply = socket?.connected && token === authToken && record?.snapshot
          ? await new Promise((resolve, reject) => socket.timeout(15000).emit("session:action", { sessionId: id, command }, (error, response) => error ? reject(error) : response?.ok ? resolve(response) : reject(errorFrom(response || {}))))
          : await httpAction(id, command, authToken);
        clearPending(id);
        metric("submit_to_ack_ms", performance.now() - started);
        if (record) { consume(record, reply.event); if (reply.privateState) consumePrivate(record, reply.privateState); }
        return reply;
      } catch (error) {
        if (error.status >= 400 && error.status < 500) clearPending(id);
        // Transport timeouts retain the original request ID and expected revision for retries.
        if (error.code === "STALE_REVISION" && record) sync(record);
        if ((!error.status || error.status >= 500) && record) sync(record);
        if (error.status === 401) onAuthExpired();
        throw error;
      }
    },
  };
}
