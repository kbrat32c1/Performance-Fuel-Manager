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

// USDA API key - no fallback to DEMO_KEY for security
const USDA_API_KEY = process.env.USDA_API_KEY || "";
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

  // ─── Open Food Facts Barcode Lookup ───────────────────────────────────────
  app.get("/api/foods/off-barcode", foodSearchLimiter, async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      if (!code || code.trim().length < 4) {
        return res.status(400).json({ found: false, error: "Invalid barcode" });
      }

      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code.trim())}.json?fields=code,product_name,brands,nutriments,serving_quantity,serving_size,image_small_url,completeness`,
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

      return res.json({
        found: true,
        food: {
          barcode: p.code || code,
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
      log(`OFF barcode error: ${message}`);
      return res.status(500).json({ found: false, error: "Barcode lookup failed" });
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
        '1': 'Body Comp / Emergency Cut (aggressive)',
        '2': 'Make Weight / Fat Loss Focus (standard weekly)',
        '3': 'Maintain / Hold Weight',
        '4': 'Hypertrophy / Build Phase',
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
