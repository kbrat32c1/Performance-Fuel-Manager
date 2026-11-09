import { describe, it, expect } from "vitest";
import { displayRecoveryScore, healthDateToShow, withDisplayRecovery, recoverySourceOf } from "../recovery-display";
import { computeBaselines } from "../recovery-baselines";
import { computeRecoveryScoreDetailed } from "../healthkit-service";
import type { DbHealthData } from "../supabase";

const day = (date: string, extra: Partial<DbHealthData>): DbHealthData =>
  ({ date, hrv: 70, resting_heart_rate: 52, sleep_hours: 7.5, sleep_score: 80, respiratory_rate: 14,
     recovery_score: 12, source: "v5-direct", ...extra } as DbHealthData);

const history = [
  day("2026-11-07", { hrv: 60 }),
  ...Array.from({ length: 10 }, (_, i) => day(`2026-10-${String(28 - i).padStart(2, "0")}`, { hrv: 70 + (i % 3) })),
];

describe("one recovery score per day", () => {
  it("matches the card's own calculation for non-WHOOP days, ignoring the stale stored number", () => {
    const b = computeBaselines(history, "2026-11-07");
    const card = computeRecoveryScoreDetailed({
      hrv: 60, restingHeartRate: 52, sleepHours: 7.5, sleepScore: 80, respiratoryRate: 14,
      baselines: { hrv: b.hrv, restingHeartRate: b.restingHeartRate, sleepScore: b.sleepScore, sleepHours: b.sleepHours, respiratoryRate: b.respiratoryRate },
    }).score;
    expect(displayRecoveryScore(history[0], history)).toBe(card);
    expect(withDisplayRecovery(history)[0].recovery_score).toBe(card);
    expect(card).not.toBe(12);
  });

  it("keeps WHOOP's own score on WHOOP days", () => {
    const whoop = day("2026-11-07", { source: "whoop" as DbHealthData["source"], recovery_score: 67 });
    expect(displayRecoveryScore(whoop, [whoop, ...history.slice(1)])).toBe(67);
  });
});

describe("healthDateToShow", () => {
  const dates = { calendarDate: "2026-11-08", healthDay: "2026-11-07" };
  it("uses today's row once the night has synced, even before the wake-up day moves", () => {
    expect(healthDateToShow([{ date: "2026-11-08" }, { date: "2026-11-07" }], { viewedDate: null, ...dates })).toBe("2026-11-08");
  });
  it("stays on the wake-up day until today has a row", () => {
    expect(healthDateToShow([{ date: "2026-11-07" }], { viewedDate: null, ...dates })).toBe("2026-11-07");
  });
  it("a past day being viewed always wins", () => {
    expect(healthDateToShow([{ date: "2026-11-08" }], { viewedDate: "2026-11-05", ...dates })).toBe("2026-11-05");
  });
});

describe("who calculated a day's score", () => {
  const base = { date: "2026-11-09", hrv: 50, resting_heart_rate: 55, sleep_hours: 8, sleep_score: 80 } as any;

  it("is WHOOP when WHOOP scored the day", () => {
    expect(recoverySourceOf({ source: "whoop", recovery_score: 70 } as any)).toBe("whoop");
  });
  it("is SPAR for a WHOOP day still waiting on its score", () => {
    const [day] = withDisplayRecovery([{ ...base, source: "whoop", recovery_score: null }]);
    expect(day.recovery_score).not.toBeNull();
    expect(day.scoreSource).toBe("spar");
  });
  it("is SPAR for other sources", () => {
    expect(recoverySourceOf({ source: "v5-direct", recovery_score: 70 } as any)).toBe("spar");
  });
});
