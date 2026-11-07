import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../_cors.js";
import { verifyUser } from "../_auth.js";
import { authorizeUrl, signState, whoopConfig } from "../_whoop.js";

/** Signed-in athlete asks to connect WHOOP; we return WHOOP's approval page URL. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, "POST")) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const cfg = whoopConfig();
  if (!cfg) return res.status(503).json({ error: "WHOOP isn't set up on the server yet." });
  const userId = await verifyUser(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "Sign in to connect WHOOP." });
  const platform = req.body?.platform === "native" ? "native" : "web";
  return res.status(200).json({ url: authorizeUrl(cfg, signState(userId, platform, cfg.clientSecret)) });
}
