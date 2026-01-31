import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
      {
        headers: {
          "User-Agent": "PerformanceFuelManager/1.0 (contact@pfm.app)",
        },
      }
    );

    if (!response.ok) {
      console.error(`OFF API error: ${response.status}`);
      return res.status(502).json({ error: "Open Food Facts API error", foods: [] });
    }

    const data = await response.json();

    const foods = (data.products || [])
      .filter((p: any) => p.product_name && p.product_name.trim().length > 0)
      .map((p: any) => {
        const n = p.nutriments || {};
        const calories = Math.round((n["energy-kcal_100g"] || 0) * 10) / 10;
        const protein = Math.round((n.proteins_100g || 0) * 10) / 10;
        const carbs = Math.round((n.carbohydrates_100g || 0) * 10) / 10;
        const fat = Math.round((n.fat_100g || 0) * 10) / 10;
        const fiber = Math.round((n.fiber_100g || 0) * 10) / 10;
        const sugar = Math.round((n.sugars_100g || 0) * 10) / 10;
        const sodium = Math.round((n.sodium_100g || 0) * 1000 * 10) / 10; // convert g to mg

        // Data quality: check if key macros are present
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
        };
      })
      // Filter out poor quality entries
      .filter((f: any) => f.dataQuality !== "poor")
      // Sort complete first
      .sort((a: any, b: any) => {
        if (a.dataQuality === "complete" && b.dataQuality !== "complete") return -1;
        if (a.dataQuality !== "complete" && b.dataQuality === "complete") return 1;
        return 0;
      });

    return res.json({ foods, totalHits: data.count || 0 });
  } catch (err: any) {
    console.error(`OFF search error: ${err.message}`);
    return res.status(500).json({ error: "Search failed", foods: [] });
  }
}
