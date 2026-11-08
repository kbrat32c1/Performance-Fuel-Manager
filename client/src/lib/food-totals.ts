/**
 * One source of truth for food bookkeeping.
 *
 * Every food log entry carries its own numbers (grams and portions), and the day's
 * totals are always the sum of the entries. Add, delete, edit, undo, repeat and
 * view switches all recompute totals from the log instead of nudging running
 * counters, so the two views can't drift apart.
 */
import type { FoodLogEntry, MealSection, NutrientSource } from "@/lib/stores/types";

export type SliceType = 'protein' | 'carb' | 'veg' | 'fruit' | 'fat';

/** Grams per portion (matches SLICE_GRAMS in spar-calculator-v2). */
export const PROTEIN_G_PER_SLICE = 25; // palm
export const CARB_G_PER_SLICE = 26;    // fist
export const FAT_G_PER_SLICE = 14;     // thumb

export interface FoodTotals {
  carbsConsumed: number;
  proteinConsumed: number;
  proteinSlices: number;
  carbSlices: number;
  vegSlices: number;
  fruitSlices: number;
  fatSlices: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Grams → portions, to the nearest half portion (12 g protein = ½ palm). */
export function gramsToSlices(grams: number, gramsPerSlice: number): number {
  if (!(grams > 0)) return 0;
  return Math.round((grams / gramsPerSlice) * 2) / 2;
}

/**
 * Pick the portion type and count for a food from its macros — the same rule for
 * search, barcode, photo, voice and custom entries.
 */
export function classifyFood(
  macros: { carbs: number; protein: number; fat?: number },
  sparCategory?: SliceType | null,
  servings = 1,
): { sliceType: SliceType; sliceCount: number } {
  const { carbs, protein } = macros;
  const fat = macros.fat ?? 0;
  if (sparCategory === 'veg' || sparCategory === 'fruit') {
    return { sliceType: sparCategory, sliceCount: Math.max(0.5, Math.round(servings * 2) / 2) };
  }
  if (sparCategory === 'fat' || (!sparCategory && carbs < 5 && protein < 5 && fat >= 5)) {
    return { sliceType: 'fat', sliceCount: fat > 0 ? Math.max(0.5, gramsToSlices(fat, FAT_G_PER_SLICE)) : Math.max(0.5, Math.round(servings * 2) / 2) };
  }
  const sliceType: SliceType = sparCategory === 'protein' || sparCategory === 'carb'
    ? sparCategory
    : (protein >= 10 && protein > carbs ? 'protein' : 'carb');
  const sliceCount = sliceType === 'protein'
    ? gramsToSlices(protein, PROTEIN_G_PER_SLICE)
    : gramsToSlices(carbs, CARB_G_PER_SLICE);
  return { sliceType, sliceCount };
}

/** Carb and protein grams this entry adds to the day. */
export function entryMacros(e: FoodLogEntry): { carbs: number; protein: number } {
  if (e.mode === 'sugar') {
    const amount = e.amount ?? 0;
    return e.macroType === 'protein' ? { carbs: 0, protein: amount } : { carbs: amount, protein: 0 };
  }
  // Portion entries logged since the fix carry both macros for the whole entry.
  if (e.carbs != null || e.protein != null) {
    return { carbs: e.carbs ?? 0, protein: e.protein ?? 0 };
  }
  // Older portion entries stored a single gramAmount (carbs unless the food had protein
  // and no carbs), so their exact grams are unknown. Best estimate; nextTotals() keeps the
  // day's recorded grams for these instead of recomputing them.
  const count = e.sliceCount ?? 1;
  if (e.sliceType === 'protein') return { carbs: 0, protein: e.gramAmount ?? PROTEIN_G_PER_SLICE * count };
  if (e.sliceType === 'carb') return { carbs: e.gramAmount ?? CARB_G_PER_SLICE * count, protein: 0 };
  return { carbs: 0, protein: 0 };
}

/** Portions this entry adds to the day. */
export function entrySlices(e: FoodLogEntry): Partial<Record<SliceType, number>> {
  if (e.mode === 'sugar') {
    const amount = e.amount ?? 0;
    return e.macroType === 'protein'
      ? { protein: gramsToSlices(amount, PROTEIN_G_PER_SLICE) }
      : { carb: gramsToSlices(amount, CARB_G_PER_SLICE) };
  }
  if (!e.sliceType) return {};
  return { [e.sliceType]: e.sliceCount ?? 1 };
}

/** The day's totals, computed from its food log. */
export function totalsFromFoodLog(log: FoodLogEntry[] | undefined): FoodTotals {
  const t: FoodTotals = { carbsConsumed: 0, proteinConsumed: 0, proteinSlices: 0, carbSlices: 0, vegSlices: 0, fruitSlices: 0, fatSlices: 0 };
  for (const e of log ?? []) {
    const m = entryMacros(e);
    t.carbsConsumed += m.carbs;
    t.proteinConsumed += m.protein;
    const s = entrySlices(e);
    t.proteinSlices += s.protein ?? 0;
    t.carbSlices += s.carb ?? 0;
    t.vegSlices += s.veg ?? 0;
    t.fruitSlices += s.fruit ?? 0;
    t.fatSlices += s.fat ?? 0;
  }
  for (const k of Object.keys(t) as (keyof FoodTotals)[]) t[k] = round1(t[k]);
  return t;
}

/** This entry's saved calories, fat and fiber multiplied; blanks stay blank. */
function scaledNutrients(e: FoodLogEntry, scale: number): Pick<FoodLogEntry, 'calories' | 'fat' | 'fiber'> {
  const out: Pick<FoodLogEntry, 'calories' | 'fat' | 'fiber'> = {};
  if (e.calories != null) out.calories = Math.round(e.calories * scale);
  if (e.fat != null) out.fat = round1(e.fat * scale);
  if (e.fiber != null) out.fiber = round1(e.fiber * scale);
  return out;
}

/** Change a portion entry's count; its grams and calories scale with it. */
export function withSliceCount(e: FoodLogEntry, newCount: number): FoodLogEntry {
  const oldCount = e.sliceCount ?? 1;
  const { carbs, protein } = entryMacros(e);
  // A 0-portion entry (e.g. 4 g carbs) keeps its grams: there's no per-portion size to scale by.
  if (!(oldCount > 0)) return { ...e, sliceCount: newCount, carbs, protein, gramAmount: undefined };
  const scale = newCount / oldCount;
  return { ...e, sliceCount: newCount, carbs: round1(carbs * scale), protein: round1(protein * scale), gramAmount: undefined, ...scaledNutrients(e, scale) };
}

/** Change a gram entry's amount; its calories, fat and fiber scale with it. */
export function withGramAmount(e: FoodLogEntry, newAmount: number): FoodLogEntry {
  const oldAmount = e.amount ?? 0;
  return { ...e, amount: newAmount, ...(oldAmount > 0 ? scaledNutrients(e, newAmount / oldAmount) : {}) };
}

/** Change how many servings an entry with calories counts for; every number scales together. */
export function withServings(e: FoodLogEntry, newServings: number): FoodLogEntry {
  const scale = newServings / (e.servings ?? 1);
  if (e.mode === 'sugar') return { ...withGramAmount(e, round1((e.amount ?? 0) * scale)), ...scaledNutrients(e, scale), servings: newServings };
  const { carbs, protein } = entryMacros(e);
  return {
    ...e,
    sliceCount: round1((e.sliceCount ?? 1) * scale),
    carbs: round1(carbs * scale),
    protein: round1(protein * scale),
    gramAmount: undefined,
    ...scaledNutrients(e, scale),
    servings: newServings,
  };
}

/** A copy of an entry for another day: same numbers, new id and time. */
export function copyEntry(e: FoodLogEntry, id: string, timestamp: string): FoodLogEntry {
  if (e.mode !== 'spar') return { ...e, id, timestamp };
  const { carbs, protein } = entryMacros(e);
  return { ...e, id, timestamp, carbs, protein, gramAmount: undefined };
}

/** Portion entry saved before entries carried their own carbs/protein. */
export function isLegacyEntry(e: FoodLogEntry): boolean {
  return e.mode === 'spar' && e.carbs == null && e.protein == null;
}

/**
 * Totals to save after the log changes from `prev.foodLog` to `newLog`.
 * Portions always come from the log (each entry stores its count). Grams too —
 * unless an older entry is involved, whose grams can't be known exactly: then the
 * day's recorded grams are kept and only the change between the two logs is applied.
 */
export function nextTotals(
  prev: { carbsConsumed: number; proteinConsumed: number; foodLog?: FoodLogEntry[] },
  newLog: FoodLogEntry[],
): FoodTotals {
  const oldLog = prev.foodLog ?? [];
  const next = totalsFromFoodLog(newLog);
  if (!oldLog.some(isLegacyEntry) && !newLog.some(isLegacyEntry)) return next;
  const before = totalsFromFoodLog(oldLog);
  return {
    ...next,
    carbsConsumed: Math.max(0, round1((prev.carbsConsumed ?? 0) + next.carbsConsumed - before.carbsConsumed)),
    proteinConsumed: Math.max(0, round1((prev.proteinConsumed ?? 0) + next.proteinConsumed - before.proteinConsumed)),
  };
}

// ─── Saving calories, fat and fiber ─────────────────────────────────────────

/** Which diary the athlete chose in Settings. */
export type TrackingView = 'spar' | 'sugar' | 'calories';

export interface FoodToLog {
  name: string;
  carbs: number;
  protein: number;
  calories?: number;
  fat?: number;
  fiber?: number;
  nutrientSource?: NutrientSource;
  servings?: number;
  sliceType?: SliceType;
  sliceCount?: number;
  liquidOz?: number;
  category?: string;
}

const suffix = () => Math.random().toString(36).substr(2, 9);

function nutrientFields(f: Pick<FoodToLog, 'calories' | 'fat' | 'fiber' | 'nutrientSource' | 'servings'>): Partial<FoodLogEntry> {
  const out: Partial<FoodLogEntry> = {};
  if (f.calories != null) out.calories = f.calories;
  if (f.fat != null) out.fat = f.fat;
  if (f.fiber != null) out.fiber = f.fiber;
  if (f.nutrientSource) out.nutrientSource = f.nutrientSource;
  if (f.servings != null) out.servings = f.servings;
  return out;
}

/**
 * Grams view stores a food as a carb row and a protein row. Each row gets its share,
 * so the two add back up to the food and deleting one row removes only its share.
 */
function shareNutrients(f: FoodToLog): [Partial<FoodLogEntry>, Partial<FoodLogEntry>] {
  const carbShare = f.carbs / (f.carbs + f.protein);
  const carbPart: FoodToLog = { ...f }, proteinPart: FoodToLog = { ...f };
  if (f.calories != null) {
    carbPart.calories = Math.round(f.calories * carbShare);
    proteinPart.calories = f.calories - carbPart.calories;
  }
  if (f.fat != null) {
    carbPart.fat = round1(f.fat * carbShare);
    proteinPart.fat = round1(f.fat - carbPart.fat);
  }
  if (f.fiber != null) {
    carbPart.fiber = round1(f.fiber * carbShare);
    proteinPart.fiber = round1(f.fiber - carbPart.fiber);
  }
  return [nutrientFields(carbPart), nutrientFields(proteinPart)];
}

/** The food log rows for one food, under the same rules for every way of adding food. */
export function buildFoodEntries(
  food: FoodToLog,
  ctx: { view: TrackingView; mealSection: MealSection; nowMs: number; index?: number },
): FoodLogEntry[] {
  const { name, carbs, protein, liquidOz } = food;
  const { view, mealSection, nowMs, index = 0 } = ctx;
  const at = (offset: number) => new Date(nowMs + index + offset).toISOString();
  const liquid = liquidOz ? { liquidOz } : {};

  if (view !== 'sugar') {
    const portion = food.sliceType
      ? { sliceType: food.sliceType, sliceCount: food.sliceCount ?? 1 }
      : classifyFood({ carbs, protein, fat: food.fat });
    return [{
      id: `${nowMs}-${index}-${suffix()}`,
      name,
      timestamp: at(0),
      mode: 'spar',
      mealSection,
      sliceType: portion.sliceType,
      sliceCount: portion.sliceCount,
      // A quick portion with no grams counts as a standard portion in the Grams view.
      carbs: carbs === 0 && protein === 0 && portion.sliceType === 'carb' ? CARB_G_PER_SLICE * portion.sliceCount : carbs,
      protein: carbs === 0 && protein === 0 && portion.sliceType === 'protein' ? PROTEIN_G_PER_SLICE * portion.sliceCount : protein,
      ...liquid,
      ...nutrientFields(food),
    }];
  }

  // Gram view: one row per macro (a food with neither, like butter or black coffee, still gets one).
  const base = { name, mode: 'sugar' as const, mealSection, category: food.category || 'custom' };
  const hasCarbRow = carbs > 0 || protein === 0;
  const hasProteinRow = protein > 0;
  const [carbNutrients, proteinNutrients] = hasCarbRow && hasProteinRow
    ? shareNutrients(food)
    : [nutrientFields(food), nutrientFields(food)];
  const rows: FoodLogEntry[] = [];
  if (hasCarbRow) {
    rows.push({ ...base, id: `${nowMs}-${index}-c-${suffix()}`, timestamp: at(0), macroType: 'carbs', amount: carbs, ...liquid, ...carbNutrients });
  }
  if (hasProteinRow) {
    rows.push({ ...base, id: `${nowMs}-${index}-p-${suffix()}`, timestamp: at(1), macroType: 'protein', amount: protein, ...proteinNutrients });
  }
  return rows;
}

// ─── Reading calories, fat and fiber ────────────────────────────────────────

export interface LogNutrition {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
  /** Portions left out of the calorie total on purpose (no checked calorie value yet) */
  portions: number;
  /** Entries with no calories: saved before this diary existed, or logged without them */
  notTracked: number;
  /** Entries counted for calories whose fat value is unknown */
  missingFat: number;
  /** Counted entries whose numbers are estimates (photo, voice, barcode) */
  estimates: number;
  incomplete: boolean;
}

/** Calories, fat and fiber across a set of entries. Only saved numbers count; none are inferred. */
export function nutritionFromLog(log: FoodLogEntry[] | undefined): LogNutrition {
  const n: LogNutrition = { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0, portions: 0, notTracked: 0, missingFat: 0, estimates: 0, incomplete: false };
  for (const e of log ?? []) {
    // Carbs and protein count even without calories, so meal lines match the day's bars.
    const m = entryMacros(e);
    n.carbs += m.carbs;
    n.protein += m.protein;
    if (e.calories == null) {
      if (e.nutrientSource === 'portion') n.portions += e.sliceCount ?? 1;
      else n.notTracked += 1;
      continue;
    }
    n.calories += e.calories;
    n.fiber += e.fiber ?? 0;
    if (e.fat != null) n.fat += e.fat;
    else n.missingFat += 1;
    if (e.nutrientSource === 'estimate') n.estimates += 1;
  }
  n.calories = Math.round(n.calories);
  n.carbs = round1(n.carbs);
  n.protein = round1(n.protein);
  n.fat = round1(n.fat);
  n.fiber = round1(n.fiber);
  n.portions = round1(n.portions);
  n.incomplete = n.portions > 0 || n.notTracked > 0 || n.missingFat > 0;
  return n;
}

/** Plain-language reasons a total is incomplete, for showing next to it. */
export function incompleteReasons(n: LogNutrition): string[] {
  const reasons: string[] = [];
  if (n.portions > 0) reasons.push(`${n.portions} ${n.portions === 1 ? 'portion' : 'portions'} not included in calorie total`);
  if (n.notTracked > 0) reasons.push(`${n.notTracked} ${n.notTracked === 1 ? 'entry' : 'entries'} not tracked`);
  if (n.missingFat > 0) reasons.push(`${n.missingFat} ${n.missingFat === 1 ? 'food has' : 'foods have'} no fat value`);
  return reasons;
}

/**
 * Calorie and fat goals, only where the SPAR calculator sets them. Extreme, Rapid,
 * Optimal and Gain have carb and protein targets but no established calorie or fat
 * target, so those plans show totals without a goal.
 */
export function establishedNutritionGoals(
  slices: { isV2?: boolean; totalCalories?: number; fatGrams?: number },
): { calories: number; fat: number } | null {
  if (!slices.isV2 || !(slices.totalCalories && slices.totalCalories > 0) || slices.fatGrams == null) return null;
  return { calories: slices.totalCalories, fat: slices.fatGrams };
}

/** What an entry shows in the Calories diary. Portions and older entries never show a number. */
export function entryCalorieLabel(e: FoodLogEntry): string {
  if (e.calories != null) return `${e.nutrientSource === 'estimate' ? 'about ' : ''}${e.calories.toLocaleString()} cal`;
  if (e.nutrientSource === 'portion') {
    const count = e.sliceCount ?? 1;
    return `${count} ${count === 1 ? 'portion' : 'portions'}`;
  }
  return 'Not tracked';
}
