import { Router } from "express";
import crypto from "node:crypto";
import { requireUserAuth } from "../middleware/userAuth.js";
import { normalizeFirebaseError } from "../services/firebaseErrors.js";
import { getFirebase } from "../services/firebaseService.js";
import { normalizeAuctionResultDocument, normalizeSessionDocument } from "../services/sessionState.js";
import { sanitizeSessionForViewer } from "../services/sessionView.js";
import { emitSessionUpdate } from "../services/realtime.js";
import { saveManualSubmission } from "../services/performanceSubmission.js";
import { normalizeFixtureLeg } from "../../shared/fixtureLegs.js";
import { readClubSelections, saveClubSelection } from "../services/clubSelections.js";

function canAccessResult(result, username) {
  if (!result || !username) return false;
  if (result.host === username) return true;
  return Array.isArray(result.participantNames) && result.participantNames.includes(username);
}

function flattenFixtures(fixtures = {}) {
  return Object.values(fixtures || {})
    .flatMap((groupFixtures) => Array.isArray(groupFixtures) ? groupFixtures : [])
    .filter((fixture) => fixture && fixture.id && fixture.home && fixture.away)
    .sort((left, right) => {
      const roundDiff = Number(left.round || 0) - Number(right.round || 0);
      if (roundDiff !== 0) return roundDiff;
      return String(left.id).localeCompare(String(right.id));
    });
}

function findFixtureGroup(fixtures = {}, fixtureId) {
  for (const [groupLabel, groupFixtures] of Object.entries(fixtures || {})) {
    if (!Array.isArray(groupFixtures)) continue;
    const fixture = groupFixtures.find((item) => String(item?.id) === String(fixtureId));
    if (fixture) return { groupLabel, fixture };
  }
  return null;
}

function pickUploadParticipants(result, fixtureId = "") {
  const fixtureTeams = fixtureId
    ? new Set(
        flattenFixtures(result?.fixtures || {})
          .filter((fixture) => String(fixture?.id) === String(fixtureId))
          .flatMap((fixture) => [fixture.home, fixture.away])
          .filter(Boolean)
      )
    : null;

  return (Array.isArray(result?.participants) ? result.participants : [])
    .filter((participant) => participant?.name)
    .filter((participant) => !fixtureTeams || fixtureTeams.has(participant.name))
    .map((participant) => ({
      name: String(participant.name || "").trim(),
      squad: Array.isArray(participant.squad)
        ? participant.squad.map((player) => ({
            id: player?.id,
            name: String(player?.name || "").trim(),
            rating: Number.isFinite(Number(player?.rating)) ? Number(player.rating) : null,
            pos: String(player?.pos || "").trim(),
          }))
        : [],
      soldPlayers: Array.isArray(participant.soldPlayers)
        ? participant.soldPlayers.map(player => ({ id: player.id, name: String(player.name || "").trim(), pos: String(player.pos || "").trim() }))
        : [],
    }));
}

async function loadPerformanceSubmissions(db, auctionResultId, fixtureId = "") {
  const snap = await db.collection("auctionPerformanceSubmissions")
    .where("auctionResultId", "==", auctionResultId)
    .get();

  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((submission) => !fixtureId || String(submission?.fixtureId) === String(fixtureId))
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

function getBaseRoundCount(teamCount) {
  if (teamCount < 2) return 0;
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

function isPlayedFixture(fixture) {
  return Number.isFinite(Number(fixture?.homeGoals)) && Number.isFinite(Number(fixture?.awayGoals));
}

function getTransferSalePrice(player, tiers = {}) {
  const explicitPrice = Number(player?.salePrice ?? player?.purchasePrice);
  if (Number.isFinite(explicitPrice)) return explicitPrice;
  const rating = Number(player?.rating);
  const fallbackTier = Object.values(tiers || {}).find((tier) => rating >= Number(tier?.min) && rating <= Number(tier?.max));
  return Number(fallbackTier?.price || 0);
}

function buildExpectedBudgets(participants = []) {
  return Object.fromEntries((Array.isArray(participants) ? participants : []).map((participant) => [
    participant?.name,
    Number(participant?.budget || 0),
  ]).filter(([name]) => Boolean(name)));
}

function normalizeDeadlineAt(value) {
  const deadline = Number(value);
  return Number.isFinite(deadline) && deadline > 0 ? deadline : null;
}

function restoreTransferredPlayer(player) {
  if (!player || typeof player !== "object") return player;
  const { soldAt, salePrice, ...restoredPlayer } = player;
  return {
    ...restoredPlayer,
    soldInTransferWindow: false,
  };
}

function isFirstRoundComplete(result) {
  if (!result?.groupsEnabled) return false;
  const groups = result.groups || {};
  const fixtures = result.fixtures || {};
  const labels = Object.keys(groups);
  if (labels.length === 0) return false;

  return labels.every((label) => {
    const teams = Array.isArray(groups[label]) ? groups[label].filter(Boolean) : [];
    const groupFixtures = Array.isArray(fixtures[label]) ? fixtures[label] : [];
    const requiredMatchesPerTeam = Math.max(teams.length - 1, 0);
    if (requiredMatchesPerTeam === 0) return false;

    const playedByTeam = Object.fromEntries(teams.map((team) => [team, 0]));
    groupFixtures.forEach((fixture) => {
      if (!isPlayedFixture(fixture)) return;
      if (playedByTeam[fixture.home] !== undefined) playedByTeam[fixture.home] += 1;
      if (playedByTeam[fixture.away] !== undefined) playedByTeam[fixture.away] += 1;
    });

    return teams.every((team) => Number(playedByTeam[team] || 0) >= requiredMatchesPerTeam);
  });
}

function createTransferSessionFromResult(result) {
  const now = Date.now();
  const boughtIds = new Set(
    (Array.isArray(result.participants) ? result.participants : [])
      .flatMap((participant) => Array.isArray(participant?.squad) ? participant.squad : [])
      .map((player) => Number(player?.id))
      .filter(Number.isFinite)
  );
  const unsoldCarryCount = (Array.isArray(result.playerPool) ? result.playerPool : [])
    .map((player) => Number(player?.id))
    .filter((id) => Number.isFinite(id) && !boughtIds.has(id))
    .length;

  return {
    id: `${result.sessionId || result.id}-transfer-${now}`,
    name: `${result.name || "Auction Result"} · Transfer Window`,
    host: result.host || "",
    roomCode: result.roomCode || "",
    budgetPerBidder: Number(result.budgetPerBidder || 0),
    participants: Array.isArray(result.participants) ? result.participants.map((participant) => ({
      ...participant,
      soldPlayers: Array.isArray(participant?.soldPlayers) ? participant.soldPlayers : [],
    })) : [],
    participantNames: Array.isArray(result.participantNames) ? result.participantNames : [],
    lotOrder: [],
    sequence: [],
    playerPool: [],
    shuffledPlayers: [],
    passedThisLot: [],
    turnIdx: 0,
    lotIdx: 0,
    lotOpen: false,
    lotClosing: false,
    drawPhase: 0,
    revealedLotCount: 0,
    revealedPickCount: 0,
    mysteryEnabled: Boolean(result.mysteryEnabled),
    mysteryPools: {},
    mysteryCurrent: {},
    mysteryUsed: {},
    tiers: result.tiers || {},
    groupsEnabled: false,
    groupCount: 0,
    groups: {},
    fixtures: {},
    fixtureLeg: normalizeFixtureLeg(result.fixtureLeg),
    clubSelections: result.clubSelections || {},
    knockoutFormat: ["semiFinal", "quarterFinal", "finalOnly"].includes(result.knockoutFormat)
      ? result.knockoutFormat
      : "semiFinal",
    carriedBudgets: Object.fromEntries(
      (Array.isArray(result.participants) ? result.participants : []).map((participant) => [
        participant.name,
        Number(result?.carriedBudgets?.[participant.name] ?? participant?.budget ?? 0),
      ])
    ),
    expectedBudgets: buildExpectedBudgets(result.participants),
    soldPlayerIds: (Array.isArray(result.participants) ? result.participants : [])
      .flatMap((participant) => Array.isArray(participant?.soldPlayers) ? participant.soldPlayers : [])
      .map((player) => Number(player?.id))
      .filter(Number.isFinite),
    transferWindow: {
      phase: "selling",
      requiredSalesMin: 2,
      requiredSalesMax: 5,
      listingDeadlineAt: normalizeDeadlineAt(result.transferWindow?.listingDeadlineAt),
      listingDeadlineSetAt: normalizeDeadlineAt(result.transferWindow?.listingDeadlineSetAt),
      completedBy: (Array.isArray(result.participants) ? result.participants : [])
        .filter((participant) => {
          const listed = Array.isArray(participant?.soldPlayers) ? participant.soldPlayers.length : 0;
          return listed >= 2 && listed <= 5;
        })
        .map((participant) => participant.name),
      openedAt: now,
      closedAt: null,
      sourceResultId: String(result.sessionId || result.id || ""),
      sourceSessionId: String(result.sessionId || result.id || ""),
      saleTargetSize: 16,
      unsoldCarryCount,
    },
    seasonInfo: result.seasonInfo || { seasonNumber: 1, leagueName: "Elite League", phase: "mid-season" },
    status: "transfer",
    createdAt: now,
    updatedAt: now,
  };
}

const router = Router();

router.get("/results", requireUserAuth, async (req, res) => {
  try {
    const username = String(req.user?.username || req.query.username || "").trim();
    if (!username) return res.status(400).json({ error: "username query param is required" });

    const { db } = getFirebase();
    const snap = await db.collection("auctionResults")
      .where("participantNames", "array-contains", username)
      .get();

    const results = snap.docs
      .map((doc) => normalizeAuctionResultDocument(doc.data()))
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

    return res.json({ results });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to list results", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.get("/results/:auctionResultId/club-selections", requireUserAuth, async (req, res) => {
  try {
    const clubSelections = await readClubSelections(getFirebase().db, req.params.auctionResultId, req.user.username);
    return res.json({ clubSelections });
  } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : "Could not load club choices" }); }
});

router.put("/results/:auctionResultId/club-selection", requireUserAuth, async (req, res) => {
  try {
    const saved = await saveClubSelection(getFirebase().db, req.params.auctionResultId, req.user.username, req.body?.clubId);
    if (saved.live) emitSessionUpdate(saved.live);
    return res.json({ clubSelections: saved.clubSelections });
  } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : "Could not save your club choice" }); }
});

router.get("/results/:auctionResultId/fixtures", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    const { db } = getFirebase();
    const snap = await db.collection("auctionResults").doc(auctionResultId).get();
    if (!snap.exists) return res.status(404).json({ error: "Result not found" });
    const result = normalizeAuctionResultDocument(snap.data());
    return res.json({ fixtures: result.fixtures || {} });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to fetch fixtures", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.get("/results/:auctionResultId/ballon-dor-submissions", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    const username = String(req.user?.username || "").trim();
    const { db } = getFirebase();

    const resultSnap = await db.collection("auctionResults").doc(auctionResultId).get();
    if (!resultSnap.exists) return res.status(404).json({ error: "Result not found" });
    const result = normalizeAuctionResultDocument(resultSnap.data());
    if (!canAccessResult(result, username)) {
      return res.status(403).json({ error: "You are not allowed to view these submissions" });
    }

    const submissions = await loadPerformanceSubmissions(db, auctionResultId);

    return res.json({ submissions });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to load Ballon dOr submissions", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/results/:auctionResultId/ballon-dor-upload-link", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    const username = String(req.user?.username || "").trim();
    const requestedFixtureId = String(req.body?.fixtureId || "").trim();
    const { db } = getFirebase();

    const resultRef = db.collection("auctionResults").doc(auctionResultId);
    const resultSnap = await resultRef.get();
    if (!resultSnap.exists) return res.status(404).json({ error: "Result not found" });
    const result = normalizeAuctionResultDocument(resultSnap.data());
    if (result.host !== username) {
      return res.status(403).json({ error: "Only the host can generate the upload link" });
    }

    if (requestedFixtureId) {
      const fixtureMatch = findFixtureGroup(result.fixtures, requestedFixtureId);
      if (!fixtureMatch) {
        return res.status(404).json({ error: "Fixture not found" });
      }
    }

    const uploadToken = String(result.ballonDorUploadToken || "").trim() || crypto.randomBytes(24).toString("hex");
    if (!result.ballonDorUploadToken) {
      await resultRef.set({ ballonDorUploadToken: uploadToken, updatedAt: Date.now() }, { merge: true });
    }

    return res.json({
      auctionResultId,
      uploadToken,
      participantNames: Array.isArray(result.participantNames) ? result.participantNames : [],
      fixtures: requestedFixtureId
        ? flattenFixtures(result.fixtures).filter((fixture) => String(fixture.id) === requestedFixtureId)
        : flattenFixtures(result.fixtures),
      fixedFixtureId: requestedFixtureId,
      leagueName: result.seasonInfo?.leagueName || result.name || "League",
    });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to generate Ballon dOr upload link", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.get("/public/results/:auctionResultId/ballon-dor-upload", async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    const token = String(req.query.token || "").trim();
    const requestedFixtureId = String(req.query.fixtureId || "").trim();
    if (!token) return res.status(400).json({ error: "Upload token is required" });

    const { db } = getFirebase();
    const resultSnap = await db.collection("auctionResults").doc(auctionResultId).get();
    if (!resultSnap.exists) return res.status(404).json({ error: "Result not found" });
    const result = normalizeAuctionResultDocument(resultSnap.data());
    if (String(result.ballonDorUploadToken || "") !== token) {
      return res.status(403).json({ error: "Upload link is invalid or expired" });
    }

    if (requestedFixtureId) {
      const fixtureMatch = findFixtureGroup(result.fixtures, requestedFixtureId);
      if (!fixtureMatch) {
        return res.status(404).json({ error: "Fixture not found" });
      }
    }

    return res.json({
      auctionResultId,
      leagueName: result.seasonInfo?.leagueName || result.name || "League",
      participantNames: Array.isArray(result.participantNames) ? result.participantNames : [],
      participants: pickUploadParticipants(result, requestedFixtureId),
      fixtures: requestedFixtureId
        ? flattenFixtures(result.fixtures).filter((fixture) => String(fixture.id) === requestedFixtureId)
        : flattenFixtures(result.fixtures),
      fixedFixtureId: requestedFixtureId,
      submissions: await loadPerformanceSubmissions(db, auctionResultId, requestedFixtureId),
    });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to load Ballon dOr upload page", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/results/:auctionResultId/ballon-dor-submissions", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    const username = String(req.user?.username || "").trim();
    const submission = req.body?.submission;
    if (!auctionResultId || !submission || typeof submission !== "object") {
      return res.status(400).json({ error: "auctionResultId and submission are required" });
    }
    const saved = await saveManualSubmission({ db: getFirebase().db, auctionResultId, submission, username });
    return res.status(201).json({ submission: saved });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to save Ballon dOr submission", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.put("/results/:auctionResultId/transfer-listings", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    const username = String(req.user?.username || "").trim();
    const playerId = Number(req.body?.playerId);
    const listed = Boolean(req.body?.listed);
    if (!auctionResultId || !Number.isFinite(playerId)) {
      return res.status(400).json({ error: "auctionResultId and playerId are required" });
    }

    const { db } = getFirebase();
    const resultRef = db.collection("auctionResults").doc(auctionResultId);
    const updatedResult = await db.runTransaction(async transaction => {
    const resultSnap = await transaction.get(resultRef);
    if (!resultSnap.exists) throw Object.assign(new Error("Result not found"), { status: 404 });
    const result = normalizeAuctionResultDocument(resultSnap.data());
    if (!canAccessResult(result, username)) {
      throw Object.assign(new Error("You are not allowed to update transfer listings for this league"), { status: 403 });
    }
    if (String(result.transferWindow?.activeSessionId || "")) {
      throw Object.assign(new Error("Transfer window is already active. Update listings from the live transfer session."), { status: 409 });
    }
    if (result.transferWindow?.listingDeadlineAt && Date.now() >= result.transferWindow.listingDeadlineAt) {
      throw Object.assign(new Error("Transfer listing deadline has passed"), { status: 409 });
    }

    const participants = Array.isArray(result.participants) ? result.participants : [];
    const ownerParticipant = participants.find((participant) => participant.name === username);
    if (!ownerParticipant) {
      throw Object.assign(new Error("Only team owners can manage their transfer listings"), { status: 403 });
    }

    const squad = Array.isArray(ownerParticipant.squad) ? ownerParticipant.squad : [];
    const soldPlayers = Array.isArray(ownerParticipant.soldPlayers) ? ownerParticipant.soldPlayers : [];
    const existingSoldPlayer = soldPlayers.find((player) => Number(player?.id) === playerId);
    const existingSquadPlayer = squad.find((player) => Number(player?.id) === playerId);

    if (listed && !existingSquadPlayer) {
      throw Object.assign(new Error("Player not found in your squad"), { status: 404 });
    }
    if (!listed && !existingSoldPlayer) {
      throw Object.assign(new Error("Player is not currently listed for transfer"), { status: 404 });
    }

    const requiredSalesMin = Number(result.transferWindow?.requiredSalesMin || 2);
    const requiredSalesMax = Number(result.transferWindow?.requiredSalesMax || 5);
    if (listed && soldPlayers.length >= requiredSalesMax) {
      throw Object.assign(new Error(`You can list at most ${requiredSalesMax} players`), { status: 409 });
    }

    const listingPrice = getTransferSalePrice(existingSquadPlayer || existingSoldPlayer, result.tiers);
    const now = Date.now();
    const nextParticipants = participants.map((participant) => {
      if (participant.name !== username) return participant;
      const participantBudget = Number(participant?.budget || 0);
      const participantSquad = Array.isArray(participant.squad) ? participant.squad : [];
      const participantSoldPlayers = Array.isArray(participant.soldPlayers) ? participant.soldPlayers : [];
      if (listed) {
        return {
          ...participant,
          budget: participantBudget + listingPrice,
          squad: participantSquad.filter((player) => Number(player?.id) !== playerId),
          soldPlayers: [
            ...participantSoldPlayers,
            {
              ...existingSquadPlayer,
              soldAt: now,
              salePrice: listingPrice,
              soldInTransferWindow: true,
            },
          ],
        };
      }

      return {
        ...participant,
        budget: Math.max(0, participantBudget - listingPrice),
        squad: [...participantSquad, restoreTransferredPlayer(existingSoldPlayer)],
        soldPlayers: participantSoldPlayers.filter((player) => Number(player?.id) !== playerId),
      };
    });

    const nextCompletedBy = nextParticipants
      .filter((participant) => {
        const listedCount = Array.isArray(participant?.soldPlayers) ? participant.soldPlayers.length : 0;
        return listedCount >= requiredSalesMin && listedCount <= requiredSalesMax;
      })
      .map((participant) => participant.name);
    const nextCarriedBudgets = {
      ...(result.carriedBudgets || {}),
      [username]: Number.isFinite(Number((result.carriedBudgets || {})[username]))
        ? Number((result.carriedBudgets || {})[username])
        : Number(ownerParticipant?.budget || 0),
    };
    const nextSoldPlayerIds = nextParticipants
      .flatMap((participant) => Array.isArray(participant?.soldPlayers) ? participant.soldPlayers : [])
      .map((player) => Number(player?.id))
      .filter(Number.isFinite);
    const nextTransferWindow = {
      ...(result.transferWindow || {}),
      requiredSalesMin,
      requiredSalesMax,
      completedBy: nextCompletedBy,
      phase: String(result.transferWindow?.phase || "locked"),
    };
    const nextResult = {
      ...result,
      participants: nextParticipants,
      carriedBudgets: nextCarriedBudgets,
      expectedBudgets: buildExpectedBudgets(nextParticipants),
      soldPlayerIds: nextSoldPlayerIds,
      transferWindow: nextTransferWindow,
      updatedAt: now,
    };

    transaction.set(resultRef, {
      participants: nextParticipants,
      carriedBudgets: nextCarriedBudgets,
      expectedBudgets: buildExpectedBudgets(nextParticipants),
      soldPlayerIds: nextSoldPlayerIds,
      transferWindow: nextTransferWindow,
      updatedAt: now,
    }, { merge: true });

    return nextResult;
    });
    return res.json({ result: updatedResult });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to update transfer listings", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/public/results/:auctionResultId/ballon-dor-submissions", async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    const token = String(req.query.token || req.body?.token || "").trim();
    const requestedFixtureId = String(req.query.fixtureId || "").trim();
    const submission = req.body?.submission;
    if (!token || !submission || typeof submission !== "object") {
      return res.status(400).json({ error: "Upload token and submission are required" });
    }

    const saved = await saveManualSubmission({ db: getFirebase().db, auctionResultId, submission, publicToken: token, requestedFixtureId });
    return res.status(201).json({ submission: saved });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to save Ballon dOr submission", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

// Save points for players in an auction
router.post("/results/:auctionResultId/points", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    const { pointsData } = req.body; // Array of { playerId, playerName, pointsAwarded }
    
    if (!auctionResultId || !Array.isArray(pointsData)) {
      return res.status(400).json({ error: "auctionResultId and pointsData array required" });
    }

    const { db } = getFirebase();
    const batch = db.batch();
    const timestamp = Date.now();

    // Save each point entry
    for (const point of pointsData) {
      const docRef = db.collection("auctionPlayerPoints").doc();
      batch.set(docRef, {
        auctionResultId,
        playerId: point.playerId,
        playerName: point.playerName,
        pointsAwarded: point.pointsAwarded || 0,
        awardedBy: req.user.username,
        awardedAt: timestamp
      });
    }

    await batch.commit();
    return res.json({ success: true, message: "Points saved" });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to save points", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

// Get leaderboard data (total points and trophies per player)
router.get("/leaderboard", requireUserAuth, async (req, res) => {
  try {
    const { db } = getFirebase();
    
    // Get all points data
    const pointsSnap = await db.collection("auctionPlayerPoints").get();
    const pointsData = pointsSnap.docs.map(doc => doc.data());

    // Get all auction results to determine winners
    const auctionsSnap = await db.collection("auctionResults").get();
    const auctions = auctionsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Calculate totals and trophies
    const leaderboard = {};
    const trophyData = {};

    // Aggregate points by player
    for (const point of pointsData) {
      const playerName = point.playerName;
      if (!leaderboard[playerName]) {
        leaderboard[playerName] = {
          playerName,
          totalPoints: 0,
          tournaments: [],
          averagePoints: 0
        };
      }
      leaderboard[playerName].totalPoints += point.pointsAwarded || 0;
    }

    // Calculate tournament winners
    for (const auction of auctions) {
      const auctionId = auction.id;
      const auctionPointsForPlayers = pointsData.filter(p => p.auctionResultId === auctionId);
      
      // Find winner (highest points in this auction)
      let winner = null;
      let maxPoints = 0;
      const playerTotals = {};

      for (const point of auctionPointsForPlayers) {
        if (!playerTotals[point.playerName]) playerTotals[point.playerName] = 0;
        playerTotals[point.playerName] += point.pointsAwarded || 0;
      }

      for (const [player, points] of Object.entries(playerTotals)) {
        if (points > maxPoints) {
          maxPoints = points;
          winner = player;
        }
      }

      // Track trophy and tournament info
      if (winner && leaderboard[winner]) {
        if (!trophyData[winner]) {
          trophyData[winner] = {
            trophyCount: 0,
            tournaments: []
          };
        }
        trophyData[winner].trophyCount += 1;
        trophyData[winner].tournaments.push(auction.name || auction.roomCode || auctionId);
      }
    }

    // Combine data
    const finalLeaderboard = Object.values(leaderboard)
      .map(entry => ({
        ...entry,
        trophyCount: trophyData[entry.playerName]?.trophyCount || 0,
        tournaments: trophyData[entry.playerName]?.tournaments || [],
        averagePoints: entry.totalPoints > 0 
          ? Math.round((entry.totalPoints / (trophyData[entry.playerName]?.tournaments?.length || 1)) * 10) / 10
          : 0
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    return res.json({ leaderboard: finalLeaderboard });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to fetch leaderboard", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

// Get points for a specific auction
router.get("/results/:auctionResultId/points", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;

    const { db } = getFirebase();
    const snap = await db.collection("auctionPlayerPoints")
      .where("auctionResultId", "==", auctionResultId)
      .get();

    const points = snap.docs.map(doc => doc.data());
    return res.json({ points });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to fetch points", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

// Save/update the group-stage fixtures (with goals) for a completed auction — host only
router.put("/results/:auctionResultId/fixtures", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    const { fixtures } = req.body || {};

    if (!auctionResultId || !fixtures || typeof fixtures !== "object" || Array.isArray(fixtures)) {
      return res.status(400).json({ error: "auctionResultId and a fixtures object are required" });
    }

    const username = String(req.user?.username || "").trim();
    const { db } = getFirebase();

    const snap = await db.collection("auctionResults").doc(auctionResultId).get();
    if (snap.exists) {
      const result = normalizeAuctionResultDocument(snap.data());
      if (result.host && result.host !== username) {
        return res.status(403).json({ error: "Only the host can save fixtures" });
      }
    }

    await db.collection("auctionResults").doc(auctionResultId).set({
      fixtures,
      updatedAt: Date.now(),
    }, { merge: true });

    return res.json({ success: true });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to save fixtures", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.put("/results/:auctionResultId/fixtures/:fixtureId/score", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId, fixtureId } = req.params;
    const username = String(req.user?.username || "").trim();
    const groupLabelInput = String(req.body?.groupLabel || "").trim();
    const homeGoalsRaw = req.body?.homeGoals;
    const awayGoalsRaw = req.body?.awayGoals;
    const homeGoals = homeGoalsRaw === null || homeGoalsRaw === "" ? null : Number(homeGoalsRaw);
    const awayGoals = awayGoalsRaw === null || awayGoalsRaw === "" ? null : Number(awayGoalsRaw);

    if (!auctionResultId || !fixtureId) {
      return res.status(400).json({ error: "auctionResultId and fixtureId are required" });
    }
    if ((homeGoals !== null && (!Number.isFinite(homeGoals) || homeGoals < 0))
      || (awayGoals !== null && (!Number.isFinite(awayGoals) || awayGoals < 0))) {
      return res.status(400).json({ error: "Scores must be non-negative numbers" });
    }

    const { db } = getFirebase();
    const resultRef = db.collection("auctionResults").doc(auctionResultId);
    const snap = await resultRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Result not found" });
    const result = normalizeAuctionResultDocument(snap.data());

    const fixtureMatch = groupLabelInput
      ? {
          groupLabel: groupLabelInput,
          fixture: Array.isArray(result.fixtures?.[groupLabelInput])
            ? result.fixtures[groupLabelInput].find((item) => String(item?.id) === String(fixtureId))
            : null,
        }
      : findFixtureGroup(result.fixtures, fixtureId);
    if (!fixtureMatch?.fixture) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const canEdit = result.host === username
      || fixtureMatch.fixture.home === username
      || fixtureMatch.fixture.away === username;
    if (!canEdit) {
      return res.status(403).json({ error: "You can only update scores for fixtures involving your team" });
    }

    const nextFixtures = {
      ...result.fixtures,
      [fixtureMatch.groupLabel]: (result.fixtures?.[fixtureMatch.groupLabel] || []).map((item) => {
        if (String(item?.id) !== String(fixtureId)) return item;
        return {
          ...item,
          homeGoals,
          awayGoals,
          scoreUpdatedAt: homeGoals !== null && awayGoals !== null ? Date.now() : item?.scoreUpdatedAt || null,
          scoreUpdatedBy: username,
        };
      }),
    };

    await resultRef.set({
      fixtures: nextFixtures,
      updatedAt: Date.now(),
    }, { merge: true });

    return res.json({ success: true, fixtures: nextFixtures });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to save fixture score", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.delete("/results/:auctionResultId", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    if (!auctionResultId) {
      return res.status(400).json({ error: "auctionResultId is required" });
    }

    const username = String(req.user?.username || "").trim();
    const { db } = getFirebase();
    const resultRef = db.collection("auctionResults").doc(auctionResultId);
    const snap = await resultRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Result not found" });

    const result = normalizeAuctionResultDocument(snap.data());
    if (!username || result.host !== username) {
      return res.status(403).json({ error: "Only the host can delete this result" });
    }

    const pointsSnap = await db.collection("auctionPlayerPoints")
      .where("auctionResultId", "==", auctionResultId)
      .get();
    const performanceSnap = await db.collection("auctionPerformanceSubmissions")
      .where("auctionResultId", "==", auctionResultId)
      .get();

    const batch = db.batch();
    batch.delete(resultRef);
    pointsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    performanceSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    return res.status(204).send();
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to delete result", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/results/:auctionResultId/transfer-window", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    if (!auctionResultId) {
      return res.status(400).json({ error: "auctionResultId is required" });
    }

    const username = String(req.user?.username || "").trim();
    const { db } = getFirebase();
    const resultRef = db.collection("auctionResults").doc(auctionResultId);
    const created = await db.runTransaction(async transaction => {
    const resultSnap = await transaction.get(resultRef);
    if (!resultSnap.exists) throw Object.assign(new Error("Result not found"), { status: 404 });

    const result = normalizeAuctionResultDocument(resultSnap.data());
    if (!username || result.host !== username) {
      throw Object.assign(new Error("Only the host can open a transfer window"), { status: 403 });
    }
    if (!isFirstRoundComplete(result)) {
      throw Object.assign(new Error("Complete every first-round fixture before opening the transfer window"), { status: 409 });
    }

    const existingTransferId = String(result.transferWindow?.activeSessionId || "");
    if (existingTransferId) {
      const existingSessionSnap = await transaction.get(db.collection("sessions").doc(existingTransferId));
      if (existingSessionSnap.exists) {
        const existingSession = existingSessionSnap.data();
        if (!["complete", "cancelled"].includes(existingSession.status)) return { session: existingSession, status: 200 };
      }
    }

    const transferSession = createTransferSessionFromResult(result);
    const roomRef = transferSession.roomCode ? db.collection("rooms").doc(transferSession.roomCode.toUpperCase()) : null;
    if (roomRef && (await transaction.get(roomRef)).exists) throw Object.assign(new Error("Room code is already in use by a live auction"), { status: 409 });
    transferSession.revision = 0;
    transaction.set(db.collection("sessions").doc(String(transferSession.id)), transferSession);
    if (transferSession.roomCode) {
      transaction.set(db.collection("rooms").doc(String(transferSession.roomCode).toUpperCase()), {
        sessionId: String(transferSession.id),
        roomCode: String(transferSession.roomCode).toUpperCase(),
        updatedAt: Date.now(),
      }, { merge: true });
    }
    transaction.set(resultRef, {
      transferWindow: {
        ...(result.transferWindow || {}),
        activeSessionId: String(transferSession.id),
        openedAt: Date.now(),
        phase: "selling",
        listingDeadlineAt: normalizeDeadlineAt(result.transferWindow?.listingDeadlineAt),
        listingDeadlineSetAt: normalizeDeadlineAt(result.transferWindow?.listingDeadlineSetAt),
      },
      updatedAt: Date.now(),
    }, { merge: true });
    return { session: transferSession, status: 201 };
    });
    return res.status(created.status).json({ session: sanitizeSessionForViewer(created.session, username) });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to open transfer window", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.put("/results/:auctionResultId/transfer-window", requireUserAuth, async (req, res) => {
  try {
    const { auctionResultId } = req.params;
    if (!auctionResultId) {
      return res.status(400).json({ error: "auctionResultId is required" });
    }

    const username = String(req.user?.username || "").trim();
    const { db } = getFirebase();
    const resultRef = db.collection("auctionResults").doc(auctionResultId);
    const updated = await db.runTransaction(async transaction => {
    const resultSnap = await transaction.get(resultRef);
    if (!resultSnap.exists) throw Object.assign(new Error("Result not found"), { status: 404 });

    const result = normalizeAuctionResultDocument(resultSnap.data());
    if (!username || result.host !== username) {
      throw Object.assign(new Error("Only the host can update the transfer window"), { status: 403 });
    }

    const listingDeadlineAt = normalizeDeadlineAt(req.body?.listingDeadlineAt);
    const now = Date.now();
    const nextTransferWindow = {
      ...(result.transferWindow || {}),
      listingDeadlineAt,
      listingDeadlineSetAt: listingDeadlineAt ? now : null,
    };

    let live = null;
    const activeSessionId = String(result.transferWindow?.activeSessionId || "");
    if (activeSessionId) {
      const sessionRef = db.collection("sessions").doc(activeSessionId);
      const sessionSnap = await transaction.get(sessionRef);
      if (sessionSnap.exists) {
        const session = normalizeSessionDocument(sessionSnap.data());
        live = { ...session,
          transferWindow: {
            ...(session.transferWindow || {}),
            listingDeadlineAt,
            listingDeadlineSetAt: listingDeadlineAt ? now : null,
          },
          updatedAt: now,
          revision: Number(session.revision || 0) + 1,
        };
        transaction.update(sessionRef, { transferWindow: live.transferWindow, updatedAt: now, revision: live.revision });
      }
    }

    transaction.set(resultRef, { transferWindow: nextTransferWindow, updatedAt: now }, { merge: true });
    return { result: { ...result, transferWindow: nextTransferWindow, updatedAt: now }, live };
    });
    if (updated.live) emitSessionUpdate(updated.live);
    return res.json({ result: updated.result });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to update transfer deadline", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

// Seed a fully-completed dummy auction result for testing the Results/Groups UI.
// The caller supplies the entire resultPayload; host is forced to the authenticated user.
router.post("/seed/auction-result", requireUserAuth, async (req, res) => {
  try {
    const username = String(req.user?.username || "").trim();
    const payload  = req.body?.result;
    if (!payload || !payload.sessionId) {
      return res.status(400).json({ error: "result.sessionId is required" });
    }

    const { db } = getFirebase();
    const doc = {
      ...payload,
      host: username,          // always owned by the caller
      status: "complete",
      seeded: true,
      completedAt: Date.now(),
      createdAt:   Date.now(),
    };

    await db.collection("auctionResults").doc(String(payload.sessionId)).set(doc, { merge: true });
    return res.status(201).json({ id: payload.sessionId });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to seed auction result", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

export default router;
