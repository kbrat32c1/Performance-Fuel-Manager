/**
 * One source of truth for food bookkeeping.
 *
 * Every food log entry carries its own numbers (grams and portions), and the day's
 * totals are always the sum of the entries. Add, delete, edit, undo, repeat and
 * view switches all recompute totals from the log instead of nudging running
 * counters, so the two views can't drift apart.
 */
import type { FoodLogEntry } from "@/lib/stores/types";

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
  // Older portion entries: gramAmount was the main macro for the entry as logged.
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

/** Change a portion entry's count; its grams scale with it. */
export function withSliceCount(e: FoodLogEntry, newCount: number): FoodLogEntry {
  const oldCount = e.sliceCount ?? 1;
  const { carbs, protein } = entryMacros(e);
  const scale = oldCount > 0 ? newCount / oldCount : 0;
  return { ...e, sliceCount: newCount, carbs: round1(carbs * scale), protein: round1(protein * scale), gramAmount: undefined };
}

/** A copy of an entry for another day: same numbers, new id and time. */
export function copyEntry(e: FoodLogEntry, id: string, timestamp: string): FoodLogEntry {
  if (e.mode !== 'spar') return { ...e, id, timestamp };
  const { carbs, protein } = entryMacros(e);
  return { ...e, id, timestamp, carbs, protein, gramAmount: undefined };
}
