import type { VercelRequest, VercelResponse } from "@vercel/node";

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
        system: "You are a food nutrition parser. You MUST respond with ONLY a raw JSON object. No markdown, no explanation, no code fences, no backticks, no text before or after the JSON. Your entire response must be valid JSON starting with { and ending with }.",
        messages: [{
          role: "user",
          content: `Parse this food description into individual food items with estimated nutrition.\n\nFood description: "${transcript.trim()}"\n\nFor EACH food item, estimate:\n- name: common food name\n- estimatedGrams: weight in grams\n- calories, protein, carbs, fat, fiber\n- sparCategory: "protein", "carb", "veg", "fruit", or "fat" (pick the dominant macro)\n- sliceCount: SPAR portions (1 palm protein≈25g protein, 1 fist carb≈26g carbs, 1 fist veg, 1 piece fruit, 1 thumb fat≈14g fat)\n\nRespond ONLY with this JSON structure:\n{"foods": [{"name":"...","estimatedGrams":0,"calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sparCategory":"...","sliceCount":1}], "confidence":"high|medium|low"}`,
        }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`Anthropic API error for voice-parse: ${response.status} ${errorBody.slice(0, 300)}`);
      return res.status(502).json({ error: "AI service error" });
    }

    const aiData = await response.json();
    // Find the text content block (skip thinking blocks)
    const textBlock = aiData.content?.find((b: any) => b.type === "text");
    const rawText = textBlock?.text || "";

    if (!rawText) {
      console.error(`Voice parse: empty response from AI. Content blocks: ${JSON.stringify(aiData.content?.map((b: any) => b.type) || [])}`);
      return res.status(502).json({ error: "AI returned empty response" });
    }

    let parsed;
    try {
      // Strip markdown code blocks if present
      let jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      // If it still doesn't start with {, try to extract JSON object
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

    const foods = parsed.foods.map((f: any) => ({
      name: String(f.name || "Unknown food").slice(0, 100),
      estimatedGrams: Math.max(0, Math.round(Number(f.estimatedGrams) || 0)),
      calories: Math.max(0, Math.round(Number(f.calories) || 0)),
      protein: Math.max(0, Math.round(Number(f.protein) || 0)),
      carbs: Math.max(0, Math.round(Number(f.carbs) || 0)),
      fat: Math.max(0, Math.round(Number(f.fat) || 0)),
      fiber: Math.max(0, Math.round(Number(f.fiber) || 0)),
      sparCategory: ["protein", "carb", "veg", "fruit", "fat"].includes(f.sparCategory) ? f.sparCategory : "carb",
      sliceCount: Math.max(0.5, Math.min(10, Number(f.sliceCount) || 1)),
    }));

    return res.json({
      foods,
      confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
    });
  } catch (err: any) {
    console.error(`Voice parse error: ${err.message}`);
    return res.status(500).json({ error: "Voice food parsing failed" });
  }
}
