import { Router } from "express";
import { config } from "../config.js";
import { normalizeFirebaseError } from "../services/firebaseErrors.js";
import { getFirebase } from "../services/firebaseService.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "fc-bidding-room-backend" });
});

router.get("/health/firebase", async (_req, res) => {
  const diagnostics = {
    configured: {
      projectId: Boolean(config.firebaseProjectId),
      clientEmail: Boolean(config.firebaseClientEmail),
      privateKey: Boolean(config.firebasePrivateKey),
      webApiKey: Boolean(config.firebaseWebApiKey),
    },
    adminInitialized: false,
    firestoreReachable: false,
    details: "",
  };

  try {
    const { db } = getFirebase();
    diagnostics.adminInitialized = true;

    await db.collection("__health").doc("ping").get();
    diagnostics.firestoreReachable = true;
    diagnostics.details = "Firebase Admin + Firestore checks passed";

    return res.json({ ok: true, ...diagnostics });
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Firebase health check failed", 503);
    diagnostics.details = normalized.error;
    return res.status(normalized.status).json({ ok: false, ...diagnostics });
  }
});

export default router;
