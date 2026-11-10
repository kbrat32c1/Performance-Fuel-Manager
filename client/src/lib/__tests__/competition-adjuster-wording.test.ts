import { describe, expect, it } from "vitest";
import { getCompetitionCalorieAdjustment } from "../spar-competition-adjuster";

const reason = (daysUntilWeighIn: number, waterLoading = true) =>
  getCompetitionCalorieAdjustment({ currentWeight: 165, targetWeightClass: 157, daysUntilWeighIn, waterLoading } as never).reason;

describe("competition adjuster wording", () => {
  it("doesn't tell anyone to restrict water two days out", () => {
    expect(reason(2)).toMatch(/^High water/);
    expect(reason(2)).not.toMatch(/restrict/i);
  });
  it("points to the water plan the day before", () => {
    expect(reason(1)).toMatch(/^Water cut/);
    expect(reason(1)).not.toMatch(/restrict/i);
  });
  it("says nothing about water when loading is off", () => {
    expect(reason(2, false)).toBe("Final days — minimal portions");
  });
});
