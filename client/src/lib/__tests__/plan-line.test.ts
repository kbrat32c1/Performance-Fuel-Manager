import { describe, expect, it } from "vitest";
import { planExplanation, planTiming } from "../plan-line";

describe("planTiming", () => {
  it("replaces Training with days out", () => expect(planTiming(6, "Training")).toBe("6 days out"));
  it("keeps the stage in a cut week", () => expect(planTiming(3, "Water Load")).toBe("3 days out · water load"));
  it("uses the singular for one day", () => expect(planTiming(1, "Water Cut")).toBe("1 day out · water cut"));
  it("shows competition day and recovery alone", () => {
    expect(planTiming(0, "Competition Day")).toBe("Competition day");
    expect(planTiming(-1, "Recovery")).toBe("Recovery");
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
