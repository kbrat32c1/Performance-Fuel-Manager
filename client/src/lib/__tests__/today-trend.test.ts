import { describe, it, expect } from "vitest";
import { buildWeightTrend } from "../today-trend";

const end = new Date(2026, 10, 7, 9, 0); // Sat Nov 7
const at = (day: number, h: number) => new Date(2026, 10, day, h, 0);

describe("7-day weight trend", () => {
  it("covers the last 7 days ending today", () => {
    const t = buildWeightTrend({ logs: [], end });
    expect(t.days.map(d => d.key)).toEqual([
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07",
    ]);
    expect(t.days[6]).toMatchObject({ label: "Sat", isToday: true });
  });

  it("keeps only logged weights in the window, with their timing, in time order", () => {
    const t = buildWeightTrend({
      end,
      logs: [
        { date: at(7, 15), weight: 146, type: "pre-practice" },
        { date: at(7, 6), weight: 145.4, type: "morning" },
        { date: at(6, 17), weight: 143.5, type: "post-practice" },
        { date: at(6, 9), weight: 150, type: "check-in" },     // not a weigh-in timing
        { date: at(6, 10), weight: 150, type: "extra-before" }, // extra workouts aren't on the trend
        { date: new Date(2026, 9, 31, 6), weight: 149, type: "morning" }, // Oct 31: outside
      ],
    });
    expect(t.points.map(p => [p.day, p.weight, p.timing])).toEqual([
      [5, 143.5, "post-practice"],
      [6, 145.4, "morning"],
      [6, 146, "pre-practice"],
    ]);
    expect(t.timings).toEqual(["morning", "pre-practice", "post-practice"]);
  });

  it("has no target and no line when there is no plan and no weigh-in", () => {
    const t = buildWeightTrend({ end, logs: [{ date: at(7, 6), weight: 145, type: "morning" }] });
    expect(t.hasTarget).toBe(false);
    expect(t.planLine).toEqual([]);
    expect(t.todayTarget).toBeNull();
  });

  it("draws the descent plan only on the days it covers", () => {
    const t = buildWeightTrend({
      end, logs: [],
      descentAllowed: { "2026-11-05": 143.1, "2026-11-06": 142.9, "2026-11-07": 142.7 },
    });
    expect(t.planLine).toEqual([{ day: 4, weight: 143.1 }, { day: 5, weight: 142.9 }, { day: 6, weight: 142.7 }]);
    expect(t.hasTarget).toBe(true);
  });

  it("shows today's target as a single value, not a line", () => {
    const t = buildWeightTrend({ end, logs: [], todayTarget: 146.8 });
    expect(t.todayTarget).toBe(146.8);
    expect(t.planLine).toEqual([]);
    expect(t.hasTarget).toBe(true);
  });

  it("pads the scale to at least 2 lbs around the data", () => {
    const t = buildWeightTrend({ end, logs: [{ date: at(7, 6), weight: 145.4, type: "morning" }] });
    expect(t.max - t.min).toBeGreaterThanOrEqual(2);
    expect(t.min).toBeLessThan(145.4);
    expect(t.max).toBeGreaterThan(145.4);
  });
});

describe("7-day weight trend: descent plan far below", () => {
  it("leaves the line off the chart and states today's lowest allowed instead", () => {
    const t = buildWeightTrend({
      end,
      logs: [{ date: at(7, 6), weight: 161.4, type: "morning" }],
      descentAllowed: { "2026-11-06": 117.3, "2026-11-07": 117.1 },
    });
    expect(t.planLine).toEqual([]);
    expect(t.planOffChart).toBe(117.1);
    expect(t.hasTarget).toBe(true);
    expect(t.min).toBeGreaterThan(150);
  });

  it("draws it when it's close to the weights", () => {
    const t = buildWeightTrend({
      end,
      logs: [{ date: at(7, 6), weight: 145.4, type: "morning" }],
      descentAllowed: { "2026-11-07": 142.7 },
    });
    expect(t.planLine).toHaveLength(1);
    expect(t.planOffChart).toBeNull();
  });
});
