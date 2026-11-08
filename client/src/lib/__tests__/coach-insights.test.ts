import { describe, it, expect } from "vitest";
import { COACH_DATA_RULES, COACH_SAFETY_RULES, formatAthleteSnapshot, formatCoachInsights } from "../../../../api/_coach-insights";

const clean = (v: unknown) => String(v ?? "").replace(/[`<>]/g, "");

describe("live AI coach insights", () => {
  it("includes the safety rules", () => {
    expect(COACH_SAFETY_RULES).toMatch(/Diuretics/);
    expect(COACH_SAFETY_RULES).toMatch(/moving up a weight class/);
  });

  it("holds back projections and extra work when data is thin", () => {
    const out = formatCoachInsights({
      weightToLose: "4.0", projectedWeight: "160.0", isOnTrack: false, projectionReliable: false,
      projectionNote: "Not enough weigh-in pairs yet",
      workoutGuidance: { description: "2 extra sessions" },
      statusRecommendation: "2 extra workouts needed",
      fluidAllowance: { oz: 0, cutoffTime: "6 PM" },
      foodGuidance: { maxLbs: 0, lastMealTime: "5 PM" },
    }, clean);
    expect(out).toContain("Weight to lose: 4.0 lbs");
    expect(out).toContain("PROJECTION CONFIDENCE LOW");
    expect(out).toContain("Not enough weigh-in pairs yet");
    expect(out).not.toContain("Projected weigh-in weight");
    expect(out).not.toContain("2 extra");
    expect(out).not.toContain("Fluid allowance");
    expect(out).not.toContain("Food: max");
  });

  it("passes projections through when they rest on enough pairs", () => {
    const out = formatCoachInsights({ projectedWeight: "157.2", isOnTrack: true, projectionReliable: true }, clean);
    expect(out).toContain("Projected weigh-in weight: 157.2 lbs");
    expect(out).toContain("On track: yes");
    expect(out).not.toContain("CONFIDENCE LOW");
  });

  it("never passes food or fluid limits, even with reliable data and an old client sending zeros", () => {
    const out = formatCoachInsights({
      projectionReliable: true,
      fluidAllowance: { oz: 0, cutoffTime: "now" },
      foodGuidance: { maxLbs: 0, lastMealTime: "after weigh-in" },
    }, clean);
    expect(out).not.toMatch(/fluid|food|0 oz|last meal/i);
  });

  it("drops workout prescriptions and forbids zero food or fluid", () => {
    const out = formatCoachInsights({ projectionReliable: true, workoutGuidance: { description: "One 30-min workout" } }, clean);
    expect(out).not.toMatch(/workout/i);
    expect(COACH_SAFETY_RULES).toMatch(/Not eating or not drinking/);
    expect(COACH_SAFETY_RULES).toMatch(/hot bath/);
  });

  it("turns the athlete snapshot into prompt lines, sanitized and capped", () => {
    const lines = formatAthleteSnapshot({
      weighInTime: "16:00", hoursUntilWeighIn: 28, minutesToFirstMatch: 90,
      foodToday: Array.from({ length: 30 }, (_, i) => ({ name: `<b>food${i}</b>`, amount: "1 carb portion" })),
      overnightPairs: [{ date: "11/8", from: 163, to: 160.6, change: -2.4 }],
    }, clean);
    const text = lines.join("\n");
    expect(text).toContain("Weigh-in time: 16:00");
    expect(text).toContain("90 minutes");
    expect(text).toContain("11/8: 163 to 160.6 (-2.4 lb)");
    expect(text).not.toMatch(/[<>]/);
    expect(text).not.toContain("food20");
    expect(COACH_DATA_RULES).toMatch(/Never invent/);
  });

  it("ignores a missing snapshot", () => {
    expect(formatAthleteSnapshot(undefined, clean)).toEqual([]);
  });

  it("sanitizes values from the client", () => {
    expect(formatCoachInsights({ weightToLose: "<b>`x`</b>", projectionReliable: true }, clean)).not.toMatch(/[`<>]/);
  });
});

describe("safety response and wording rules", () => {
  it("keeps weight talk out of a safety response", () => {
    expect(COACH_SAFETY_RULES).toMatch(/SAFETY RESPONSE ONLY/);
    expect(COACH_SAFETY_RULES).toMatch(/purged/);
    expect(COACH_SAFETY_RULES).toMatch(/aren't in trouble/);
  });
  it("sends a big rapid loss to the coach", () => {
    expect(COACH_SAFETY_RULES).toMatch(/about 10% or more of body weight in 3 days/);
    expect(COACH_SAFETY_RULES).toMatch(/talk with their coach today/);
    expect(COACH_SAFETY_RULES).not.toMatch(/8% of body weight/);
  });
  it("names an extra workout as an option without prescribing it", () => {
    expect(COACH_SAFETY_RULES).toMatch(/extra workout is how that remaining gap/);
    expect(COACH_SAFETY_RULES).toMatch(/Don't give a duration/);
    expect(COACH_SAFETY_RULES).not.toMatch(/Saunas over 30 minutes/);
  });
  it("doesn't subtract losses straight from a morning weight", () => {
    expect(COACH_SAFETY_RULES).toMatch(/Don't subtract a usual practice and a usual night straight from a morning weight/);
  });
  it("speaks to the athlete about NCAA rules, not to itself", () => {
    expect(COACH_SAFETY_RULES).toMatch(/tell the athlete they're against NCAA wrestling rules/);
    expect(COACH_SAFETY_RULES).not.toMatch(/Treat these/);
  });
  it("doesn't repeat sips-only to an athlete who's behind", () => {
    expect(COACH_SAFETY_RULES).toMatch(/don't repeat the sips-only/);
  });
  it("keeps the routine trainer line out of ordinary answers", () => {
    expect(COACH_DATA_RULES).toMatch(/Don't add a routine line/);
  });
  it("doesn't let a number read as clearance", () => {
    expect(COACH_DATA_RULES).toMatch(/never "safe"/);
    expect(COACH_DATA_RULES).toMatch(/"on track" as reassurance/);
  });
  it("admits it can't see how a label was worked out", () => {
    expect(COACH_DATA_RULES).toMatch(/can't see the calculation/);
  });
  it("asks for match timing before an after-weigh-in plan", () => {
    expect(COACH_DATA_RULES).toMatch(/time to the first or next match/);
  });
});
