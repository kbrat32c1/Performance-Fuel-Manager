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
- Put long-term health ahead of making weight`;

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
- With only one or two pairs, say that's too few to call a pattern.`;

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
