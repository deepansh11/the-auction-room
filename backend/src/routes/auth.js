import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { normalizeFirebaseError } from "../services/firebaseErrors.js";
import { getFirebase } from "../services/firebaseService.js";

const router = Router();

const authSchema = z.object({
  username: z.string().min(2).max(40),
  password: z.string().min(6).max(100),
});

function issueToken(user) {
  if (!config.authJwtSecret) {
    throw Object.assign(new Error("AUTH_JWT_SECRET is not configured"), { status: 503 });
  }

  return jwt.sign(
    {
      uid: user.uid,
      username: user.username,
    },
    config.authJwtSecret,
    { expiresIn: "7d" }
  );
}

router.post("/auth/register", async (req, res) => {
  try {
    const { username, password } = authSchema.parse(req.body || {});
    const { db } = getFirebase();
    const normalizedUsername = username.trim();
    const usernameLower = normalizedUsername.toLowerCase();
    const userId = `user:${usernameLower}`;
    const existing = await db.collection("users").doc(userId).get();

    if (existing.exists) {
      return res.status(409).json({ error: "Username taken" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      uid: userId,
      username: normalizedUsername,
      usernameLower,
      passwordHash,
      createdAt: Date.now(),
      wishlists: {},
    };

    await db.collection("users").doc(userId).set(user, { merge: true });
    const token = issueToken(user);

    return res.status(201).json({
      user: {
        uid: user.uid,
        username: user.username,
        wishlists: {},
      },
      token,
    });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Registration failed", 400);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = authSchema.parse(req.body || {});
    const { db } = getFirebase();
    const usernameLower = username.trim().toLowerCase();
    const userDoc = await db.collection("users").doc(`user:${usernameLower}`).get();

    if (!userDoc.exists) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const userData = userDoc.data();
    const passwordOk = await bcrypt.compare(password, userData.passwordHash || "");
    if (!passwordOk) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = issueToken(userData);

    return res.json({
      user: {
        uid: userData.uid,
        username: userData?.username || username.trim(),
        wishlists: userData?.wishlists || {},
      },
      token,
    });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Login failed", 401);
    return res.status(normalized.status).json({
      error: normalized.status === 401 ? "Invalid credentials" : normalized.error,
    });
  }
});

export default router;
