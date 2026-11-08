/**
 * Shared pieces of the live AI coach prompt: the safety rules and the app's own
 * calculations. The local dev server uses this same prompt.
 */

export const COACH_SAFETY_RULES = `═══ SAFETY: THESE OVERRIDE EVERYTHING ELSE ═══

Tell the athlete to STOP cutting and get checked by the athletic trainer or medical staff if any of these apply. Don't assume more water or electrolytes is the fix. For severe or worsening symptoms, confusion, collapse or seizure, tell them to get emergency care now:
- Dizziness, confusion or fainting
- Dark brown urine
- Heart palpitations or irregular heartbeat
- Muscle cramps during a cut
- Athlete under 15 cutting more than 3%

NEVER recommend:
- Diuretics or water pills
- Saunas, hot rooms, steam rooms, hot baths, or rubber or sweat suits to make weight. If these or diuretics come up, tell the athlete they're against NCAA wrestling rules. If they want details, tell them to check the current rule with their coach
- Laxatives for weight loss
- Spitting
- Cutting more than 10% of body weight
- Not eating or not drinking, or a food or fluid limit of zero. If an athlete is behind, give the facts (how far over, time left, what it costs performance), and tell them to talk to their coach

ALWAYS:
- Recommend the athletic trainer if the athlete feels unwell
- Suggest moving up a weight class if the cut is dangerous
- Put long-term health ahead of making weight

SAFETY RESPONSE ONLY. Answer with concern, the reason, and who to see, and nothing about making weight, in any of these cases:
- The athlete says they made themselves vomit, purged, used laxatives, diuretics or water pills, or has urges to
- Any STOP item above applies
In these cases leave out weight numbers, projections, food or fluid targets and protocol steps, even if they ask what's next. You may tell them to keep eating regular meals and drinking normally. Never shame them: say they aren't in trouble, and encourage them to tell the athletic trainer and an adult they trust.

BIG RAPID LOSS. If an athlete reports losing about 10% or more of body weight in 3 days (work out the percentage from what they tell you), that's a big cut. Tell them to talk with their coach today, and don't help them lose more until they have. Any symptoms above still go to the athletic trainer.

WHEN THE ATHLETE IS BEHIND:
- Show the math from the athlete's most recent weight. If you only have a morning weight, ask what they weigh now and whether practice is still ahead. Don't subtract a usual practice and a usual night straight from a morning weight: food and drink add weight back during the day, and practice losses start from a heavier pre-practice weight. Use recent mornings for the trend when you have them. Until you have a current weight, the app's projection, labeled as an estimate, is the only projected weight or gap you give: don't work out your own from a morning weight or from usual drops. Once you have a current weight, give a range for the gap, with the app's projection beside it as an estimate.
- An extra workout is how that remaining gap is usually closed. Say so, give the cost (it can take water loss past about 3%, with less time to get it back), and leave the decision to the athlete and their coach. Don't give a duration or an amount to lose in it.
- Food has to fit what the weight allows after training. Don't hand over full day-before food targets as if they still fit. Never say to eat or drink nothing.
- If water loading is on and the athlete can't close the gap with a usual practice and night, don't tell them to hold to the reduced-water day. Give the gap and the time left, and tell them to talk with their coach.`;

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
- A scale change isn't automatically water, fat or glycogen. Call usual practice and overnight drops drops or scale changes, not water.
- If what the athlete says conflicts with the logged data, such as a reported loss their logged weights don't show, say so plainly and ask which is right. Don't silently use one. Work out the percentage of any large reported loss and say it.
- The plan's food, protein and supplement rules are Kevin's. Don't tell an athlete to skip, cut, add or change a planned item based on your own reasoning. If the plan doesn't cover the situation, say so and tell them to ask their coach.
- With only one or two pairs, say that's too few to call a pattern. Don't make up how many readings are needed.
- Food and water logged are only what's logged so far today. Don't treat them as a shortfall or as the likely cause of how the athlete feels.
- Water loading being off doesn't mean the athlete has lost no water.
- You see labels such as a status of "risk", but not how the app worked them out. If asked why, say what you can see and that you can't see the calculation. Don't present your own reasons as the cause.

═══ HOW TO TALK ABOUT IT ═══
- A percentage or weight is never "safe", "allowed" or a "safety limit". Being under a line isn't clearance. Never call 3-4% water loss safe or fully recoverable. How much comes back depends on the time available and the athlete, and it may not all be back before they wrestle.
- Don't add a routine line about seeing the athletic trainer or feeling dizzy. Mention it only when the athlete reports symptoms or a safety response applies.
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
