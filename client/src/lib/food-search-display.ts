/**
 * What a food search result shows before it's added: cooked or raw, where the numbers
 * come from, a typed amount, and the slices it counts as.
 *
 * Cooked or raw is only ever read from the words the database used. If the words don't
 * say, the result stays unlabeled instead of guessing.
 */
import { classifyFood, type SliceType } from "@/lib/food-totals";

export type FoodPrep = 'cooked' | 'raw' | 'dry';

export interface ServingForDisplay {
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  metricAmount: number | null;
  metricUnit: string;
}

const COOKED_NAME = /\b(cooked|grilled|baked|roasted|broiled|boiled|steamed|fried|sauteed|sautéed|poached|smoked|braised|stewed|scrambled|rotisserie)\b/i;
const RAW_NAME = /\b(raw|uncooked)\b/i;
/** "1 oz, dry, yields" and "1 oz raw (yield after cooking)": measured before cooking. */
const MEASURED_BEFORE_COOKING = /\b(raw|dry|uncooked)\b.*\byields?\b/i;
const SERVING_WORD = /\b(cooked|prepared|raw|uncooked|dry)\b|\byield after cooking\b/gi;
/** Foods people normally cook first, the only ones whose order should change. */
const USUALLY_COOKED = /\b(rice|pasta|spaghetti|penne|macaroni|noodles?|rotini|fettuccine|rigatoni|oats?|oatmeal|quinoa|grits|barley|couscous|potato(es)?|yams?|chicken|turkey|beef|steaks?|pork|ham|bacon|sausages?|lamb|fish|salmon|tuna|tilapia|cod|shrimp|eggs?|lentils?|beans?)\b/i;

function prepFromWord(word: string): FoodPrep {
  const w = word.toLowerCase();
  if (w === 'dry') return 'dry';
  if (w === 'raw' || w === 'uncooked') return 'raw';
  return 'cooked';
}

/** The size notes in "1 medium (2-1/4" to 3" dia, raw)" describe the potato, not how it's eaten. */
const withoutSizeNotes = (description: string) => description.replace(/\([^)]*\bdia\b[^)]*\)/gi, ' ');

/** Cooked, raw or dry, from the food's name and this serving's description. Null when they don't say. */
export function foodPrep(name: string, servingDescription = ''): FoodPrep | null {
  const serving = withoutSizeNotes(servingDescription);
  const before = serving.match(MEASURED_BEFORE_COOKING);
  if (before) return prepFromWord(before[1]);

  const nameCooked = COOKED_NAME.test(name);
  const nameRaw = RAW_NAME.test(name);
  if (nameCooked !== nameRaw) return nameCooked ? 'cooked' : 'raw';
  if (nameCooked && nameRaw) return null;

  const first = serving.match(SERVING_WORD)?.[0];
  return first ? prepFromWord(first) : null;
}

export const PREP_LABEL: Record<FoodPrep, string> = { cooked: 'Cooked', raw: 'Raw', dry: 'Dry' };

/** "Cooked · 1 cup cooked" says it twice. Raw and dry always show, because they change how you measure. */
export function prepTag(prep: FoodPrep | null, name: string, servingDescription: string): string | null {
  if (!prep) return null;
  if (prep === 'cooked' && /\bcooked\b/i.test(`${name} ${servingDescription}`)) return null;
  return PREP_LABEL[prep];
}

/** Keeps the database's order, except cooked versions of usually-cooked foods go first and raw or dry go last. */
export function sortCookedFirst<T extends { name: string; servings: { description: string; isDefault: boolean }[] }>(
  foods: T[],
  query: string,
): T[] {
  if (/\b(raw|uncooked|dry)\b/i.test(query)) return foods;
  const rank = (food: T) => {
    if (!USUALLY_COOKED.test(food.name)) return 1;
    const serving = food.servings.find(s => s.isDefault) ?? food.servings[0];
    const prep = foodPrep(food.name, serving?.description);
    return prep === 'cooked' ? 0 : prep ? 2 : 1;
  };
  return foods
    .map((food, index) => ({ food, index, rank: rank(food) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.food);
}

/** A typed amount with how it's measured, e.g. "6 oz cooked", unless the food's name already says. */
export function typedAmountLabel(input: string, unit: AmountUnit, foodName: string, baseDescription: string): string {
  const amount = `${parseFloat(input)} ${unit}`;
  const prep = foodPrep(foodName, baseDescription);
  if (!prep || new RegExp(`\\b${prep}\\b`, 'i').test(foodName)) return amount;
  return `${amount} ${prep}`;
}

/** How a searched food reads in the diary. */
export function searchFoodName(displayName: string, brand: string, amountText: string): string {
  return `${displayName}${brand ? ` (${brand})` : ''} — ${amountText}`;
}

/** Where a result's numbers come from. Null when we don't know. */
export function foodSourceLabel(type: string | undefined): string | null {
  switch (type) {
    case 'Generic': return 'FatSecret generic listing';
    case 'Brand': return 'FatSecret brand listing';
    case 'Foundation':
    case 'SR Legacy':
      return 'USDA';
    default: return null;
  }
}

export type AmountUnit = 'g' | 'oz' | 'mL' | 'fl oz';

const UNITS_BY_METRIC: Record<string, AmountUnit[]> = { g: ['g', 'oz'], ml: ['mL', 'fl oz'], oz: ['oz'] };
const TO_METRIC: Partial<Record<string, number>> = { 'g:oz': 28.3495, 'ml:fl oz': 29.5735 };

const metricKey = (serving: ServingForDisplay) => serving.metricUnit.trim().toLowerCase();

function canBeBase(serving: ServingForDisplay): boolean {
  if (!(serving.metricAmount && serving.metricAmount > 0)) return false;
  if (!UNITS_BY_METRIC[metricKey(serving)]) return false;
  // "1 oz, dry, yields" lists the cooked weight of 1 oz dry, so its grams can't scale a typed amount.
  return !MEASURED_BEFORE_COOKING.test(serving.description);
}

/** The serving a typed amount is measured against: the chosen one if it has a usable weight. */
export function amountBaseServing<T extends ServingForDisplay>(selected: T, servings: T[]): T | null {
  if (canBeBase(selected)) return selected;
  return servings.find(canBeBase) ?? null;
}

export function amountUnits(base: ServingForDisplay): AmountUnit[] {
  return UNITS_BY_METRIC[metricKey(base)] ?? [];
}

/** How many of the base serving a typed amount equals. Null until the amount is a positive number. */
export function servingsFromAmount(input: string, unit: AmountUnit, base: ServingForDisplay): number | null {
  const amount = parseFloat(input);
  if (!(amount > 0) || !base.metricAmount) return null;
  const metric = metricKey(base);
  const factor = TO_METRIC[`${metric}:${unit}`] ?? 1;
  return (amount * factor) / base.metricAmount;
}

/** Grams and slices one search result adds, so the preview and the saved entry can't differ. */
export function searchFoodPortion(
  serving: ServingForDisplay,
  sparCategory: string | null | undefined,
  qty: number,
): { carbs: number; protein: number; fat: number; sliceType: SliceType; sliceCount: number } {
  const carbs = Math.round(serving.carbs * qty);
  const protein = Math.round(serving.protein * qty);
  const fat = Math.round((serving.fat || 0) * qty);
  const { sliceType, sliceCount } = classifyFood({ carbs, protein, fat }, (sparCategory as SliceType) || null, qty);
  return { carbs, protein, fat, sliceType, sliceCount };
}

const SLICE_NAME: Record<SliceType, string> = { protein: 'protein', carb: 'carb', veg: 'veg', fruit: 'fruit', fat: 'fat' };

export function sliceCountText(sliceType: SliceType, sliceCount: number): string {
  return `Counts as ${sliceCount} ${SLICE_NAME[sliceType]} ${sliceCount === 1 ? 'slice' : 'slices'}`;
}
