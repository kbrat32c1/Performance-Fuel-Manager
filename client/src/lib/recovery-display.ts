import type { DbHealthData } from "./supabase";
import { computeBaselines } from "./recovery-baselines";
import { computeRecoveryScoreDetailed } from "./healthkit-service";

/**
 * The one recovery score every screen shows for a day.
 *
 * WHOOP days keep WHOOP's own score, so it matches the WHOOP app.
 * Other days use SPAR's score against the athlete's baselines as of that day,
 * so the card, its 7-day bars and the detail sheet always agree.
 */
export function isWhoopDay(h: Pick<DbHealthData, "source">): boolean {
  return (h.source as string) === "whoop";
}

export function displayRecoveryScore(h: DbHealthData, history: DbHealthData[]): number | null {
  if (isWhoopDay(h) && h.recovery_score != null) return Math.round(h.recovery_score);
  if (h.hrv == null && h.resting_heart_rate == null && h.sleep_hours == null && h.sleep_score == null) {
    return h.recovery_score != null ? Math.round(h.recovery_score) : null;
  }
  const baselines = computeBaselines(history, h.date);
  return computeRecoveryScoreDetailed({
    hrv: h.hrv,
    restingHeartRate: h.resting_heart_rate,
    sleepHours: h.sleep_hours,
    sleepScore: h.sleep_score,
    respiratoryRate: h.respiratory_rate,
    baselines: {
      hrv: baselines.hrv,
      restingHeartRate: baselines.restingHeartRate,
      sleepScore: baselines.sleepScore,
      sleepHours: baselines.sleepHours,
      respiratoryRate: baselines.respiratoryRate,
    },
  }).score;
}

/** History with recovery_score replaced by the displayed score. */
export function withDisplayRecovery(history: DbHealthData[]): DbHealthData[] {
  return history.map(h => ({ ...h, recovery_score: displayRecoveryScore(h, history) }));
}
