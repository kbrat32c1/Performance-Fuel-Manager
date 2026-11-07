import type { VercelRequest, VercelResponse } from "@vercel/node";
import { exchangeCode, newNonce, PENDING_MAX_AGE_MS, returnUrl, serviceClient, verifyState, whoopConfig, whoopGet } from "../_whoop.js";

/**
 * WHOOP sends the athlete back here after they approve (or decline). Nothing is attached to a
 * SPAR account yet: the tokens wait in whoop_pending until the signed-in app that started the
 * connection claims them (api/whoop/complete).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cfg = whoopConfig();
  const db = serviceClient();
  const state = cfg ? verifyState(String(req.query.state ?? ""), cfg.clientSecret) : null;
  const platform = state?.platform ?? "web";
  const fail = () => res.redirect(302, returnUrl(platform, "error"));
  if (!cfg || !db || !state || typeof req.query.code !== "string" || req.query.error) return fail();

  try {
    const tokens = await exchangeCode(cfg, req.query.code);
    let whoopUserId: string | null = null;
    try {
      const profile = await whoopGet<{ user_id?: number | string }>("/v2/user/profile/basic", tokens.access_token);
      whoopUserId = profile.user_id != null ? String(profile.user_id) : null;
    } catch { /* profile is optional */ }

    const nonce = newNonce();
    await db.from("whoop_pending").delete().lt("created_at", new Date(Date.now() - PENDING_MAX_AGE_MS).toISOString());
    const { error } = await db.from("whoop_pending").insert({
      nonce,
      user_id: state.userId,
      whoop_user_id: whoopUserId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
    });
    if (error) return fail();
    return res.redirect(302, returnUrl(platform, "finish", nonce));
  } catch {
    return fail();
  }
}
