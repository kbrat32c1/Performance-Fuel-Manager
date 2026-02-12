import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Barcode Lookup API — FatSecret Premier (primary) with Open Food Facts fallback.
 *
 * FatSecret: better US brand coverage + richer nutrition data.
 * Open Food Facts: community-sourced fallback for items FatSecret doesn't have.
 */

const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID || "";
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET || "";

// ─── FatSecret OAuth2 Token Cache (shared pattern with search endpoint) ───
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

  try {
    const code = req.query.code as string;
    if (!code || code.trim().length < 4) {
      return res.status(400).json({ found: false, error: "Invalid barcode" });
    }

    const barcode = code.trim();

    // Try FatSecret barcode lookup first
    const token = await getFatSecretToken();
    if (token) {
      try {
        const result = await lookupFatSecretBarcode(barcode, token);
        if (result) {
          return res.json({ found: true, food: result });
        }
      } catch (err: any) {
        console.error(`FatSecret barcode error: ${err.message}`);
        // Fall through to OFF
      }
    }

    // Fallback: Open Food Facts
    return await lookupOFF(barcode, res);
  } catch (err: any) {
    console.error(`Barcode lookup error: ${err.message}`);
    return res.status(500).json({ found: false, error: "Barcode lookup failed" });
  }
}

// ─── FatSecret Barcode Lookup ───

async function lookupFatSecretBarcode(barcode: string, token: string) {
  // Step 1: Find food_id by barcode
  const barcodeParams = new URLSearchParams({
    barcode,
    format: "json",
  });

  const barcodeResponse = await fetch(
    `https://platform.fatsecret.com/rest/food/find-id-for-barcode/v1?${barcodeParams}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!barcodeResponse.ok) return null;

  const barcodeData = await barcodeResponse.json();
  const foodId = barcodeData?.food_id?.value || barcodeData?.food_id;
  if (!foodId) return null;

  // Step 2: Get full food details
  const foodParams = new URLSearchParams({
    food_id: String(foodId),
    format: "json",
    include_food_attributes: "true",
  });

  const foodResponse = await fetch(
    `https://platform.fatsecret.com/rest/food/v4?${foodParams}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!foodResponse.ok) return null;

  const foodData = await foodResponse.json();
  const food = foodData?.food;
  if (!food) return null;

  // Get servings
  const servingsData = food.servings?.serving;
  const servings = Array.isArray(servingsData) ? servingsData : servingsData ? [servingsData] : [];
  const defaultServing = servings.find((s: any) => s.is_default === "1") || servings[0];
  if (!defaultServing) return null;

  const calories = round(parseFloat(defaultServing.calories) || 0);
  const protein = round(parseFloat(defaultServing.protein) || 0);
  const carbs = round(parseFloat(defaultServing.carbohydrate) || 0);
  const fat = round(parseFloat(defaultServing.fat) || 0);
  const fiber = round(parseFloat(defaultServing.fiber) || 0);
  const sugar = round(parseFloat(defaultServing.sugar) || 0);
  const sodium = round(parseFloat(defaultServing.sodium) || 0);

  return {
    barcode,
    name: food.food_name || "",
    brand: food.brand_name || "",
    calories,
    protein,
    carbs,
    fat,
    fiber,
    sugar,
    sodium,
    servingSize: parseFloat(defaultServing.metric_serving_amount) || null,
    servingSizeLabel: defaultServing.serving_description || "",
    imageUrl: null,
    dataQuality: (calories > 0 && (protein > 0 || carbs > 0)) ? "complete" as const : "partial" as const,
  };
}

// ─── Open Food Facts Fallback ───

async function lookupOFF(barcode: string, res: VercelResponse) {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,brands,nutriments,serving_quantity,serving_size,image_small_url,completeness`,
    {
      headers: {
        "User-Agent": "PerformanceFuelManager/1.0 (contact@pfm.app)",
      },
    }
  );

  if (!response.ok) {
    console.error(`OFF barcode API error: ${response.status}`);
    return res.status(502).json({ found: false, error: "Open Food Facts API error" });
  }

  const data = await response.json();

  if (data.status !== 1 || !data.product?.product_name) {
    return res.json({ found: false });
  }

  const p = data.product;
  const n = p.nutriments || {};
  const calories = round(n["energy-kcal_100g"] || 0);
  const protein = round(n.proteins_100g || 0);
  const carbs = round(n.carbohydrates_100g || 0);
  const fat = round(n.fat_100g || 0);
  const fiber = round(n.fiber_100g || 0);
  const sugar = round(n.sugars_100g || 0);
  const sodium = round((n.sodium_100g || 0) * 1000);

  let dataQuality: "complete" | "partial" | "poor" = "poor";
  if (calories > 0 && protein >= 0 && carbs >= 0) {
    dataQuality = (protein > 0 || carbs > 0) ? "complete" : "partial";
  } else if (calories > 0) {
    dataQuality = "partial";
  }

  return res.json({
    found: true,
    food: {
      barcode: p.code || barcode,
      name: p.product_name || "",
      brand: p.brands || "",
      calories,
      protein,
      carbs,
      fat,
      fiber,
      sugar,
      sodium,
      servingSize: p.serving_quantity || null,
      servingSizeLabel: p.serving_size || "",
      imageUrl: p.image_small_url || null,
      dataQuality,
    },
  });
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
