export function normalizeFirebaseError(err, fallbackMessage = "Request failed", fallbackStatus = 500) {
  const rawMessage = String(err?.message || "");
  const isNotFound = err?.code === 5 || rawMessage.startsWith("5 NOT_FOUND");

  if (isNotFound) {
    return {
      status: 503,
      error: "Firestore database is not available for this Firebase project. Create a Firestore database in the Firebase console and verify this service account has access.",
    };
  }

  return {
    status: err?.status || fallbackStatus,
    error: err?.message || fallbackMessage,
  };
}