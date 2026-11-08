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

  it("keeps one comparable weight per day: morning, or the official weigh-in", () => {
    const t = buildWeightTrend({
      end,
      logs: [
        { date: at(7, 15), weight: 146, type: "pre-practice" },   // not comparable
        { date: at(7, 6), weight: 145.4, type: "morning" },
        { date: at(6, 17), weight: 143.5, type: "post-practice" }, // not comparable
        { date: at(6, 6), weight: 146.1, type: "morning" },
        { date: at(5, 6), weight: 146.9, type: "morning" },
        { date: at(5, 7), weight: 146.5, type: "weigh-in" },       // official wins that day
        { date: new Date(2026, 9, 31, 6), weight: 149, type: "morning" }, // outside the window
      ],
    });
    expect(t.points.map(p => [p.day, p.weight, p.timing])).toEqual([
      [4, 146.5, "weigh-in"],
      [5, 146.1, "morning"],
      [6, 145.4, "morning"],
    ]);
    expect(t.enoughForChart).toBe(true);
  });

  it("needs 3 days of weights for a chart", () => {
    const t = buildWeightTrend({
      end,
      logs: [{ date: at(6, 6), weight: 146.1, type: "morning" }, { date: at(7, 6), weight: 145.4, type: "morning" }],
    });
    expect(t.points).toHaveLength(2);
    expect(t.enoughForChart).toBe(false);
  });

  it("has no target unless an approved one is passed", () => {
    expect(buildWeightTrend({ end, logs: [] }).approvedTarget).toBeNull();
    expect(buildWeightTrend({ end, logs: [], approvedTarget: 146 }).approvedTarget).toBe(146);
  });

  it("pads the scale to at least 2 lbs around the data", () => {
    const t = buildWeightTrend({ end, logs: [{ date: at(7, 6), weight: 145.4, type: "morning" }] });
    expect(t.max - t.min).toBeGreaterThanOrEqual(2);
    expect(t.min).toBeLessThan(145.4);
    expect(t.max).toBeGreaterThan(145.4);
  });
});
