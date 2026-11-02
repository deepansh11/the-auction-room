# Real-time engineering report

## Scope and original architecture

This repository is React 18 + Vite, Express, Socket.IO 4.8, and Cloud Firestore through Firebase Admin. Authentication is custom JWT/bcrypt. Gameplay is fixed-price, turn-based drafting, not highest-bid competition. No Redis, replacement database, state-store dependency, or visual redesign was introduced.

Originally, the browser validated picks, deducted budgets, submitted broad session objects over HTTP, and then fetched the session again. Express used a non-transactional read/merge/write and broadcast full viewer-specific snapshots. Both live screens also polled every 15 seconds, with overlapping mount/connect/focus/action refreshes. Socket joins trusted a client-provided username without authentication.

The audit reproduced tokenless subscription to another user's Mystery Card candidate. Room isolation worked. A local OPTIONS request returned 204, not the reported Cloudflare challenge. Screenshot attachments and production Cloudflare/Render configuration were unavailable.

## Implemented changes

- Centralized, JWT-authenticated socket lifecycle, one socket/listener set per page and reference-counted subscriptions. Token changes reset identity. Leaving the last subscribed session stops reconnection. Multiple browser tabs remain separate connections.
- Room access validation; server-derived identity; one active auction room per socket plus its private viewer room; operation limits and token expiry disconnection.
- A single-flight HTTP fallback controller. Healthy socket synchronization stops periodic HTTP session polling and focus refreshes. Failures back off; HTTP Retry-After is respected. Valid CORS preflights cache for 600 seconds without removing Authorization.
- Authoritative pick/pass/Mystery Card/draw/lot/transfer/completion commands. Canonical player data and prices come from the backend catalogue and stored tiers, not submitted budgets or squads. Room setup rejects duplicate identities/players, catalogue-unknown selections, and collisions.
- Firestore transactions commit mutations, revisions, and durable request receipts together. Duplicate requests return the saved event without another broadcast; conflicting ID reuse is rejected. Administrative live-session writers also use transactions.
- Compact public deltas to `auction:<sessionId>`; changed Mystery candidates only to authenticated personal rooms. Hidden lots and draw order remain filtered. Static catalogue/fixture data is not rewritten per pick.
- Revision-gap detection, duplicate/stale event rejection, socket snapshot synchronization, and stale HTTP response rejection. Completed/cancelled sessions remain durable for reconnect recovery. Completion archives results and removes the room mapping in the same transaction.
- Pending feedback without optimistic financial mutation. Unknown outcomes retain the request ID/revision for retry; unrelated commands are blocked until resolved. Failed actions do not navigate to results.
- Shared frontend CSV fetch/parse cache, stable unchanged participant/catalogue references, hidden analyser subtree suppression, and isolated countdown text. Parent screens update once at deadline expiry, not every second. Server validation enforces listing deadlines.
- Optional structured backend/browser instrumentation and local-only test/load harnesses.

## Consistency and recovery

Firestore is the durable authoritative state. There is **no authoritative backend in-memory auction cache**. Static player catalogue caching is immutable data; browser snapshots are only UI replicas.

Every accepted command increments `revision`. The existing `sequence` array remains the pick order. Concurrent transactions conflict on the session document; Firestore retries against current state and stale expected revisions reject without mutation. Transaction callbacks perform no broadcasts or response side effects.

Receipts live at `sessions/{id}/requests/{requestId}` and contain the authenticated UID, normalized-command fingerprint, accepted public event, and creation time. The acknowledgement timeout is 15 seconds. Transport/5xx failures preserve the exact command for retry, even after the browser has learned a newer revision. Definitive 4xx rejections clear it.

Snapshots are fetched after joining the authorized room so the read-before-subscription window does not lose updates. Missing revisions request a fresh filtered snapshot. A crash between commit and broadcast is recovered on reconnect; a retry returns the durable receipt. Recovery converges state; it does not promise replay of every missed toast/animation. Socket.IO's process-local adapter means deployment must currently use **one backend instance**; multiple instances require a separately validated cross-instance broadcast mechanism.

Terminal documents and receipt subcollections are retained. Define a retention/cleanup policy before enabling TTL. Firestore deleting a parent does not delete its subcollections. Do not expire receipts while retry guarantees are expected. Session listing filters terminal records from responses but still reads historical session documents; indexed active-only queries are a future improvement if history grows.

Restoring a backup cannot overwrite an existing live or terminal session. Backups remain host-authorized recovery for missing sessions. Pause the room and review any legacy state before migration; previously corrupted budgets are not automatically repaired.

## Protocol

All client events require a valid signed JWT in `socket.handshake.auth.token`. Usernames in legacy join payloads are ignored for identity. IDs are bounded and cannot contain `/`. Errors use `{ok:false,error,code,status}`; clients must inspect `ok`, not just receipt of an acknowledgement.

| Event | Direction | Payload / acknowledgement | Persistence / scope |
| --- | --- | --- | --- |
| `session:join` | client -> server | `{sessionId}` -> `{ok:true,session,serverTimestamp}` | Membership checked; filtered full snapshot; joins public and own private rooms |
| `session:sync` | client -> server | Same contract as join; coalesced client-side, 10 s timeout | Durable snapshot recovery, not event replay |
| `session:leave` | client -> server | `{sessionId}` -> `{ok:true}` | Leaves that subscription; no mutation |
| `session:action` | client -> server | `{sessionId,command}` -> `{ok:true,event,privateState}` | Auth, membership, role, status, turn, eligibility, price/budget/capacity validated; transactional receipt |
| `session:state` | server -> auction room | `{sessionId,eventId,revision,type,timestamp,fields,participants,removedParticipants}` | Accepted public delta only after commit. `participants` contains changed entries, not the whole room |
| `session:private` | server -> own private room | `{sessionId,revision,mysteryCurrent}` | Candidate changes only; never a Mystery pool |
| `session:update` | server -> personal rooms | `{session}` | Filtered administrative snapshots for membership/market/deadline changes |
| `session:closed` | server -> personal rooms | `{session,reason}` | Durable cancellation notification; command completion also arrives as a terminal public delta |
| `session:revoked` | server -> removed socket | `{sessionId}` | Subscription revoked after membership change |

Command schema: `{requestId,expectedRevision,type,playerId?,playerIds?,listed?}`. Request IDs are 8-100 alphanumeric/underscore/hyphen characters; expected revision is a non-negative integer. Types: `pick`, `mystery`, `pass`, `open-lot`, `next-lot`, `end`, `force-skip`, `reveal-draw`, `start`, `transfer-list`, `transfer-toggle`.

HTTP fallback uses `POST /api/sessions/:id/actions` with `{command}` and the same validation engine/response. Full client-state `PUT /api/sessions/:id` is retired with HTTP 409 / `CLIENT_UPGRADE_REQUIRED`. Old and new clients must not be mixed during a live auction.

## Tests and measurements

Commands:

```sh
npm test
npm run test:firestore
npm run test:load:actions
npm run test:load:firestore
npm run build
```

The emulator commands require Firebase CLI and Java and use `firebase.test.json`, a loopback Firestore emulator, and the demo project `demo-fc-auction`. No service-account credentials, production traffic, or production data are used. The normal test command intentionally skips the emulator test; it is run separately. The backend has no compilation build script; all 22 backend JavaScript files were syntax-checked and relevant modules/routes exercised.

Coverage includes valid/invalid picks, budgets/capacity, closed/completed auctions, sold/unopened players, unauthorized participants, host permissions, concurrent requests, duplicate/conflicting IDs, timeout retries, commit failure, archive recovery, transfer refunds/expiry, unchanged-reference updates, CSV reuse/retry, countdown formatting/expiry, single-flight refreshes, late-response cleanup, socket isolation/authentication, shared listeners, revision gaps, reconnect, and backend restart. The real emulator suite also exercises HTTP room creation/join/draw/start/open/pick and the retired PUT contract.

The initial snapshot-only loopback baseline (50 broadcasts) measured p95 visibility of 2.54 / 4.27 / 20.45 ms for 10 / 20 / 50 clients. **It omitted database processing and is not directly comparable to the new action path.** No before/after production latency claim is made.

Latest authoritative Socket.IO + real Firestore emulator load run: 50 picks plus two lot transitions per group, five duplicate retries, and a disconnect/rejoin. All accepted public events were received once by every connected participant.

| Clients | Accepted commands | Deliveries | Visibility p95 | Processing p95 | Actual public/private event bytes | Full snapshots at identical accepted states (calculated reference) |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 52 | 520 | 24.93 ms | 24.32 ms | 484,090 | 5,540,860 |
| 20 | 52 | 1,040 | 19.58 ms | 18.85 ms | 791,780 | 11,995,220 |
| 50 | 52 | 2,600 | 29.69 ms | 28.58 ms | 1,868,400 | 36,698,500 |

Visibility is measured from client submission to receipt by each simulated client using a shared monotonic process clock. Processing includes the emulator transaction. Byte counts are JSON payloads, not wire compression/framing; acknowledgements and join snapshots are excluded. Snapshot equivalents serialize the same states/viewers and show payload savings, not a second execution of the old backend. Fixtures are synthetic and unseeded; repeat runs vary. These are localhost results, **not Firebase cloud, Render, Chrome rendering, or WAN p95**.

At the end of the initial real-time pass, builds passed with a >500 kB chunk warning and a roughly 4 MB stadium image. The subsequent [Auction focus mode](auction-focus-mode.md) pass split secondary screens, optimized the image, removed that chunk warning, and added real Chromium UI checks. Full Chrome render, long-task, and heap profiling remains outstanding; these checks are not proof of zero unnecessary DOM renders or memory leaks.

## Monitoring and deployment

1. Deploy to staging first. Pause/finish active auctions; coordinate frontend/backend rollout and have all participants reload. Backend: `npm --prefix backend ci`, `npm --prefix backend start`. Frontend: `npm ci`, `npm run build`; publish `dist/` using the existing deployment workflow. No production deployment was performed by this change.
2. Preserve `PORT`, `CORS_ORIGINS`, `AUTH_JWT_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, and `VITE_API_BASE_URL`. Never set `FIRESTORE_EMULATOR_HOST` in production. Test-only emulator access requires loopback and a demo-prefixed project ID.
3. Set `PERFORMANCE_LOGS=true` on a controlled backend run for structured request, action/commit/broadcast, socket transport, room connection, event-loop delay, CPU, memory, and rolling p95 logs. Tokens, IPs, bodies, and query strings are excluded. Action logs include UID for correlation; apply your normal log access/retention policy.
4. Build with `VITE_PERFORMANCE_LOGS=true` for optional browser console summaries: submit-to-ack, event-to-next-frame, and long tasks. React Profiler durations require development or a React profiling build; ordinary production React disables those callbacks. These measurements separate processing/rendering components but do not by themselves determine cross-browser WAN latency.
5. Verify Render instance count/plan, resource charts/restarts, and Render-Firestore region latency. Keep a single instance until cross-instance propagation is implemented/tested. Do not add Redis or change the database without evidence.
6. Keep explicit CORS origins. Inspect actual Socket.IO transport in Chrome and `socket_transport` logs. Compare OPTIONS, API, and WebSocket traffic separately. Correlate Cloudflare challenges with Ray IDs/security events and origin logs; do not globally disable security or blindly increase rate limits. Verify the proxy path before changing `trust proxy`.
7. Existing Firestore client rules are expired development rules and Admin SDK bypasses them. Review deployed rules/IAM separately. No production rules/index changes were applied. Consider index exemptions for large non-queryable state and indexed active-session queries only with staging measurements and a coordinated index deployment.
8. Review receipt/terminal retention and large-session document growth. The current single-document transactional model is deliberately retained; measure contention before splitting it.

## Remaining risks / deliberately deferred work

- Custom account recovery currently returns reset tokens without ownership verification. This critical pre-existing issue needs a separately approved fix; this report does not certify production authentication security.
- Mystery Card cross-team duplicates preserve the original behavior. Global exclusivity requires a gameplay decision.
- No production before/after measurements or Chrome screenshot/HAR verification. Cloudflare challenges, Render limits, and region latency remain unverified.
- Snapshot recovery restores accepted state, not guaranteed historical notification replay; no cross-instance adapter or crash-durable timer scheduler was introduced. No timed highest-bid auction exists in this app.
- Full DOM/heap tests, profiler traces, and broader fixture/leaderboard security/performance tests remain to be done. Results/leaderboard history queries and pre-existing first-round completion semantics were not comprehensively redesigned.
- `scripts/test-10-players.mjs` is an old synthetic HTTP setup script, not a safe real-time load test. Its fake player IDs no longer pass canonical catalogue validation. Use the new loopback/emulator harnesses; do not run old seed/setup scripts against production.

Rollback requires a coordinated maintenance window and both frontend/backend rollback; do not re-enable the unsafe broad PUT while command clients are running. Durable session documents must not be reset or discarded to roll back code.
