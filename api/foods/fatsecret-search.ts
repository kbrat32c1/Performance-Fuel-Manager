import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFatSecretToken, searchFatSecret } from "./_fatsecret-utils.js";

/**
 * Food Search API — FatSecret only.
 *
 * Uses FatSecret Platform API for food search with OAuth2 authentication.
 * Returns clean food names, multiple serving sizes, and nutrition data.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const query = req.query.q as string;
    if (!query || query.trim().length < 2) {
      return res.json({ foods: [], totalHits: 0 });
    }

    const token = await getFatSecretToken();
    const result = await searchFatSecret(query.trim(), token);
    return res.json(result);
  } catch (err: any) {
    console.error(`Food search error: ${err.message}`);
    return res.status(500).json({ error: err.message, foods: [] });
  }
}
