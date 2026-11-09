import { describe, expect, it } from "vitest";
import { planExplanation, planStage, stageExplanation, stageIntroFor } from "../plan-line";

describe("planStage", () => {
  it("names a normal training week", () => expect(planStage("Training")).toBe("Training"));
  it("names the stage in a cut week", () => {
    expect(planStage("Water Load")).toBe("Water load");
    expect(planStage("High Water")).toBe("High water");
  });
  it("names competition day and recovery", () => {
    expect(planStage("Competition Day")).toBe("Competition day");
    expect(planStage("Recovery")).toBe("Recovery");
  });
});

describe("planExplanation", () => {
  it("explains each weight plan", () => {
    for (const p of ["1", "2", "3", "4", "6"]) expect(planExplanation(p)).toBeTruthy();
  });
  it("makes no safety or performance promise", () => {
    for (const p of ["1", "2", "3", "4", "6"]) expect(planExplanation(p)).not.toMatch(/safe|protect|guarantee|predictabl/i);
  });
});

describe("stageExplanation", () => {
  const ctx = { protocol: "3", weightClass: 157, currentWeight: 168, waterAmount: "1.75 gal" };

  it("tells a training athlete their walk-around weight", () => {
    expect(stageExplanation("Training", ctx)).toBe("Weigh-in is more than 5 days away. Train and stay near your walk-around weight, about 168 for 157. Weigh-in prep starts 5 days out.");
  });
  it("still counts 2 lbs over as near walk-around", () => {
    expect(stageExplanation("Training", { ...ctx, currentWeight: 170 })).toMatch(/stay near/);
  });
  it("tells an athlete above it to work back down", () => {
    expect(stageExplanation("Training", { ...ctx, currentWeight: 174 })).toBe("Weigh-in is more than 5 days away. You're above your walk-around weight, so work back down to about 168 before weigh-in week.");
  });
  it("doesn't tell a Gain athlete to hold walk-around", () => {
    expect(stageExplanation("Training", { ...ctx, protocol: "4" })).toBeNull();
  });
  it("gives today's water and says loading is optional", () => {
    const text = stageExplanation("Water load", ctx);
    expect(text).toContain("1.75 gal");
    expect(text).toMatch(/optional/);
  });
  it("explains every stage the header can show", () => {
    for (const s of ["High water", "Water cut", "Comp week", "Final prep", "Competition day", "Recovery"]) {
      expect(stageExplanation(s, ctx)).toBeTruthy();
    }
    expect(stageExplanation(null, ctx)).toBeNull();
  });
});

describe("stageIntroFor", () => {
  it("shows on the first day of a stage", () => {
    expect(stageIntroFor(null, "Training", "2026-11-09")).toEqual({ show: true, stored: { stage: "Training", firstDay: "2026-11-09" } });
    expect(stageIntroFor({ stage: "Training", firstDay: "2026-11-01" }, "Water load", "2026-11-09").show).toBe(true);
  });
  it("stays up through that day, then only on tap", () => {
    const stored = { stage: "Water load", firstDay: "2026-11-09" };
    expect(stageIntroFor(stored, "Water load", "2026-11-09").show).toBe(true);
    expect(stageIntroFor(stored, "Water load", "2026-11-10")).toEqual({ show: false, stored });
  });
});
