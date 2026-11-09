/** Numbers behind the Today header's scale. Pure, so the edge cases can be tested. */
export interface TodayScale {
  /** Weight above (+) or below (-) today's target. Null when the two can't be fairly compared. */
  targetDelta: number | null;
  /** Position on the scale, 0 at the heavy end and 100 at class. */
  weightPct: number;
  /** Null when today's target is the class itself. */
  targetPct: number | null;
}

export function getTodayScale(input: {
  weight: number;
  weightClass: number;
  target: number;
  /** Targets are morning weights, so only a morning or weigh-in reading from today compares. */
  isComparable: boolean;
}): TodayScale | null {
  const { weight, weightClass, target, isComparable } = input;
  const heavyEnd = Math.max(weight, target);
  if (!(weight > weightClass) || !(heavyEnd > weightClass)) return null;
  const pct = (w: number) => Math.min(100, Math.max(0, ((heavyEnd - w) / (heavyEnd - weightClass)) * 100));
  return {
    targetDelta: isComparable ? Math.round((weight - target) * 10) / 10 : null,
    weightPct: pct(weight),
    targetPct: target > weightClass ? pct(target) : null,
  };
}

/** Keeps the "Today's target" label on the card and clear of the "Class" label. */
export function targetLabelLeftPct(targetPct: number): number {
  return Math.min(68, Math.max(16, targetPct));
}
