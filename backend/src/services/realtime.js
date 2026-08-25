import { Server } from "socket.io";
import { collectSessionRecipients, sanitizeSessionForViewer } from "./sessionView.js";

let io = null;

function socketAllowedOrigin(corsOrigins, origin) {
  if (!origin) return true;
  if (!Array.isArray(corsOrigins) || corsOrigins.length === 0) return true;
  return corsOrigins.includes(origin);
}

// Each connected client joins a room scoped to *their own identity* within a session
// (`session:<id>:<username>`), never a single shared room for everyone in the session. This
// lets every broadcast be individually filtered so one participant's socket frames never
// contain another participant's Mystery Card candidate or any unopened lot's players.
function personalRoomName(sessionId, username) {
  return `session:${sessionId}:${username}`;
}

export function initRealtime(httpServer, { corsOrigins = [] } = {}) {
  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (socketAllowedOrigin(corsOrigins, origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS blocked"));
      },
      methods: ["GET", "POST"],
      credentials: false,
    },
  });

  io.on("connection", (socket) => {
    socket.on("session:join", ({ sessionId, username }) => {
      const id = String(sessionId || "").trim();
      const name = String(username || "").trim();
      if (!id || !name) return;
      socket.join(personalRoomName(id, name));
    });

    socket.on("session:leave", ({ sessionId, username }) => {
      const id = String(sessionId || "").trim();
      const name = String(username || "").trim();
      if (!id || !name) return;
      socket.leave(personalRoomName(id, name));
    });
  });

  return io;
}

export function emitSessionUpdate(session) {
  const id = String(session?.id || "").trim();
  if (!io || !id) return;
  collectSessionRecipients(session).forEach((name) => {
    io.to(personalRoomName(id, name)).emit("session:update", {
      session: sanitizeSessionForViewer(session, name),
    });
  });
}

export function emitSessionClosed(session, reason = "complete") {
  const id = String(session?.id || "").trim();
  if (!io || !id) return;
  collectSessionRecipients(session).forEach((name) => {
    io.to(personalRoomName(id, name)).emit("session:closed", {
      session: sanitizeSessionForViewer(session, name),
      reason,
    });
  });
}
