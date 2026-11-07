import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../_cors.js";
import { verifyUser } from "../_auth.js";
import { serviceClient } from "../_whoop.js";

/** Disconnect WHOOP: delete the stored tokens and every health row that came from WHOOP. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, "POST")) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const db = serviceClient();
  if (!db) return res.status(503).json({ error: "Server is missing its database settings." });
  const userId = await verifyUser(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "Sign in first." });
  const [a, b] = await Promise.all([
    db.from("whoop_connections").delete().eq("user_id", userId),
    db.from("health_data").delete().eq("user_id", userId).eq("source", "whoop"),
  ]);
  if (a.error || b.error) return res.status(500).json({ error: "Could not disconnect. Try again." });
  return res.status(200).json({ disconnected: true });
}
