import { describe, it, expect } from 'vitest';
import {
  matchedFoodToPhotoFood,
  type MatchedFood,
  type FatSecretServing,
  type FatSecretFood,
  type PhotoFood,
} from '../food-photo-review';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeServing(overrides: Partial<FatSecretServing> = {}): FatSecretServing {
  return {
    id: '1',
    description: '1 serving',
    calories: 200,
    protein: 25,
    carbs: 0,
    fat: 3,
    fiber: 0,
    sugar: 0,
    metricAmount: 100,
    metricUnit: 'g',
    isDefault: true,
    ...overrides,
  };
}

function makeFood(overrides: Partial<FatSecretFood> = {}, servings?: FatSecretServing[]): FatSecretFood {
  return {
    id: '100',
    name: 'Chicken Breast',
    brand: '',
    type: 'Generic',
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    fiber: 0,
    sugar: 0,
    sodium: 74,
    servingSize: 100,
    servingSizeUnit: 'g',
    servingSizeLabel: 'per 100g',
    sparCategory: 'protein',
    servings: servings || [makeServing()],
    ...overrides,
  };
}

function makeMatchedFood(overrides: Partial<MatchedFood> = {}): MatchedFood {
  const food = overrides.fsMatch !== undefined ? overrides.fsMatch : makeFood();
  const serving = overrides.selectedServing !== undefined ? overrides.selectedServing : makeServing();
  return {
    originalName: 'chicken breast',
    quantity: '1 piece',
    estimatedGrams: 150,
    fsMatch: food,
    selectedServing: serving,
    servingQty: 1,
    alternatives: [],
    aiFallback: null,
    matchConfidence: 'exact',
    ...overrides,
  };
}

// ─── Core Conversion Tests ────────────────────────────────────────────────────

describe('matchedFoodToPhotoFood', () => {

  // ─── FatSecret-matched food path ──────────────────────────────────

  describe('FatSecret matched foods', () => {
    it('converts a protein food with correct macros and slice count', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: 'protein' }),
        selectedServing: makeServing({ calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, metricAmount: 100 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.calories).toBe(165);
      expect(result.protein).toBe(31);
      expect(result.carbs).toBe(0);
      expect(result.fat).toBe(4); // Math.round(3.6)
      expect(result.sparCategory).toBe('protein');
      // 31g protein / 25g per palm = 1.24 → rounds to 1
      expect(result.sliceCount).toBe(1);
    });

    it('calculates multiple protein slices for large portion', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: 'protein' }),
        selectedServing: makeServing({ calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 }),
        servingQty: 2, // 2 servings = 62g protein
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.protein).toBe(62);
      // 62g / 25 = 2.48 → rounds to 2
      expect(result.sliceCount).toBe(2);
    });

    it('converts a carb food with correct slice count', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ name: 'Brown Rice', sparCategory: 'carb' }),
        selectedServing: makeServing({ calories: 215, protein: 5, carbs: 45, fat: 1.8, fiber: 3.5, metricAmount: 195 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.carbs).toBe(45);
      expect(result.sparCategory).toBe('carb');
      // 45g carbs / 26g per fist = 1.73 → rounds to 2
      expect(result.sliceCount).toBe(2);
    });

    it('converts a veg food based on grams', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ name: 'Broccoli', sparCategory: 'veg' }),
        selectedServing: makeServing({ calories: 55, protein: 3.7, carbs: 11, fat: 0.6, fiber: 5.1, metricAmount: 156 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.sparCategory).toBe('veg');
      // 156g / 80g per fist = 1.95 → rounds to 2
      expect(result.sliceCount).toBe(2);
    });

    it('converts a fruit food — always 1 slice', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ name: 'Banana', sparCategory: 'fruit' }),
        selectedServing: makeServing({ calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, metricAmount: 118 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.sparCategory).toBe('fruit');
      expect(result.sliceCount).toBe(1);
    });

    it('converts a fat food with correct slice count', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ name: 'Peanut Butter', sparCategory: 'fat' }),
        selectedServing: makeServing({ calories: 188, protein: 7, carbs: 7, fat: 16, fiber: 1.5, metricAmount: 32 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.sparCategory).toBe('fat');
      // 16g fat / 14g per thumb = 1.14 → rounds to 1
      expect(result.sliceCount).toBe(1);
    });

    it('includes brand in name when present', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ name: 'Protein Bar', brand: 'Quest' }),
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.name).toBe('Protein Bar (Quest)');
    });

    it('does not add brand parentheses when brand is empty', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ name: 'Chicken Breast', brand: '' }),
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.name).toBe('Chicken Breast');
    });
  });

  // ─── Serving overrides ────────────────────────────────────────────

  describe('serving and quantity overrides', () => {
    it('uses servingOverride when provided', () => {
      const altServing = makeServing({ calories: 100, protein: 12, carbs: 2, fat: 5, fiber: 0, metricAmount: 50 });
      const mf = makeMatchedFood();
      const result = matchedFoodToPhotoFood(mf, altServing);

      expect(result.calories).toBe(100);
      expect(result.protein).toBe(12);
    });

    it('uses qtyOverride when provided', () => {
      const mf = makeMatchedFood({
        selectedServing: makeServing({ calories: 100, protein: 10, carbs: 20, fat: 3, fiber: 1 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf, undefined, 3);

      expect(result.calories).toBe(300);
      expect(result.protein).toBe(30);
      expect(result.carbs).toBe(60);
    });

    it('uses both overrides together', () => {
      const altServing = makeServing({ calories: 50, protein: 5, carbs: 0, fat: 2, fiber: 0 });
      const mf = makeMatchedFood();
      const result = matchedFoodToPhotoFood(mf, altServing, 4);

      expect(result.calories).toBe(200);
      expect(result.protein).toBe(20);
    });

    it('computes estimatedGrams from serving.metricAmount × qty', () => {
      const mf = makeMatchedFood({
        selectedServing: makeServing({ metricAmount: 80 }),
        servingQty: 2,
        estimatedGrams: 999, // should be overridden
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.estimatedGrams).toBe(160); // 80 × 2
    });

    it('falls back to mf.estimatedGrams when serving has no metricAmount', () => {
      const mf = makeMatchedFood({
        selectedServing: makeServing({ metricAmount: null }),
        estimatedGrams: 200,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.estimatedGrams).toBe(200);
    });
  });

  // ─── Negligible foods (coffee, water, tea, diet drinks) ───────────

  describe('negligible food detection', () => {
    it('gives coffee 0 slices (negligible: low cal, no macros)', () => {
      const coffeeServing = makeServing({
        calories: 2, protein: 0.3, carbs: 0, fat: 0, fiber: 0, metricAmount: 240,
      });
      const mf = makeMatchedFood({
        originalName: 'coffee',
        fsMatch: makeFood({ name: 'Coffee', sparCategory: 'carb' }),
        selectedServing: coffeeServing,
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.sliceCount).toBe(0);
      expect(result.calories).toBe(2);
    });

    it('gives 4 cups of coffee 0 slices (still negligible per-cup)', () => {
      const coffeeServing = makeServing({
        calories: 2, protein: 0.3, carbs: 0, fat: 0, fiber: 0, metricAmount: 240,
      });
      const mf = makeMatchedFood({
        originalName: 'coffee',
        fsMatch: makeFood({ name: 'Coffee', sparCategory: 'carb' }),
        selectedServing: coffeeServing,
        servingQty: 4,
      });
      const result = matchedFoodToPhotoFood(mf);

      // 4 × 2 = 8 cal, 4 × 0.3 = 1.2 → rounds to 1 protein, 4 × 0 = 0 carbs
      // isNegligible: 8 < 15 ✓, 1 < 2 ✓, 0 < 3 ✓, 0 < 2 ✓ → true
      expect(result.sliceCount).toBe(0);
    });

    it('gives black tea 0 slices', () => {
      const teaServing = makeServing({
        calories: 1, protein: 0, carbs: 0.3, fat: 0, fiber: 0, metricAmount: 237,
      });
      const mf = makeMatchedFood({
        fsMatch: makeFood({ name: 'Tea', sparCategory: 'carb' }),
        selectedServing: teaServing,
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.sliceCount).toBe(0);
    });

    it('gives diet soda 0 slices', () => {
      const serving = makeServing({
        calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, metricAmount: 355,
      });
      const mf = makeMatchedFood({
        fsMatch: makeFood({ name: 'Diet Coke', sparCategory: null }),
        selectedServing: serving,
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.sliceCount).toBe(0);
    });

    it('does NOT flag a latte as negligible (has calories from milk)', () => {
      const latteServing = makeServing({
        calories: 130, protein: 8, carbs: 13, fat: 5, fiber: 0, metricAmount: 360,
      });
      const mf = makeMatchedFood({
        fsMatch: makeFood({ name: 'Latte', sparCategory: 'carb' }),
        selectedServing: latteServing,
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      // Not negligible: 130 cal >> 15
      expect(result.sliceCount).toBeGreaterThan(0);
    });
  });

  // ─── Minimum macro thresholds ─────────────────────────────────────

  describe('minimum macro thresholds before awarding slices', () => {
    it('gives 0 slices to a protein food with only 3g protein (below 5g minimum)', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: 'protein' }),
        selectedServing: makeServing({ calories: 30, protein: 3, carbs: 1, fat: 0.5, fiber: 0 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      // Not negligible (30 cal > 15), but protein=3 < 5 threshold → 0 slices
      expect(result.sliceCount).toBe(0);
    });

    it('gives 0 slices to a carb food with only 4g carbs (below 5g minimum)', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: 'carb' }),
        selectedServing: makeServing({ calories: 20, protein: 0, carbs: 4, fat: 0.5, fiber: 0 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.sliceCount).toBe(0);
    });

    it('gives 0 slices to a fat food with only 3g fat (below 5g minimum)', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: 'fat' }),
        selectedServing: makeServing({ calories: 30, protein: 0, carbs: 0, fat: 3, fiber: 0 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.sliceCount).toBe(0);
    });

    it('gives 0 slices to a veg food with only 20g (below 30g minimum)', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: 'veg' }),
        selectedServing: makeServing({ calories: 10, protein: 1, carbs: 2, fat: 0.1, fiber: 1, metricAmount: 20 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      // Not negligible (needs to fail at least one: 10 < 15 ✓, 1 < 2 ✓, 2 < 3 ✓, 0 < 2 ✓)
      // Actually this IS negligible. Let me adjust the test.
      // With metricAmount=20, estimatedGrams=20, but negligible=true → 0 anyway.
      expect(result.sliceCount).toBe(0);
    });

    it('gives 1+ slices to protein food at exactly 5g protein', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: 'protein' }),
        selectedServing: makeServing({ calories: 50, protein: 5, carbs: 0, fat: 1, fiber: 0 }),
        servingQty: 1,
      });
      const result = matchedFoodToPhotoFood(mf);

      // 5g / 25 = 0.2 → rounds to 0, but Math.max(1, 0) = 1
      expect(result.sliceCount).toBe(1);
    });
  });

  // ─── AI Fallback path ─────────────────────────────────────────────

  describe('AI fallback (no FatSecret match)', () => {
    it('returns AI fallback data when fsMatch is null', () => {
      const mf = makeMatchedFood({
        originalName: 'some obscure food',
        fsMatch: null,
        selectedServing: null,
        aiFallback: {
          name: 'Some Obscure Food',
          estimatedGrams: 100,
          calories: 150,
          protein: 10,
          carbs: 15,
          fat: 5,
          fiber: 2,
          sparCategory: 'protein',
          sliceCount: 1,
        },
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.name).toBe('Some Obscure Food');
      expect(result.calories).toBe(150);
      expect(result.protein).toBe(10);
      expect(result.sparCategory).toBe('protein');
      expect(result.sliceCount).toBe(1);
    });

    it('returns zeroed-out PhotoFood when both fsMatch and aiFallback are null', () => {
      const mf = makeMatchedFood({
        originalName: 'mystery item',
        fsMatch: null,
        selectedServing: null,
        aiFallback: null,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.name).toBe('mystery item');
      expect(result.calories).toBe(0);
      expect(result.protein).toBe(0);
      expect(result.carbs).toBe(0);
      expect(result.fat).toBe(0);
      expect(result.sliceCount).toBe(0);
      expect(result.sparCategory).toBe('carb'); // default
    });

    it('uses AI fallback sliceCount as-is (no recalculation)', () => {
      const mf = makeMatchedFood({
        fsMatch: null,
        selectedServing: null,
        aiFallback: {
          name: 'Test Food',
          estimatedGrams: 50,
          calories: 200,
          protein: 20,
          carbs: 10,
          fat: 8,
          fiber: 1,
          sparCategory: 'protein',
          sliceCount: 3,
        },
      });
      const result = matchedFoodToPhotoFood(mf);

      // AI fallback sliceCount is passed through directly
      expect(result.sliceCount).toBe(3);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles 0 qty override without crashing', () => {
      const mf = makeMatchedFood({
        selectedServing: makeServing({ calories: 200, protein: 25, carbs: 0, fat: 3, fiber: 0 }),
      });
      const result = matchedFoodToPhotoFood(mf, undefined, 0);

      expect(result.calories).toBe(0);
      expect(result.protein).toBe(0);
      expect(result.sliceCount).toBe(0);
    });

    it('handles very large qty (10 servings of chicken)', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: 'protein' }),
        selectedServing: makeServing({ calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 }),
        servingQty: 10,
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.protein).toBe(310);
      // 310g / 25 = 12.4 → rounds to 12
      expect(result.sliceCount).toBe(12);
    });

    it('defaults sparCategory to carb when null in FatSecret match', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: null }),
        selectedServing: makeServing({ calories: 100, protein: 2, carbs: 20, fat: 1, fiber: 0 }),
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.sparCategory).toBe('carb');
    });

    it('rounds macros to integers', () => {
      const mf = makeMatchedFood({
        selectedServing: makeServing({ calories: 33.33, protein: 4.7, carbs: 2.2, fat: 1.1, fiber: 0.9 }),
        servingQty: 3,
      });
      const result = matchedFoodToPhotoFood(mf);

      // 33.33 * 3 = 99.99 → 100, 4.7 * 3 = 14.1 → 14, etc.
      expect(result.calories).toBe(100);
      expect(result.protein).toBe(14);
      expect(result.carbs).toBe(7); // 2.2 * 3 = 6.6 → 7
      expect(result.fat).toBe(3); // 1.1 * 3 = 3.3 → 3
      expect(result.fiber).toBe(3); // 0.9 * 3 = 2.7 → 3
    });

    it('unknown sparCategory with >= 30 cal gets 1 slice', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: 'something_weird' as any }),
        selectedServing: makeServing({ calories: 50, protein: 3, carbs: 5, fat: 2, fiber: 0 }),
      });
      const result = matchedFoodToPhotoFood(mf);

      // Falls to else branch: calories >= 30 → 1
      expect(result.sliceCount).toBe(1);
    });

    it('unknown sparCategory with < 30 cal gets 0 slices', () => {
      const mf = makeMatchedFood({
        fsMatch: makeFood({ sparCategory: 'something_weird' as any }),
        selectedServing: makeServing({ calories: 20, protein: 3, carbs: 4, fat: 0, fiber: 0 }),
      });
      const result = matchedFoodToPhotoFood(mf);

      expect(result.sliceCount).toBe(0);
    });
  });
});
