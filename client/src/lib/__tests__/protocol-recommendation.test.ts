import { describe, it, expect } from "vitest";
import { getProtocolRecommendation, isPreseason } from "../protocol-utils";

const NOW = new Date(2026, 10, 8, 12, 0);
const inDays = (d: number) => new Date(NOW.getTime() + d * 86400000);
// Class 133: walk-around 142.3; 12% over = 148.96
const rec = (weight: number, ctx: Parameters<typeof getProtocolRecommendation>[2] = {}) =>
  getProtocolRecommendation(weight, 133, { now: NOW, ...ctx });

describe("Extreme Cut recommendation", () => {
  it("recommends Extreme in preseason when body fat is over 12%", () => {
    expect(rec(152, { bodyFatPercent: 15, weighInDate: inDays(40) }).protocol).toBe("1");
  });

  it("never recommends Extreme in-season, even at high body fat", () => {
    const r = rec(152, { bodyFatPercent: 15, weighInDate: inDays(10) });
    expect(r.protocol).toBe("2");
    expect(r.warning).toBeUndefined();
  });

  it("does not use scale weight alone: no body fat means Rapid Cut plus a prompt for body fat", () => {
    const r = rec(152, { weighInDate: inDays(40) });
    expect(r.protocol).toBe("2");
    expect(r.warning).toMatch(/body fat/);
  });

  it("keeps Rapid Cut for a lean athlete 7%+ over class", () => {
    expect(rec(152, { bodyFatPercent: 9, weighInDate: inDays(40) }).protocol).toBe("2");
  });

  it("keeps Optimal at walk-around and Gain under class", () => {
    expect(rec(140, { bodyFatPercent: 15, weighInDate: inDays(40) }).protocol).toBe("3");
    expect(rec(130).protocol).toBe("4");
  });

  it("counts no weigh-in or one 4+ weeks out as preseason; a past date is not", () => {
    expect(isPreseason(null, NOW)).toBe(true);
    expect(isPreseason(inDays(28), NOW)).toBe(true);
    expect(isPreseason(inDays(27), NOW)).toBe(false);
    expect(isPreseason(inDays(-3), NOW)).toBe(false);
  });
});
