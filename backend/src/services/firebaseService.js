import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "../config.js";

let cached = null;

function decodePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

function assertFirebaseConfigured() {
  if (!config.firebaseProjectId || !config.firebaseClientEmail || !config.firebasePrivateKey) {
    throw Object.assign(new Error("Firebase is not configured"), { status: 503 });
  }
}

export function getFirebase() {
  if (cached) return cached;

  assertFirebaseConfigured();

  const app = getApps()[0] || initializeApp({
    credential: cert({
      projectId: config.firebaseProjectId,
      clientEmail: config.firebaseClientEmail,
      privateKey: decodePrivateKey(config.firebasePrivateKey),
    }),
  });

  cached = {
    app,
    db: getFirestore(app),
  };

  return cached;
}
