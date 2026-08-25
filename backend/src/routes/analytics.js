import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../middleware/userAuth.js";
import { normalizeFirebaseError } from "../services/firebaseErrors.js";
import { getFirebase } from "../services/firebaseService.js";

const router = Router();

// Keep event payloads small and predictable — this endpoint is fire-and-forget from the
// frontend, so it must never become a way to smuggle large arbitrary blobs into Firestore.
const eventSchema = z.object({
  event: z.string().min(1).max(64),
  properties: z.record(z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
  clientTimestamp: z.number().optional(),
  sessionId: z.string().max(120).optional(), // browser-tab analytics session, not a game session
});

router.post("/analytics/event", requireUserAuth, async (req, res) => {
  try {
    const { event, properties, clientTimestamp, sessionId } = eventSchema.parse(req.body || {});
    const { db } = getFirebase();

    await db.collection("analyticsEvents").add({
      event,
      properties: properties || {},
      username: req.user?.username || null,
      uid: req.user?.uid || null,
      sessionId: sessionId || null,
      clientTimestamp: Number.isFinite(clientTimestamp) ? clientTimestamp : null,
      serverTimestamp: Date.now(),
      userAgent: String(req.header("user-agent") || "").slice(0, 300),
    });

    return res.status(204).send();
  } catch (err) {
    // Analytics must never surface hard failures to the UI — log and swallow.
    const normalized = normalizeFirebaseError(err, "Failed to record event", 400);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(25),
});

// Frontend batches events client-side and flushes periodically, so most traffic goes through
// here instead of firing one HTTP request per tracked action.
router.post("/analytics/events", requireUserAuth, async (req, res) => {
  try {
    const { events } = batchSchema.parse(req.body || {});
    const { db } = getFirebase();
    const batch = db.batch();
    const serverTimestamp = Date.now();
    const userAgent = String(req.header("user-agent") || "").slice(0, 300);

    events.forEach(({ event, properties, clientTimestamp, sessionId }) => {
      const docRef = db.collection("analyticsEvents").doc();
      batch.set(docRef, {
        event,
        properties: properties || {},
        username: req.user?.username || null,
        uid: req.user?.uid || null,
        sessionId: sessionId || null,
        clientTimestamp: Number.isFinite(clientTimestamp) ? clientTimestamp : null,
        serverTimestamp,
        userAgent,
      });
    });

    await batch.commit();
    return res.status(204).send();
  } catch (err) {
    const normalized = normalizeFirebaseError(err, "Failed to record events", 400);
    return res.status(normalized.status).json({ error: normalized.error });
  }
});

export default router;
