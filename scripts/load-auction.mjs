/** Loopback-only Socket.IO transport harness. Synthetic state; never calls Firebase. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { io as connect } from "socket.io-client";
import { initRealtime, emitSessionUpdate } from "../backend/src/services/realtime.js";
import { fixture, testUser } from "../tests/helpers.mjs";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
for (const count of [10, 20, 50]) {
  const session = fixture(count);
  const server = createServer();
  const io = initRealtime(server, {
    verifyToken: token => { assert(token.startsWith("test-")); return testUser(token); },
    readSession: async () => session,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  let delivered = 0;
  let bytes = 0;
  const durations = [];
  const sent = new Map();
  try {
    await Promise.all(session.participantNames.map(async username => {
      const socket = connect(url, { auth: { token: username }, transports: ["websocket"], reconnection: false, timeout: 3000 });
      clients.push(socket);
      await once(socket, "connect");
      socket.emit("session:join", { sessionId: session.id, username });
      socket.on("session:update", payload => {
        if (!sent.has(payload.session.updatedAt)) return;
        durations.push(performance.now() - sent.get(payload.session.updatedAt));
        delivered++;
        bytes += Buffer.byteLength(JSON.stringify(payload));
      });
    }));
    await wait(100);
    for (let index = 1; index <= 50; index++) {
      session.updatedAt = index + 100;
      sent.set(session.updatedAt, performance.now());
      emitSessionUpdate(session);
      const timeoutAt = performance.now() + 3000;
      while (delivered < count * index && performance.now() < timeoutAt) await wait(1);
      assert.equal(delivered, count * index);
    }
    durations.sort((a, b) => a - b);
    console.log(JSON.stringify({ participants: count, deliveries: delivered, payloadBytes: bytes, visibilityP95Ms: durations[Math.ceil(durations.length * 0.95) - 1], scope: "localhost snapshot transport only; no Firebase, commands, browser rendering, or WAN" }));
  } finally {
    clients.forEach(client => client.disconnect());
    await new Promise(resolve => io.close(resolve));
  }
}
