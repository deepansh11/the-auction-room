/** Local-only authoritative Socket.IO action harness. Optional REAL Firestore emulator. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { io as connect } from "socket.io-client";
import { initRealtime } from "../backend/src/services/realtime.js";
import { processSessionAction } from "../backend/src/services/sessionActions.js";
import { sanitizeSessionForViewer } from "../backend/src/services/sessionView.js";
import { fixture, MemoryFirestore, testUser } from "../tests/helpers.mjs";

const emulator = process.argv.includes("--firestore");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let app;
let db;
let deleteApp;
if (emulator) {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
  const require = createRequire(new URL("../backend/package.json", import.meta.url));
  const admin = require("firebase-admin/app");
  deleteApp = admin.deleteApp;
  app = admin.initializeApp({ projectId: "demo-fc-auction" }, `load-${Date.now()}`);
  db = require("firebase-admin/firestore").getFirestore(app);
} else db = new MemoryFirestore();

try {
  for (const count of [10, 20, 50]) {
    let session = fixture(count);
    session.id = `load-${count}-${Date.now()}`;
    const catalogue = new Map(session.playerPool.map(p => [p.id, p]));
    await db.collection("sessions").doc(session.id).set(session);
    const server = createServer();
    const processing = [];
    const io = initRealtime(server, {
      verifyToken: token => { assert(token?.startsWith("test-")); return testUser(token); },
      readSession: async id => (await db.collection("sessions").doc(id).get()).data(),
      executeAction: async args => {
        const start = performance.now();
        const result = await processSessionAction({ ...args, db, catalog: catalogue });
        processing.push(performance.now() - start);
        session = result.session;
        return result;
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const url = `http://127.0.0.1:${server.address().port}`;
    const clients = new Map();
    const sent = new Map();
    const latencies = [];
    let bytes = 0;
    let snapshotEquivalentBytes = 0;
    let deliveries = 0;
    let commands = 0;
    try {
      await Promise.all(session.participantNames.map(async name => {
        const client = connect(url, { auth: { token: name }, reconnection: false, transports: ["websocket"] });
        clients.set(name, client);
        await once(client, "connect");
        const joined = await client.timeout(5000).emitWithAck("session:join", { sessionId: session.id });
        assert.equal(joined.ok, true);
        client.on("session:state", event => {
          deliveries++;
          bytes += Buffer.byteLength(JSON.stringify(event));
          latencies.push(performance.now() - sent.get(event.eventId));
        });
        client.on("session:private", event => { bytes += Buffer.byteLength(JSON.stringify(event)); });
      }));
      const submit = async (name, input, duplicate = false) => {
        const command = { ...input, expectedRevision: Number(session.revision || 0), requestId: `load-request-${count}-${++commands}` };
        sent.set(command.requestId, performance.now());
        const send = () => clients.get(name).timeout(15000).emitWithAck("session:action", { sessionId: session.id, command });
        const reply = await send();
        assert.equal(reply.ok, true, reply.error);
        if (duplicate) assert.equal((await send()).event.eventId, reply.event.eventId);
        const deadline = performance.now() + 5000;
        while (deliveries < count * commands && performance.now() < deadline) await pause(1);
        assert.equal(deliveries, count * commands);
        for (const name of session.participantNames) snapshotEquivalentBytes += Buffer.byteLength(JSON.stringify({ session: sanitizeSessionForViewer(session, name) }));
      };
      for (let index = 0; index < 50; index++) {
        if (session.lotClosing) {
          await submit(session.host, { type: "next-lot" });
          await submit(session.host, { type: "open-lot" });
        }
        const active = session.sequence.filter(name => !session.passedThisLot.includes(name));
        const picker = active[session.turnIdx % active.length];
        const owned = new Set(session.participants.flatMap(p => p.squad.map(player => player.id)));
        const player = session.playerPool.find(p => p.lot === session.lotOrder[session.lotIdx] && !owned.has(p.id));
        await submit(picker, { type: "pick", playerId: player.id }, index % 10 === 0);
        if (index === 24) {
          const client = clients.get(session.host);
          client.disconnect(); client.connect();
          await once(client, "connect");
          const recovered = await client.timeout(5000).emitWithAck("session:join", { sessionId: session.id });
          assert.equal(recovered.session.revision, session.revision);
        }
      }
      const percentile = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
      console.log(JSON.stringify({ participants: count, acceptedCommands: commands, deliveries, payloadBytes: bytes, snapshotEquivalentBytes,
        visibilityP95Ms: percentile(latencies), processingP95Ms: percentile(processing),
        scope: emulator ? "localhost Socket.IO + real Firestore emulator; no WAN/browser rendering" : "localhost Socket.IO + transaction double; no Firebase/WAN/browser rendering" }));
    } finally { clients.forEach(client => client.disconnect()); await new Promise(resolve => io.close(resolve)); }
  }
} finally { if (emulator) { await db.terminate(); await deleteApp(app); } }
