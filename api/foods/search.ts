import type { VercelRequest, VercelResponse } from "@vercel/node";

// No fallback key - return error if not configured
const USDA_API_KEY = process.env.USDA_API_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Check if USDA API key is configured
    if (!USDA_API_KEY) {
      console.error("USDA API key not configured");
      return res.status(503).json({ error: "Food search service not configured", foods: [] });
    }

    const query = req.query.q as string;
    if (!query || query.trim().length < 2) {
      return res.json({ foods: [] });
    }

    // Use POST to avoid URL encoding issues with query params
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          dataType: ["Foundation", "SR Legacy"],
          pageSize: 20,
          sortBy: "dataType.keyword",
          sortOrder: "asc",
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`USDA API error: ${response.status} - ${errBody}`);
      return res.status(502).json({ error: "USDA API error", foods: [] });
    }

    const data = await response.json();

    const foods = (data.foods || []).map((food: any) => {
      const nutrients = food.foodNutrients || [];
      const getNutrient = (id: number) => {
        const n = nutrients.find((n: any) => n.nutrientId === id);
        return n ? Math.round(n.value * 10) / 10 : 0;
      };

      return {
        fdcId: food.fdcId,
        name: food.description,
        category: food.foodCategory || "",
        calories: getNutrient(1008),
        protein: getNutrient(1003),
        carbs: getNutrient(1005),
        fat: getNutrient(1004),
        fiber: getNutrient(1079),
        sugar: getNutrient(2000) || getNutrient(1063),  // 2000 = branded, 1063 = Foundation/SR Legacy
        sodium: getNutrient(1093),
        servingSize: food.servingSize || null,
        servingSizeUnit: food.servingSizeUnit || "g",
        dataType: food.dataType,
      };
    });

    return res.json({ foods, totalHits: data.totalHits || 0 });
  } catch (err: any) {
    console.error(`Food search error: ${err.message}`);
    return res.status(500).json({ error: "Search failed", foods: [] });
  }
}
