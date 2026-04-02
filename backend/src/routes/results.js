import { Router } from "express";
import { requireUserAuth } from "../middleware/userAuth.js";
import { normalizeFirebaseError } from "../services/firebaseErrors.js";
import { getFirebase } from "../services/firebaseService.js";

const router = Router();

router.get("/results", requireUserAuth, async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    if (!username) return res.status(400).json({ error: "username query param is required" });

    const { db } = getFirebase();
    const snap = await db.collection("auctionResults")
      .where("participantNames", "array-contains", username)
      .get();

    const results = snap.docs
      .map((doc) => doc.data())
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

    return res.json({ results });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to list results", 500);
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

export default router;
