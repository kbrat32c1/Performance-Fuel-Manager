import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getFatSecretToken,
  searchFatSecret,
  pickBestServing,
  scoreMatchConfidence,
  autoSparCategory,
  type MatchedFood,
} from "./_fatsecret-utils";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// Rate limiting: track requests per IP (in-memory, resets on cold start)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxReqs = 10, windowMs = 60000): boolean {
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

    const { transcript } = req.body;
    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 3) {
      return res.status(400).json({ error: "A food description is required (at least 3 characters)" });
    }

    if (transcript.length > 1000) {
      return res.status(400).json({ error: "Description too long. Keep it under 1000 characters." });
    }

    // ─── Step 1: AI extracts food names + quantities (not nutrition) ───
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        temperature: 0,
        system: "You are a food identification parser. You MUST respond with ONLY a raw JSON object. No markdown, no explanation, no code fences, no backticks, no text before or after the JSON. Your entire response must be valid JSON starting with { and ending with }.",
        messages: [{
          role: "user",
          content: `Parse this food description into individual food items.\n\nFood description: "${transcript.trim()}"\n\nFor EACH food item, extract:\n- name: the most common/searchable food name (e.g., "chicken breast", "brown rice", "banana"). Use plain names that work as food database search queries. Keep important qualifiers like "whole wheat" or "skim" but drop cooking methods.\n- quantity: the spoken quantity (e.g., "2 large", "about a cup", "1 serving"). If none mentioned, use "1 serving".\n- estimatedGrams: your best estimate of total weight in grams for the stated quantity.\n\nAlso provide fallback nutrition estimates in case the food can't be found in our database:\n- fallbackCalories, fallbackProtein, fallbackCarbs, fallbackFat, fallbackFiber\n\nRespond ONLY with this JSON structure:\n{"foods": [{"name":"...","quantity":"...","estimatedGrams":0,"fallbackCalories":0,"fallbackProtein":0,"fallbackCarbs":0,"fallbackFat":0,"fallbackFiber":0}], "confidence":"high|medium|low"}`,
        }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`Anthropic API error for voice-parse: ${response.status} ${errorBody.slice(0, 300)}`);
      return res.status(502).json({ error: "AI service error" });
    }

    const aiData = await response.json();
    const textBlock = aiData.content?.find((b: any) => b.type === "text");
    const rawText = textBlock?.text || "";

    if (!rawText) {
      console.error(`Voice parse: empty response from AI. Content blocks: ${JSON.stringify(aiData.content?.map((b: any) => b.type) || [])}`);
      return res.status(502).json({ error: "AI returned empty response" });
    }

    let parsed;
    try {
      let jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      if (!jsonStr.startsWith("{")) {
        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
        }
      }
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error(`Voice parse JSON error. Raw text: ${rawText.slice(0, 500)}`);
      return res.status(502).json({ error: "AI returned invalid response" });
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
      // Fall through — will use AI fallbacks
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

        // Compute fallback slice count
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

        // Search FatSecret
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
            aiFallback: null, // Not needed — FatSecret matched
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
    console.error(`Voice parse error: ${err.message}`);
    return res.status(500).json({ error: "Voice food parsing failed" });
  }
}
