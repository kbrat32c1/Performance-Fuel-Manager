import { describe, it, expect } from "vitest";
import { COACH_SAFETY_RULES, formatCoachInsights } from "../../../../api/_coach-insights";

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
    }, clean);
    expect(out).toContain("Weight to lose: 4.0 lbs");
    expect(out).toContain("PROJECTION CONFIDENCE LOW");
    expect(out).toContain("Not enough weigh-in pairs yet");
    expect(out).not.toContain("Projected weigh-in weight");
    expect(out).not.toContain("2 extra");
  });

  it("passes projections through when they rest on enough pairs", () => {
    const out = formatCoachInsights({ projectedWeight: "157.2", isOnTrack: true, projectionReliable: true }, clean);
    expect(out).toContain("Projected weigh-in weight: 157.2 lbs");
    expect(out).toContain("On track: yes");
    expect(out).not.toContain("CONFIDENCE LOW");
  });

  it("sanitizes values from the client", () => {
    expect(formatCoachInsights({ weightToLose: "<b>`x`</b>", projectionReliable: true }, clean)).not.toMatch(/[`<>]/);
  });
});
