/**
 * Seven-day weight trend for the Today screen.
 *
 * Morning weights (and official weigh-ins) only: the comparable weight each day.
 * A target line is drawn only from an approved target; the app's automatic numbers
 * (walk-around, water-load targets, the descent plan's eligible weight) are not drawn.
 * Nothing here projects or draws a line down to the class weight.
 */

export type TrendTiming = 'morning' | 'weigh-in';

export const TIMING_LABEL: Record<TrendTiming, string> = {
  'morning': 'Morning',
  'weigh-in': 'Official weigh-in',
};

export interface TrendDay {
  key: string;      // yyyy-MM-dd
  label: string;    // "Mon"
  isToday: boolean;
}

export interface TrendPoint {
  day: number;      // index into days
  weight: number;
  timing: TrendTiming;
}

export interface TrendInput {
  logs: { date: Date | string; weight: number; type: string }[];
  /** The day the trend ends on (today, or the demo date). */
  end: Date;
  /** An approved target weight, when one exists. The app has none today. */
  approvedTarget?: number | null;
}

export interface WeightTrend {
  days: TrendDay[];
  /** One point per day: the official weigh-in if there was one, else the morning weight. */
  points: TrendPoint[];
  /** Fewer than this many days with a weight: show a short list, not a chart. */
  enoughForChart: boolean;
  approvedTarget: number | null;
  min: number;
  max: number;
}

export const MIN_CHART_DAYS = 3;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
export const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function buildWeightTrend(input: TrendInput): WeightTrend {
  const days: TrendDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(input.end.getFullYear(), input.end.getMonth(), input.end.getDate() - i, 12);
    days.push({ key: localKey(d), label: DAY_NAMES[d.getDay()], isToday: i === 0 });
  }
  const index = new Map(days.map((d, i) => [d.key, i]));

  // One comparable weight per day; an official weigh-in wins over the morning weight.
  const byDay = new Map<number, TrendPoint>();
  for (const log of input.logs) {
    if ((log.type !== 'morning' && log.type !== 'weigh-in') || !(log.weight > 0)) continue;
    const day = index.get(localKey(new Date(log.date)));
    if (day === undefined) continue;
    const existing = byDay.get(day);
    if (existing && existing.timing === 'weigh-in' && log.type === 'morning') continue;
    byDay.set(day, { day, weight: log.weight, timing: log.type as TrendTiming });
  }
  const points = Array.from(byDay.values()).sort((a, b) => a.day - b.day);

  const approvedTarget = input.approvedTarget != null && input.approvedTarget > 0 ? input.approvedTarget : null;
  const values = [...points.map(p => p.weight), ...(approvedTarget != null ? [approvedTarget] : [])];
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  // At least a 2 lb window so small changes don't look like cliffs.
  const spread = Math.max(2, hi - lo);
  const mid = (hi + lo) / 2;

  return {
    days,
    points,
    enoughForChart: points.length >= MIN_CHART_DAYS,
    approvedTarget,
    min: Math.floor((mid - spread / 2 - 0.5) * 2) / 2,
    max: Math.ceil((mid + spread / 2 + 0.5) * 2) / 2,
  };
}
