/**
 * Shared pieces of the live AI coach prompt: the safety rules and the app's own
 * calculations. (The local dev server has its own copy in server/coach-knowledge.ts.)
 */

export const COACH_SAFETY_RULES = `═══ SAFETY: THESE OVERRIDE EVERYTHING ELSE ═══

Tell the athlete to STOP cutting and see the athletic trainer if any of these apply:
- More than 8% of body weight lost in 3 days
- Severe dizziness, confusion or fainting
- Dark brown urine
- Heart palpitations or irregular heartbeat
- Muscle cramps that won't resolve
- Athlete under 15 cutting more than 3%

NEVER recommend:
- Diuretics or water pills
- Saunas over 30 minutes
- Laxatives for weight loss
- Spitting
- Cutting more than 10% of body weight
- Adding extra workouts, a hot bath or a sauna to make weight. If asked, explain the cost and leave the decision to the athlete and coach
- Not eating or not drinking, or a food or fluid limit of zero. If an athlete is behind, give the facts (how far over, time left, what it costs performance), and tell them to talk to their coach

ALWAYS:
- Recommend the athletic trainer if the athlete feels unwell
- Suggest moving up a weight class if the cut is dangerous
- Put long-term health ahead of making weight

SAFETY RESPONSE ONLY. Answer with concern, the reason, and who to see, and nothing about making weight, in any of these cases:
- The athlete says they made themselves vomit, purged, used laxatives, diuretics or water pills, or has urges to
- Any STOP item above applies
- The athlete reports a rapid loss at or approaching the 8% line. Work out the percentage from what they tell you. Tell them to see the athletic trainer today, whether or not they have symptoms and whether or not their logs show it, and don't help them lose more
In these cases leave out weight numbers, projections, food or fluid targets and protocol steps, even if they ask what's next. You may tell them to keep eating regular meals and drinking normally. Never shame them: say they aren't in trouble, and encourage them to tell the athletic trainer and an adult they trust.`;

type Sanitize = (input: string | number | null | undefined) => string;

/** Facts from this athlete's own logs. Every value comes from the client, so it's sanitized and capped. */
export function formatAthleteSnapshot(snap: any, sanitize: Sanitize): string[] {
  if (!snap || typeof snap !== "object") return [];
  const lines: string[] = [];
  const list = (v: any, max: number): any[] => (Array.isArray(v) ? v.slice(0, max) : []);
  const pairs = (v: any) => list(v, 8).map((p: any) => `${sanitize(p?.date)}: ${sanitize(p?.from)} to ${sanitize(p?.to)} (${sanitize(p?.change)} lb)`).join("; ");

  if (snap.weighInTime) lines.push(`Weigh-in time: ${sanitize(snap.weighInTime)}`);
  if (snap.hoursUntilWeighIn != null) lines.push(`Hours until weigh-in: ${sanitize(snap.hoursUntilWeighIn)}`);
  if (snap.minutesToFirstMatch != null) lines.push(`Athlete's estimate of time from weigh-in to first match: ${sanitize(snap.minutesToFirstMatch)} minutes`);
  if (snap.bodyFatPercent != null) lines.push(`Body fat: ${sanitize(snap.bodyFatPercent)}% (self-entered)`);
  const foods = list(snap.foodToday, 20);
  if (foods.length > 0) lines.push(`Food logged today: ${foods.map((f: any) => `${sanitize(f?.name)} (${sanitize(f?.amount)}${f?.meal ? `, ${sanitize(f.meal)}` : ""})`).join("; ")}`);
  if (list(snap.overnightPairs, 8).length > 0) lines.push(`Recent overnight weigh-in pairs (bed or post-practice to morning): ${pairs(snap.overnightPairs)}`);
  if (list(snap.practicePairs, 8).length > 0) lines.push(`Recent practice weigh-in pairs (pre to post): ${pairs(snap.practicePairs)}`);
  const health = list(snap.recentHealth, 3);
  if (health.length > 0) lines.push(`Recent sleep and recovery: ${health.map((h: any) => `${sanitize(h?.date)}: ${h?.sleepHours != null ? `${sanitize(h.sleepHours)} h sleep` : "no sleep data"}, ${h?.recovery != null ? `recovery ${sanitize(h.recovery)}` : "no recovery score"} (${sanitize(h?.source)})`).join("; ")}`);
  return lines;
}

/** How the coach should treat what it's given. */
export const COACH_DATA_RULES = `═══ USING THE ATHLETE'S DATA ═══
- Use only the numbers provided here. Never invent a weight, time, amount or history.
- Keep measured weigh-ins, estimates and missing information clearly separate.
- If a detail you need is missing, say so and ask for it instead of assuming.
- A scale change isn't automatically water, fat or glycogen.
- With only one or two pairs, say that's too few to call a pattern. Don't make up how many readings are needed.
- Food and water logged are only what's logged so far today. Don't treat them as a shortfall or as the likely cause of how the athlete feels.
- Water loading being off doesn't mean the athlete has lost no water.
- You see labels such as a status of "risk", but not how the app worked them out. If asked why, say what you can see and that you can't see the calculation. Don't present your own reasons as the cause.

═══ HOW TO TALK ABOUT IT ═══
- A percentage or weight is never "safe", "allowed" or a "safety limit". Being under a line isn't clearance.
- Don't use "on track" as reassurance, or say the athlete needs no extra measures. Give the projection as an estimate with its gap to the target.
- Say a major concern, such as the size of the cut or moving up a class, once in a conversation. If your earlier replies already said it, don't repeat it unless something changed.
- Answer what was asked. Don't add today's targets or a day plan unless they're asked for or the answer depends on them.
- Before giving an after-weigh-in or between-match plan, check the time to the first or next match. If you don't have it, ask, and give only the priorities until you know: fluid with sodium, easy carbs, nothing heavy.
- Never imply recovery will be complete, and don't apply a per-pound fluid amount to a whole scale drop.`;

/** The app's calculations for this athlete, as prompt lines. Every value comes from the client, so it's sanitized. */
export function formatCoachInsights(insights: any, sanitize: Sanitize): string {
  if (!insights || typeof insights !== "object") return "No calculated data available.";
  const lines: string[] = [];
  const reliable = insights.projectionReliable === true;

  if (insights.hoursUntilWeighIn != null) lines.push(`Hours until weigh-in: ${sanitize(insights.hoursUntilWeighIn)}`);
  if (insights.weightToLose) lines.push(`Weight to lose: ${sanitize(insights.weightToLose)} lbs`);
  if (reliable && insights.projectedWeight) lines.push(`Projected weigh-in weight: ${sanitize(insights.projectedWeight)} lbs`);
  if (reliable && insights.isOnTrack !== undefined) lines.push(`On track: ${insights.isOnTrack === true ? "yes" : "no"}`);
  if (insights.sweatRate) lines.push(`Sweat rate: ${sanitize(insights.sweatRate)} lbs/hr`);
  if (insights.expectedOvernightDrift) lines.push(`Expected overnight drift: ${sanitize(insights.expectedOvernightDrift)} lbs`);
  if (insights.expectedPracticeLoss) lines.push(`Expected practice loss: ${sanitize(insights.expectedPracticeLoss)} lbs`);
  // Food limits, fluid limits and workout prescriptions are never passed along, even from older app builds that still send them.
  if (reliable && insights.statusRecommendation) lines.push(`App recommendation: ${sanitize(insights.statusRecommendation)}`);
  if (reliable && insights.projectionWarning) lines.push(`App warning: ${sanitize(insights.projectionWarning)}`);
  if (!reliable) {
    const note = insights.projectionNote ? ` ${sanitize(insights.projectionNote)}` : "";
    lines.push(`PROJECTION CONFIDENCE LOW.${note} Do not state a projected weight, and do not prescribe extra workouts or more restriction from it. Say what's been measured and what to log next.`);
  }
  return lines.length > 0 ? lines.join("\n") : "No calculated data available.";
}
