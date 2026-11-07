import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getFatSecretToken,
  searchFatSecret,
  pickBestServing,
  scoreMatchConfidence,
  autoSparCategory,
  type MatchedFood,
} from "./_fatsecret-utils.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// Rate limiting: track requests per IP (in-memory, resets on cold start)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxReqs = 5, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxReqs) return false;
  entry.count++;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: "AI not configured",
        message: "Add ANTHROPIC_API_KEY to environment variables.",
      });
    }

    // Rate limit check
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || "unknown";
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: "Too many requests. Try again in a minute." });
    }

    const { image } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Image data is required" });
    }

    // Validate base64 image format
    const match = image.match(/^data:image\/(jpeg|png|webp|gif);base64,/);
    if (!match) {
      return res.status(400).json({ error: "Invalid image format. Must be base64 JPEG, PNG, WebP, or GIF." });
    }

    // Check size (~4MB limit for base64)
    if (image.length > 5_500_000) {
      return res.status(413).json({ error: "Image too large. Max 4MB." });
    }

    const mediaType = `image/${match[1]}` as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    // ─── Step 1: AI extracts food names + quantities from photo ───
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        model: "claude-opus-5-5",
        // Thinking is always on and shares max_tokens with the answer
        max_tokens: 8000,
        output_config: { effort: "low" },
        fallbacks: "default",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: `Analyze this food photo. Identify each distinct food item visible.

For EACH food item, extract:
- name: the most common/searchable food name (e.g., "chicken breast", "brown rice", "banana"). Use plain names suitable for food database search.
- quantity: estimated quantity description (e.g., "1 large piece", "about 1 cup")
- estimatedGrams: estimated weight in grams for the visible portion

Also provide fallback nutrition estimates in case the food can't be found in our database:
- fallbackCalories, fallbackProtein, fallbackCarbs, fallbackFat, fallbackFiber

Respond ONLY with valid JSON (no markdown, no explanation):
{"foods": [{"name":"...","quantity":"...","estimatedGrams":0,"fallbackCalories":0,"fallbackProtein":0,"fallbackCarbs":0,"fallbackFat":0,"fallbackFiber":0}], "confidence":"high|medium|low"}

If you cannot identify any food in the image, return: {"foods": [], "confidence": "low"}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Anthropic Vision API error: ${response.status} ${errText}`);
      return res.status(502).json({ error: "AI vision service error" });
    }

    const aiData = await response.json();
    // A thinking block comes before the answer; read the text block
    const rawText = aiData.content?.find((b: any) => b.type === "text")?.text || "";

    let parsed;
    try {
      const jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", rawText.substring(0, 200));
      return res.status(502).json({ error: "AI returned invalid response format" });
    }

    if (!parsed.foods || !Array.isArray(parsed.foods)) {
      return res.status(502).json({ error: "AI returned unexpected structure" });
    }

    // ─── Step 2: Parallel FatSecret lookups for each food ───
    let token: string | null = null;
    try {
      token = await getFatSecretToken();
    } catch (err: any) {
      console.error(`FatSecret token error: ${err.message}`);
    }

    const matchedFoods: MatchedFood[] = await Promise.all(
      parsed.foods.map(async (food: any): Promise<MatchedFood> => {
        const name = String(food.name || "").trim();
        const quantity = String(food.quantity || "1 serving");
        const estimatedGrams = Math.max(0, Math.round(Number(food.estimatedGrams) || 0));

        // Build AI fallback
        const fbCal = Math.max(0, Math.round(Number(food.fallbackCalories) || 0));
        const fbPro = Math.max(0, Math.round(Number(food.fallbackProtein) || 0));
        const fbCarbs = Math.max(0, Math.round(Number(food.fallbackCarbs) || 0));
        const fbFat = Math.max(0, Math.round(Number(food.fallbackFat) || 0));
        const fbFiber = Math.max(0, Math.round(Number(food.fallbackFiber) || 0));
        const fbCategory = autoSparCategory(fbCal, fbPro, fbCarbs, fbFat, fbFiber) || 'carb';
        const isNegligible = fbCal < 10 && fbPro < 2 && fbCarbs < 2 && fbFat < 2;

        let fbSliceCount = 0;
        if (!isNegligible) {
          if (fbCategory === 'protein') fbSliceCount = fbPro >= 5 ? Math.max(1, Math.round(fbPro / 25)) : 0;
          else if (fbCategory === 'carb') fbSliceCount = fbCarbs >= 5 ? Math.max(1, Math.round(fbCarbs / 26)) : 0;
          else fbSliceCount = 1;
        }

        const aiFallback = {
          name: name || "Unknown food",
          estimatedGrams,
          calories: fbCal,
          protein: fbPro,
          carbs: fbCarbs,
          fat: fbFat,
          fiber: fbFiber,
          sparCategory: fbCategory,
          sliceCount: fbSliceCount,
        };

        if (!token || !name) {
          return {
            originalName: name || "Unknown food",
            quantity,
            estimatedGrams,
            fsMatch: null,
            selectedServing: null,
            servingQty: 1,
            alternatives: [],
            aiFallback,
            matchConfidence: 'none',
          };
        }

        try {
          const result = await searchFatSecret(name, token, { maxResults: 5 });

          if (result.foods.length === 0) {
            return {
              originalName: name,
              quantity,
              estimatedGrams,
              fsMatch: null,
              selectedServing: null,
              servingQty: 1,
              alternatives: [],
              aiFallback,
              matchConfidence: 'none',
            };
          }

          const bestMatch = result.foods[0];
          const { serving, qty } = pickBestServing(bestMatch.servings, estimatedGrams);
          const confidence = scoreMatchConfidence(name, bestMatch.name);

          return {
            originalName: name,
            quantity,
            estimatedGrams,
            fsMatch: bestMatch,
            selectedServing: serving,
            servingQty: qty,
            alternatives: result.foods.slice(1, 5),
            aiFallback: null,
            matchConfidence: confidence,
          };
        } catch (err) {
          console.error(`FatSecret search failed for "${name}":`, err);
          return {
            originalName: name,
            quantity,
            estimatedGrams,
            fsMatch: null,
            selectedServing: null,
            servingQty: 1,
            alternatives: [],
            aiFallback,
            matchConfidence: 'none',
          };
        }
      })
    );

    return res.json({
      foods: matchedFoods,
      confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
    });
  } catch (err: any) {
    console.error(`Photo analysis error: ${err.message}`);
    return res.status(500).json({ error: "Photo analysis failed" });
  }
}
