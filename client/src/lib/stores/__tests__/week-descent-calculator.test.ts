import { describe, it, expect } from "vitest";
import { computeWeekDescentData } from "../week-descent-calculator";
import type { AthleteProfile, WeightLog, DailyTracking } from "../types";

// Viewing Wed Nov 11 2026; weigh-in Sat Nov 14.
const VIEW = new Date(2026, 10, 11, 12, 0);
const profile = {
  name: "Test", lastName: "", currentWeight: 140, targetWeightClass: 133,
  weighInDate: new Date(2026, 10, 14, 7, 0), simulatedDate: VIEW, protocol: "2",
} as unknown as AthleteProfile;

let id = 0;
const at = (day: number, hour: number, weight: number, type: WeightLog["type"], extra: Partial<WeightLog> = {}): WeightLog =>
  ({ id: String(++id), date: new Date(2026, 10, day, hour, 0), weight, type, ...extra });

const run = (logs: WeightLog[]) => computeWeekDescentData({
  profile, logs, daysUntilWeighIn: 3, calculateTarget: () => 136,
  getDailyTracking: (date: string) => ({ date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0 } as DailyTracking),
});

/** n nights of before-bed → morning pairs ending the morning of `lastDay`, each losing `drift`. */
const nights = (lastDay: number, n: number, drift: number, start = 140) => {
  const out: WeightLog[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = lastDay - i;
    const bed = start - (n - 1 - i) * 0.5;
    out.push(at(d - 1, 22, bed, "before-bed"), at(d, 6, bed - drift, "morning"));
  }
  return out;
};
const practices = (days: number[], loss: number) =>
  days.flatMap(d => [at(d, 15, 139, "pre-practice"), at(d, 17, 139 - loss, "post-practice", { duration: 120 })]);

describe("Cut Lab calculations", () => {
  it("shows an overnight gain as a gain, and never counts it as loss capacity", () => {
    const r = run(nights(11, 3, -0.6));
    expect(r.avgOvernightDrift).toBeLessThan(0);
    expect(r.grossDailyLoss).toBe(0);
  });

  it("does not let a practice gain add to daily loss", () => {
    const r = run([...nights(11, 3, 1.5), ...practices([8, 9, 10], -0.5)]);
    expect(r.avgPracticeLoss).toBeLessThan(0);
    expect(r.grossDailyLoss).toBeCloseTo(r.avgOvernightDrift!, 5);
  });

  it("ignores weigh-ins logged after the day being viewed", () => {
    const base = nights(11, 3, 1.2);
    const later = [at(11, 22, 150, "before-bed"), at(12, 6, 140, "morning")];
    expect(run([...base, ...later]).avgOvernightDrift).toBeCloseTo(run(base).avgOvernightDrift!, 5);
  });

  it("skips an implausible pair instead of letting it drive the average, and reports it", () => {
    // A 15 lb "practice loss" (typo) on the most recent practice
    const typo = [at(10, 15, 154, "pre-practice"), at(10, 17, 139, "post-practice", { duration: 120 })];
    const r = run([...nights(11, 3, 1.2), ...practices([8, 9], 2.5), ...typo]);
    expect(r.confidence.excludedPairs).toBe(1);
    expect(r.avgPracticeLoss).toBeCloseTo(2.5, 5);
  });

  it("is not reliable with one pair, and keeps extra work out of the make-weight odds", () => {
    const r = run([...nights(11, 1, 1.0), ...practices([10], 2)]);
    expect(r.confidence.reliable).toBe(false);
    if (r.makeWeightProb) expect(r.makeWeightProb.includesExtraWork).toBe(false);
  });

  it("is reliable with three of each", () => {
    const r = run([...nights(11, 3, 1.2), ...practices([8, 9, 10], 2.5)]);
    expect(r.confidence.reliable).toBe(true);
  });
});
