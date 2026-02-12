import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { createClient } from "@supabase/supabase-js";
import { storage } from "./storage";
import { log, aiCoachLimiter, foodSearchLimiter } from "./index";
import { buildEliteCoachPrompt, formatInsightsForPrompt } from "./coach-knowledge";

// ─── API Response Types ───────────────────────────────────────────────────────
interface USDAFoodNutrient {
  nutrientId: number;
  value: number;
}

interface USDAFood {
  fdcId: number;
  description: string;
  foodCategory?: string;
  foodNutrients?: USDAFoodNutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
  dataType?: string;
}

interface OFFProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nutriments?: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
    sodium_100g?: number;
  };
  serving_quantity?: number;
  serving_size?: string;
  image_small_url?: string;
  completeness?: number;
}

interface TransformedOFFFood {
  barcode: string;
  name: string;
  brand: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize: number | null;
  servingSizeLabel: string;
  imageUrl: string | null;
  dataQuality: "complete" | "partial" | "poor";
}

// USDA API key — DEMO_KEY allows 30 req/IP/hour, set USDA_API_KEY for 1000/hour
const USDA_API_KEY = process.env.USDA_API_KEY || "DEMO_KEY";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// Sanitize user input for AI prompts to prevent injection
function sanitizeForPrompt(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  const str = String(input);
  // Remove potential prompt injection patterns and limit length
  return str
    .replace(/```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/<[^>]*>/g, '')
    .slice(0, 500);
}

// Server-side Supabase client (uses service role key if available, falls back to anon)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ─── USDA Food Search ──────────────────────────────────────────────────────
  app.get("/api/foods/search", foodSearchLimiter, async (req: Request, res: Response) => {
    try {
      // Check if USDA API key is configured
      if (!USDA_API_KEY) {
        log("USDA API key not configured");
        return res.status(503).json({ error: "Food search service not configured", foods: [] });
      }

      const query = req.query.q as string;
      if (!query || query.trim().length < 2) {
        return res.json({ foods: [] });
      }

      const params = new URLSearchParams({
        api_key: USDA_API_KEY,
        query: query.trim(),
        dataType: "Foundation,SR Legacy",
        pageSize: "20",
        sortBy: "dataType.keyword",
        sortOrder: "asc",
      });

      const response = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`
      );

      if (!response.ok) {
        log(`USDA API error: ${response.status} ${response.statusText}`);
        return res.status(502).json({ error: "USDA API error", foods: [] });
      }

      const data = await response.json();

      // Transform USDA response into our simplified format
      const foods = (data.foods || []).map((food: USDAFood) => {
        const nutrients = food.foodNutrients || [];
        const getNutrient = (id: number) => {
          const n = nutrients.find((n: USDAFoodNutrient) => n.nutrientId === id);
          return n ? Math.round(n.value * 10) / 10 : 0;
        };

        return {
          fdcId: food.fdcId,
          name: food.description,
          category: food.foodCategory || "",
          calories: getNutrient(1008),  // Energy (kcal)
          protein: getNutrient(1003),   // Protein
          carbs: getNutrient(1005),     // Carbohydrate
          fat: getNutrient(1004),       // Total fat
          fiber: getNutrient(1079),     // Fiber
          sugar: getNutrient(2000),     // Total sugars
          sodium: getNutrient(1093),    // Sodium (mg)
          servingSize: food.servingSize || null,
          servingSizeUnit: food.servingSizeUnit || "g",
          dataType: food.dataType,
        };
      });

      return res.json({ foods, totalHits: data.totalHits || 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log(`Food search error: ${message}`);
      return res.status(500).json({ error: "Search failed", foods: [] });
    }
  });

  // ─── Open Food Facts Text Search ───────────────────────────────────────────
  app.get("/api/foods/off-search", foodSearchLimiter, async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim().length < 2) {
        return res.json({ foods: [] });
      }

      const params = new URLSearchParams({
        search_terms: query.trim(),
        json: "1",
        page_size: "15",
        fields: "code,product_name,brands,nutriments,serving_quantity,serving_size,image_small_url,completeness",
      });

      const response = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?${params}`,
        { headers: { "User-Agent": "PerformanceFuelManager/1.0" } }
      );

      if (!response.ok) {
        log(`OFF API error: ${response.status}`);
        return res.status(502).json({ error: "Open Food Facts API error", foods: [] });
      }

      const data = await response.json();

      const foods = (data.products || [])
        .filter((p: OFFProduct) => p.product_name && p.product_name.trim().length > 0)
        .map((p: OFFProduct): TransformedOFFFood => {
          const n = p.nutriments || {};
          const calories = Math.round((n["energy-kcal_100g"] || 0) * 10) / 10;
          const protein = Math.round((n.proteins_100g || 0) * 10) / 10;
          const carbs = Math.round((n.carbohydrates_100g || 0) * 10) / 10;
          const fat = Math.round((n.fat_100g || 0) * 10) / 10;
          const fiber = Math.round((n.fiber_100g || 0) * 10) / 10;
          const sugar = Math.round((n.sugars_100g || 0) * 10) / 10;
          const sodium = Math.round((n.sodium_100g || 0) * 1000 * 10) / 10;

          let dataQuality: "complete" | "partial" | "poor" = "poor";
          if (calories > 0 && protein >= 0 && carbs >= 0) {
            dataQuality = (protein > 0 || carbs > 0) ? "complete" : "partial";
          } else if (calories > 0) {
            dataQuality = "partial";
          }

          return {
            barcode: p.code || "",
            name: p.product_name || "",
            brand: p.brands || "",
            calories, protein, carbs, fat, fiber, sugar, sodium,
            servingSize: p.serving_quantity || null,
            servingSizeLabel: p.serving_size || "",
            imageUrl: p.image_small_url || null,
            dataQuality,
          };
        })
        .filter((f: TransformedOFFFood) => f.dataQuality !== "poor")
        .sort((a: TransformedOFFFood, b: TransformedOFFFood) => (a.dataQuality === "complete" ? -1 : 1) - (b.dataQuality === "complete" ? -1 : 1));

      return res.json({ foods, totalHits: data.count || 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log(`OFF search error: ${message}`);
      return res.status(500).json({ error: "Search failed", foods: [] });
    }
  });

  // ─── Barcode Lookup (FatSecret primary, Open Food Facts fallback) ─────────
  app.get("/api/foods/off-barcode", foodSearchLimiter, async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      if (!code || code.trim().length < 4) {
        return res.status(400).json({ found: false, error: "Invalid barcode" });
      }
      const barcode = code.trim();

      // Try FatSecret barcode first
      const token = await getFatSecretToken();
      if (token) {
        try {
          const bcParams = new URLSearchParams({ barcode, format: "json" });
          const bcResp = await fetch(`https://platform.fatsecret.com/rest/food/find-id-for-barcode/v1?${bcParams}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (bcResp.ok) {
            const bcData = await bcResp.json();
            const foodId = bcData?.food_id?.value || bcData?.food_id;
            if (foodId) {
              const fdParams = new URLSearchParams({ food_id: String(foodId), format: "json", include_food_attributes: "true" });
              const fdResp = await fetch(`https://platform.fatsecret.com/rest/food/v4?${fdParams}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (fdResp.ok) {
                const fdData = await fdResp.json();
                const food = fdData?.food;
                if (food) {
                  const srvs = food.servings?.serving;
                  const servings = Array.isArray(srvs) ? srvs : srvs ? [srvs] : [];
                  const def = servings.find((s: any) => s.is_default === "1") || servings[0];
                  if (def) {
                    const cal = rnd(parseFloat(def.calories)||0), pro = rnd(parseFloat(def.protein)||0);
                    const carb = rnd(parseFloat(def.carbohydrate)||0), fat = rnd(parseFloat(def.fat)||0);
                    const fib = rnd(parseFloat(def.fiber)||0), sug = rnd(parseFloat(def.sugar)||0);
                    const sod = rnd(parseFloat(def.sodium)||0);
                    return res.json({
                      found: true,
                      food: {
                        barcode, name: food.food_name||"", brand: food.brand_name||"",
                        calories: cal, protein: pro, carbs: carb, fat, fiber: fib, sugar: sug, sodium: sod,
                        servingSize: parseFloat(def.metric_serving_amount)||null,
                        servingSizeLabel: def.serving_description||"",
                        imageUrl: null,
                        dataQuality: (cal > 0 && (pro > 0 || carb > 0)) ? "complete" as const : "partial" as const,
                      },
                    });
                  }
                }
              }
            }
          }
        } catch (err) {
          log(`FatSecret barcode error: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }

      // Fallback: Open Food Facts
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,brands,nutriments,serving_quantity,serving_size,image_small_url,completeness`,
        { headers: { "User-Agent": "PerformanceFuelManager/1.0" } }
      );

      if (!response.ok) {
        log(`OFF barcode API error: ${response.status}`);
        return res.status(502).json({ found: false, error: "Open Food Facts API error" });
      }

      const data = await response.json();
      if (data.status !== 1 || !data.product?.product_name) {
        return res.json({ found: false });
      }

      const p = data.product;
      const n = p.nutriments || {};
      const calories = rnd(n["energy-kcal_100g"] || 0);
      const protein = rnd(n.proteins_100g || 0);
      const carbs = rnd(n.carbohydrates_100g || 0);
      const fat = rnd(n.fat_100g || 0);
      const fiber = rnd(n.fiber_100g || 0);
      const sugar = rnd(n.sugars_100g || 0);
      const sodium = rnd((n.sodium_100g || 0) * 1000);

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
          calories, protein, carbs, fat, fiber, sugar, sodium,
          servingSize: p.serving_quantity || null,
          servingSizeLabel: p.serving_size || "",
          imageUrl: p.image_small_url || null,
          dataQuality,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log(`Barcode error: ${message}`);
      return res.status(500).json({ found: false, error: "Barcode lookup failed" });
    }
  });

  // ─── Food Search (FatSecret Premier primary, USDA fallback) ──────────────
  // FatSecret provides branded foods + better serving sizes
  // Falls back to USDA FoodData Central if FatSecret unavailable
  const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID || "";
  const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET || "";
  let fsTokenCache: { token: string; expiresAt: number } | null = null;

  async function getFatSecretToken(): Promise<string | null> {
    if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) return null;
    if (fsTokenCache && Date.now() < fsTokenCache.expiresAt - 300000) return fsTokenCache.token;
    try {
      const resp = await fetch("https://oauth.fatsecret.com/connect/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: FATSECRET_CLIENT_ID,
          client_secret: FATSECRET_CLIENT_SECRET,
          scope: "premier",
        }).toString(),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      fsTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 86400) * 1000 };
      return fsTokenCache.token;
    } catch { return null; }
  }

  function autoSparCategory(cal: number, p: number, c: number, f: number, fib: number, foodCategory?: string): string | null {
    if (cal <= 0 && p <= 0) return null;
    const cat = (foodCategory || "").toLowerCase();
    if (cat.includes("fruit") && !cat.includes("baby")) return 'fruit';
    if (cat.includes("vegetable")) return 'veg';
    if (cal > 0) {
      const pP = (p*4)/cal, cP = (c*4)/cal, fP = (f*9)/cal;
      if (pP > 0.40) return 'protein';
      if (fP > 0.60) return 'fat';
      if (cP > 0.40 && fib > 3) return 'veg';
      if (cP > 0.40) return 'carb';
    }
    return null;
  }

  const rnd = (v: number) => Math.round(v * 10) / 10;

  // ── FatSecret Autocomplete ──
  app.get("/api/foods/fatsecret-autocomplete", foodSearchLimiter, async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string || "").trim();
      if (query.length < 2) return res.json({ suggestions: [] });

      const token = await getFatSecretToken();
      if (!token) return res.json({ suggestions: [] });

      const params = new URLSearchParams({
        expression: query,
        format: "json",
        max_results: "8",
      });

      const response = await fetch(
        `https://platform.fatsecret.com/rest/food/autocomplete/v1?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) return res.json({ suggestions: [] });

      const data = await response.json();
      const suggestions = data?.suggestions?.suggestion || [];
      const list = Array.isArray(suggestions) ? suggestions : [suggestions];
      return res.json({ suggestions: list });
    } catch (err: any) {
      console.error(`Autocomplete error: ${err.message}`);
      return res.json({ suggestions: [] });
    }
  });

  app.get("/api/foods/fatsecret-search", foodSearchLimiter, async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string || "").trim();
      if (query.length < 2) return res.json({ foods: [], totalHits: 0 });

      // Try FatSecret first
      const token = await getFatSecretToken();
      if (token) {
        try {
          const fsParams = new URLSearchParams({
            search_expression: query, format: "json", max_results: "20", include_food_attributes: "true",
          });
          const fsResp = await fetch(`https://platform.fatsecret.com/rest/foods/search/v1?${fsParams}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (fsResp.ok) {
            const fsData = await fsResp.json();
            const results = fsData?.foods?.food;
            if (results) {
              const foodList = Array.isArray(results) ? results : [results];
              const foods = foodList.map((food: any) => {
                const srvs = food.servings?.serving;
                const servings = Array.isArray(srvs) ? srvs : srvs ? [srvs] : [];
                const def = servings.find((s: any) => s.is_default === "1") || servings[0];
                if (!def) return null;
                const cal = parseFloat(def.calories)||0, pro = parseFloat(def.protein)||0;
                const carb = parseFloat(def.carbohydrate)||0, fat = parseFloat(def.fat)||0;
                const fib = parseFloat(def.fiber)||0, sug = parseFloat(def.sugar)||0, sod = parseFloat(def.sodium)||0;
                if (cal <= 0 && pro <= 0 && carb <= 0) return null;
                return {
                  id: String(food.food_id), name: food.food_name||"", brand: food.brand_name||"",
                  type: food.food_type||"Generic",
                  calories: rnd(cal), protein: rnd(pro), carbs: rnd(carb), fat: rnd(fat),
                  fiber: rnd(fib), sugar: rnd(sug), sodium: rnd(sod),
                  servingSize: parseFloat(def.metric_serving_amount)||100,
                  servingSizeUnit: def.metric_serving_unit||"g",
                  servingSizeLabel: def.serving_description||"per serving",
                  sparCategory: autoSparCategory(cal, pro, carb, fat, fib, food.food_type),
                  servings: servings.map((s: any) => ({
                    id: s.serving_id||s.serving_description, description: s.serving_description||"serving",
                    calories: rnd(parseFloat(s.calories)||0), protein: rnd(parseFloat(s.protein)||0),
                    carbs: rnd(parseFloat(s.carbohydrate)||0), fat: rnd(parseFloat(s.fat)||0),
                    fiber: rnd(parseFloat(s.fiber)||0), sugar: rnd(parseFloat(s.sugar)||0),
                    metricAmount: parseFloat(s.metric_serving_amount)||null, metricUnit: s.metric_serving_unit||"g",
                    isDefault: s.is_default === "1",
                  })),
                };
              }).filter(Boolean);
              if (foods.length > 0) {
                return res.json({ foods, totalHits: parseInt(fsData?.foods?.total_results)||foods.length });
              }
            }
          }
        } catch (err) {
          log(`FatSecret search error: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }

      // Fallback to USDA
      const keysToTry = USDA_API_KEY !== "DEMO_KEY" ? [USDA_API_KEY, "DEMO_KEY"] : ["DEMO_KEY"];
      for (const apiKey of keysToTry) {
        const params = new URLSearchParams({
          api_key: apiKey, query, dataType: "Foundation,SR Legacy", pageSize: "20",
          sortBy: "dataType.keyword", sortOrder: "asc",
        });
        const resp = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`);
        if (resp.ok) {
          const data = await resp.json();
          return res.json(transformUSDAtoClientShape(data));
        }
        log(`USDA API error (key=${apiKey.substring(0,8)}...): ${resp.status}`);
        if (keysToTry.indexOf(apiKey) < keysToTry.length - 1) continue;
      }

      return res.status(502).json({ error: "Food database error", foods: [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      log(`Food search error: ${msg}`);
      return res.status(500).json({ error: "Search failed", foods: [] });
    }
  });

  function transformUSDAtoClientShape(data: any) {
    const foods = (data.foods || []).map((food: any) => {
      const nutrients = food.foodNutrients || [];
      const gn = (id: number) => {
        const n = nutrients.find((n: any) => n.nutrientId === id);
        return n ? rnd(n.value) : 0;
      };
      const cal = gn(1008) || gn(2048), pro = gn(1003), carb = gn(1005), fat = gn(1004);
      const fib = gn(1079), sug = gn(2000), sod = gn(1093);
      if (cal <= 0 && pro <= 0 && carb <= 0) return null;
      const ss = food.servingSize || 100;
      const ssu = food.servingSizeUnit || "g";
      const sparCat = autoSparCategory(cal, pro, carb, fat, fib, food.foodCategory);

      return {
        id: String(food.fdcId), name: food.description || "",
        brand: food.brandName || food.brandOwner || "",
        type: food.dataType || "Generic",
        calories: cal, protein: pro, carbs: carb, fat, fiber: fib, sugar: sug, sodium: sod,
        servingSize: 100, servingSizeUnit: "g", servingSizeLabel: "per 100g",
        sparCategory: sparCat,
        servings: [
          { id: "100g", description: "per 100g", calories: cal, protein: pro,
            carbs: carb, fat, fiber: fib, sugar: sug,
            metricAmount: 100, metricUnit: "g", isDefault: true },
          ...(food.servingSize && food.servingSize !== 100 ? [{
            id: "serving", description: `${ss}${ssu}`,
            calories: rnd(cal*(ss/100)), protein: rnd(pro*(ss/100)),
            carbs: rnd(carb*(ss/100)), fat: rnd(fat*(ss/100)),
            fiber: rnd(fib*(ss/100)), sugar: rnd(sug*(ss/100)),
            metricAmount: ss, metricUnit: ssu, isDefault: false,
          }] : []),
        ],
      };
    }).filter(Boolean);
    return { foods, totalHits: data.totalHits || 0 };
  }

  // ─── AI Food Photo Analysis ─────────────────────────────────────────────────
  app.post("/api/foods/photo-analysis", aiCoachLimiter, async (req: Request, res: Response) => {
    try {
      if (!ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI not configured" });
      }

      const { image } = req.body;
      if (!image || typeof image !== 'string') {
        return res.status(400).json({ error: "Image data is required" });
      }

      const match = image.match(/^data:image\/(jpeg|png|webp|gif);base64,/);
      if (!match) {
        return res.status(400).json({ error: "Invalid image format" });
      }

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
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
              { type: "text", text: `Analyze this food photo. Identify each distinct food item visible.\n\nFor EACH food item, estimate:\n- name: common food name\n- estimatedGrams: weight in grams\n- calories, protein, carbs, fat, fiber\n- sparCategory: "protein", "carb", "veg", "fruit", or "fat"\n- sliceCount: SPAR portions (1 palm protein=1, 1 fist carb=1, 1 fist veg=1, 1 piece fruit=1, 1 thumb fat=1)\n\nRespond ONLY with valid JSON:\n{"foods": [{"name":"...","estimatedGrams":0,"calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sparCategory":"...","sliceCount":1}], "confidence":"high|medium|low"}` },
            ],
          }],
        }),
      });

      if (!response.ok) {
        log(`Anthropic Vision API error: ${response.status}`);
        return res.status(502).json({ error: "AI vision service error" });
      }

      const aiData = await response.json();
      // Find the text content block (skip thinking blocks)
      const textBlock = aiData.content?.find((b: any) => b.type === 'text');
      const rawText = textBlock?.text || "";

      if (!rawText) {
        log(`Photo analysis: empty response from AI. Content blocks: ${JSON.stringify(aiData.content?.map((b: any) => b.type) || [])}`);
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
        log(`Photo analysis JSON error. Raw text: ${rawText.slice(0, 500)}`);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown';
      log(`Photo analysis error: ${message}`);
      return res.status(500).json({ error: "Photo analysis failed" });
    }
  });

  // ─── Voice Food Parsing (text transcript → food items) ──────────────────────
  app.post("/api/foods/voice-parse", aiCoachLimiter, async (req: Request, res: Response) => {
    try {
      if (!ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI not configured" });
      }

      const { transcript } = req.body;
      if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 3) {
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
        log(`Anthropic API error for voice-parse: ${response.status} ${errorBody.slice(0, 300)}`);
        return res.status(502).json({ error: "AI service error" });
      }

      const aiData = await response.json();
      // Find the text content block (skip thinking blocks)
      const textBlock = aiData.content?.find((b: any) => b.type === 'text');
      const rawText = textBlock?.text || "";

      if (!rawText) {
        log(`Voice parse: empty response from AI. Content blocks: ${JSON.stringify(aiData.content?.map((b: any) => b.type) || [])}`);
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
        log(`Voice parse JSON error. Raw text: ${rawText.slice(0, 500)}`);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown';
      log(`Voice parse error: ${message}`);
      return res.status(500).json({ error: "Voice food parsing failed" });
    }
  });

  // ─── AI Weight Cutting & Recovery Coach (Elite Version) ─────────────────────
  app.post("/api/ai/coach", aiCoachLimiter, async (req: Request, res: Response) => {
    try {
      if (!ANTHROPIC_API_KEY) {
        return res.status(503).json({
          error: "AI not configured",
          message: "Add ANTHROPIC_API_KEY to environment variables to enable AI coaching.",
        });
      }

      const { question, context } = req.body;

      if (!question || typeof question !== "string" || question.trim().length < 3) {
        return res.status(400).json({ error: "Question is required" });
      }

      const ctx = context || {};

      // Build athlete context string (sanitized)
      const contextLines: string[] = [];

      // Athlete profile
      if (ctx.name) contextLines.push(`Athlete: ${sanitizeForPrompt(ctx.name)}`);
      if (ctx.currentWeight) contextLines.push(`Current weight: ${sanitizeForPrompt(ctx.currentWeight)} lbs`);
      if (ctx.targetWeightClass) contextLines.push(`Target weight class: ${sanitizeForPrompt(ctx.targetWeightClass)} lbs`);
      if (ctx.daysUntilWeighIn !== undefined) {
        const days = Number(ctx.daysUntilWeighIn) || 0;
        if (days > 0) contextLines.push(`Days until weigh-in: ${days}`);
        else if (days === 0) contextLines.push(`Competition day: TODAY`);
        else contextLines.push(`Post-competition: ${Math.abs(days)} days after`);
      }
      if (ctx.weightToLose) contextLines.push(`Weight still to cut: ${sanitizeForPrompt(ctx.weightToLose)} lbs`);

      // Protocol info
      const protocolNames: Record<string, string> = {
        '1': 'Extreme Cut (aggressive)',
        '2': 'Rapid Cut (standard weekly)',
        '3': 'Optimal Cut',
        '4': 'Gain Phase',
        '5': 'SPAR Nutrition (portion-based)',
      };
      if (ctx.protocol) contextLines.push(`Protocol: ${protocolNames[ctx.protocol] || ctx.protocol}`);
      if (ctx.phase) contextLines.push(`Current phase: ${ctx.phase}`);
      if (ctx.status) contextLines.push(`Status: ${ctx.status}`);

      // Daily targets
      if (ctx.macroTargets) {
        contextLines.push(`Today's targets — Carbs: ${ctx.macroTargets.carbs?.min}-${ctx.macroTargets.carbs?.max}g, Protein: ${ctx.macroTargets.protein?.min}-${ctx.macroTargets.protein?.max}g`);
      }
      if (ctx.todaysFoods) {
        contextLines.push(`Today's carb type: ${ctx.todaysFoods.carbsLabel}`);
        contextLines.push(`Today's protein: ${ctx.todaysFoods.proteinLabel}`);
        if (ctx.todaysFoods.avoid?.length > 0) {
          contextLines.push(`Foods to avoid: ${ctx.todaysFoods.avoid.slice(0, 5).map((a: { name: string }) => a.name).join(', ')}`);
        }
      }

      // Hydration target
      if (ctx.hydrationTarget) {
        contextLines.push(`Water target: ${ctx.hydrationTarget.amount} (${ctx.hydrationTarget.type}) - ${ctx.hydrationTarget.note || ''}`);
      }

      // Daily tracking
      if (ctx.dailyTracking) {
        contextLines.push(`Today's intake — Water: ${ctx.dailyTracking.waterConsumed || 0}oz, Carbs: ${ctx.dailyTracking.carbsConsumed || 0}g, Protein: ${ctx.dailyTracking.proteinConsumed || 0}g`);
      }

      // Historical metrics
      if (ctx.avgOvernightDrift) contextLines.push(`Avg overnight drift: ${ctx.avgOvernightDrift} lbs`);
      if (ctx.avgPracticeLoss) contextLines.push(`Avg practice loss: ${ctx.avgPracticeLoss} lbs`);

      // Recovery context
      if (ctx.recoveryMode) {
        contextLines.push(`Recovery mode: ${ctx.recoveryMode === 'weigh-in' ? 'Post weigh-in' : `Between matches (#${ctx.matchNumber || '?'})`}`);
        if (ctx.elapsed) contextLines.push(`Time in recovery: ${Math.floor(ctx.elapsed / 60)} minutes`);
        if (ctx.weighInWeight) contextLines.push(`Weigh-in weight: ${ctx.weighInWeight} lbs`);
        if (ctx.lostWeight) contextLines.push(`Weight to recover: ${ctx.lostWeight} lbs`);
      }

      // Build calculated insights string
      const calculatedInsights = formatInsightsForPrompt(ctx.calculatedInsights);

      // Build the elite coach system prompt with full protocol knowledge
      const protocol = ctx.protocol || '2';
      const daysUntilWeighIn = Number(ctx.daysUntilWeighIn) || 0;
      const systemPrompt = buildEliteCoachPrompt(
        contextLines.length > 0 ? contextLines.join('\n') : 'No context provided',
        calculatedInsights,
        protocol,
        daysUntilWeighIn
      );

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600, // Increased for more detailed responses
          system: systemPrompt,
          messages: [{ role: "user", content: sanitizeForPrompt(question.trim()) }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        log(`Anthropic API error: ${response.status} ${errText}`);
        return res.status(502).json({ error: "AI service error" });
      }

      const aiData = await response.json();
      const reply = aiData.content?.[0]?.text || "Sorry, I couldn't generate a recommendation.";

      return res.json({ recommendation: reply });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log(`AI coach error: ${message}`);
      return res.status(500).json({ error: "AI coaching failed" });
    }
  });

  // ─── Coach Share Endpoint ─────────────────────────────────────────────────
  app.get("/api/share/:token", foodSearchLimiter, async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;

      // Validate token format: must be a valid UUID v4
      // This prevents enumeration attacks and invalid database queries
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!token || !UUID_REGEX.test(token)) {
        return res.status(400).json({ error: "Invalid share token format" });
      }

      if (!supabase) {
        return res.status(503).json({ error: "Database not configured" });
      }

      // Look up athlete profile by share_token
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("user_id, name, last_name, current_weight, target_weight_class, weigh_in_date, weigh_in_time, protocol")
        .eq("share_token", token)
        .single();

      if (profileErr || !profile) {
        return res.status(404).json({ error: "Athlete not found or sharing has been disabled." });
      }

      // Fetch weight logs for this athlete (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: logs } = await supabase
        .from("weight_logs")
        .select("weight, date, type, duration, sleep_hours")
        .eq("user_id", profile.user_id)
        .gte("date", thirtyDaysAgo.toISOString())
        .order("date", { ascending: false });

      // Fetch today's daily tracking
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: trackingRows } = await supabase
        .from("daily_tracking")
        .select("date, water_consumed, carbs_consumed, protein_consumed, no_practice")
        .eq("user_id", profile.user_id)
        .eq("date", todayStr)
        .limit(1);

      const dailyTracking = trackingRows && trackingRows.length > 0
        ? {
            date: trackingRows[0].date,
            waterConsumed: trackingRows[0].water_consumed || 0,
            carbsConsumed: trackingRows[0].carbs_consumed || 0,
            proteinConsumed: trackingRows[0].protein_consumed || 0,
          }
        : null;

      return res.json({
        profile: {
          name: profile.name,
          last_name: profile.last_name,
          current_weight: profile.current_weight,
          target_weight_class: profile.target_weight_class,
          weigh_in_date: profile.weigh_in_date,
          weigh_in_time: profile.weigh_in_time,
          protocol: profile.protocol,
        },
        logs: logs || [],
        dailyTracking,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log(`Share endpoint error: ${message}`);
      return res.status(500).json({ error: "Failed to load athlete data" });
    }
  });

  return httpServer;
}
