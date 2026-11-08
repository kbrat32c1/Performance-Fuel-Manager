import { describe, expect, it } from "vitest";
import { planExplanation, planStage } from "../plan-line";

describe("planStage", () => {
  it("shows nothing in a normal training week", () => expect(planStage("Training")).toBeNull());
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
