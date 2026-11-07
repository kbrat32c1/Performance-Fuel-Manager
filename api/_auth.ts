import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Paid AI endpoints only serve signed-in athletes. The app sends the Supabase session's
 * access token; Supabase says whose it is. No service key needed: /auth/v1/user only
 * answers for a valid token.
 */
export async function verifyUser(
  authorization: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!url || !anonKey || !token) return null;
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: unknown };
    return typeof user.id === "string" && user.id ? user.id : null;
  } catch {
    return null;
  }
}

// Per-athlete sliding window. Lives in one function instance, so it caps bursts rather than
// being a hard global quota.
const hits = new Map<string, number[]>();
export function allowRequest(key: string, max: number, windowMs: number, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/**
 * Sends 401 (or 429) and returns null when the request may not continue; otherwise the user id.
 * Limits: `perMinute` requests a minute and `perDay` a day for each athlete.
 */
export async function requireUserWithinLimit(
  req: VercelRequest,
  res: VercelResponse,
  endpoint: string,
  { perMinute, perDay }: { perMinute: number; perDay: number },
): Promise<string | null> {
  const userId = await verifyUser(req.headers.authorization as string | undefined);
  if (!userId) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  if (!allowRequest(`${endpoint}:min:${userId}`, perMinute, 60_000) ||
      !allowRequest(`${endpoint}:day:${userId}`, perDay, 86_400_000)) {
    res.status(429).json({ error: "Too many requests. Try again later." });
    return null;
  }
  return userId;
}
