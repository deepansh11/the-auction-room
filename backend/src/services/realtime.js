import { Server } from "socket.io";

let io = null;

function socketAllowedOrigin(corsOrigins, origin) {
  if (!origin) return true;
  if (!Array.isArray(corsOrigins) || corsOrigins.length === 0) return true;
  return corsOrigins.includes(origin);
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
    socket.on("session:join", ({ sessionId }) => {
      const id = String(sessionId || "").trim();
      if (!id) return;
      socket.join(`session:${id}`);
    });

    socket.on("session:leave", ({ sessionId }) => {
      const id = String(sessionId || "").trim();
      if (!id) return;
      socket.leave(`session:${id}`);
    });
  });

  return io;
}

export function emitSessionUpdate(session) {
  const id = String(session?.id || "").trim();
  if (!io || !id) return;
  io.to(`session:${id}`).emit("session:update", { session });
}

export function emitSessionClosed(session, reason = "complete") {
  const id = String(session?.id || "").trim();
  if (!io || !id) return;
  io.to(`session:${id}`).emit("session:closed", { session, reason });
}
