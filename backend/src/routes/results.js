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

export default router;
