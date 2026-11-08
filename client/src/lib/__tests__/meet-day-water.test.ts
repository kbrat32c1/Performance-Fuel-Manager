import { describe, it, expect } from "vitest";
import { getMeetDayWater } from "../meet-day-water";
import type { WeightLog } from "../stores/types";

const weighIn = new Date(2026, 10, 14, 7, 0);
const log = (daysBefore: number, weight: number, type: WeightLog["type"] = "morning"): WeightLog => ({
  id: `${type}-${daysBefore}`, date: new Date(2026, 10, 14 - daysBefore, 6, 30), weight, type,
});

describe("Meet Day water to recover", () => {
  it("uses the morning two days out, not this morning's weight", () => {
    const logs = [log(7, 141), log(2, 137), log(1, 135), log(0, 133.2)];
    const r = getMeetDayWater({ logs, weighInDate: weighIn, weightClass: 133 });
    expect(r.preCutWeight).toBe(137);
    expect(r.preCutDaysOut).toBe(2);
    expect(r.lbsToRecover).toBe(4);
    expect(r.estimated).toBe(false);
    expect(r.overSafeCut).toBe(false);
  });

  it("estimates 3% of the weight class when the pre-cut morning isn't logged", () => {
    const r = getMeetDayWater({ logs: [log(0, 133)], weighInDate: weighIn, weightClass: 133 });
    expect(r.estimated).toBe(true);
    expect(r.lbsToRecover).toBe(4);
  });

  it("uses a logged weigh-in, and an entered weight over that", () => {
    const logs = [log(2, 137), log(0, 132.4, "weigh-in")];
    expect(getMeetDayWater({ logs, weighInDate: weighIn, weightClass: 133 }).lbsToRecover).toBe(4.6);
    const r = getMeetDayWater({ logs, weighInDate: weighIn, weightClass: 133, enteredWeight: 132 });
    expect(r.weighInSource).toBe("entered");
    expect(r.lbsToRecover).toBe(5);
  });

  it("shows zero, not the estimate, when the logged pre-cut weight shows no drop", () => {
    const r = getMeetDayWater({ logs: [log(2, 133)], weighInDate: weighIn, weightClass: 133 });
    expect(r.estimated).toBe(false);
    expect(r.lbsToRecover).toBe(0);
  });

  it("falls back to the morning before weigh-in and says so", () => {
    const r = getMeetDayWater({ logs: [log(1, 135)], weighInDate: weighIn, weightClass: 133 });
    expect(r.preCutDaysOut).toBe(1);
    expect(r.lbsToRecover).toBe(2);
  });

  it("flags a water cut over 3%", () => {
    const r = getMeetDayWater({ logs: [log(2, 139)], weighInDate: weighIn, weightClass: 133 });
    expect(r.lbsToRecover).toBe(6);
    expect(r.overSafeCut).toBe(true);
  });
});
