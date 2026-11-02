import { verifyUserToken } from "../services/authToken.js";

export async function requireUserAuth(req, res, next) {
  try {
    const raw = req.header("authorization") || "";
    const [scheme, token] = raw.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const decoded = verifyUserToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    const status = err?.status || 401;
    return res.status(status).json({ error: status === 503 ? "Auth is not configured" : "Unauthorized" });
  }
}
