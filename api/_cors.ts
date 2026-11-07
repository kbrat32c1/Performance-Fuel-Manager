import type { VercelRequest, VercelResponse } from "@vercel/node";

/** The iPhone app (Capacitor) loads from these origins; the web app is same-origin and needs no CORS. */
const NATIVE_APP_ORIGINS = new Set(["capacitor://localhost", "ionic://localhost"]);

/**
 * Lets the native app call this function. Returns true when the request was a CORS
 * preflight and has been answered, so the handler should stop.
 */
export function applyCors(req: VercelRequest, res: VercelResponse, methods: string): boolean {
  const origin = req.headers.origin;
  if (origin && NATIVE_APP_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", `${methods}, OPTIONS`);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
