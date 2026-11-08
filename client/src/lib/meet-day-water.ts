import { addDays, isSameDay, startOfDay } from "date-fns";
import type { WeightLog } from "./stores/types";

/**
 * A good cut drops only the last ~3% as water, in the final two days
 * (restriction two days out, sips the day before). That water is what the
 * athlete drinks back after weigh-in — not fat or food weight lost earlier.
 */
export const WATER_CUT_SAFE_PCT = 0.03;

export interface MeetDayWater {
  /** Weight on the scale at weigh-in */
  weighInWeight: number;
  /** Where weighInWeight came from */
  weighInSource: "entered" | "logged" | "class";
  /** Morning weight before the water cut, if logged */
  preCutWeight: number | null;
  /** Water to drink back, lbs */
  lbsToRecover: number;
  /** True when lbsToRecover is the 3% estimate (no pre-cut weight logged) */
  estimated: boolean;
  /** Water cut as a share of pre-cut weight (null when estimated) */
  cutPct: number | null;
  /** Water cut was more than 3% */
  overSafeCut: boolean;
}

function morningOn(logs: WeightLog[], day: Date): WeightLog | undefined {
  return logs
    .filter(l => l.type === "morning" && isSameDay(new Date(l.date), day))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

export function getMeetDayWater(opts: {
  logs: WeightLog[];
  weighInDate: Date;
  weightClass: number;
  enteredWeight?: number | null;
}): MeetDayWater {
  const { logs, weightClass, enteredWeight } = opts;
  const day = startOfDay(new Date(opts.weighInDate));

  const loggedWeighIn = logs
    .filter(l => l.type === "weigh-in" && isSameDay(new Date(l.date), day))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  let weighInWeight = weightClass;
  let weighInSource: MeetDayWater["weighInSource"] = "class";
  if (enteredWeight && enteredWeight > 0) {
    weighInWeight = enteredWeight;
    weighInSource = "entered";
  } else if (loggedWeighIn) {
    weighInWeight = loggedWeighIn.weight;
    weighInSource = "logged";
  }

  // Morning two days out is before any water restriction; fall back to the day before.
  const preCut = morningOn(logs, addDays(day, -2)) ?? morningOn(logs, addDays(day, -1));
  const preCutWeight = preCut ? preCut.weight : null;

  if (preCutWeight !== null && preCutWeight > weighInWeight) {
    const lbs = preCutWeight - weighInWeight;
    const pct = lbs / preCutWeight;
    return {
      weighInWeight, weighInSource, preCutWeight,
      lbsToRecover: Math.round(lbs * 10) / 10,
      estimated: false,
      cutPct: pct,
      overSafeCut: pct > WATER_CUT_SAFE_PCT + 0.001,
    };
  }

  return {
    weighInWeight, weighInSource, preCutWeight,
    lbsToRecover: Math.round(weightClass * WATER_CUT_SAFE_PCT * 10) / 10,
    estimated: true,
    cutPct: null,
    overSafeCut: false,
  };
}
