/**
 * Shared FatSecret utilities for food search, auth, and matching.
 * Used by fatsecret-search.ts, voice-parse.ts, and photo-analysis.ts.
 *
 * File is prefixed with _ so Vercel does not expose it as its own endpoint.
 */

const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID || "";
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET || "";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FatSecretServing {
  id: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  metricAmount: number | null;
  metricUnit: string;
  isDefault: boolean;
}

export interface FatSecretFood {
  id: string;
  name: string;
  brand: string;
  type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize: number | null;
  servingSizeUnit: string;
  servingSizeLabel: string;
  sparCategory: string | null;
  servings: FatSecretServing[];
}

export interface MatchedFood {
  originalName: string;
  quantity: string;
  estimatedGrams: number;
  fsMatch: FatSecretFood | null;
  selectedServing: FatSecretServing | null;
  servingQty: number;
  alternatives: FatSecretFood[];
  aiFallback: {
    name: string;
    estimatedGrams: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sparCategory: string;
    sliceCount: number;
  } | null;
  matchConfidence: 'exact' | 'close' | 'fuzzy' | 'none';
}

// ─── OAuth2 Token Cache ──────────────────────────────────────────────────────

let fsTokenCache: { token: string; expiresAt: number } | null = null;

export async function getFatSecretToken(): Promise<string> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    throw new Error("FatSecret credentials not configured");
  }

  // Return cached token if still valid (with 5 min buffer)
  if (fsTokenCache && Date.now() < fsTokenCache.expiresAt - 300000) {
    return fsTokenCache.token;
  }

  const basicAuth = Buffer.from(`${FATSECRET_CLIENT_ID}:${FATSECRET_CLIENT_SECRET}`).toString("base64");

  for (const scope of ["premier", "basic"]) {
    try {
      const response = await fetch("https://oauth.fatsecret.com/connect/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
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

// ─── SPAR Auto-Categorization ────────────────────────────────────────────────

export function autoSparCategory(
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

// ─── FatSecret Search ────────────────────────────────────────────────────────

export async function searchFatSecret(
  query: string,
  token: string,
  opts?: { maxResults?: number }
): Promise<{ foods: FatSecretFood[]; totalHits: number }> {
  const response = await fetch(
    "https://platform.fatsecret.com/rest/server.api",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${token}`,
      },
      body: new URLSearchParams({
        method: "foods.search.v3",
        search_expression: query,
        format: "json",
        max_results: String(opts?.maxResults ?? 20),
        include_food_attributes: "true",
      }).toString(),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`FatSecret API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const results = data?.foods_search?.results?.food;
  if (!results) return { foods: [], totalHits: 0 };

  const foodList = Array.isArray(results) ? results : [results];

  const foods = foodList.map((food: any) => {
    const servingsData = food.servings?.serving;
    const servings = Array.isArray(servingsData) ? servingsData : servingsData ? [servingsData] : [];

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
    } as FatSecretFood;
  }).filter(Boolean) as FatSecretFood[];

  return {
    foods,
    totalHits: parseInt(data?.foods_search?.total_results) || foods.length,
  };
}

// ─── Serving Selection Helper ────────────────────────────────────────────────

/**
 * Auto-select the best serving size and quantity to match a target gram amount.
 * Prefers whole-number quantities and servings close to the target.
 */
export function pickBestServing(
  servings: FatSecretServing[],
  targetGrams: number
): { serving: FatSecretServing; qty: number } {
  const defaultServing = servings.find(s => s.isDefault) || servings[0];

  if (!targetGrams || targetGrams <= 0 || servings.length === 0) {
    return { serving: defaultServing, qty: 1 };
  }

  let bestServing = defaultServing;
  let bestQty = 1;
  let bestScore = Infinity;

  for (const s of servings) {
    if (!s.metricAmount || s.metricAmount <= 0) continue;
    const rawQty = targetGrams / s.metricAmount;
    // Round to nearest 0.5
    const roundedQty = Math.round(rawQty * 2) / 2;
    if (roundedQty <= 0) continue;

    // Score: prefer qty close to 1, penalize non-whole numbers
    const qtyPenalty = Math.abs(roundedQty - 1) * 0.3;
    const gramsDiff = Math.abs(roundedQty * s.metricAmount - targetGrams) / targetGrams;
    const score = gramsDiff + qtyPenalty;

    if (score < bestScore) {
      bestScore = score;
      bestServing = s;
      bestQty = roundedQty;
    }
  }

  return { serving: bestServing, qty: Math.max(0.5, bestQty) };
}

// ─── Match Confidence Scorer ─────────────────────────────────────────────────

export function scoreMatchConfidence(
  query: string,
  matchName: string
): 'exact' | 'close' | 'fuzzy' {
  const q = query.toLowerCase().trim();
  const m = matchName.toLowerCase().trim();

  if (m === q || m.includes(q) || q.includes(m)) return 'exact';

  // Check if all words from query appear in match
  const qWords = q.split(/\s+/);
  const matchesAll = qWords.every(w => m.includes(w));
  if (matchesAll) return 'close';

  return 'fuzzy';
}

// ─── Utility ─────────────────────────────────────────────────────────────────

export function round(v: number): number {
  return Math.round(v * 10) / 10;
}
