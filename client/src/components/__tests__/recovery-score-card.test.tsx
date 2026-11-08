import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecoveryScoreCard } from "../dashboard/recovery-score-card";
import type { DbHealthData } from "@/lib/supabase";

const day = (date: string, extra: Partial<DbHealthData> = {}): DbHealthData =>
  ({ date, hrv: 62, resting_heart_rate: 51, sleep_hours: 7.5, sleep_score: 80, respiratory_rate: 14,
     recovery_score: null, source: "v5-direct", ...extra } as DbHealthData);

describe("RecoveryScoreCard readings", () => {
  it("shows today's value and the athlete's usual under each bar", () => {
    const history = [
      day("2026-11-07", { hrv: 48, resting_heart_rate: 58 }),
      ...Array.from({ length: 6 }, (_, i) => day(`2026-11-0${6 - i}`, { hrv: 60 + (i % 3) })),
    ];
    render(<RecoveryScoreCard latestHealth={history[0]} healthHistory={history} isStale={false} />);
    expect(screen.getByText(/^48 ms · usual \d+$/)).toBeTruthy();
    expect(screen.getByText(/^58 bpm · usual \d+$/)).toBeTruthy();
    expect(screen.getByText(/^7\.5 h/)).toBeTruthy();
  });
});
