import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const code = req.query.code as string;
    if (!code || code.trim().length < 4) {
      return res.status(400).json({ found: false, error: "Invalid barcode" });
    }

    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code.trim())}.json?fields=code,product_name,brands,nutriments,serving_quantity,serving_size,image_small_url,completeness`,
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
  } catch (err: any) {
    console.error(`OFF barcode error: ${err.message}`);
    return res.status(500).json({ found: false, error: "Barcode lookup failed" });
  }
}
