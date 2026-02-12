import type { VercelRequest, VercelResponse } from "@vercel/node";

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

For EACH food item, estimate:
- name: common food name (e.g., "Grilled Chicken Breast", "Brown Rice")
- estimatedGrams: estimated weight in grams for the visible portion
- calories: estimated calories for that portion
- protein: grams of protein
- carbs: grams of carbs
- fat: grams of fat
- fiber: grams of fiber
- sparCategory: one of "protein", "carb", "veg", "fruit", or "fat" — based on which macronutrient dominates
- sliceCount: SPAR portion count (1 palm of protein = 1, 1 fist of carbs = 1, 1 fist of veg = 1, 1 piece of fruit = 1, 1 thumb of fat = 1). Use 0.5 for small portions, 2 for large.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "foods": [
    {
      "name": "Grilled Chicken Breast",
      "estimatedGrams": 170,
      "calories": 284,
      "protein": 53,
      "carbs": 0,
      "fat": 6,
      "fiber": 0,
      "sparCategory": "protein",
      "sliceCount": 2
    }
  ],
  "confidence": "high"
}

confidence should be "high", "medium", or "low" based on how clearly you can identify the foods.
If you cannot identify any food in the image, return: {"foods": [], "confidence": "low", "error": "No food detected in image"}`,
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
    const rawText = aiData.content?.[0]?.text || "";

    // Parse JSON from response (handle potential markdown wrapping)
    let parsed;
    try {
      const jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", rawText.substring(0, 200));
      return res.status(502).json({ error: "AI returned invalid response format" });
    }

    // Validate structure
    if (!parsed.foods || !Array.isArray(parsed.foods)) {
      return res.status(502).json({ error: "AI returned unexpected structure" });
    }

    // Sanitize and validate each food item
    const foods = parsed.foods.map((f: any) => ({
      name: String(f.name || "Unknown food").slice(0, 100),
      estimatedGrams: Math.max(0, Math.round(Number(f.estimatedGrams) || 0)),
      calories: Math.max(0, Math.round(Number(f.calories) || 0)),
      protein: Math.max(0, Math.round(Number(f.protein) || 0)),
      carbs: Math.max(0, Math.round(Number(f.carbs) || 0)),
      fat: Math.max(0, Math.round(Number(f.fat) || 0)),
      fiber: Math.max(0, Math.round(Number(f.fiber) || 0)),
      sparCategory: ["protein", "carb", "veg", "fruit", "fat"].includes(f.sparCategory)
        ? f.sparCategory
        : "carb",
      sliceCount: Math.max(0.5, Math.min(10, Number(f.sliceCount) || 1)),
    }));

    return res.json({
      foods,
      confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
    });
  } catch (err: any) {
    console.error(`Photo analysis error: ${err.message}`);
    return res.status(500).json({ error: "Photo analysis failed" });
  }
}
