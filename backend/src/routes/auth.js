import { Router } from "express";
import crypto from "crypto";
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

const registerSchema = authSchema.extend({
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
});

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
    const { username, password, email } = registerSchema.parse(req.body || {});
    const { db } = getFirebase();
    const normalizedUsername = username.trim();
    const usernameLower = normalizedUsername.toLowerCase();
    const userId = `user:${usernameLower}`;
    const existing = await db.collection("users").doc(userId).get();

    if (existing.exists) {
      return res.status(409).json({ error: "Username taken" });
    }

    const normalizedEmail = String(email || "").trim();
    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      uid: userId,
      username: normalizedUsername,
      usernameLower,
      email: normalizedEmail || null,
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
        role: user.role,
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
        role: userData?.role,
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

const forgotPasswordSchema = z.object({
  username: z.string().min(2).max(40),
});

const resetPasswordSchema = z.object({
  username: z.string().min(2).max(40),
  token: z.string().min(10),
  newPassword: z.string().min(6).max(100),
});

// Self-hosted / no email-service flow: instead of emailing a reset link, we hand the reset
// token straight back in the response so the user can carry it into the "reset password" form.
router.post("/auth/forgot-password", async (req, res) => {
  try {
    const { username } = forgotPasswordSchema.parse(req.body || {});
    const { db } = getFirebase();
    const usernameLower = username.trim().toLowerCase();
    const userId = `user:${usernameLower}`;
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "No account found with that username" });
    }

    const resetToken = crypto.randomBytes(24).toString("hex");
    const resetTokenExpiresAt = Date.now() + RESET_TOKEN_TTL_MS;

    await db.collection("users").doc(userId).set({ resetToken, resetTokenExpiresAt }, { merge: true });

    return res.json({
      username: userDoc.data()?.username || username.trim(),
      resetToken,
      expiresAt: resetTokenExpiresAt,
    });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to start password reset", 400);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/auth/reset-password", async (req, res) => {
  try {
    const { username, token, newPassword } = resetPasswordSchema.parse(req.body || {});
    const { db } = getFirebase();
    const usernameLower = username.trim().toLowerCase();
    const userId = `user:${usernameLower}`;
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const userData = userDoc.data();
    const tokenValid = userData?.resetToken && userData.resetToken === token;
    const tokenFresh = Number(userData?.resetTokenExpiresAt || 0) > Date.now();

    if (!tokenValid || !tokenFresh) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const updatedUser = {
      ...userData,
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
    };

    await db.collection("users").doc(userId).set(
      { passwordHash, resetToken: null, resetTokenExpiresAt: null },
      { merge: true }
    );

    const authToken = issueToken(updatedUser);

    return res.json({
      user: {
        uid: updatedUser.uid,
        username: updatedUser?.username || username.trim(),
        wishlists: updatedUser?.wishlists || {},
        role: updatedUser?.role,
      },
      token: authToken,
    });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to reset password", 400);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

export default router;
