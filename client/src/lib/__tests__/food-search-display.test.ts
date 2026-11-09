import { describe, expect, it } from "vitest";
import {
  amountBaseServing, amountUnits, foodPrep, foodSourceLabel, prepTag, searchFoodName, searchFoodPortion,
  servingsFromAmount, sliceCountText, sortCookedFirst, typedAmountLabel,
} from "../food-search-display";
import { buildFoodEntry } from "../food-totals";

const serving = (description: string, metricAmount: number | null, metricUnit = 'g', extra: Partial<{ carbs: number; protein: number; fat: number }> = {}) => ({
  description, metricAmount, metricUnit, calories: 200, carbs: 40, protein: 4, fat: 1, isDefault: false, ...extra,
});

describe('foodPrep, using real FatSecret wording', () => {
  it.each([
    ['White Rice', '1 cup cooked', 'cooked'],
    ['White Rice', '1 oz, dry, yields', 'dry'],
    ['White Rice', '100 g', null],
    ['Cooked Rice', '100 g', 'cooked'],
    ['White Rice (Long-Grain, Cooked)', '1 cup', 'cooked'],
    ['Jasmine Long Grain Rice', '1/4 cup dry (3/4 cup prepared)', 'dry'],
    ['Basmati Rice', '1/4 cup prepared', 'cooked'],
    ['Old Fashioned Oatmeal', '1/2 cup uncooked', 'raw'],
    ['Oatmeal', '1/2 cup dry', 'dry'],
    ['Chicken Breast', '100 g', null],
    ['Chicken Breast', '1/2 small (yield after cooking, bone removed)', 'cooked'],
    ['Chicken Breast', '1 oz boneless, cooked', 'cooked'],
    ['Grilled Chicken Breast Strips', '3 oz', 'cooked'],
    ['Ground Beef (Cooked)', '1 oz raw (yield after cooking)', 'raw'],
    ['Potato', '1 medium (2-1/4" to 3" dia, raw)', null],
    ['Roasted Potato', '1 medium (2-1/4" to 3" dia, raw)', 'cooked'],
    ['Roasted Potato', '1 oz, raw, yields', 'raw'],
    ['Raw Almonds', '1/4 cup', 'raw'],
    ['Dry Roasted Almonds', '1 package', null],
    ['Fried Rice Mix', '1/4 cup dry (3/4 cup prepared)', 'dry'],
    ['Roasted Garlic Couscous', '1/3 cup dry', 'dry'],
    ['Raw Spinach', '1 cup cooked', 'cooked'],
    ['Gatorade Powder', '12 fl oz prepared', null],
    ['Smoked Salmon', '3 oz', null],
    ['Smoked Gouda', '1 oz', null],
    ['Baked Potato Chips', '1 oz', null],
    ['Uncooked Pasta', '2 oz', 'raw'],
  ])('%s, %s', (name, description, expected) => {
    expect(foodPrep(name, description)).toBe(expected);
  });
});

describe('prepTag', () => {
  it("doesn't repeat cooked when the text already says it", () => {
    expect(prepTag('cooked', 'White Rice', '1 cup cooked')).toBeNull();
    expect(prepTag('cooked', 'Cooked Rice', '100 g')).toBeNull();
    expect(prepTag('cooked', 'Basmati Rice', '1/4 cup prepared')).toBe('Cooked');
  });

  it('always shows raw and dry', () => {
    expect(prepTag('dry', 'Oatmeal', '1/2 cup dry')).toBe('Dry');
    expect(prepTag('raw', 'Raw Almonds', '1/4 cup')).toBe('Raw');
    expect(prepTag(null, 'Chicken Breast', '100 g')).toBeNull();
  });
});

describe('sortCookedFirst', () => {
  const food = (name: string, description: string) => ({ name, servings: [{ description, isDefault: true }] });

  it('moves cooked up and dry down, keeping the order otherwise', () => {
    const foods = [food('Quaker Oatmeal', '1/2 cup dry'), food('Oatmeal Packet', '1 packet'), food('Oatmeal', '1 cup cooked')];
    expect(sortCookedFirst(foods, 'oatmeal').map(f => f.name)).toEqual(['Oatmeal', 'Oatmeal Packet', 'Quaker Oatmeal']);
  });

  it("leaves foods people don't usually cook in the database's order", () => {
    const foods = [food('Almonds', '1 oz'), food('Raw Almonds', '1/4 cup'), food('Roasted Almonds', '25 almonds')];
    expect(sortCookedFirst(foods, 'almonds').map(f => f.name)).toEqual(['Almonds', 'Raw Almonds', 'Roasted Almonds']);
  });

  it('leaves packaged and mixed foods where the database put them', () => {
    const foods = [food('Chicken Breast', '100 g'), food('Grilled Chicken Sandwich', '1 sandwich'), food('Kettle Cooked Potato Chips', '1 oz')];
    expect(sortCookedFirst(foods, 'chicken').map(f => f.name)).toEqual(['Chicken Breast', 'Grilled Chicken Sandwich', 'Kettle Cooked Potato Chips']);
  });

  it('does not reorder when the athlete searched for raw or dry', () => {
    const foods = [food('Rice', '1/4 cup dry'), food('Rice Bowl', '1 cup cooked')];
    expect(sortCookedFirst(foods, 'dry rice').map(f => f.name)).toEqual(['Rice', 'Rice Bowl']);
  });
});

describe('foodSourceLabel', () => {
  it('names only sources we know', () => {
    expect(foodSourceLabel('Generic')).toBe('FatSecret generic listing');
    expect(foodSourceLabel('Brand')).toBe('FatSecret brand listing');
    expect(foodSourceLabel('SR Legacy')).toBe('USDA');
    expect(foodSourceLabel(undefined)).toBeNull();
    expect(foodSourceLabel('Something')).toBeNull();
  });
});

describe('typed amounts', () => {
  it('offers no typed amount from a dry-yield serving, whose grams are the cooked weight', () => {
    const dry = serving('1 oz, dry, yields', 87);
    const hundred = serving('100 g', 100);
    expect(amountBaseServing(dry, [dry, hundred])).toBeNull();
  });

  it('skips dry-yield servings when the chosen one has no weight', () => {
    const packet = serving('1 packet', null);
    const dry = serving('1 oz, dry, yields', 87);
    const hundred = serving('100 g', 100);
    expect(amountBaseServing(packet, [packet, dry, hundred])).toBe(hundred);
  });

  it('has no base when no serving has a usable weight', () => {
    const packet = serving('1 packet', null);
    expect(amountBaseServing(packet, [packet])).toBeNull();
  });

  it('converts grams and ounces', () => {
    const cup = serving('1 cup cooked', 158);
    expect(servingsFromAmount('158', 'g', cup)).toBeCloseTo(1);
    expect(servingsFromAmount('2', 'oz', cup)).toBeCloseTo((2 * 28.3495) / 158);
  });

  it('converts mL and fluid ounces', () => {
    const bottle = serving('1 bottle', 591, 'ml');
    expect(amountUnits(bottle)).toEqual(['mL', 'fl oz']);
    expect(servingsFromAmount('20', 'fl oz', bottle)).toBeCloseTo((20 * 29.5735) / 591);
  });

  it('keeps ounces as ounces when that is all the database gave', () => {
    const bottle = serving('1 bottle', 20, 'oz');
    expect(amountUnits(bottle)).toEqual(['oz']);
    expect(servingsFromAmount('10', 'oz', bottle)).toBeCloseTo(0.5);
  });

  it('waits for a positive number', () => {
    const cup = serving('1 cup', 158);
    expect(servingsFromAmount('', 'g', cup)).toBeNull();
    expect(servingsFromAmount('0', 'g', cup)).toBeNull();
    expect(servingsFromAmount('abc', 'g', cup)).toBeNull();
  });
});

describe('a typed amount keeps how the food was measured', () => {
  const savedName = (name: string, brand: string, amount: string) =>
    buildFoodEntry({ name: searchFoodName(name, brand, amount), carbs: 40, protein: 4 }, { mealSection: 'breakfast', nowMs: 0 }).name;

  it('keeps cooked through to the saved entry', () => {
    const label = typedAmountLabel('6', 'oz', 'White Rice', '1 cup cooked');
    expect(label).toBe('6 oz cooked');
    expect(savedName('White Rice', '', label)).toBe('White Rice — 6 oz cooked');
  });

  it('keeps dry through to the saved entry, with the brand', () => {
    const label = typedAmountLabel('40', 'g', 'Oatmeal', '1/2 cup dry');
    expect(label).toBe('40 g dry');
    expect(savedName('Oatmeal', 'Great Value', label)).toBe('Oatmeal (Great Value) — 40 g dry');
  });

  it("doesn't repeat what the name says, or invent what the database doesn't", () => {
    expect(typedAmountLabel('100', 'g', 'Cooked Rice', '100 g')).toBe('100 g');
    expect(typedAmountLabel('30', 'g', 'Raw Almonds', '1/4 cup')).toBe('30 g');
    expect(typedAmountLabel('100', 'g', 'Chicken Breast', '100 g')).toBe('100 g');
  });
});

describe('slices before adding', () => {
  it('gives the same slices the saved entry gets', () => {
    const rice = serving('1 cup cooked', 158, 'g', { carbs: 45, protein: 4, fat: 0 });
    expect(searchFoodPortion(rice, 'carb', 1)).toMatchObject({ carbs: 45, protein: 4, fat: 0, sliceType: 'carb', sliceCount: 1.5 });
    expect(searchFoodPortion(rice, 'carb', 2).sliceCount).toBe(3.5);
  });

  it("doesn't guess fruit or veg slices from a typed amount, and keeps the nutrition", () => {
    const berries = serving('1 large', 18, 'g', { carbs: 1.4, protein: 0.1, fat: 0 });
    const typed = searchFoodPortion(berries, 'fruit', 150 / 18, true);
    expect(typed).toMatchObject({ carbs: 12, sliceType: 'fruit', sliceCount: 0, sliceCountKnown: false });
    expect(searchFoodPortion(berries, 'fruit', 2)).toMatchObject({ sliceCount: 2, sliceCountKnown: true });
  });

  it('still counts typed protein and carb foods', () => {
    const rice = serving('1 cup cooked', 158, 'g', { carbs: 45, protein: 4, fat: 0 });
    expect(searchFoodPortion(rice, 'carb', 2, true)).toMatchObject({ sliceCount: 3.5, sliceCountKnown: true });
  });

  it('reads plainly', () => {
    expect(sliceCountText('carb', 1)).toBe('Counts as 1 carb slice');
    expect(sliceCountText('protein', 1.5)).toBe('Counts as 1.5 protein slices');
  });
});
