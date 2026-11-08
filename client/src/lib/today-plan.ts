/**
 * Today's plan — the summary at the top of the Today screen.
 *
 * Answers four questions in one place: what to do next, what today's food and
 * fluid targets are (and what's left), whether the athlete is on track, and how
 * much of that is measured versus estimated or missing.
 *
 * Pure function: every number comes from the store's existing selectors
 * (getMacroTargets, getSliceTargets, getHydrationTarget, getDailyTracking,
 * calculateTarget, getStatus, getDaysUntilWeighIn). Nothing here changes a
 * cutting-guidance number. Cut Lab projections are never used to decide status;
 * the only part of getStatus used is its weight level, and only "risk" moves the
 * status, because that level needs a large measured gap to today's target.
 */

export type PlanStatus = 'on-track' | 'data-check' | 'coach';

export type NextActionKind =
  | 'set-weigh-in'
  | 'log-morning'
  | 'log-pre-practice'
  | 'log-post-practice'
  | 'log-before-bed'
  | 'log-official'
  | 'recovery'
  | 'log-food'
  | 'none';

export interface NextAction {
  kind: NextActionKind;
  /** Short instruction, e.g. "Log your morning weight". */
  title: string;
  /** When to do it, e.g. "Now, before you eat or drink". */
  when: string;
  /** Quick-log weigh-in type to open, when the action is a weigh-in. */
  logType?: 'morning' | 'pre-practice' | 'post-practice' | 'before-bed' | 'weigh-in';
}

export interface PlanLine {
  key: string;
  label: string;
  /** e.g. "2 of 5 palms" or "40 of 120 oz". */
  progress: string;
  /** e.g. "3 left", "Done", "None today". */
  remaining: string;
  done: boolean;
}

export interface ConfidenceItem {
  label: string;
  detail: string;
}

export interface PlanFact {
  label: string;
  value: string;
}

export interface TodayPlan {
  /** Latest weight today and when it was taken. */
  current: { weight: number; timing: string } | null;
  demo: boolean;
  /** Class and days to the official weigh-in. */
  facts: PlanFact[];
  status: PlanStatus;
  headline: string;
  reason: string;
  next: NextAction;
  food: PlanLine[];
  fluid: PlanLine | null;
  /** The store's own food warning, shown word for word (e.g. the "do not eat" override). */
  foodWarning?: string;
  measured: ConfidenceItem[];
  estimated: ConfidenceItem[];
  missing: ConfidenceItem[];
}

export interface TodayPlanInput {
  /** Hour of the day (0-23), used only to order the evening weigh-in. */
  hour: number;
  protocol: string;
  /** Protocol 5: general nutrition, no official weigh-in. */
  isGeneralNutrition: boolean;
  weighInCleared: boolean;
  daysUntilWeighIn: number;
  weighInTime?: string;
  weightClass: number;
  /** Profile weight the food targets are built from. */
  profileWeight: number;
  /** calculateTarget(): today's morning target from the protocol. */
  todayTarget: number;
  /** getStatus().status, the weight level vs today's target. */
  weightLevel: 'on-track' | 'borderline' | 'risk' | string;
  isRestDay: boolean;
  trackPracticeWeighIns: boolean;
  logs: {
    morning?: number | null;
    prePractice?: number | null;
    postPractice?: number | null;
    beforeBed?: number | null;
    officialWeighIn?: number | null;
  };
  nutritionMode: 'spar' | 'sugar';
  macros: {
    carbs: { min: number; max: number };
    protein: { min: number; max: number };
    weightWarning?: string;
  };
  slices: { protein: number; carb: number; veg: number; fruit: number; fat: number } | null;
  hydration: { targetOz: number; type: string };
  tracking: {
    waterConsumed: number;
    carbsConsumed: number;
    proteinConsumed: number;
    proteinSlices: number;
    carbSlices: number;
    vegSlices: number;
    fruitSlices?: number;
    fatSlices?: number;
    foodLogCount: number;
  };
  /** Recovery or sleep data from a band, WHOOP or HealthKit for today. */
  hasRecoveryData: boolean;
  /** getWeekDescentData().confidence: whether Cut Lab has enough pairs to project from. */
  projection?: { reliable: boolean; driftSamples: number; practiceSamples: number };
  /** Latest weigh-in today, any timing, for the big number. */
  latest?: { weight: number; timing: string } | null;
  /** Settings' Demo Mode (a simulated date) is on. */
  demo?: boolean;
}

const lbs = (n: number) => `${n.toFixed(1)} lbs`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function weighInTimeLabel(time?: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

function line(key: string, label: string, done: number, target: number, unit: string, unitPlural = unit): PlanLine {
  const left = Math.max(0, Math.round((target - done) * 10) / 10);
  const isDone = done >= target;
  return {
    key,
    label,
    progress: `${Math.round(done * 10) / 10} of ${target} ${plural(target, unit, unitPlural)}`,
    remaining: isDone ? 'Done' : `${left} left`,
    done: isDone,
  };
}

/** Food lines in the athlete's mode, using the same blocking rules as the Fuel card. */
export function buildFoodLines(input: TodayPlanInput): PlanLine[] {
  const { macros, slices, tracking, nutritionMode } = input;
  const proteinBlocked = macros.protein.max === 0;
  const carbBlocked = macros.carbs.max === 0 && macros.protein.max === 0;

  if (nutritionMode === 'spar' && slices) {
    const lines: PlanLine[] = [];
    const add = (key: string, label: string, done: number, target: number, unit: string, unitPlural: string, blocked: boolean) => {
      if (blocked) {
        lines.push({ key, label, progress: 'None today', remaining: 'Per your plan', done: true });
      } else if (target > 0) {
        lines.push(line(key, label, done, target, unit, unitPlural));
      }
    };
    add('protein', 'Protein', tracking.proteinSlices, slices.protein, 'palm', 'palms', proteinBlocked);
    add('carb', 'Carbs', tracking.carbSlices, slices.carb, 'fist', 'fists', carbBlocked);
    add('veg', 'Vegetables', tracking.vegSlices, slices.veg, 'fist', 'fists', proteinBlocked);
    add('fruit', 'Fruit', tracking.fruitSlices || 0, slices.fruit, 'piece', 'pieces', false);
    add('fat', 'Fat', tracking.fatSlices || 0, slices.fat, 'thumb', 'thumbs', false);
    return lines;
  }

  const lines: PlanLine[] = [];
  if (carbBlocked) {
    lines.push({ key: 'carb', label: 'Carbs', progress: 'None today', remaining: 'Per your plan', done: true });
  } else if (macros.carbs.max > 0) {
    lines.push(line('carb', 'Carbs', tracking.carbsConsumed, macros.carbs.max, 'g'));
  }
  if (proteinBlocked) {
    lines.push({ key: 'protein', label: 'Protein', progress: 'None today', remaining: 'Per your plan', done: true });
  } else if (macros.protein.max > 0) {
    lines.push(line('protein', 'Protein', tracking.proteinConsumed, macros.protein.max, 'g'));
  }
  return lines;
}

export function buildFluidLine(input: TodayPlanInput): PlanLine | null {
  const { hydration, tracking } = input;
  if (hydration.targetOz <= 0) {
    return { key: 'fluid', label: 'Fluids', progress: `${Math.round(tracking.waterConsumed)} oz so far`, remaining: hydration.type || 'Per your plan', done: true };
  }
  const l = line('fluid', 'Fluids', Math.round(tracking.waterConsumed), Math.round(hydration.targetOz), 'oz');
  if (hydration.type === 'Sip Only') l.remaining = l.done ? 'Done, sips only' : `${l.remaining}, sips only`;
  return l;
}

export function buildNextAction(input: TodayPlanInput): NextAction {
  const { logs, daysUntilWeighIn } = input;
  const competition = !input.isGeneralNutrition;

  if (competition && input.weighInCleared) {
    return { kind: 'set-weigh-in', title: 'Set official weigh-in', when: 'When you know the date' };
  }
  if (competition && daysUntilWeighIn < 0) {
    return { kind: 'set-weigh-in', title: 'Set official weigh-in', when: 'Your last one has passed' };
  }

  if (competition && daysUntilWeighIn === 0) {
    if (logs.officialWeighIn == null) {
      const t = weighInTimeLabel(input.weighInTime);
      return {
        kind: 'log-official',
        title: 'Log official weigh-in',
        when: t ? `Right after you step off the scale (weigh-in at ${t})` : 'Right after you step off the scale',
        logType: 'weigh-in',
      };
    }
    return { kind: 'recovery', title: 'Open recovery plan', when: 'Now, before your first match' };
  }

  if (logs.morning == null) {
    return { kind: 'log-morning', title: 'Log morning weight', when: 'Now, before you eat or drink', logType: 'morning' };
  }

  const practiceSlots = !input.isGeneralNutrition || input.trackPracticeWeighIns;
  const practiceToday = practiceSlots && (!input.isRestDay || logs.prePractice != null || logs.postPractice != null);
  const evening = input.hour >= 20;

  if (practiceToday && !evening) {
    if (logs.prePractice == null) {
      return { kind: 'log-pre-practice', title: 'Log pre-practice weight', when: 'Before practice starts', logType: 'pre-practice' };
    }
    if (logs.postPractice == null) {
      return { kind: 'log-post-practice', title: 'Log post-practice weight', when: 'Right after practice, before you drink', logType: 'post-practice' };
    }
  }

  // Food comes before the bedtime weigh-in during the day, unless nothing is allowed.
  const foodAllowed = !(input.macros.carbs.max === 0 && input.macros.protein.max === 0);
  if (!evening && foodAllowed && input.tracking.foodLogCount === 0) {
    return { kind: 'log-food', title: 'Log food', when: 'After each meal' };
  }

  if (logs.beforeBed == null) {
    return { kind: 'log-before-bed', title: 'Log before-bed weight', when: 'Right before you go to sleep', logType: 'before-bed' };
  }

  return { kind: 'none', title: 'All weigh-ins are in for today', when: 'Next: morning weight when you wake up' };
}

export function buildConfidence(input: TodayPlanInput): Pick<TodayPlan, 'measured' | 'estimated' | 'missing'> {
  const measured: ConfidenceItem[] = [];
  const estimated: ConfidenceItem[] = [];
  const missing: ConfidenceItem[] = [];
  const competition = !input.isGeneralNutrition;
  const meetDay = competition && !input.weighInCleared && input.daysUntilWeighIn === 0;

  if (meetDay) {
    if (input.logs.officialWeighIn != null) measured.push({ label: 'Official weigh-in', detail: lbs(input.logs.officialWeighIn) });
    else missing.push({ label: 'Official weigh-in', detail: 'Not logged yet' });
  }

  if (input.logs.morning != null) measured.push({ label: 'Morning weight', detail: lbs(input.logs.morning) });
  else if (!meetDay || input.logs.officialWeighIn == null) missing.push({ label: 'Morning weight', detail: 'Not logged yet' });

  if (input.tracking.foodLogCount > 0) {
    measured.push({ label: 'Food', detail: `${input.tracking.foodLogCount} ${plural(input.tracking.foodLogCount, 'item', 'items')} logged` });
  } else {
    missing.push({ label: 'Food', detail: 'Nothing logged today' });
  }

  if (input.tracking.waterConsumed > 0) measured.push({ label: 'Fluids', detail: `${Math.round(input.tracking.waterConsumed)} oz logged` });
  else missing.push({ label: 'Fluids', detail: 'Nothing logged today' });

  if (input.hasRecoveryData) measured.push({ label: 'Recovery', detail: 'Synced from your band or watch' });

  estimated.push({
    label: 'Food and fluid targets',
    detail: input.profileWeight > 0
      ? `From your protocol and profile weight (${lbs(input.profileWeight)})`
      : 'From your protocol',
  });

  if (competition) {
    if (input.weighInCleared || input.daysUntilWeighIn < 0) {
      missing.push({ label: 'Official weigh-in date', detail: 'Not set' });
    } else if (input.daysUntilWeighIn > 0) {
      estimated.push({ label: "Today's target weight", detail: `${lbs(input.todayTarget)}, from your descent plan` });
      const pr = input.projection;
      if (pr && !pr.reliable) {
        missing.push({
          label: 'Cut Lab projections',
          detail: `Too few pairs to project (${pr.driftSamples} overnight, ${pr.practiceSamples} practice; need 3 of each)`,
        });
      } else if (pr) {
        estimated.push({ label: 'Cut Lab projections', detail: `From ${pr.driftSamples} overnight and ${pr.practiceSamples} practice pairs` });
      } else {
        estimated.push({ label: 'Cut Lab projections', detail: 'Estimates from your recent weigh-ins' });
      }
    }
  }

  if (!input.hasRecoveryData) missing.push({ label: 'Recovery', detail: 'No band, WHOOP or Health data today' });

  return { measured, estimated, missing };
}

export function buildStatus(input: TodayPlanInput): Pick<TodayPlan, 'status' | 'headline' | 'reason'> {
  const competition = !input.isGeneralNutrition;
  const { logs } = input;

  // Meet Day: the official weigh-in decides it.
  if (competition && !input.weighInCleared && input.daysUntilWeighIn === 0 && logs.officialWeighIn != null) {
    if (logs.officialWeighIn <= input.weightClass) {
      return { status: 'on-track', headline: 'Made weight', reason: `Official weigh-in ${lbs(logs.officialWeighIn)} for ${input.weightClass}. Stick with your recovery plan.` };
    }
    return {
      status: 'coach',
      headline: 'Talk to your coach',
      reason: `Official weigh-in ${lbs(logs.officialWeighIn)} is ${lbs(logs.officialWeighIn - input.weightClass)} over ${input.weightClass}.`,
    };
  }

  if (competition && (input.weighInCleared || input.daysUntilWeighIn < 0)) {
    return {
      status: 'data-check',
      headline: input.weighInCleared ? 'No target set' : 'Official weigh-in has passed',
      reason: input.weighInCleared
        ? 'Set your next official weigh-in to get a target to compare with.'
        : 'Set the next one to get a new descent plan.',
    };
  }

  // Food cut for weight (includes the "do not eat" override): a coach should see it.
  if (competition && input.macros.weightWarning) {
    return {
      status: 'coach',
      headline: 'Talk to your coach',
      reason: "Today's food was cut for your weight. Go over this plan with your coach before you cut further.",
    };
  }

  const morning = logs.morning;
  if (morning == null) {
    return {
      status: 'data-check',
      headline: input.daysUntilWeighIn === 0 && competition ? 'Waiting on your official weigh-in' : 'Log a morning weight to compare',
      reason: input.daysUntilWeighIn === 0 && competition
        ? 'Status updates when you log it.'
        : "Today's target is a morning weight, so a later weigh-in can't be compared with it.",
    };
  }

  if (!competition) {
    return { status: 'on-track', headline: 'Stick with your plan', reason: 'Nothing needs changing. Hit your food and fluid targets.' };
  }

  if (input.weightLevel === 'risk') {
    const gap = morning - input.todayTarget;
    return {
      status: 'coach',
      headline: 'Talk to your coach',
      reason: gap > 0
        ? `Morning weight ${lbs(morning)} is ${lbs(gap)} above today's target of ${lbs(input.todayTarget)}.`
        : 'Your weight is well above where your descent plan expects it today.',
    };
  }

  const gap = morning - input.todayTarget;
  return {
    status: 'on-track',
    headline: 'On track',
    reason: gap <= 0
      ? `Nothing needs changing. Morning weight ${lbs(morning)}, at or under today's target of ${lbs(input.todayTarget)}.`
      : `Keep to today's food and fluid targets. Morning weight ${lbs(morning)} is ${lbs(gap)} above today's target of ${lbs(input.todayTarget)}.`,
  };
}

export function buildFacts(input: TodayPlanInput): PlanFact[] {
  if (input.isGeneralNutrition) return [];
  const d = input.daysUntilWeighIn;
  return [
    { label: 'Class', value: `${input.weightClass} lbs` },
    {
      label: 'Official weigh-in',
      value: input.weighInCleared || d < 0 ? 'Not set' : d === 0 ? 'Today' : `in ${d} ${plural(d, 'day', 'days')}`,
    },
  ];
}

const TIMING_NAMES: Record<string, string> = {
  'morning': 'Morning',
  'pre-practice': 'Pre-practice',
  'post-practice': 'Post-practice',
  'before-bed': 'Before bed',
  'weigh-in': 'Official weigh-in',
};

export function buildTodayPlan(input: TodayPlanInput): TodayPlan {
  return {
    current: input.latest ? { weight: input.latest.weight, timing: TIMING_NAMES[input.latest.timing] ?? 'Weight check' } : null,
    demo: !!input.demo,
    facts: buildFacts(input),
    ...buildStatus(input),
    next: buildNextAction(input),
    food: buildFoodLines(input),
    fluid: buildFluidLine(input),
    foodWarning: input.macros.weightWarning,
    ...buildConfidence(input),
  };
}
