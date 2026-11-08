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

ALWAYS:
- Recommend the athletic trainer if the athlete feels unwell
- Suggest moving up a weight class if the cut is dangerous
- Put long-term health ahead of making weight`;

type Sanitize = (input: string | number | null | undefined) => string;

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
  if (insights.fluidAllowance?.oz != null) {
    lines.push(`Fluid allowance: ${sanitize(insights.fluidAllowance.oz)} oz, cutoff ${sanitize(insights.fluidAllowance.cutoffTime)}`);
  }
  if (insights.foodGuidance?.maxLbs != null) {
    lines.push(`Food: max ${sanitize(insights.foodGuidance.maxLbs)} lbs, last meal by ${sanitize(insights.foodGuidance.lastMealTime)}`);
  }
  if (reliable && insights.workoutGuidance?.description) {
    lines.push(`Workout: ${sanitize(insights.workoutGuidance.description)}`);
  }
  if (reliable && insights.statusRecommendation) lines.push(`App recommendation: ${sanitize(insights.statusRecommendation)}`);
  if (reliable && insights.projectionWarning) lines.push(`App warning: ${sanitize(insights.projectionWarning)}`);
  if (!reliable) {
    const note = insights.projectionNote ? ` ${sanitize(insights.projectionNote)}` : "";
    lines.push(`PROJECTION CONFIDENCE LOW.${note} Do not state a projected weight, and do not prescribe extra workouts or more restriction from it. Say what's been measured and what to log next.`);
  }
  return lines.length > 0 ? lines.join("\n") : "No calculated data available.";
}
