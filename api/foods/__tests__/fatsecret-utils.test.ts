/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  pickBestServing,
  scoreMatchConfidence,
  autoSparCategory,
  barcodeServingBasis,
  reportedNutrients,
  round,
  type FatSecretServing,
} from '../_fatsecret-utils';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeServing(overrides: Partial<FatSecretServing> = {}): FatSecretServing {
  return {
    id: '1',
    description: '1 serving',
    calories: 200,
    protein: 25,
    carbs: 10,
    fat: 5,
    fiber: 2,
    sugar: 1,
    metricAmount: 100,
    metricUnit: 'g',
    isDefault: true,
    ...overrides,
  };
}

// ─── round() ──────────────────────────────────────────────────────────────────

describe('round', () => {
  it('rounds to one decimal place', () => {
    expect(round(1.234)).toBe(1.2);
    expect(round(1.25)).toBe(1.3);
    expect(round(1.0)).toBe(1);
    expect(round(0)).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(round(-1.55)).toBe(-1.5);
  });
});

// ─── autoSparCategory() ──────────────────────────────────────────────────────

describe('autoSparCategory with everyday foods (name first, then macros)', () => {
  // [name, calories, protein, carbs, fat, fiber, expected] per typical serving
  const cases: Array<[string, number, number, number, number, number, string | null]> = [
    ['Bananas', 105, 1.3, 27, 0.4, 3.1, 'fruit'],
    ['Banana', 105, 1.3, 27, 0.4, 3.1, 'fruit'],
    ['Apple', 95, 0.5, 25, 0.3, 4.4, 'fruit'],
    ['Blueberries', 84, 1.1, 21, 0.5, 3.6, 'fruit'],
    ['Strawberries', 49, 1, 12, 0.5, 3, 'fruit'],
    ['Orange', 62, 1.2, 15, 0.2, 3.1, 'fruit'],
    ['Broccoli', 55, 3.7, 11, 0.6, 5, 'veg'],
    ['Spinach', 7, 0.9, 1.1, 0.1, 0.7, 'veg'],
    ['Green Beans', 31, 1.8, 7, 0.2, 2.7, 'veg'],
    ['Peppers, banana or Hungarian wax, raw', 27, 1.7, 5.4, 0.5, 3.4, 'veg'],
    ['Carrots', 50, 1.1, 12, 0.3, 3.4, 'veg'],
    ['Sweet Potato', 112, 2, 26, 0.1, 3.9, 'carb'],
    ['Oatmeal', 158, 6, 27, 3.2, 4, 'carb'],
    ['Black Beans', 227, 15.2, 40.8, 0.9, 15, 'carb'],
    ['Whole Wheat Bread', 81, 4, 14, 1.1, 1.9, 'carb'],
    ['Banana Bread', 196, 2.6, 33, 6.3, 0.7, 'carb'],
    ['Snacks, banana chips', 519, 2.3, 58.4, 33.6, 7.7, 'carb'],
    ['Orange Juice', 112, 1.7, 26, 0.5, 0.5, 'carb'],
    ['Babyfood, banana no tapioca, strained', 91, 1, 21.3, 0.2, 1.6, 'carb'],
    ['Chicken Breast', 165, 31, 0, 3.6, 0, 'protein'],
    ['Peanut Butter', 188, 8, 6, 16, 1.9, 'fat'],
    ['Scrambled Eggs', 182, 12, 2, 13.4, 0, 'fat'],
  ];
  for (const [name, cal, pro, carb, fat, fib, expected] of cases) {
    it(`${name} -> ${expected}`, () => {
      expect(autoSparCategory(cal, pro, carb, fat, fib, undefined, name)).toBe(expected);
    });
  }

  it('still guesses from macros when there is no name', () => {
    expect(autoSparCategory(105, 1.3, 27, 0.4, 3.1)).toBe('carb'); // banana-like, not a vegetable
    expect(autoSparCategory(55, 3.7, 11, 0.6, 5)).toBe('veg');     // broccoli-like: low calorie, high fiber
  });
});

describe('autoSparCategory', () => {
  it('returns null for zero-calorie, zero-protein food', () => {
    expect(autoSparCategory(0, 0, 0, 0, 0)).toBeNull();
  });

  it('categorizes high-protein food as protein', () => {
    // Chicken breast: 165 cal, 31g pro, 0g carb, 3.6g fat
    // proteinPct = (31*4)/165 = 0.75 → > 0.40
    expect(autoSparCategory(165, 31, 0, 3.6, 0)).toBe('protein');
  });

  it('categorizes high-fat food as fat', () => {
    // Olive oil: 119 cal, 0g pro, 0g carb, 13.5g fat
    // fatPct = (13.5*9)/119 = 1.02 → > 0.60
    expect(autoSparCategory(119, 0, 0, 13.5, 0)).toBe('fat');
  });

  it('categorizes high-carb food as carb', () => {
    // White rice: 206 cal, 4.3g pro, 44.5g carb, 0.4g fat, 0.6g fiber
    // carbPct = (44.5*4)/206 = 0.86 → > 0.40, but fiber 0.6 < 3 → carb
    expect(autoSparCategory(206, 4.3, 44.5, 0.4, 0.6)).toBe('carb');
  });

  it('categorizes high-carb food with fiber > 3 as veg', () => {
    // Broccoli-like: 55 cal, 3.7g pro, 11g carb, 0.6g fat, 5g fiber
    // carbPct = (11*4)/55 = 0.8 → > 0.40, fiber=5 > 3 → veg
    expect(autoSparCategory(55, 3.7, 11, 0.6, 5)).toBe('veg');
  });

  it('overrides macro calculation when foodCategory includes "fruit"', () => {
    // Even if macros suggest carb, category wins
    expect(autoSparCategory(95, 1.2, 25, 0.3, 3.1, 'Fruits')).toBe('fruit');
  });

  it('overrides macro calculation when foodCategory includes "vegetable"', () => {
    expect(autoSparCategory(30, 2, 6, 0.3, 2, 'Vegetables')).toBe('veg');
  });

  it('does not treat "baby food fruit" as fruit category', () => {
    // baby food is excluded
    expect(autoSparCategory(50, 0.5, 12, 0.1, 1, 'Baby Food Fruit')).not.toBe('fruit');
  });

  it('returns null when macros are balanced (no dominant category)', () => {
    // Balanced: 200 cal, 10g pro (20%), 20g carb (40%), 6.7g fat (30%)
    // proteinPct=0.20 < 0.40, fatPct=0.30 < 0.60, carbPct=0.40 but fiber=0 → carb
    // Actually carbPct > 0.40 → carb. Let me adjust.
    // 200 cal, 15g pro (30%), 15g carb (30%), 8g fat (36%)
    // none > threshold
    expect(autoSparCategory(200, 15, 15, 8, 0)).toBeNull();
  });
});

// ─── scoreMatchConfidence() ──────────────────────────────────────────────────

describe('scoreMatchConfidence', () => {
  it('returns exact when query matches name exactly', () => {
    expect(scoreMatchConfidence('chicken breast', 'chicken breast')).toBe('exact');
  });

  it('returns exact when query matches name case-insensitively', () => {
    expect(scoreMatchConfidence('Chicken Breast', 'chicken breast')).toBe('exact');
  });

  it('returns exact when match name contains the query', () => {
    expect(scoreMatchConfidence('chicken', 'grilled chicken breast')).toBe('exact');
  });

  it('returns exact when query contains the match name', () => {
    expect(scoreMatchConfidence('grilled chicken breast boneless', 'chicken breast')).toBe('exact');
  });

  it('returns close when all query words appear in match but not as substring', () => {
    // "grilled" and "breast" both appear in "breast of chicken grilled" but
    // "grilled breast" is not a contiguous substring, nor does either fully contain the other
    expect(scoreMatchConfidence('grilled breast', 'breast of chicken grilled')).toBe('close');
  });

  it('returns fuzzy when not all words match', () => {
    expect(scoreMatchConfidence('chicken parmesan', 'parmesan cheese')).toBe('fuzzy');
  });

  it('handles extra whitespace', () => {
    expect(scoreMatchConfidence('  chicken breast  ', 'chicken breast')).toBe('exact');
  });

  it('returns exact for single-word queries that match', () => {
    expect(scoreMatchConfidence('banana', 'Banana')).toBe('exact');
  });
});

// ─── pickBestServing() ────────────────────────────────────────────────────────

describe('pickBestServing', () => {
  const smallServing = makeServing({ id: 'small', description: '1 oz', metricAmount: 28, isDefault: false });
  const mediumServing = makeServing({ id: 'med', description: '100g', metricAmount: 100, isDefault: true });
  const largeServing = makeServing({ id: 'large', description: '1 cup', metricAmount: 240, isDefault: false });

  it('returns default serving with qty 1 when targetGrams is 0', () => {
    const { serving, qty } = pickBestServing([smallServing, mediumServing, largeServing], 0);
    expect(serving.id).toBe('med'); // isDefault = true
    expect(qty).toBe(1);
  });

  it('returns default serving with qty 1 when targetGrams is negative', () => {
    const { serving, qty } = pickBestServing([smallServing, mediumServing, largeServing], -50);
    expect(serving.id).toBe('med');
    expect(qty).toBe(1);
  });

  it('picks serving closest to target with qty near 1', () => {
    // Target 100g → medium serving (100g) × 1 = perfect match
    const { serving, qty } = pickBestServing([smallServing, mediumServing, largeServing], 100);
    expect(serving.id).toBe('med');
    expect(qty).toBe(1);
  });

  it('prefers serving that avoids fractional qty', () => {
    // Target 240g → large serving (240g) × 1 = exact match (better than medium × 2.5)
    const { serving, qty } = pickBestServing([smallServing, mediumServing, largeServing], 240);
    expect(serving.id).toBe('large');
    expect(qty).toBe(1);
  });

  it('allows half-step quantities', () => {
    // Target 150g → medium (100g) × 1.5 = 150g exact
    const { serving, qty } = pickBestServing([smallServing, mediumServing, largeServing], 150);
    expect(qty).toBe(1.5);
  });

  it('returns first serving when no default flag is set', () => {
    const s1 = makeServing({ id: 'a', isDefault: false, metricAmount: 50 });
    const s2 = makeServing({ id: 'b', isDefault: false, metricAmount: 100 });
    const { serving } = pickBestServing([s1, s2], 0);
    expect(serving.id).toBe('a');
  });

  it('skips servings with no metricAmount when scoring', () => {
    const noMetric = makeServing({ id: 'no-metric', metricAmount: null, isDefault: false });
    const withMetric = makeServing({ id: 'with-metric', metricAmount: 100, isDefault: true });
    const { serving } = pickBestServing([noMetric, withMetric], 100);
    expect(serving.id).toBe('with-metric');
  });

  it('returns minimum 0.5 qty', () => {
    // Target 5g with serving of 100g → rawQty = 0.05 → roundedQty = 0 → skip
    // But if the only serving is 100g, it should still return something
    const only = makeServing({ id: 'only', metricAmount: 100, isDefault: true });
    const { serving, qty } = pickBestServing([only], 5);
    // rawQty = 0.05, rounded to 0 → skipped, falls back to default with qty 1
    // Actually: roundedQty = Math.round(0.05*2)/2 = 0 → continue. bestServing stays default.
    expect(qty).toBeGreaterThanOrEqual(0.5);
  });

  it('handles empty servings array gracefully', () => {
    // Edge case: should not throw
    // Actually pickBestServing expects at least one serving for the default
    // Let's just verify it doesn't throw
    const result = pickBestServing([], 100);
    expect(result.qty).toBe(1);
  });

  it('picks 2x of medium over 1x of no-metric default', () => {
    const noMetricDefault = makeServing({ id: 'def', metricAmount: null, isDefault: true });
    const metricServing = makeServing({ id: 'metric', metricAmount: 100, isDefault: false });
    const { serving, qty } = pickBestServing([noMetricDefault, metricServing], 200);
    expect(serving.id).toBe('metric');
    expect(qty).toBe(2);
  });
});

describe("barcodeServingBasis", () => {
  it("converts a 30 g serving to per-100 g so scaling back gives the serving's calories", () => {
    const { servingSize, scale } = barcodeServingBasis({ metric_serving_amount: "30.000", metric_serving_unit: "g" });
    expect(servingSize).toBe(30);
    expect(Math.round(200 * scale * 30 / 100)).toBe(200);
  });

  it("leaves values per serving when there is no gram or ml weight", () => {
    expect(barcodeServingBasis({})).toEqual({ servingSize: null, scale: 1 });
    expect(barcodeServingBasis({ metric_serving_amount: "1", metric_serving_unit: "oz" })).toEqual({ servingSize: null, scale: 1 });
  });
});

describe("reportedNutrients", () => {
  it("tells a missing fat value apart from a listed zero", () => {
    expect(reportedNutrients({ calories: "120" })).toEqual({ calories: true, fat: false });
    expect(reportedNutrients({ calories: "120", fat: "" })).toEqual({ calories: true, fat: false });
    expect(reportedNutrients({ calories: "0", fat: "0.000" })).toEqual({ calories: true, fat: true });
  });
});
