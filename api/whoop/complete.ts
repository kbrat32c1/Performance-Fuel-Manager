import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../_cors.js";
import { verifyUser } from "../_auth.js";
import { checkPendingClaim, serviceClient, syncWhoop, whoopConfig } from "../_whoop.js";

/** The signed-in app claims its WHOOP approval. Only the account that started it can. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, "POST")) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const cfg = whoopConfig();
  const db = serviceClient();
  if (!cfg || !db) return res.status(503).json({ error: "WHOOP isn't set up on the server yet." });
  const userId = await verifyUser(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "Sign in to finish connecting WHOOP." });
  const nonce = typeof req.body?.nonce === "string" ? req.body.nonce : "";
  if (!nonce) return res.status(400).json({ error: "Missing WHOOP approval." });

  // One use only: take it out first, whoever is asking.
  const { data: pending } = await db.from("whoop_pending").delete().eq("nonce", nonce).select("*").maybeSingle();
  const check = checkPendingClaim(pending, userId);
  if (check === "wrong-account") return res.status(403).json({ error: "This WHOOP approval was started from a different SPAR account." });
  if (check !== "ok") return res.status(410).json({ error: "That WHOOP approval expired. Connect again." });

  const { error } = await db.from("whoop_connections").upsert({
    user_id: userId,
    whoop_user_id: pending!.whoop_user_id,
    access_token: pending!.access_token,
    refresh_token: pending!.refresh_token,
    expires_at: pending!.expires_at,
    scope: pending!.scope,
    connected_at: new Date().toISOString(),
    last_error: null,
  }, { onConflict: "user_id" });
  if (error) return res.status(500).json({ error: "Could not save the WHOOP connection." });

  try { await syncWhoop(db, cfg, userId, 30); } catch { /* the next sync retries */ }
  return res.status(200).json({ connected: true });
}
