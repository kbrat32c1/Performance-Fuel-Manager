import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { buildWeightChart, chartDayReadout, dayTarget, gapBridges, knownWeighIns, labelAbove } from "../weight-chart";

const today = new Date(2026, 10, 9, 8, 0);
const morning = (daysAgo: number, weight: number) => ({ date: addDays(today, -daysAgo), type: "morning", weight });
const logs = [morning(6, 170.6), morning(4, 171), morning(2, 169), morning(0, 170)];
const base = { today, logs, weightClass: 157, protocol: "2", waterLoading: true };
const fiveOut = { ...base, weighInDate: addDays(today, 5) };

describe("buildWeightChart", () => {
  it("waits for 3 morning weights", () => {
    expect(buildWeightChart({ ...fiveOut, logs: logs.slice(0, 2) })).toBeNull();
  });

  it("uses morning weights only, and leaves gaps for missed mornings", () => {
    const chart = buildWeightChart({ ...fiveOut, logs: [...logs, { date: addDays(today, -5), type: "before-bed", weight: 175 }] })!;
    expect(chart.days[1].weight).toBeNull();
    expect(chart.days[6].weight).toBe(170);
  });

  it("uses the same targets as Week", () => {
    const chart = buildWeightChart(fiveOut)!;
    expect(chart.days.slice(6).map(d => d.target)).toEqual([168, 166, 165, 163, 162, 157]);
  });

  it("is flat at walk-around in a training week and stops 5 days ahead", () => {
    const chart = buildWeightChart({ ...base, weighInDate: addDays(today, 12) })!;
    expect(chart.days).toHaveLength(12);
    expect(new Set(chart.days.map(d => d.target))).toEqual(new Set([168]));
  });

  it("drops targets from before an earlier weigh-in", () => {
    const chart = buildWeightChart({ ...fiveOut, knownWeighIns: [addDays(today, -2)] })!;
    expect(chart.days.slice(0, 5).every(d => d.target === null)).toBe(true);
    expect(chart.days[5].target).toBe(168);
  });

  it("hides a far-away class so the weights aren't flattened, and zooms in", () => {
    const chart = buildWeightChart({ ...base, weighInDate: addDays(today, 12) })!;
    expect(chart.showClass).toBe(false);
    expect(chart.min).toBeGreaterThan(157);
  });

  it("includes the class once it's close", () => {
    const chart = buildWeightChart(fiveOut)!;
    expect(chart.showClass).toBe(true);
    expect(chart.min).toBeLessThanOrEqual(157);
  });

  it("doesn't exaggerate tiny changes", () => {
    const flat = [morning(3, 168), morning(2, 168.2), morning(1, 168.1), morning(0, 168)];
    const chart = buildWeightChart({ ...base, logs: flat, weighInDate: addDays(today, 12) })!;
    expect(chart.max - chart.min).toBeGreaterThanOrEqual(6);
  });

  it("labels the first and latest weight, today's target, and checkpoints", () => {
    const chart = buildWeightChart(fiveOut)!;
    expect(chart.labels.filter(l => l.series === "weight").map(l => l.value)).toEqual([170.6, 170]);
    expect(chart.labels.filter(l => l.series === "target").map(l => l.value)).toEqual([168, 165, 162, 157]);
  });

  it("holds Gain at the class", () => {
    const chart = buildWeightChart({ ...fiveOut, protocol: "4" })!;
    expect(new Set(chart.days.map(d => d.target))).toEqual(new Set([157]));
  });
});

describe("chartDayReadout", () => {
  const day = { date: new Date(2026, 10, 7), isToday: false, isFuture: false };

  it("compares a logged day", () => {
    expect(chartDayReadout({ ...day, weight: 169.6, target: 168 })).toBe("Sat: weighed 169.6 · target 168 · 1.6 over");
    expect(chartDayReadout({ ...day, weight: 167, target: 168 })).toBe("Sat: weighed 167.0 · target 168 · 1.0 under");
    expect(chartDayReadout({ ...day, weight: 168, target: 168 })).toBe("Sat: weighed 168.0 · target 168 · on target");
  });
  it("says when a morning was missed", () => {
    expect(chartDayReadout({ ...day, weight: null, target: 168 })).toBe("Sat: no morning weight · target 168");
  });
  it("handles today, the future and unknown targets", () => {
    expect(chartDayReadout({ ...day, isToday: true, weight: null, target: 168 })).toBe("Today: no morning weight yet · target 168");
    expect(chartDayReadout({ ...day, isFuture: true, weight: null, target: 165 })).toBe("Sat: target 165");
    expect(chartDayReadout({ ...day, weight: 169.6, target: null })).toBe("Sat: weighed 169.6");
  });
});

describe("gapBridges", () => {
  it("connects across missed mornings only", () => {
    expect(gapBridges([170, null, null, 169, 168, null, 167])).toEqual([[0, 3], [4, 6]]);
  });
  it("adds nothing when every morning is logged or at the ends", () => {
    expect(gapBridges([170, 169, 168])).toEqual([]);
    expect(gapBridges([null, 170, 169, null])).toEqual([]);
  });
});

describe("labelAbove", () => {
  it("splits a weight and target at the same value", () => {
    expect(labelAbove({ series: "weight", value: 168 }, 168, 157)).toBe(true);
    expect(labelAbove({ series: "target", value: 168 }, 168, 157)).toBe(false);
  });
  it("puts the higher number on top", () => {
    expect(labelAbove({ series: "weight", value: 170 }, 168, 157)).toBe(true);
    expect(labelAbove({ series: "target", value: 168 }, 170, 157)).toBe(false);
    expect(labelAbove({ series: "target", value: 168 }, 160, 157)).toBe(true);
  });
  it("keeps the class under its own line", () => {
    expect(labelAbove({ series: "target", value: 157 }, null, 157)).toBe(false);
    expect(labelAbove({ series: "target", value: 165 }, null, 157)).toBe(true);
  });
});

describe("at or below class", () => {
  const under = [morning(3, 156), morning(2, 156.5), morning(1, 155.8), morning(0, 155.5)];
  it("still draws the chart", () => {
    expect(buildWeightChart({ ...fiveOut, logs: under })).not.toBeNull();
  });
  it("still draws it for a Gain athlete below their goal", () => {
    expect(buildWeightChart({ ...base, logs: under, protocol: "4", weighInDate: addDays(today, 12) })).not.toBeNull();
  });
});

describe("dayTarget", () => {
  it("matches the chart's targets", () => {
    const chart = buildWeightChart(fiveOut)!;
    for (const d of chart.days) expect(dayTarget(d.date, fiveOut)).toBe(d.target);
  });
  it("is blank on and before an earlier weigh-in", () => {
    const input = { ...fiveOut, knownWeighIns: [addDays(today, -2)] };
    expect(dayTarget(addDays(today, -2), input)).toBeNull();
    expect(dayTarget(addDays(today, -1), input)).toBe(168);
  });
});

describe("knownWeighIns", () => {
  it("uses official weigh-ins and the last day of team events, skipping events the athlete skipped", () => {
    const team = { skipped: ["b"], events: [{ id: "a", eventDate: "2026-11-01", days: 2 }, { id: "b", eventDate: "2026-11-05", days: 1 }] };
    const dates = knownWeighIns([{ date: "2026-10-20T12:00:00Z", type: "weigh-in" }, { date: "2026-10-21T12:00:00Z", type: "morning" }], team);
    expect(dates).toHaveLength(2);
    expect(dates[1].getDate()).toBe(2);
  });
  it("works with no team", () => expect(knownWeighIns([], null)).toEqual([]));
});
