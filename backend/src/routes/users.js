import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../middleware/userAuth.js";
import { normalizeFirebaseError } from "../services/firebaseErrors.js";
import { getFirebase } from "../services/firebaseService.js";

const router = Router();

const wishlistSchema = z.record(z.array(z.union([z.number(), z.string()])));

function serializeUser(user) {
  return {
    uid: user.uid,
    username: user.username,
    usernameLower: user.usernameLower,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    wishlists: user.wishlists || {},
  };
}

router.get("/users/me", requireUserAuth, async (req, res) => {
  try {
    const { db } = getFirebase();
    const userSnap = await db.collection("users").doc(req.user.uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ user: serializeUser(userSnap.data()) });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to load user", 500);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.put("/users/me/wishlists", requireUserAuth, async (req, res) => {
  try {
    const wishlists = wishlistSchema.parse(req.body?.wishlists || {});
    const { db } = getFirebase();
    await db.collection("users").doc(req.user.uid).set({
      wishlists,
      updatedAt: Date.now(),
    }, { merge: true });
    return res.status(204).send();
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to update wishlists", 400);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

export default router;
