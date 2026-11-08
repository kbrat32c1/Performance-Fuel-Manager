/**
 * Seven-day weight trend for the Today screen.
 *
 * Shows only weights the athlete logged, each labelled with its timing. A plan line is
 * drawn only from the athlete's own descent plan (the certified NCAA line), and today's
 * target only when an official weigh-in is set. Nothing here projects or draws a line
 * down to the class weight.
 */

export type TrendTiming = 'morning' | 'pre-practice' | 'post-practice' | 'before-bed' | 'weigh-in';

export const TIMING_LABEL: Record<TrendTiming, string> = {
  'morning': 'Morning',
  'pre-practice': 'Pre-practice',
  'post-practice': 'Post-practice',
  'before-bed': 'Before bed',
  'weigh-in': 'Official weigh-in',
};

const TIMINGS = new Set<string>(Object.keys(TIMING_LABEL));

export interface TrendDay {
  key: string;      // yyyy-MM-dd
  label: string;    // "Mon"
  isToday: boolean;
}

export interface TrendPoint {
  day: number;      // index into days
  weight: number;
  timing: TrendTiming;
  /** Time of day, used to order points inside a day. */
  at: number;
}

export interface TrendInput {
  logs: { date: Date | string; weight: number; type: string }[];
  /** The day the trend ends on (today, or the demo date). */
  end: Date;
  /** Lowest allowed weight per day from the athlete's descent plan, keyed yyyy-MM-dd. */
  descentAllowed?: Record<string, number>;
  /** Today's morning target, only when an official weigh-in is set. */
  todayTarget?: number | null;
}

export interface WeightTrend {
  days: TrendDay[];
  points: TrendPoint[];
  timings: TrendTiming[];
  /** Descent plan line, one value per day it covers. Empty when it is far below the weights. */
  planLine: { day: number; weight: number }[];
  /** Today's lowest allowed weight when the plan line is too far below the weights to draw. */
  planOffChart: number | null;
  todayTarget: number | null;
  hasTarget: boolean;
  min: number;
  max: number;
}

/** Draw the descent plan only within this many pounds below the lowest logged weight. */
export const PLAN_DRAW_RANGE = 5;

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

  const points: TrendPoint[] = [];
  for (const log of input.logs) {
    if (!TIMINGS.has(log.type) || !(log.weight > 0)) continue;
    const date = new Date(log.date);
    const day = index.get(localKey(date));
    if (day === undefined) continue;
    points.push({ day, weight: log.weight, timing: log.type as TrendTiming, at: date.getHours() * 60 + date.getMinutes() });
  }
  points.sort((a, b) => a.day - b.day || a.at - b.at);

  const planLine: { day: number; weight: number }[] = [];
  if (input.descentAllowed) {
    days.forEach((d, i) => {
      const w = input.descentAllowed![d.key];
      if (w != null) planLine.push({ day: i, weight: w });
    });
  }

  // A plan line far under the weights would squash them into a flat line; state it instead.
  let planOffChart: number | null = null;
  if (planLine.length && points.length) {
    const lowestWeight = Math.min(...points.map(p => p.weight));
    if (Math.min(...planLine.map(p => p.weight)) < lowestWeight - PLAN_DRAW_RANGE) {
      planOffChart = planLine[planLine.length - 1].weight;
      planLine.length = 0;
    }
  }

  const todayTarget = input.todayTarget != null && input.todayTarget > 0 ? input.todayTarget : null;
  const values = [...points.map(p => p.weight), ...planLine.map(p => p.weight), ...(todayTarget != null ? [todayTarget] : [])];
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  // At least a 2 lb window so small changes don't look like cliffs.
  const spread = Math.max(2, hi - lo);
  const mid = (hi + lo) / 2;

  const order: TrendTiming[] = ['morning', 'pre-practice', 'post-practice', 'before-bed', 'weigh-in'];
  return {
    days,
    points,
    timings: order.filter(t => points.some(p => p.timing === t)),
    planLine,
    planOffChart,
    todayTarget,
    hasTarget: planLine.length > 0 || planOffChart != null || todayTarget != null,
    min: Math.floor((mid - spread / 2 - 0.5) * 2) / 2,
    max: Math.ceil((mid + spread / 2 + 0.5) * 2) / 2,
  };
}
