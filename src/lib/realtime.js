import { io } from "socket.io-client";

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta?.env?.VITE_API_BASE_URL)
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
    : "";

let sharedSocket = null;

function getSocket() {
  if (!sharedSocket) {
    sharedSocket = io(API_BASE_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      // Start at 2 s, double each attempt, cap at 60 s.
      // This prevents a reconnect storm if the server is down or overloaded.
      reconnectionDelay: 2000,
      reconnectionDelayMax: 60000,
      randomizationFactor: 0.4,
    });
  }
  return sharedSocket;
}

export function subscribeToSessionStream(sessionId, handlers = {}, username = "") {
  const id = String(sessionId || "").trim();
  if (!id) return () => {};

  const socket = getSocket();
  const onUpdate = handlers.onUpdate;
  const onClosed = handlers.onClosed;
  const onReconnect = handlers.onReconnect;

  const join = () => {
    socket.emit("session:join", { sessionId: id, username });
  };

  const handleConnect = () => {
    join();
    onReconnect?.();
  };

  const handleUpdate = (payload) => {
    const next = payload?.session;
    if (!next || String(next.id || "") !== id) return;
    onUpdate?.(next);
  };

  const handleClosed = (payload) => {
    const next = payload?.session;
    if (!next || String(next.id || "") !== id) return;
    onClosed?.(next, payload?.reason || "complete");
  };

  socket.on("connect", handleConnect);
  socket.on("session:update", handleUpdate);
  socket.on("session:closed", handleClosed);

  if (socket.connected) {
    join();
  }

  return () => {
    socket.emit("session:leave", { sessionId: id, username });
    socket.off("connect", handleConnect);
    socket.off("session:update", handleUpdate);
    socket.off("session:closed", handleClosed);
  };
}
