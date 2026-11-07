/**
 * NCAA/NWCA weight descent plan, matching TrackWrestling's "Weight Loss Plan" day by day.
 * Eligibility facts only: it never recommends a class or an amount to lose.
 *
 * Checked against TrackWrestling's own plan code (see __tests__/fixtures/trackwrestling-descent.json):
 *  1. Weekly loss = 1.5% of the assessment weight, rounded to 0.1 lb, fixed for the season.
 *  2. Each day the line drops a seventh of that, rounded to 0.1 lb, never below the certified
 *     minimum (if rounding lands under it, the minimum itself is shown).
 *  3. An official weigh-in that counts restarts the line the next day from that weight.
 *  4. An allowance on that weigh-in is taken back off, up to the amount it was over the line.
 *  5. A weigh-in below the line, or on day 2 of the same tournament, does not count.
 * Integer math throughout: weights in hundredths of a pound, weekly loss in tenths.
 */

export const NCAA_CLASSES = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285] as const;

export interface OfficialWeighIn {
  date: string;           // yyyy-MM-dd
  weight: number;         // lb
  allowance: number;      // whole pounds allowed that day (0 for most duals)
  secondDay?: boolean;    // day 2 of the same tournament as the day before
}

export interface DescentInput {
  assessmentDate: string; // yyyy-MM-dd
  initialWeight: number;  // lb, from the certification
  minimumWeight: number;  // lb, certified minimum wrestling weight
  weighIns: OfficialWeighIn[];
}

export type NotCountedReason = 'below-line' | 'second-day';

export interface DescentRow {
  date: string;
  allowed: number;        // lb, lowest weight allowed that day
  eligibleClass: number;  // lightest class open that day
  atMinimum: boolean;
  weighIn?: { weight: number; allowance: number; counted: boolean; reason?: NotCountedReason };
}

const DAY = 86_400_000;
const utc = (date: string) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY);
export const addDaysKey = (date: string, n: number) => new Date(utc(date) + n * DAY).toISOString().slice(0, 10);
const hundredths = (lb: number) => Math.round(lb * 100);

export const weeklyTenths = (initialH: number) => Math.floor((initialH * 15 + 5000) / 10000);
export const dailyThousandths = (weekly: number) => Math.floor((weekly * 200 + 7) / 14);

function lineOn(anchorH: number, daily: number, days: number, minimumH: number): number {
  const exact = Math.max(anchorH * 10 - daily * days, minimumH * 10);
  return Math.max(10 * Math.floor((exact + 50) / 100), minimumH);
}

export function classFor(weightLb: number): number | null {
  return NCAA_CLASSES.find(c => c >= weightLb - 1e-9) ?? null;
}

export function eligibleClass(allowedLb: number, minimumLb: number): number {
  const floor = classFor(minimumLb);
  const c = classFor(allowedLb) ?? NCAA_CLASSES[NCAA_CLASSES.length - 1];
  return floor !== null && c < floor ? floor : c;
}

export interface DescentPlan {
  weeklyLoss: number;     // lb per week
  minimumClass: number | null;
  rows: DescentRow[];
}

export function buildDescentPlan(input: DescentInput, through?: string): DescentPlan {
  const initialH = hundredths(input.initialWeight);
  const minimumH = hundredths(input.minimumWeight);
  const weekly = weeklyTenths(initialH);
  const daily = dailyThousandths(weekly);
  const byDate = new Map(input.weighIns.map(w => [w.date, w]));
  const last = [through, ...input.weighIns.map(w => w.date)].filter((d): d is string => !!d).sort().pop()
    ?? input.assessmentDate;

  let anchor = { date: input.assessmentDate, weight: initialH };
  const rows: DescentRow[] = [];
  for (let date = input.assessmentDate; date <= last; date = addDaysKey(date, 1)) {
    const days = daysBetween(anchor.date, date);
    const allowedH = lineOn(anchor.weight, daily, days, minimumH);
    const allowed = allowedH / 100;
    const row: DescentRow = {
      date,
      allowed,
      eligibleClass: eligibleClass(allowed, input.minimumWeight),
      atMinimum: anchor.weight * 10 - daily * days <= minimumH * 10,
    };
    const w = date !== input.assessmentDate ? byDate.get(date) : undefined;
    if (w) {
      const weightH = hundredths(w.weight);
      const reason: NotCountedReason | undefined = w.secondDay ? 'second-day' : weightH < allowedH ? 'below-line' : undefined;
      row.weighIn = { weight: w.weight, allowance: w.allowance, counted: !reason, reason };
      if (!reason) {
        const over = Math.max(weightH - allowedH, 0);
        anchor = { date, weight: weightH - Math.min(over, Math.round(w.allowance) * 100) };
      }
    }
    rows.push(row);
  }
  return { weeklyLoss: weekly / 10, minimumClass: classFor(input.minimumWeight), rows };
}

export const rowOn = (plan: DescentPlan, date: string) => plan.rows.find(r => r.date === date) ?? null;

/** Preview a weigh-in without saving it. It replaces any weigh-in already on that date. */
export function whatIf(input: DescentInput, weighIn: OfficialWeighIn, through?: string): DescentPlan {
  const weighIns = [...input.weighIns.filter(w => w.date !== weighIn.date), weighIn]
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return buildDescentPlan({ ...input, weighIns }, through);
}

/** First date on or after `from` when `weightClass` is open, or null if never within the plan. */
export function firstOpenDate(plan: DescentPlan, weightClass: number, from: string): string | null {
  return plan.rows.find(r => r.date >= from && r.eligibleClass <= weightClass)?.date ?? null;
}

export type TableItem =
  | { kind: 'row'; row: DescentRow }
  | { kind: 'run'; from: string; to: string; count: number; allowed: number; eligibleClass: number };

/**
 * Once the line sits at the certified minimum, three or more quiet days in a row become one item.
 * Days `keep` returns true for (today, weigh-ins, the row being edited) always stay their own row.
 */
export function collapseFlat(rows: DescentRow[], keep: (r: DescentRow) => boolean = () => false): TableItem[] {
  const out: TableItem[] = [];
  let run: DescentRow[] = [];
  const flush = () => {
    if (run.length >= 3) {
      out.push({ kind: 'run', from: run[0].date, to: run[run.length - 1].date, count: run.length, allowed: run[0].allowed, eligibleClass: run[0].eligibleClass });
    } else {
      out.push(...run.map(row => ({ kind: 'row' as const, row })));
    }
    run = [];
  };
  for (const r of rows) {
    const flat = r.atMinimum && !r.weighIn && !keep(r);
    if (flat && (run.length === 0 || (run[0].allowed === r.allowed && run[0].eligibleClass === r.eligibleClass))) {
      run.push(r);
    } else {
      flush();
      if (flat) run.push(r); else out.push({ kind: 'row', row: r });
    }
  }
  flush();
  return out;
}

export function validateDescentInput(input: Partial<DescentInput>): string | null {
  const date = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && addDaysKey(x, 0) === x;
  const weight = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 50 && x <= 400;
  if (!date(input.assessmentDate)) return 'Enter the assessment date.';
  if (!weight(input.initialWeight)) return 'Enter the starting weight from your certification.';
  if (!weight(input.minimumWeight)) return 'Enter your certified minimum weight.';
  if (input.minimumWeight! > input.initialWeight!) return 'The minimum cannot be above the starting weight.';
  const seen = new Set<string>();
  for (const w of input.weighIns ?? []) {
    if (!date(w.date) || !weight(w.weight)) return 'Each weigh-in needs a date and a weight between 50 and 400 lb.';
    if (w.date <= input.assessmentDate!) return 'Official weigh-ins must come after the assessment date.';
    if (!Number.isInteger(w.allowance) || w.allowance < 0 || w.allowance > 5) return 'Allowance must be 0 to 5 lb.';
    if (seen.has(w.date)) return 'Enter one official weigh-in per date.';
    seen.add(w.date);
  }
  return null;
}
