import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Configuration for Vercel Edge Function
 *
 * SECURITY: No hardcoded URLs. Both env vars are required.
 * Uses service role key because this bypasses RLS for the share feature.
 */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { token } = req.query;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing token" });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return res.status(400).json({ error: "Invalid token format" });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    return res.status(500).json({ error: "Server configuration error" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Fetch profile by share_token
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("name, current_weight, target_weight_class, weigh_in_date, weigh_in_time, protocol, user_id")
      .eq("share_token", token)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "Athlete not found or sharing disabled" });
    }

    // Fetch recent weight_logs (last 14 days)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const cutoffDate = twoWeeksAgo.toISOString().split("T")[0];

    const { data: logs } = await supabase
      .from("weight_logs")
      .select("weight, date, type, duration, sleep_hours")
      .eq("user_id", profile.user_id)
      .gte("date", cutoffDate)
      .order("date", { ascending: true });

    // Fetch today's daily tracking (water, macros)
    const todayDate = new Date().toISOString().split("T")[0];
    const { data: dailyTrackingData } = await supabase
      .from("daily_tracking")
      .select("date, water_consumed, carbs_consumed, protein_consumed")
      .eq("user_id", profile.user_id)
      .eq("date", todayDate)
      .maybeSingle();

    // Strip user_id from response
    const { user_id, ...safeProfile } = profile;

    // Cache for 2 minutes (coaches checking periodically)
    res.setHeader("Cache-Control", "public, max-age=120");

    return res.json({
      profile: safeProfile,
      logs: logs || [],
      dailyTracking: dailyTrackingData ? {
        date: dailyTrackingData.date,
        waterConsumed: dailyTrackingData.water_consumed || 0,
        carbsConsumed: dailyTrackingData.carbs_consumed || 0,
        proteinConsumed: dailyTrackingData.protein_consumed || 0,
      } : null,
    });
  } catch (err) {
    console.error("Share endpoint error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
