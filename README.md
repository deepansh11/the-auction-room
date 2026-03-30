# FC Draft Bidding Room

A turn-based FC draft auction app with shared rooms, multi-device participation, Firebase-backed auth, Firestore persistence, and live session sync through the backend API.

## What This Repository Contains

- Frontend app: React + Vite, using `React.createElement()`.
- Backend API: Express service for Firebase Auth and Firestore-backed room/session persistence.
- Main app implementation in `src/app/App.jsx` with compatibility re-export at `fc-draft-v4.jsx`.

## Features

- Firebase-backed register/login flow.
- Shareable room links and room codes.
- Cross-profile and cross-incognito room/session sharing through backend persistence.
- Auction setup for 2-8 participants.
- CSV-driven player pool from `public/data/FC26 Data Sept 21 2025.csv`.
- Setup controls for player inclusion/exclusion, tier rules, and per-bidder budget.
- Host-controlled lot opening and progression.
- Turn-based picking with per-user turn enforcement.
- Squad analyser with formation fit and wishlist view.
- Firestore-persisted wishlists.
- Firestore-persisted completed auction results.

## Current Architecture

### Frontend

- `src/app/App.jsx`: root app orchestration.
- `src/screens/AuthScreen.jsx`: backend-driven auth UI.
- `src/screens/SetupScreen.jsx`: auction/session creation.
- `src/screens/BiddingScreen.jsx`: live bidding flow with session polling.
- `src/screens/ResultsScreen.jsx`: completed draft view.
- `src/screens/Dashboard.jsx`: active auctions and past results.
- `src/lib/api.js`: frontend API client for auth, rooms, sessions, results, and wishlists.
- `src/lib/localAuth.js`: client-side cache of authenticated user/token.

### Backend

- `backend/src/server.js`: Express bootstrap.
- `backend/src/services/firebaseService.js`: Firebase Admin initialization.
- `backend/src/routes/auth.js`: Firebase-backed register/login endpoints.
- `backend/src/routes/rooms.js`: room creation, joining, session reads/updates.
- `backend/src/routes/users.js`: current-user profile and wishlist persistence.
- `backend/src/routes/results.js`: completed auction results listing.
- `backend/src/services/sessionPersistence.js`: writes completed sessions into Firestore results collection.

## Firebase Setup

You need one Firebase project with:

1. Firebase Authentication enabled.
   Use `Email/Password` sign-in.
2. Cloud Firestore enabled.
3. A service account key for the backend.
4. A Firebase Web API key for backend login via Identity Toolkit.

### Backend Environment

Create `backend/.env` with:

```env
NODE_ENV=development
PORT=4000
CORS_ORIGINS=http://localhost:5173

FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-firebase-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_WEB_API_KEY=your-firebase-web-api-key
```

### Frontend Environment

Create `.env` in the repo root with:

```env
VITE_API_BASE_URL=http://localhost:4000
```

## Firestore Collections

The app currently uses these collections.

### `users`

Document id: Firebase Auth `uid`

Example:

```json
{
  "uid": "firebase-user-id",
  "username": "deepansh",
  "usernameLower": "deepansh",
  "wishlists": {
    "deepansh": [158023, 202126],
    "friend1": [20801]
  },
  "createdAt": 1710000000000,
  "updatedAt": 1710000009999
}
```

Purpose:

- stores the canonical username
- stores wishlist state
- hydrates the user profile across devices/sessions

### `rooms`

Document id: uppercased room code

Example:

```json
{
  "roomCode": "AB12CD",
  "sessionId": "session:1710000000000",
  "updatedAt": 1710000001234
}
```

Purpose:

- resolves share links and room-code joins to the active session document

### `sessions`

Document id: app session id

Example:

```json
{
  "id": "session:1710000000000",
  "name": "Deepansh's Auction",
  "host": "deepansh",
  "roomCode": "AB12CD",
  "budgetPerBidder": 240,
  "status": "active",
  "participants": [
    { "name": "deepansh", "budget": 219, "squad": [] },
    { "name": "friend1", "budget": 240, "squad": [] }
  ],
  "participantNames": ["deepansh", "friend1"],
  "lotOrder": [3, 1, 5, 2, 6, 4],
  "lotIdx": 0,
  "turnIdx": 1,
  "lotOpen": true,
  "lotClosing": false,
  "passedThisLot": [],
  "tiers": {},
  "playerPool": [],
  "shuffledPlayers": [],
  "createdAt": 1710000000000,
  "updatedAt": 1710000005555
}
```

Purpose:

- live room state
- active bidding sync
- resumed in-progress auctions

### `auctionResults`

Document id: completed `sessionId`

Example:

```json
{
  "sessionId": "session:1710000000000",
  "roomCode": "AB12CD",
  "name": "Deepansh's Auction",
  "host": "deepansh",
  "participants": [],
  "participantNames": ["deepansh", "friend1"],
  "tiers": {},
  "playerPool": [],
  "status": "complete",
  "createdAt": 1710000000000,
  "completedAt": 1710000099999
}
```

Purpose:

- long-term storage of completed auctions
- dashboard history / past results listing

## Quick Start

1. Install frontend dependencies:

```bash
npm install
```

2. Install backend dependencies:

```bash
npm --prefix backend install
```

3. Create `.env` and `backend/.env` using the values shown above.

4. Start frontend and backend together:

```bash
npm run dev
```

5. Open the app:

- `http://localhost:5173`

6. Check backend health:

- `http://localhost:4000/api/health`

## Backend API Overview

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`

### User

- `GET /api/users/me`
- `PUT /api/users/me/wishlists`

### Rooms

- `POST /api/rooms`
- `GET /api/rooms/:roomCode`
- `POST /api/rooms/:roomCode/join`

### Sessions

- `GET /api/sessions?username=<name>`
- `GET /api/sessions/:id`
- `PUT /api/sessions/:id`

### Results

- `GET /api/results?username=<name>`

## Persistence Rules

- Wishlists are persisted to Firestore under `users/{uid}.wishlists`.
- Active auction state is persisted in `sessions`.
- Room code resolution is persisted in `rooms`.
- Completed auctions are copied into `auctionResults` when a session reaches `status: complete`.

## Security Notes

- Backend verifies Firebase ID tokens for protected routes.
- CORS allowlist is controlled through `CORS_ORIGINS`.
- Rate limiting and `helmet` are enabled.
- `.env` files should not be committed.

## Commands

- `npm run dev`: run frontend and backend together.
- `npm run dev:frontend`: run Vite only.
- `npm run dev:backend`: run backend only.
- `npm run build`: production frontend build.
- `npm run preview`: preview frontend build.

## Next Recommended Hardening

- Add Firestore security/index documentation.
- Add refresh-token handling or session renewal in frontend auth cache.
- Add backend authorization checks so only room participants/host can mutate a session.
- Add automated tests for auth, room join, and session result persistence.
