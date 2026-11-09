/**
 * The Today chart: what an athlete weighed each morning, what they should have weighed,
 * and the weight class. Pure, so the odd weeks can be tested.
 */
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { calculateTargetWeight, PROTOCOLS } from "@/lib/constants";

export interface ChartDay {
  date: Date;
  /** Morning or official weigh-in. Null if none was logged; the line shows a gap. */
  weight: number | null;
  /** Null when the target can't be known, such as before an earlier weigh-in. */
  target: number | null;
  isToday: boolean;
  isFuture: boolean;
}

export interface ChartLabel {
  index: number;
  series: 'weight' | 'target';
  value: number;
}

export interface WeightChart {
  days: ChartDay[];
  labels: ChartLabel[];
  todayIndex: number;
  min: number;
  max: number;
  /** False when the class is so far below that showing it would flatten the weights. */
  showClass: boolean;
}

export interface WeightChartInput {
  today: Date;
  logs: { date: Date | string; type: string; weight: number }[];
  weighInDate: Date;
  weightClass: number;
  protocol: string;
  waterLoading: boolean;
  /** Earlier weigh-ins the app knows about. Targets before them belong to another week. */
  knownWeighIns?: Date[];
}

const DAYS_BACK = 6;
const DAYS_AHEAD = 5;
const MIN_MORNING_WEIGHTS = 3;
const MIN_SPAN_LBS = 6;
/** How far below the lowest number the class line can sit before it flattens the chart. */
const MAX_CLASS_GAP_LBS = 8;

const round1 = (n: number) => Math.round(n * 10) / 10;

function targetFor(day: Date, input: WeightChartInput): number {
  if (input.protocol === PROTOCOLS.GAIN) return input.weightClass;
  const daysOut = differenceInCalendarDays(input.weighInDate, day);
  return calculateTargetWeight(input.weightClass, daysOut, input.protocol, input.waterLoading).base;
}

/** The chart for today, or null until there's enough to be worth drawing. */
export function buildWeightChart(input: WeightChartInput): WeightChart | null {
  const today = startOfDay(input.today);
  const weighIn = startOfDay(input.weighInDate);
  const daysAhead = Math.min(DAYS_AHEAD, Math.max(0, differenceInCalendarDays(weighIn, today)));

  const morningByDay = new Map<string, number>();
  for (const log of input.logs) {
    if (log.type !== 'morning' && log.type !== 'weigh-in') continue;
    const key = format(new Date(log.date), 'yyyy-MM-dd');
    if (log.type === 'morning' || !morningByDay.has(key)) morningByDay.set(key, log.weight);
  }

  // Days up to and including an earlier weigh-in were aiming at that one, not the next.
  const lastEarlierWeighIn = (input.knownWeighIns ?? [])
    .map(d => startOfDay(d))
    .filter(d => d < today)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const days: ChartDay[] = [];
  for (let offset = -DAYS_BACK; offset <= daysAhead; offset++) {
    const date = addDays(today, offset);
    const beforeThisCycle = !!lastEarlierWeighIn && date <= lastEarlierWeighIn;
    days.push({
      date,
      weight: offset <= 0 ? morningByDay.get(format(date, 'yyyy-MM-dd')) ?? null : null,
      target: beforeThisCycle ? null : targetFor(date, input),
      isToday: offset === 0,
      isFuture: offset > 0,
    });
  }

  if (days.filter(d => d.weight !== null).length < MIN_MORNING_WEIGHTS) return null;

  const numbers = days.flatMap(d => [d.weight, d.target]).filter((n): n is number => n !== null);
  let min = Math.min(...numbers);
  let max = Math.max(...numbers);
  const showClass = min - input.weightClass <= MAX_CLASS_GAP_LBS;
  if (showClass) min = Math.min(min, input.weightClass);
  if (max - min < MIN_SPAN_LBS) {
    const pad = (MIN_SPAN_LBS - (max - min)) / 2;
    min -= pad;
    max += pad;
  }

  const todayIndex = DAYS_BACK;
  const weighed = days.map((d, i) => (d.weight !== null ? i : -1)).filter(i => i >= 0);
  const firstWeighed = weighed[0];
  const lastWeighed = weighed[weighed.length - 1];

  const labels: ChartLabel[] = [
    { index: firstWeighed, series: 'weight', value: days[firstWeighed].weight as number },
  ];
  if (lastWeighed !== firstWeighed) {
    labels.push({ index: lastWeighed, series: 'weight', value: days[lastWeighed].weight as number });
  }
  if (days[todayIndex].target !== null) {
    labels.push({ index: todayIndex, series: 'target', value: days[todayIndex].target as number });
  }
  // The checkpoints from the weekly plan, 3 and 1 days out, and the weigh-in itself.
  for (const daysOut of [3, 1, 0]) {
    const index = todayIndex + differenceInCalendarDays(weighIn, today) - daysOut;
    if (index > todayIndex && index < days.length && days[index].target !== null) {
      labels.push({ index, series: 'target', value: days[index].target as number });
    }
  }

  return { days, labels, todayIndex, min, max, showClass };
}

/** Pairs of neighboring weigh-ins with missed mornings between them. No day in between gets a value. */
export function gapBridges(values: (number | null)[]): [number, number][] {
  const present = values.map((v, i) => (v !== null ? i : -1)).filter(i => i >= 0);
  const bridges: [number, number][] = [];
  for (let n = 1; n < present.length; n++) {
    if (present[n] - present[n - 1] > 1) bridges.push([present[n - 1], present[n]]);
  }
  return bridges;
}

/** One line of text for the selected day. */
export function chartDayReadout(day: ChartDay): string {
  const name = day.isToday ? 'Today' : format(day.date, 'EEE');
  if (day.isFuture) return `${name}: target ${day.target}`;
  if (day.weight === null) {
    const none = day.isToday ? 'no morning weight yet' : 'no morning weight';
    return day.target === null ? `${name}: ${none}` : `${name}: ${none} · target ${day.target}`;
  }
  if (day.target === null) return `${name}: weighed ${day.weight.toFixed(1)}`;
  const diff = round1(day.weight - day.target);
  const gap = Math.abs(diff) < 0.05 ? 'on target' : `${Math.abs(diff).toFixed(1)} ${diff > 0 ? 'over' : 'under'}`;
  return `${name}: weighed ${day.weight.toFixed(1)} · target ${day.target} · ${gap}`;
}
