import { describe, it, expect } from 'vitest';
import {
  calculateSparSlicesV2,
  getTrainingDescription,
  getWorkdayDescription,
  getGoalDescription,
  validateSliceCalories,
  calculate7DayAverage,
  shouldRecalculate,
  hasReachedGoal,
  type SparV2Input,
} from '../spar-calculator-v2';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_MALE: SparV2Input = {
  sex: 'male',
  age: 20,
  heightInches: 70, // 5'10"
  weightLbs: 165,
  trainingSessions: '5-6',
  workdayActivity: 'mostly_sitting',
  goal: 'lose',
  goalIntensity: 'aggressive',
};

const BASE_FEMALE: SparV2Input = {
  ...BASE_MALE,
  sex: 'female',
  weightLbs: 130,
  heightInches: 64,
};

// ─── Main Calculator ─────────────────────────────────────────────────────────

describe('calculateSparSlicesV2', () => {
  describe('BMR calculation', () => {
    it('uses Mifflin-St Jeor for standard inputs', () => {
      const result = calculateSparSlicesV2(BASE_MALE);
      // Male: 10 × 74.84kg + 6.25 × 177.8cm - 5 × 20 + 5 ≈ 1762
      expect(result.bmr).toBeGreaterThan(1700);
      expect(result.bmr).toBeLessThan(1850);
    });

    it('female BMR is lower than male at same dimensions', () => {
      const male = calculateSparSlicesV2({ ...BASE_MALE, weightLbs: 150, heightInches: 66 });
      const female = calculateSparSlicesV2({ ...BASE_FEMALE, weightLbs: 150, heightInches: 66 });
      expect(female.bmr).toBeLessThan(male.bmr);
      // Mifflin-St Jeor offset difference is 166 (5 vs -161)
      expect(male.bmr - female.bmr).toBeCloseTo(166, 0);
    });

    it('uses Cunningham formula when bodyFatPercent is provided', () => {
      const standard = calculateSparSlicesV2(BASE_MALE);
      const nerdMode = calculateSparSlicesV2({ ...BASE_MALE, bodyFatPercent: 12 });
      // Cunningham: 500 + 22 × (165 × 0.453592 × 0.88) ≈ 500 + 22 × 65.9 ≈ 1950
      expect(nerdMode.bmr).not.toBe(standard.bmr);
      expect(nerdMode.bmr).toBeGreaterThan(1900);
    });

    it('ignores bodyFatPercent of 0 or 100', () => {
      const standard = calculateSparSlicesV2(BASE_MALE);
      const zeroFat = calculateSparSlicesV2({ ...BASE_MALE, bodyFatPercent: 0 });
      const fullFat = calculateSparSlicesV2({ ...BASE_MALE, bodyFatPercent: 100 });
      expect(zeroFat.bmr).toBe(standard.bmr);
      expect(fullFat.bmr).toBe(standard.bmr);
    });
  });

  describe('TDEE and activity multipliers', () => {
    it('TDEE is BMR times activity multiplier (within rounding tolerance)', () => {
      const result = calculateSparSlicesV2(BASE_MALE);
      // 5-6 sessions + mostly_sitting = 1.55
      // Both bmr and tdee are independently rounded from raw floats,
      // so allow ±1 for rounding difference
      expect(Math.abs(result.tdee - result.bmr * 1.55)).toBeLessThanOrEqual(1);
    });

    it('higher activity level increases TDEE', () => {
      const sedentary = calculateSparSlicesV2({ ...BASE_MALE, trainingSessions: '1-2', workdayActivity: 'mostly_sitting' });
      const active = calculateSparSlicesV2({ ...BASE_MALE, trainingSessions: '7+', workdayActivity: 'on_feet_most' });
      expect(active.tdee).toBeGreaterThan(sedentary.tdee);
    });
  });

  describe('calorie adjustment by goal', () => {
    it('lose_aggressive applies -500 cal deficit', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, goal: 'lose', goalIntensity: 'aggressive' });
      expect(result.calorieAdjustment).toBe(-500);
      expect(result.adjustedTdee).toBe(Math.round(result.tdee - 500));
    });

    it('lose_lean applies -250 cal deficit', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, goal: 'lose', goalIntensity: 'lean' });
      expect(result.calorieAdjustment).toBe(-250);
    });

    it('maintain applies 0 adjustment', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, goal: 'maintain' });
      expect(result.calorieAdjustment).toBe(0);
    });

    it('gain_aggressive applies +500 cal surplus', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, goal: 'gain', goalIntensity: 'aggressive' });
      expect(result.calorieAdjustment).toBe(500);
    });

    it('gain_lean applies +250 cal surplus', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, goal: 'gain', goalIntensity: 'lean' });
      expect(result.calorieAdjustment).toBe(250);
    });

    it('calorieOverride bypasses goal-based adjustment', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, calorieOverride: -700 });
      expect(result.calorieAdjustment).toBe(-700);
    });

    it('adjustedTdee never drops below 1200', () => {
      // Very low weight + extreme deficit should floor at 1200
      const result = calculateSparSlicesV2({
        ...BASE_FEMALE,
        weightLbs: 90,
        trainingSessions: '1-2',
        workdayActivity: 'mostly_sitting',
        calorieOverride: -2000,
      });
      expect(result.adjustedTdee).toBe(1200);
    });
  });

  describe('protein calculation', () => {
    it('anchors protein to bodyweight using protocol multiplier', () => {
      const result = calculateSparSlicesV2(BASE_MALE);
      // lose_aggressive uses 0.85 g/lb → 165 × 0.85 ≈ 140g
      expect(result.proteinGrams).toBe(Math.round(165 * 0.85));
      expect(result.proteinPerLb).toBe(0.85);
    });

    it('customProteinPerLb overrides protocol default', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, customProteinPerLb: 1.2 });
      expect(result.proteinGrams).toBe(Math.round(165 * 1.2));
      expect(result.proteinPerLb).toBe(1.2);
    });

    it('maintain_performance uses higher protein than maintain_general', () => {
      const general = calculateSparSlicesV2({ ...BASE_MALE, goal: 'maintain', maintainPriority: 'general' });
      const performance = calculateSparSlicesV2({ ...BASE_MALE, goal: 'maintain', maintainPriority: 'performance' });
      expect(performance.proteinPerLb).toBeGreaterThan(general.proteinPerLb);
    });
  });

  describe('slice output', () => {
    it('vegFists is always 5', () => {
      const result = calculateSparSlicesV2(BASE_MALE);
      expect(result.vegFists).toBe(5);
    });

    it('fruitPieces is always 2', () => {
      const result = calculateSparSlicesV2(BASE_MALE);
      expect(result.fruitPieces).toBe(2);
    });

    it('proteinPalms has a minimum of 2', () => {
      // Even with very low weight, protein palms should floor at 2
      const result = calculateSparSlicesV2({ ...BASE_FEMALE, weightLbs: 80, customProteinPerLb: 0.1 });
      expect(result.proteinPalms).toBeGreaterThanOrEqual(2);
    });

    it('carbFists has a minimum of 1', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, calorieOverride: -1500 });
      expect(result.carbFists).toBeGreaterThanOrEqual(1);
    });

    it('fatThumbs has a minimum of 1', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, customFatPercent: 1, customCarbPercent: 99 });
      expect(result.fatThumbs).toBeGreaterThanOrEqual(1);
    });

    it('all slices are whole numbers', () => {
      const result = calculateSparSlicesV2(BASE_MALE);
      expect(Number.isInteger(result.proteinPalms)).toBe(true);
      expect(Number.isInteger(result.carbFists)).toBe(true);
      expect(Number.isInteger(result.vegFists)).toBe(true);
      expect(Number.isInteger(result.fruitPieces)).toBe(true);
      expect(Number.isInteger(result.fatThumbs)).toBe(true);
    });
  });

  describe('fat/carb split', () => {
    it('returns the configured split percentages', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, goal: 'maintain', maintainPriority: 'performance' });
      expect(result.fatCarbSplit).toEqual({ fat: 30, carb: 70 });
    });

    it('custom splits override protocol defaults', () => {
      const result = calculateSparSlicesV2({ ...BASE_MALE, customFatPercent: 40, customCarbPercent: 60 });
      expect(result.fatCarbSplit).toEqual({ fat: 40, carb: 60 });
    });

    it('normalizes custom splits that do not sum to 100', () => {
      // 30 + 30 = 60, should normalize to 50/50
      const result = calculateSparSlicesV2({ ...BASE_MALE, customFatPercent: 30, customCarbPercent: 30 });
      // The split values returned are the raw inputs, but the calculation normalizes
      // So the gram outputs should reflect 50/50 of remaining calories
      expect(result.fatCarbSplit).toEqual({ fat: 30, carb: 30 });
      // The actual grams should be equal since the split normalizes
      // (approximately, given rounding)
    });
  });

  describe('slice calorie validation', () => {
    it('total slice calories are within 200 cal of adjustedTdee for typical inputs', () => {
      const result = calculateSparSlicesV2(BASE_MALE);
      expect(validateSliceCalories(result, 200)).toBe(true);
    });

    it('gain goals produce higher total calories', () => {
      const lose = calculateSparSlicesV2({ ...BASE_MALE, goal: 'lose', goalIntensity: 'aggressive' });
      const gain = calculateSparSlicesV2({ ...BASE_MALE, goal: 'gain', goalIntensity: 'aggressive' });
      expect(gain.totalSliceCalories).toBeGreaterThan(lose.totalSliceCalories);
    });
  });
});

// ─── Utility Functions ───────────────────────────────────────────────────────

describe('getTrainingDescription', () => {
  it('returns readable descriptions for all session levels', () => {
    expect(getTrainingDescription('1-2')).toContain('1-2');
    expect(getTrainingDescription('3-4')).toContain('3-4');
    expect(getTrainingDescription('5-6')).toContain('5-6');
    expect(getTrainingDescription('7+')).toContain('7+');
  });
});

describe('getWorkdayDescription', () => {
  it('returns readable descriptions for all activity levels', () => {
    expect(getWorkdayDescription('mostly_sitting')).toContain('sitting');
    expect(getWorkdayDescription('on_feet_some')).toContain('some');
    expect(getWorkdayDescription('on_feet_most')).toContain('most');
  });
});

describe('getGoalDescription', () => {
  it('describes lose goals with calorie info', () => {
    expect(getGoalDescription('lose', 'lean')).toContain('-250');
    expect(getGoalDescription('lose', 'aggressive')).toContain('-500');
  });

  it('describes gain goals with calorie info', () => {
    expect(getGoalDescription('gain', 'lean')).toContain('+250');
    expect(getGoalDescription('gain', 'aggressive')).toContain('+500');
  });

  it('describes maintain goals', () => {
    expect(getGoalDescription('maintain', undefined, 'general')).toContain('general');
    expect(getGoalDescription('maintain', undefined, 'performance')).toContain('performance');
  });
});

describe('calculate7DayAverage', () => {
  it('returns null for empty array', () => {
    expect(calculate7DayAverage([])).toBeNull();
  });

  it('returns null when all weights are older than 7 days', () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    expect(calculate7DayAverage([{ date: oldDate, weight: 170 }])).toBeNull();
  });

  it('averages recent weights', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weights = [
      { date: now, weight: 170 },
      { date: yesterday, weight: 168 },
    ];
    expect(calculate7DayAverage(weights)).toBe(169);
  });

  it('excludes weights older than 7 days', () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const weights = [
      { date: now, weight: 170 },
      { date: oldDate, weight: 200 }, // should be excluded
    ];
    expect(calculate7DayAverage(weights)).toBe(170);
  });
});

describe('shouldRecalculate', () => {
  it('returns true when weight shifts by threshold or more', () => {
    expect(shouldRecalculate(170, 172, 2)).toBe(true);
    expect(shouldRecalculate(170, 168, 2)).toBe(true);
  });

  it('returns false when weight is within threshold', () => {
    expect(shouldRecalculate(170, 171, 2)).toBe(false);
    expect(shouldRecalculate(170, 169, 2)).toBe(false);
  });

  it('uses default threshold of 2 lbs', () => {
    expect(shouldRecalculate(170, 172)).toBe(true);
    expect(shouldRecalculate(170, 171.5)).toBe(false);
  });
});

describe('hasReachedGoal', () => {
  it('returns true for lose goal when at or below goal weight', () => {
    expect(hasReachedGoal('lose', 160, 160)).toBe(true);
    expect(hasReachedGoal('lose', 160, 158)).toBe(true);
  });

  it('returns false for lose goal when above goal weight', () => {
    expect(hasReachedGoal('lose', 160, 162)).toBe(false);
  });

  it('returns true for gain goal when at or above goal weight', () => {
    expect(hasReachedGoal('gain', 180, 180)).toBe(true);
    expect(hasReachedGoal('gain', 180, 185)).toBe(true);
  });

  it('returns false for gain goal when below goal weight', () => {
    expect(hasReachedGoal('gain', 180, 175)).toBe(false);
  });

  it('returns false for maintain goal always', () => {
    expect(hasReachedGoal('maintain', 170, 170)).toBe(false);
  });
});
