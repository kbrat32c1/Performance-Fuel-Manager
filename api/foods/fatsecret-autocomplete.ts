import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * FatSecret Autocomplete API — returns clean search suggestions as the user types.
 * E.g. "coff" → ["coffee", "coffee creamer", "coffee cake", "coffee mate"]
 */

const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID || "";
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET || "";

// ─── Shared OAuth2 Token Cache ───
let fsTokenCache: { token: string; expiresAt: number } | null = null;

async function getFatSecretToken(): Promise<string | null> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) return null;

  if (fsTokenCache && Date.now() < fsTokenCache.expiresAt - 300000) {
    return fsTokenCache.token;
  }

  try {
    const response = await fetch("https://oauth.fatsecret.com/connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: FATSECRET_CLIENT_ID,
        client_secret: FATSECRET_CLIENT_SECRET,
        scope: "premier",
      }).toString(),
    });

    if (!response.ok) return null;

    const data = await response.json();
    fsTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 86400) * 1000,
    };
    return fsTokenCache.token;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const query = req.query.q as string;
  if (!query || query.trim().length < 2) {
    return res.json({ suggestions: [] });
  }

  try {
    const token = await getFatSecretToken();
    if (!token) {
      console.error('FatSecret autocomplete: token is null');
      return res.json({ suggestions: [] });
    }

    const params = new URLSearchParams({
      expression: query.trim(),
      format: "json",
      max_results: "8",
    });

    const url = `https://platform.fatsecret.com/rest/food/autocomplete/v2?${params}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`FatSecret autocomplete error: ${response.status} ${errText}`);
      return res.json({ suggestions: [] });
    }

    const data = await response.json();
    console.log(`FatSecret autocomplete raw response:`, JSON.stringify(data).substring(0, 500));
    const suggestions = data?.suggestions?.suggestion || [];
    // API returns either a string[] or a single string
    const list = Array.isArray(suggestions) ? suggestions : [suggestions];

    return res.json({ suggestions: list });
  } catch (err: any) {
    console.error(`FatSecret autocomplete exception: ${err.message}`);
    return res.json({ suggestions: [] });
  }
}
