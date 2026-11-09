import { describe, expect, it } from "vitest";
import { canShowTodayScale, getTodayScale, targetLabelLeftPct } from "../today-scale";

describe("getTodayScale", () => {
  it("places a weight under today's target between the target and class", () => {
    const s = getTodayScale({ weight: 160.6, weightClass: 157, target: 168, isComparable: true })!;
    expect(s.targetDelta).toBe(-7.4);
    expect(s.weightPct).toBeCloseTo(67.3, 1);
    expect(s.targetPct).toBe(0);
  });

  it("makes the weight the heavy end when it is over today's target", () => {
    const s = getTodayScale({ weight: 163.1, weightClass: 157, target: 162, isComparable: true })!;
    expect(s.targetDelta).toBe(1.1);
    expect(s.weightPct).toBe(0);
    expect(s.targetPct).toBeCloseTo(18, 0);
  });

  it("gives no over or under for a weight that isn't from this morning", () => {
    expect(getTodayScale({ weight: 160, weightClass: 157, target: 168, isComparable: false })!.targetDelta).toBeNull();
  });

  it("hides the target mark when today's target is the class", () => {
    expect(getTodayScale({ weight: 159, weightClass: 157, target: 157, isComparable: true })!.targetPct).toBeNull();
  });

  it("has no scale at or under class", () => {
    expect(getTodayScale({ weight: 157, weightClass: 157, target: 168, isComparable: true })).toBeNull();
    expect(getTodayScale({ weight: 150, weightClass: 157, target: 168, isComparable: true })).toBeNull();
  });
});

describe("targetLabelLeftPct", () => {
  it("keeps the label on the card and clear of Class", () => {
    expect(targetLabelLeftPct(0)).toBe(16);
    expect(targetLabelLeftPct(40)).toBe(40);
    expect(targetLabelLeftPct(95)).toBe(68);
  });
});

describe("canShowTodayScale", () => {
  const base = { daysUntil: 2, weighInTimePassed: false, hasLoggedWeight: true };
  it("shows for a logged weight before weigh-in", () => expect(canShowTodayScale(base)).toBe(true));
  it("hides after the scheduled weigh-in, even the same day", () => {
    expect(canShowTodayScale({ ...base, daysUntil: 0, weighInTimePassed: true })).toBe(false);
  });
  it("hides after the weigh-in day", () => expect(canShowTodayScale({ ...base, daysUntil: -1 })).toBe(false));
  it("hides when the only weight is the profile weight", () => {
    expect(canShowTodayScale({ ...base, hasLoggedWeight: false })).toBe(false);
  });
});
