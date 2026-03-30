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
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
  }
  return sharedSocket;
}

export function subscribeToSessionStream(sessionId, handlers = {}) {
  const id = String(sessionId || "").trim();
  if (!id) return () => {};

  const socket = getSocket();
  const onUpdate = handlers.onUpdate;
  const onClosed = handlers.onClosed;
  const onReconnect = handlers.onReconnect;

  const join = () => {
    socket.emit("session:join", { sessionId: id });
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
    socket.emit("session:leave", { sessionId: id });
    socket.off("connect", handleConnect);
    socket.off("session:update", handleUpdate);
    socket.off("session:closed", handleClosed);
  };
}
