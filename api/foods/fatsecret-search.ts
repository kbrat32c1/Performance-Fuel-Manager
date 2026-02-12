import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Food Search API — FatSecret only.
 *
 * Uses FatSecret Platform API for food search with OAuth2 authentication.
 * Returns clean food names, multiple serving sizes, and nutrition data.
 */

const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID || "";
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET || "";

// ─── FatSecret OAuth2 Token Cache ───
let fsTokenCache: { token: string; expiresAt: number } | null = null;

async function getFatSecretToken(): Promise<string> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    throw new Error("FatSecret credentials not configured");
  }

  // Return cached token if still valid (with 5 min buffer)
  if (fsTokenCache && Date.now() < fsTokenCache.expiresAt - 300000) {
    return fsTokenCache.token;
  }

  // Try premier scope first, fall back to basic
  for (const scope of ["premier", "basic"]) {
    try {
      const response = await fetch("https://oauth.fatsecret.com/connect/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: FATSECRET_CLIENT_ID,
          client_secret: FATSECRET_CLIENT_SECRET,
          scope,
        }).toString(),
      });

      if (response.ok) {
        const data = await response.json();
        fsTokenCache = {
          token: data.access_token,
          expiresAt: Date.now() + (data.expires_in || 86400) * 1000,
        };
        return fsTokenCache.token;
      }

      const errText = await response.text();
      console.error(`FatSecret token error (scope=${scope}): ${response.status} ${errText}`);
    } catch (err: any) {
      console.error(`FatSecret token fetch failed (scope=${scope}): ${err.message}`);
    }
  }

  throw new Error("FatSecret authentication failed — check FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET");
}

/**
 * Auto-categorize a food for SPAR v2 slice tracking.
 */
function autoSparCategory(
  calories: number, protein: number, carbs: number, fat: number, fiber: number,
  foodCategory?: string
): string | null {
  if (calories <= 0 && protein <= 0) return null;
  const cat = (foodCategory || "").toLowerCase();

  if (cat.includes("fruit") && !cat.includes("baby")) return 'fruit';
  if (cat.includes("vegetable")) return 'veg';

  if (calories > 0) {
    const proteinPct = (protein * 4) / calories;
    const carbPct = (carbs * 4) / calories;
    const fatPct = (fat * 9) / calories;

    if (proteinPct > 0.40) return 'protein';
    if (fatPct > 0.60) return 'fat';
    if (carbPct > 0.40 && fiber > 3) return 'veg';
    if (carbPct > 0.40) return 'carb';
  }

  return null;
}

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

// ─── FatSecret Search ───

async function searchFatSecret(query: string, token: string) {
  const params = new URLSearchParams({
    search_expression: query,
    format: "json",
    max_results: "20",
    include_food_attributes: "true",
  });

  const response = await fetch(
    `https://platform.fatsecret.com/rest/foods/search/v1?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`FatSecret API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const results = data?.foods?.food;
  if (!results) return { foods: [], totalHits: 0 };

  const foodList = Array.isArray(results) ? results : [results];

  const foods = foodList.map((food: any) => {
    // FatSecret provides servings as an object or array
    const servingsData = food.servings?.serving;
    const servings = Array.isArray(servingsData) ? servingsData : servingsData ? [servingsData] : [];

    // Use first serving (default) for top-level nutrition
    const defaultServing = servings.find((s: any) => s.is_default === "1") || servings[0];
    if (!defaultServing) return null;

    const calories = parseFloat(defaultServing.calories) || 0;
    const protein = parseFloat(defaultServing.protein) || 0;
    const carbs = parseFloat(defaultServing.carbohydrate) || 0;
    const fat = parseFloat(defaultServing.fat) || 0;
    const fiber = parseFloat(defaultServing.fiber) || 0;
    const sugar = parseFloat(defaultServing.sugar) || 0;
    const sodium = parseFloat(defaultServing.sodium) || 0;

    if (calories <= 0 && protein <= 0 && carbs <= 0) return null;

    const sparCategory = autoSparCategory(calories, protein, carbs, fat, fiber, food.food_type);

    return {
      id: String(food.food_id),
      name: food.food_name || "",
      brand: food.brand_name || "",
      type: food.food_type || "Generic",
      calories: round(calories),
      protein: round(protein),
      carbs: round(carbs),
      fat: round(fat),
      fiber: round(fiber),
      sugar: round(sugar),
      sodium: round(sodium),
      servingSize: parseFloat(defaultServing.metric_serving_amount) || 100,
      servingSizeUnit: defaultServing.metric_serving_unit || "g",
      servingSizeLabel: defaultServing.serving_description || "per serving",
      sparCategory,
      servings: servings.map((s: any) => ({
        id: s.serving_id || s.serving_description,
        description: s.serving_description || "serving",
        calories: round(parseFloat(s.calories) || 0),
        protein: round(parseFloat(s.protein) || 0),
        carbs: round(parseFloat(s.carbohydrate) || 0),
        fat: round(parseFloat(s.fat) || 0),
        fiber: round(parseFloat(s.fiber) || 0),
        sugar: round(parseFloat(s.sugar) || 0),
        metricAmount: parseFloat(s.metric_serving_amount) || null,
        metricUnit: s.metric_serving_unit || "g",
        isDefault: s.is_default === "1",
      })),
    };
  }).filter(Boolean);

  return {
    foods,
    totalHits: parseInt(data?.foods?.total_results) || foods.length,
  };
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
