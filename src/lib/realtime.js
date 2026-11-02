import { io } from "socket.io-client";
import { createSocketManager } from "./socketManager.js";
import { apiSubmitSessionAction } from "./api.js";
import { normalizeSessionRecord } from "../utils/sessionData.js";
import { browserMetric } from "./browserMetrics.js";

const url = String(import.meta.env?.VITE_API_BASE_URL || "").replace(/\/$/, "");
const manager = createSocketManager({
  connect: io, url, normalize: normalizeSessionRecord, httpAction: apiSubmitSessionAction, metric: browserMetric,
  onAuthExpired: () => window.dispatchEvent(new CustomEvent("fc:auth-expired")),
});

export function subscribeToSessionStream(id, handlers = {}, _username = "", token = "") {
  if (!id || !token) return () => {};
  return manager.subscribe(id, handlers, token);
}
export const submitSessionAction = (id, command, token, revision) => manager.submit(id, command, token, revision);
export const acceptSessionSnapshot = (id, session) => manager.acceptSnapshot(id, session);
export const synchronizeSession = id => manager.sync(id);
export const getPendingSessionAction = id => manager.getPending(id);
