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
  /** Which morning preCutWeight came from: 2 = two days out (preferred), 1 = the day before */
  preCutDaysOut: 1 | 2 | null;
  /** Date of that morning */
  preCutDate: Date | null;
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
  const twoOut = morningOn(logs, addDays(day, -2));
  const oneOut = twoOut ? undefined : morningOn(logs, addDays(day, -1));
  const preCut = twoOut ?? oneOut;
  const preCutWeight = preCut ? preCut.weight : null;
  const preCutDaysOut: MeetDayWater["preCutDaysOut"] = twoOut ? 2 : oneOut ? 1 : null;
  const preCutDate = preCut ? new Date(preCut.date) : null;

  if (preCutWeight !== null) {
    // A known baseline wins even when it shows no drop: no water cut means nothing to drink back.
    const lbs = Math.max(0, preCutWeight - weighInWeight);
    const pct = lbs / preCutWeight;
    return {
      weighInWeight, weighInSource, preCutWeight, preCutDaysOut, preCutDate,
      lbsToRecover: Math.round(lbs * 10) / 10,
      estimated: false,
      cutPct: pct,
      overSafeCut: pct > WATER_CUT_SAFE_PCT + 0.001,
    };
  }

  return {
    weighInWeight, weighInSource, preCutWeight, preCutDaysOut, preCutDate,
    lbsToRecover: Math.round(weightClass * WATER_CUT_SAFE_PCT * 10) / 10,
    estimated: true,
    cutPct: null,
    overSafeCut: false,
  };
}
