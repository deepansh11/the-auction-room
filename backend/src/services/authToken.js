import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function verifyUserToken(token) {
  if (!config.authJwtSecret) {
    throw Object.assign(new Error("AUTH_JWT_SECRET is not configured"), { status: 503, code: "AUTH_UNAVAILABLE" });
  }
  try {
    const user = jwt.verify(String(token || ""), config.authJwtSecret);
    if (!user.uid || !user.username) throw new Error("Invalid identity");
    return user;
  } catch {
    throw Object.assign(new Error("Unauthorized"), { status: 401, code: "AUTH_EXPIRED" });
  }
}
