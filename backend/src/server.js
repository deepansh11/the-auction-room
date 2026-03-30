import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import roomRoutes from "./routes/rooms.js";
import userRoutes from "./routes/users.js";
import resultRoutes from "./routes/results.js";

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.corsOrigins.length === 0 || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS blocked"));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "x-api-key", "authorization"],
    credentials: false,
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(express.json({ limit: "256kb" }));

app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", roomRoutes);
app.use("/api", userRoutes);
app.use("/api", resultRoutes);

app.use((err, _req, res, _next) => {
  const status = err?.message === "CORS blocked" ? 403 : 500;
  res.status(status).json({ error: status === 403 ? "Origin not allowed" : "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`Backend running on http://localhost:${config.port}`);
});
