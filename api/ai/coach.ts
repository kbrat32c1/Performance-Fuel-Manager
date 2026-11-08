import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../_cors.js";
import { requireUserWithinLimit } from "../_auth.js";
import { buildCoachSystemPrompt, sanitizeForPrompt } from "../_coach-prompt.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res, "POST")) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Paid AI call: signed-in athletes only, with a per-athlete limit
  const userId = await requireUserWithinLimit(req, res, "coach", { perMinute: 10, perDay: 100 });
  if (!userId) return;

  try {
    if (!ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: "AI not configured",
        message: "Add ANTHROPIC_API_KEY to environment variables to enable AI coaching.",
      });
    }

    // The app's availability check: answer without spending an AI call
    if (req.body?.ping === true) return res.status(200).json({ ok: true });

    const { question, context, history } = req.body;

    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return res.status(400).json({ error: "Question is required" });
    }

    const systemPrompt = buildCoachSystemPrompt(context || {});

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        model: "claude-opus-5-5",
        // Thinking is always on and shares max_tokens with the answer
        max_tokens: 4000,
        output_config: { effort: "low" },
        fallbacks: "default",
        system: systemPrompt,
        messages: [
          // Include conversation history for multi-turn context
          ...(Array.isArray(history) ? history.slice(-6) : []),
          { role: "user", content: sanitizeForPrompt(question.trim()) },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Anthropic API error: ${response.status} ${errText}`);
      return res.status(502).json({ error: "AI service error" });
    }

    const aiData = await response.json();
    // A thinking block comes before the answer; read the text block
    const reply = aiData.content?.find((b: any) => b.type === "text")?.text || "Sorry, I couldn't generate a recommendation.";

    return res.json({ recommendation: reply });
  } catch (err: any) {
    console.error(`AI coach error: ${err.message}`);
    return res.status(500).json({ error: "AI coaching failed" });
  }
}
