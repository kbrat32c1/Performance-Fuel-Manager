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

  it("counts the overnight pair that ends on the first morning of the cycle", () => {
    // Viewing Sun Nov 8 at 6:30 AM, weigh-in Sat Nov 14: the cycle starts at midnight Nov 8.
    const sunday = { ...profile, simulatedDate: new Date(2026, 10, 8, 6, 30) } as AthleteProfile;
    const logs = [
      at(7, 10, 161.4, "morning"), at(7, 10, 163.0, "pre-practice"), at(7, 11, 160.6, "post-practice"),
      at(7, 22, 163.0, "before-bed"),
      { ...at(8, 6, 160.6, "morning", { sleepHours: 7 }), date: new Date(2026, 10, 8, 6, 18) },
    ];
    const r = computeWeekDescentData({
      profile: sunday, logs, daysUntilWeighIn: 6, calculateTarget: () => 157,
      getDailyTracking: (date: string) => ({ date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0 } as DailyTracking),
    });
    expect(r.confidence.driftSamples).toBe(1);
    expect(r.avgOvernightDrift).toBeCloseTo(2.4, 5);
    expect(r.avgDriftRateOzPerHr).toBeCloseTo(2.4 / 8.3, 3);
    // Saturday's practice is before the cycle, so it is not this cycle's pair.
    expect(r.confidence.practiceSamples).toBe(0);
  });

  it("gives season averages the same limits and per-hour rate as cycle pairs", () => {
    // All before the cycle (Nov 8-14), so these feed the season averages.
    const logs = [
      at(1, 22, 141, "before-bed"), at(2, 6, 139.5, "morning", { sleepHours: 5 }), // 1.5 lb loss over 8 h
      at(2, 22, 139, "before-bed"), at(3, 6, 139.4, "morning"),                     // 0.4 lb gain
      at(4, 15, 141, "pre-practice"), at(4, 17, 139, "post-practice", { duration: 120 }), // 2.0 lb loss
      at(5, 15, 154, "pre-practice"), at(5, 17, 139, "post-practice", { duration: 120 }), // 15 lb typo
    ];
    const r = run(logs);
    expect(r.historicalPracticeLoss).toBeCloseTo(2.0, 5);
    expect(r.historicalDrift).toBeLessThan(1.5); // the gain night counts
    expect(r.historicalDriftRate).toBeCloseTo(1.5 / 8, 5); // hours bed→morning, not sleep hours
  });
});

describe("water loading and the projection", () => {
  const thursday = new Date(2026, 10, 12, 12, 0);
  const logs = () => [...nights(12, 4, 1.4), ...practices([9, 10, 11], 2.3)];
  const project = (waterLoading: boolean) => computeWeekDescentData({
    profile: { ...profile, simulatedDate: thursday, waterLoading } as unknown as AthleteProfile,
    logs: logs(), daysUntilWeighIn: 2, calculateTarget: () => 136,
    getDailyTracking: (date: string) => ({ date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0 } as DailyTracking),
  });

  it("doesn't count full cut-day losses 2 days out while water stays high", () => {
    const on = project(true).projectedSaturday!;
    const off = project(false).projectedSaturday!;
    expect(on).toBeGreaterThan(off);
  });
});
