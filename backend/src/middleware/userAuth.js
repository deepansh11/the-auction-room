import jwt from "jsonwebtoken";
import { config } from "../config.js";

export async function requireUserAuth(req, res, next) {
  try {
    const raw = req.header("authorization") || "";
    const [scheme, token] = raw.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    if (!config.authJwtSecret) {
      return res.status(503).json({ error: "AUTH_JWT_SECRET is not configured" });
    }

    const decoded = jwt.verify(token, config.authJwtSecret);
    req.user = decoded;
    return next();
  } catch (err) {
    const status = err?.status || 401;
    return res.status(status).json({ error: status === 503 ? "Auth is not configured" : "Unauthorized" });
  }
}
