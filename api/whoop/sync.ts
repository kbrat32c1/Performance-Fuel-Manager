import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../_cors.js";
import { allowRequest, verifyUser } from "../_auth.js";
import { serviceClient, syncWhoop, whoopConfig } from "../_whoop.js";

/** Pull the athlete's last week of WHOOP data into health_data. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, "POST")) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const cfg = whoopConfig();
  const db = serviceClient();
  if (!cfg || !db) return res.status(503).json({ error: "WHOOP isn't set up on the server yet." });
  const userId = await verifyUser(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "Sign in to sync WHOOP." });
  if (!allowRequest(`whoop-sync:${userId}`, 6, 10 * 60_000)) return res.status(429).json({ error: "Synced recently. Try again in a few minutes." });
  try {
    const days = await syncWhoop(db, cfg, userId, 7);
    return res.status(200).json({ days });
  } catch (e) {
    const message = e instanceof Error && /not connected/.test(e.message) ? "WHOOP is not connected." : "WHOOP sync failed. Try again later.";
    return res.status(message.startsWith("WHOOP is not") ? 404 : 502).json({ error: message });
  }
}
