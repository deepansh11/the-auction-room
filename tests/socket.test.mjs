import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { io as connect } from "socket.io-client";
import { initRealtime } from "../backend/src/services/realtime.js";
import { processSessionAction } from "../backend/src/services/sessionActions.js";
import { fixture, MemoryFirestore, testUser } from "./helpers.mjs";
import { createSocketManager } from "../src/lib/socketManager.js";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check) {
  for (let index = 0; index < 100; index++) { if (check()) return; await pause(10); }
  assert(check(), "Timed out waiting for state");
}
async function serverFor(db, catalog) {
  const server = createServer();
  const io = initRealtime(server, {
    verifyToken: token => {
      if (typeof token !== "string" || !token.startsWith("test-")) throw Object.assign(new Error("Unauthorized"), { status: 401 });
      return testUser(token);
    },
    readSession: async id => {
      const snapshot = db.snapshot(`sessions/${id}`);
      if (!snapshot.exists) throw Object.assign(new Error("Session not found"), { status: 404 });
      return snapshot.data();
    },
    executeAction: args => processSessionAction({ ...args, db, catalog }),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { io, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => io.close(resolve)) };
}

test("socket rejects anonymous access, ignores spoofed username, isolates rooms, reconnects and recovers after server restart", async () => {
  const session = fixture();
  session.mysteryCurrent = { "test-0": 1, "test-1": 2 };
  const other = { ...fixture(), id: "other-session" };
  const db = new MemoryFirestore();
  db.write(`sessions/${session.id}`, session);
  db.write(`sessions/${other.id}`, other);
  const catalog = new Map(session.playerPool.map(p => [p.id, p]));
  let server = await serverFor(db, catalog);
  const clients = [];
  try {
    const anonymous = connect(server.url, { reconnection: false, transports: ["websocket"] });
    clients.push(anonymous);
    const [error] = await once(anonymous, "connect_error");
    assert.equal(error.data.status, 401);
    const participant = connect(server.url, { auth: { token: "test-0" }, reconnection: false, transports: ["websocket"] });
    const friend = connect(server.url, { auth: { token: "test-1" }, reconnection: false, transports: ["websocket"] });
    const isolated = connect(server.url, { auth: { token: "test-2" }, reconnection: false, transports: ["websocket"] });
    clients.push(participant, friend, isolated);
    await Promise.all([participant, friend, isolated].map(client => once(client, "connect")));
    const join = (client, id) => client.timeout(2000).emitWithAck("session:join", { sessionId: id, username: "test-9" });
    const view = await join(participant, session.id);
    assert.deepEqual(view.session.mysteryCurrent, { "test-0": 1 });
    await join(friend, session.id);
    await join(isolated, other.id);
    let crossRoomEvents = 0;
    isolated.on("session:state", () => crossRoomEvents++);
    const deliveries = [once(participant, "session:state"), once(friend, "session:state")];
    const command = { type: "pick", playerId: session.playerPool.find(p => p.lot === 1).id, expectedRevision: 0, requestId: "socket-pick-request" };
    const accepted = await participant.timeout(2000).emitWithAck("session:action", { sessionId: session.id, command });
    assert.equal(accepted.ok, true);
    const events = await Promise.all(deliveries);
    assert.equal(events[0][0].revision, 1);
    assert.equal(events[1][0].revision, 1);
    assert.equal(events[0][0].fields.mysteryCurrent, undefined);
    const retry = await participant.timeout(2000).emitWithAck("session:action", { sessionId: session.id, command });
    assert.equal(retry.event.eventId, accepted.event.eventId);
    await pause(20);
    assert.equal(crossRoomEvents, 0);
    friend.disconnect();
    friend.connect();
    await once(friend, "connect");
    assert.equal((await join(friend, session.id)).session.revision, 1);
    await server.close();
    server = await serverFor(db, catalog);
    const restarted = connect(server.url, { auth: { token: "test-0" }, reconnection: false, transports: ["websocket"] });
    clients.push(restarted);
    await once(restarted, "connect");
    assert.equal((await join(restarted, session.id)).session.participants[0].budget, 228);
  } finally { clients.forEach(client => client.disconnect()); await server.close(); }
});

test("central manager shares one socket/listener set, restores snapshots, and stops connections after leaving", async () => {
  const session = fixture();
  const db = new MemoryFirestore();
  db.write(`sessions/${session.id}`, session);
  const server = await serverFor(db, new Map(session.playerPool.map(p => [p.id, p])));
  const sockets = [];
  const manager = createSocketManager({ url: server.url,
    connect: (...args) => { const socket = connect(...args); sockets.push(socket); return socket; },
    httpAction: () => { throw new Error("Healthy socket must not use HTTP"); } });
  let first;
  let second;
  const pendingStates = [];
  const leave1 = manager.subscribe(session.id, { onUpdate: value => { first = value; }, onPending: value => pendingStates.push(value) }, "test-0");
  const leave2 = manager.subscribe(session.id, { onUpdate: value => { second = value; } }, "test-0");
  try {
    await eventually(() => first && second);
    assert.equal(sockets.length, 1);
    assert.equal(sockets[0].listeners("session:state").length, 1);
    await manager.submit(session.id, { type: "pick", playerId: session.playerPool.find(p => p.lot === 1).id }, "test-0");
    await eventually(() => first.revision === 1 && second.revision === 1);
    assert(pendingStates.some(value => value?.type === "pick"));
    assert.equal(pendingStates.at(-1), null);
    manager.acceptSnapshot(session.id, session);
    assert.equal(first.revision, 1);
    // Simulate a missing revision. Sync recovers the durable snapshot rather than applying a gap.
    db.write(`sessions/${session.id}`, { ...db.snapshot(`sessions/${session.id}`).data(), revision: 3, updatedAt: Date.now(), turnIdx: 3 });
    sockets[0].emitEvent(["session:state", { sessionId: session.id, revision: 3, fields: {}, participants: [] }]);
    await eventually(() => first.revision === 3);
    assert.equal(first.turnIdx, 3);
    leave1();
    assert.equal(sockets[0].connected, true);
    leave2();
    assert.equal(sockets[0].connected, false);
  } finally { leave1(); leave2(); sockets.forEach(socket => socket.disconnect()); await server.close(); }
});
