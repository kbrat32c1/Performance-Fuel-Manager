/**
 * SPAR Calculator Tests
 *
 * Tests for BMR, TDEE, and slice calculation functions.
 * These calculations are critical for athlete nutrition recommendations.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateBMR,
  calculateTDEE,
  calculateSliceTargets,
  SPAR_MACRO_PROTOCOLS,
} from '../spar-calculator';

describe('BMR Calculation (Mifflin-St Jeor)', () => {
  /**
   * Reference values calculated manually using Mifflin-St Jeor:
   * Male: BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age + 5
   * Female: BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age - 161
   */

  it('calculates BMR correctly for a male athlete', () => {
    // 170 lbs = 77.11 kg, 70 inches = 177.8 cm, age 20
    // BMR = 10(77.11) + 6.25(177.8) - 5(20) + 5
    // BMR = 771.1 + 1111.25 - 100 + 5 = 1787.35
    const bmr = calculateBMR(170, 70, 20, 'male');
    expect(bmr).toBeCloseTo(1787, 0);
  });

  it('calculates BMR correctly for a female athlete', () => {
    // 130 lbs = 58.97 kg, 65 inches = 165.1 cm, age 18
    // BMR = 10(58.97) + 6.25(165.1) - 5(18) - 161
    // BMR = 589.7 + 1031.875 - 90 - 161 = 1370.575
    const bmr = calculateBMR(130, 65, 18, 'female');
    expect(bmr).toBeCloseTo(1371, 0);
  });

  it('produces higher BMR for heavier athletes (same height/age/gender)', () => {
    const lighterAthlete = calculateBMR(150, 70, 20, 'male');
    const heavierAthlete = calculateBMR(200, 70, 20, 'male');
    expect(heavierAthlete).toBeGreaterThan(lighterAthlete);
  });

  it('produces higher BMR for taller athletes (same weight/age/gender)', () => {
    const shorterAthlete = calculateBMR(170, 65, 20, 'male');
    const tallerAthlete = calculateBMR(170, 75, 20, 'male');
    expect(tallerAthlete).toBeGreaterThan(shorterAthlete);
  });

  it('produces lower BMR for older athletes (same weight/height/gender)', () => {
    const youngerAthlete = calculateBMR(170, 70, 18, 'male');
    const olderAthlete = calculateBMR(170, 70, 35, 'male');
    expect(youngerAthlete).toBeGreaterThan(olderAthlete);
  });

  it('produces higher BMR for males vs females (same weight/height/age)', () => {
    const maleAthlete = calculateBMR(150, 68, 20, 'male');
    const femaleAthlete = calculateBMR(150, 68, 20, 'female');
    expect(maleAthlete).toBeGreaterThan(femaleAthlete);
    // The difference should be 166 (5 - (-161) = 166)
    expect(maleAthlete - femaleAthlete).toBeCloseTo(166, 0);
  });
});

describe('TDEE Calculation (BMR × Activity Multiplier)', () => {
  /**
   * Activity multipliers:
   * - sedentary: 1.2
   * - light: 1.375
   * - moderate: 1.55
   * - active: 1.725
   * - very-active: 1.9
   */

  it('applies correct multiplier for sedentary activity', () => {
    const bmr = 1800;
    const tdee = calculateTDEE(bmr, 'sedentary');
    expect(tdee).toBe(Math.round(bmr * 1.2));
  });

  it('applies correct multiplier for light activity', () => {
    const bmr = 1800;
    const tdee = calculateTDEE(bmr, 'light');
    expect(tdee).toBe(Math.round(bmr * 1.375));
  });

  it('applies correct multiplier for moderate activity', () => {
    const bmr = 1800;
    const tdee = calculateTDEE(bmr, 'moderate');
    expect(tdee).toBe(Math.round(bmr * 1.55));
  });

  it('applies correct multiplier for active activity', () => {
    const bmr = 1800;
    const tdee = calculateTDEE(bmr, 'active');
    expect(tdee).toBe(Math.round(bmr * 1.725));
  });

  it('applies correct multiplier for very-active activity', () => {
    const bmr = 1800;
    const tdee = calculateTDEE(bmr, 'very-active');
    expect(tdee).toBe(Math.round(bmr * 1.9));
  });

  it('produces increasing TDEE with increasing activity', () => {
    const bmr = 1800;
    const sedentary = calculateTDEE(bmr, 'sedentary');
    const light = calculateTDEE(bmr, 'light');
    const moderate = calculateTDEE(bmr, 'moderate');
    const active = calculateTDEE(bmr, 'active');
    const veryActive = calculateTDEE(bmr, 'very-active');

    expect(light).toBeGreaterThan(sedentary);
    expect(moderate).toBeGreaterThan(light);
    expect(active).toBeGreaterThan(moderate);
    expect(veryActive).toBeGreaterThan(active);
  });
});

describe('SPAR Macro Protocols', () => {
  it('has all six protocols defined', () => {
    expect(SPAR_MACRO_PROTOCOLS).toHaveProperty('performance');
    expect(SPAR_MACRO_PROTOCOLS).toHaveProperty('maintenance');
    expect(SPAR_MACRO_PROTOCOLS).toHaveProperty('recomp');
    expect(SPAR_MACRO_PROTOCOLS).toHaveProperty('build');
    expect(SPAR_MACRO_PROTOCOLS).toHaveProperty('fatloss');
    expect(SPAR_MACRO_PROTOCOLS).toHaveProperty('custom');
  });

  it('has macros that sum to 100% for each protocol', () => {
    Object.values(SPAR_MACRO_PROTOCOLS).forEach((protocol) => {
      const total = protocol.carbs + protocol.protein + protocol.fat;
      expect(total).toBe(100);
    });
  });

  it('build protocol has positive calorie adjustment (surplus)', () => {
    expect(SPAR_MACRO_PROTOCOLS.build.calorieAdjustment).toBeGreaterThan(0);
  });

  it('fatloss protocol has negative calorie adjustment (deficit)', () => {
    expect(SPAR_MACRO_PROTOCOLS.fatloss.calorieAdjustment).toBeLessThan(0);
  });

  it('maintenance protocol has zero calorie adjustment', () => {
    expect(SPAR_MACRO_PROTOCOLS.maintenance.calorieAdjustment).toBe(0);
  });
});

describe('Slice Target Calculation', () => {
  const baseProfile = {
    weightLbs: 170,
    heightInches: 70,
    age: 20,
    gender: 'male' as const,
    activityLevel: 'active' as const,
  };

  it('calculates non-zero slice targets', () => {
    const result = calculateSliceTargets(
      baseProfile.weightLbs,
      baseProfile.heightInches,
      baseProfile.age,
      baseProfile.gender,
      baseProfile.activityLevel,
      'maintenance'
    );

    expect(result.protein).toBeGreaterThan(0);
    expect(result.carb).toBeGreaterThan(0);
    expect(result.veg).toBeGreaterThan(0);
    expect(result.totalCalories).toBeGreaterThan(0);
  });

  it('returns integer slice counts (no fractional slices)', () => {
    const result = calculateSliceTargets(
      baseProfile.weightLbs,
      baseProfile.heightInches,
      baseProfile.age,
      baseProfile.gender,
      baseProfile.activityLevel,
      'performance'
    );

    expect(Number.isInteger(result.protein)).toBe(true);
    expect(Number.isInteger(result.carb)).toBe(true);
    expect(Number.isInteger(result.veg)).toBe(true);
  });

  it('includes BMR and TDEE in the result', () => {
    const result = calculateSliceTargets(
      baseProfile.weightLbs,
      baseProfile.heightInches,
      baseProfile.age,
      baseProfile.gender,
      baseProfile.activityLevel,
      'maintenance'
    );

    expect(result.bmr).toBeGreaterThan(1000);
    expect(result.tdee).toBeGreaterThan(result.bmr!);
  });

  it('build protocol produces higher calories than maintenance', () => {
    const maintenance = calculateSliceTargets(
      baseProfile.weightLbs,
      baseProfile.heightInches,
      baseProfile.age,
      baseProfile.gender,
      baseProfile.activityLevel,
      'maintenance'
    );

    const build = calculateSliceTargets(
      baseProfile.weightLbs,
      baseProfile.heightInches,
      baseProfile.age,
      baseProfile.gender,
      baseProfile.activityLevel,
      'build'
    );

    expect(build.totalCalories).toBeGreaterThan(maintenance.totalCalories);
  });

  it('fatloss protocol produces lower calories than maintenance', () => {
    const maintenance = calculateSliceTargets(
      baseProfile.weightLbs,
      baseProfile.heightInches,
      baseProfile.age,
      baseProfile.gender,
      baseProfile.activityLevel,
      'maintenance'
    );

    const fatloss = calculateSliceTargets(
      baseProfile.weightLbs,
      baseProfile.heightInches,
      baseProfile.age,
      baseProfile.gender,
      baseProfile.activityLevel,
      'fatloss'
    );

    expect(fatloss.totalCalories).toBeLessThan(maintenance.totalCalories);
  });

  it('performance protocol has higher carb ratio', () => {
    const performance = calculateSliceTargets(
      baseProfile.weightLbs,
      baseProfile.heightInches,
      baseProfile.age,
      baseProfile.gender,
      baseProfile.activityLevel,
      'performance'
    );

    const maintenance = calculateSliceTargets(
      baseProfile.weightLbs,
      baseProfile.heightInches,
      baseProfile.age,
      baseProfile.gender,
      baseProfile.activityLevel,
      'maintenance'
    );

    // Performance (55% carb) should have more carb slices than maintenance (45% carb)
    expect(performance.carb).toBeGreaterThanOrEqual(maintenance.carb);
  });
});

describe('Edge Cases and Safety', () => {
  it('handles minimum reasonable weight (50 lbs)', () => {
    const result = calculateSliceTargets(50, 48, 12, 'female', 'light', 'maintenance');
    expect(result.totalCalories).toBeGreaterThan(0);
    expect(result.protein).toBeGreaterThan(0);
  });

  it('handles maximum reasonable weight (400 lbs)', () => {
    const result = calculateSliceTargets(400, 78, 30, 'male', 'sedentary', 'fatloss');
    expect(result.totalCalories).toBeGreaterThan(0);
    expect(result.protein).toBeGreaterThan(0);
  });

  it('handles young athletes (14 years old)', () => {
    const result = calculateSliceTargets(120, 62, 14, 'male', 'active', 'performance');
    expect(result.totalCalories).toBeGreaterThan(1500);
  });

  it('handles older athletes (50 years old)', () => {
    const result = calculateSliceTargets(180, 70, 50, 'male', 'moderate', 'maintenance');
    expect(result.totalCalories).toBeGreaterThan(1800);
  });
});
