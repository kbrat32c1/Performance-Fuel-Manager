/**
 * What the AI coach gets to know about one athlete: facts from their own logs,
 * built here so both coach entry points send the same thing.
 */
import { format } from "date-fns";
import type { FoodLogEntry, WeightLog } from "@/lib/stores/types";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { DbHealthData } from "@/lib/supabase";
import { displayRecoveryScore } from "@/lib/recovery-display";
import {
  DRIFT_GAIN_LIMIT, DRIFT_LOSS_LIMIT, PRACTICE_GAIN_LIMIT, PRACTICE_LOSS_LIMIT,
} from "@/lib/stores/week-descent-calculator";

export interface WeightPair { date: string; from: number; to: number; change: number }

export interface AthleteSnapshot {
  weighInTime: string | null;
  hoursUntilWeighIn: number | null;
  minutesToFirstMatch: number | null;
  bodyFatPercent: number | null;
  foodToday: { name: string; meal: string | null; amount: string }[];
  overnightPairs: WeightPair[];
  practicePairs: WeightPair[];
  recentHealth: { date: string; sleepHours: number | null; recovery: number | null; source: string | null }[];
}

const MAX_PAIRS = 8;
const MAX_FOODS = 20;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Hours from now to the weigh-in at its actual time. Null if none is set or it has passed. */
export function hoursUntilWeighIn(
  weighInDate: Date | string | null | undefined,
  weighInTime: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!weighInDate) return null;
  const at = new Date(weighInDate);
  if (isNaN(at.getTime())) return null;
  const [h, m] = (weighInTime || "07:00").split(":").map(Number);
  at.setHours(h || 0, m || 0, 0, 0);
  const hours = (at.getTime() - now.getTime()) / 3_600_000;
  return hours < 0 ? null : round1(hours);
}

/** The athlete's own estimate from Meet Day, only when competition is close enough to matter. */
export function readMinutesToFirstMatch(daysUntil: number, recoveryMode: string | null): number | null {
  if (daysUntil > 1 && (!recoveryMode || recoveryMode === "idle")) return null;
  try {
    const minutes = parseInt(localStorage.getItem(STORAGE_KEYS.COMP_TIME_TO_MATCH) || "", 10);
    return minutes > 0 ? minutes : null;
  } catch {
    return null;
  }
}

/** Real before/after readings, using the same pairing rules and typo limits as Cut Lab. */
export function weightPairs(logs: WeightLog[]): { overnight: WeightPair[]; practice: WeightPair[] } {
  const sorted = [...logs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const overnight: WeightPair[] = [];
  const practice: WeightPair[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const hours = (new Date(cur.date).getTime() - new Date(prev.date).getTime()) / 3_600_000;
    const loss = prev.weight - cur.weight;
    const pair = { date: format(new Date(cur.date), "M/d"), from: prev.weight, to: cur.weight, change: round1(-loss) };
    if (cur.type === "morning" && (prev.type === "before-bed" || prev.type === "post-practice")
      && hours > 4 && hours < 16 && loss >= -DRIFT_GAIN_LIMIT && loss <= DRIFT_LOSS_LIMIT) {
      overnight.push(pair);
    } else if (cur.type === "post-practice" && prev.type === "pre-practice"
      && hours < 6 && loss >= -PRACTICE_GAIN_LIMIT && loss <= PRACTICE_LOSS_LIMIT) {
      practice.push(pair);
    }
  }
  return { overnight: overnight.slice(-MAX_PAIRS), practice: practice.slice(-MAX_PAIRS) };
}

function foodAmount(e: FoodLogEntry): string {
  if (e.mode === "sugar") return `${e.amount ?? 0} g ${e.macroType ?? ""}`.trim();
  return `${e.sliceCount ?? 1} ${e.sliceType ?? ""} portion`.trim();
}

export function buildAthleteSnapshot(input: {
  logs: WeightLog[];
  foodLog?: FoodLogEntry[];
  health?: DbHealthData[];
  bodyFatPercent?: number | null;
  weighInDate?: Date | string | null;
  weighInTime?: string | null;
  weighInCleared?: boolean;
  minutesToFirstMatch?: number | null;
  now?: Date;
}): AthleteSnapshot {
  const { overnight, practice } = weightPairs(input.logs);
  const today = format(input.now ?? new Date(), "yyyy-MM-dd");
  return {
    weighInTime: input.weighInCleared ? null : input.weighInTime ?? null,
    hoursUntilWeighIn: input.weighInCleared ? null : hoursUntilWeighIn(input.weighInDate, input.weighInTime, input.now),
    minutesToFirstMatch: input.minutesToFirstMatch ?? null,
    bodyFatPercent: input.bodyFatPercent && input.bodyFatPercent > 0 ? input.bodyFatPercent : null,
    foodToday: (input.foodLog ?? []).slice(-MAX_FOODS).map(e => ({
      name: e.name.slice(0, 60), meal: e.mealSection ?? null, amount: foodAmount(e),
    })),
    overnightPairs: overnight,
    practicePairs: practice,
    recentHealth: (input.health ?? []).filter(h => h.date <= today).slice(0, 3).map(h => ({
      date: h.date, sleepHours: h.sleep_hours, recovery: displayRecoveryScore(h, input.health ?? []), source: h.source ?? null,
    })),
  };
}

/** Shown when a coach request fails. Never sent back to the coach as if it had said it. */
export const COACH_REPLY_FAILED = "Sorry, I couldn't process that. Try again?";

/** The most recent exchanges to send with a question, so the coach can follow the conversation. */
export function coachHistory(
  messages: { role: string; content: string }[],
  opener?: { question: string; answer: string } | null,
): { role: "user" | "assistant"; content: string }[] {
  const said = messages.filter(m => (m.role === "user" || m.role === "assistant") && m.content !== COACH_REPLY_FAILED);
  const turns = [
    ...(opener ? [{ role: "user", content: opener.question }, { role: "assistant", content: opener.answer }] : []),
    ...said,
  ].slice(-6) as { role: "user" | "assistant"; content: string }[];
  // The conversation sent to the model has to start with the athlete.
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}
