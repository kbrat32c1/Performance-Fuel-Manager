import { describe, it, expect } from "vitest";
import { buildAthleteSnapshot, hoursUntilWeighIn, weightPairs, coachHistory, COACH_REPLY_FAILED } from "../coach-context";
import { displayRecoveryScore } from "../recovery-display";
import type { WeightLog, FoodLogEntry } from "../stores/types";
import type { DbHealthData } from "../supabase";

const at = (day: number, hour: number, weight: number, type: WeightLog["type"]): WeightLog =>
  ({ id: `${day}-${hour}-${type}`, date: new Date(2026, 10, day, hour, 0), weight, type });
const NOW = new Date(2026, 10, 8, 12, 0);

describe("coach athlete snapshot", () => {
  it("counts hours to the athlete's actual weigh-in time, not an assumed 6 AM", () => {
    expect(hoursUntilWeighIn(new Date(2026, 10, 9, 12, 0), "16:00", NOW)).toBe(28);
    expect(hoursUntilWeighIn(new Date(2026, 10, 9, 12, 0), "06:00", NOW)).toBe(18);
    expect(hoursUntilWeighIn(new Date(2026, 10, 7, 12, 0), "06:00", NOW)).toBeNull();
  });

  it("builds real overnight and practice pairs and skips typos", () => {
    const { overnight, practice } = weightPairs([
      at(7, 15, 163, "pre-practice"), at(7, 17, 160.6, "post-practice"),
      at(7, 22, 163, "before-bed"), at(8, 6, 160.6, "morning"),
      at(8, 15, 180, "pre-practice"), at(8, 17, 160, "post-practice"), // 20 lb typo
    ]);
    expect(overnight).toEqual([{ date: "11/8", from: 163, to: 160.6, change: -2.4 }]);
    expect(practice).toEqual([{ date: "11/7", from: 163, to: 160.6, change: -2.4 }]);
  });

  it("includes what was eaten, and nothing about a cleared weigh-in", () => {
    const food: FoodLogEntry[] = [{ id: "1", name: "Chicken", timestamp: "", mode: "spar", sliceType: "protein", sliceCount: 2, mealSection: "lunch" }];
    const s = buildAthleteSnapshot({ logs: [], foodLog: food, weighInDate: new Date(2026, 10, 9), weighInTime: "07:00", weighInCleared: true, now: NOW });
    expect(s.foodToday).toEqual([{ name: "Chicken", meal: "lunch", amount: "2 protein portion" }]);
    expect(s.hoursUntilWeighIn).toBeNull();
    expect(s.weighInTime).toBeNull();
  });

  it("only sends health data up to today", () => {
    const s = buildAthleteSnapshot({ logs: [], now: NOW, health: [
      { date: "2026-11-09", sleep_hours: 8, recovery_score: 90 },
      { date: "2026-11-08", sleep_hours: 4.3, recovery_score: 41, source: "whoop" },
    ] as unknown as DbHealthData[] });
    expect(s.recentHealth).toEqual([{ date: "2026-11-08", sleepHours: 4.3, recovery: 41, source: "whoop" }]);
  });

  it("sends the same recovery score the athlete sees, not the raw stored one", () => {
    const row = { date: "2026-11-08", sleep_hours: 8, hrv: 60, resting_heart_rate: 50, sleep_score: 85, recovery_score: 12, source: "v5-direct" } as unknown as DbHealthData;
    const s = buildAthleteSnapshot({ logs: [], now: NOW, health: [row] });
    expect(s.recentHealth[0].recovery).toBe(displayRecoveryScore(row, [row]));
    expect(s.recentHealth[0].recovery).not.toBe(12);
  });
});

describe("coachHistory", () => {
  const u = (content: string) => ({ role: "user", content });
  const a = (content: string) => ({ role: "assistant", content });

  it("keeps the last six messages", () => {
    const msgs = Array.from({ length: 10 }, (_, i) => (i % 2 ? a(`a${i}`) : u(`u${i}`)));
    const h = coachHistory(msgs);
    expect(h).toHaveLength(6);
    expect(h[5].content).toBe("a9");
  });
  it("leaves out failed replies and error messages", () => {
    const h = coachHistory([u("q"), a(COACH_REPLY_FAILED), u("again"), { role: "error", content: "x" }]);
    expect(h.map(m => m.content)).toEqual(["q", "again"]);
  });
  it("always starts with the athlete", () => {
    expect(coachHistory([a("hello"), u("q")])[0].role).toBe("user");
  });
  it("includes the advice already on screen", () => {
    const h = coachHistory([u("why?")], { question: "advice please", answer: "drink water" });
    expect(h.map(m => m.content)).toEqual(["advice please", "drink water", "why?"]);
  });
});
