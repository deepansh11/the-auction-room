import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "../config.js";

let cached = null;

function decodePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

function assertFirebaseConfigured() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST) || !config.firebaseProjectId.startsWith("demo-")) {
      throw Object.assign(new Error("Emulator access requires a loopback host and demo- project ID"), { status: 503 });
    }
    return;
  }
  if (!config.firebaseProjectId || !config.firebaseClientEmail || !config.firebasePrivateKey) {
    throw Object.assign(new Error("Firebase is not configured"), { status: 503 });
  }
}

export function getFirebase() {
  if (cached) return cached;

  assertFirebaseConfigured();

  const app = getApps()[0] || initializeApp({
    ...(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: config.firebaseProjectId } : { credential: cert({
      projectId: config.firebaseProjectId,
      clientEmail: config.firebaseClientEmail,
      privateKey: decodePrivateKey(config.firebasePrivateKey),
    }) }),
  });

  cached = {
    app,
    db: getFirestore(app),
  };

  return cached;
}
