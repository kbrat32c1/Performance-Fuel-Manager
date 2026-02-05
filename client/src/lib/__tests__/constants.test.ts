/**
 * Constants and Unit Conversion Tests
 *
 * Tests for unit conversion constants and weight validation functions.
 * Ensures mathematical accuracy across the entire app.
 */

import { describe, it, expect } from 'vitest';
import {
  LBS_TO_KG,
  KG_TO_LBS,
  INCHES_TO_CM,
  CM_TO_INCHES,
  OZ_TO_ML,
  ML_TO_OZ,
  GAL_TO_OZ,
  MIN_WEIGHT_LBS,
  MAX_WEIGHT_LBS,
  isValidWeight,
  getWeightValidationError,
  WEIGHT_CLASSES,
  PROTOCOLS,
  assessWeightCutSafety,
  MAX_SAFE_WEEKLY_LOSS_PERCENT,
  MAX_SAFE_TOTAL_CUT_PERCENT,
  CRITICAL_DAYS_THRESHOLD,
  DANGER_DELTA_24H_LBS,
  WARNING_DELTA_48H_LBS,
} from '../constants';

describe('Unit Conversion Constants', () => {
  describe('Weight Conversions (lbs/kg)', () => {
    it('LBS_TO_KG matches international standard', () => {
      // 1 lb = 0.45359237 kg (exact SI definition)
      expect(LBS_TO_KG).toBeCloseTo(0.453592, 5);
    });

    it('KG_TO_LBS is the inverse of LBS_TO_KG', () => {
      expect(LBS_TO_KG * KG_TO_LBS).toBeCloseTo(1, 4);
    });

    it('round-trip conversion is accurate', () => {
      const originalLbs = 170;
      const kg = originalLbs * LBS_TO_KG;
      const backToLbs = kg * KG_TO_LBS;
      expect(backToLbs).toBeCloseTo(originalLbs, 2);
    });

    it('converts common wrestling weights correctly', () => {
      // 125 lbs class
      expect(125 * LBS_TO_KG).toBeCloseTo(56.7, 1);
      // 165 lbs class
      expect(165 * LBS_TO_KG).toBeCloseTo(74.84, 1);
      // 285 lbs (heavyweight)
      expect(285 * LBS_TO_KG).toBeCloseTo(129.27, 1);
    });
  });

  describe('Height Conversions (inches/cm)', () => {
    it('INCHES_TO_CM matches international standard', () => {
      // 1 inch = 2.54 cm (exact definition)
      expect(INCHES_TO_CM).toBe(2.54);
    });

    it('CM_TO_INCHES is the inverse of INCHES_TO_CM', () => {
      expect(INCHES_TO_CM * CM_TO_INCHES).toBeCloseTo(1, 4);
    });

    it('round-trip conversion is accurate', () => {
      const originalInches = 70;
      const cm = originalInches * INCHES_TO_CM;
      const backToInches = cm * CM_TO_INCHES;
      expect(backToInches).toBeCloseTo(originalInches, 2);
    });

    it('converts common heights correctly', () => {
      // 5'6" = 66 inches
      expect(66 * INCHES_TO_CM).toBeCloseTo(167.64, 1);
      // 6'0" = 72 inches
      expect(72 * INCHES_TO_CM).toBeCloseTo(182.88, 1);
    });
  });

  describe('Volume Conversions (oz/ml)', () => {
    it('OZ_TO_ML matches US customary standard', () => {
      // 1 US fl oz = 29.5735 ml
      expect(OZ_TO_ML).toBeCloseTo(29.5735, 3);
    });

    it('ML_TO_OZ is the inverse of OZ_TO_ML', () => {
      expect(OZ_TO_ML * ML_TO_OZ).toBeCloseTo(1, 4);
    });

    it('round-trip conversion is accurate', () => {
      const originalOz = 32;
      const ml = originalOz * OZ_TO_ML;
      const backToOz = ml * ML_TO_OZ;
      expect(backToOz).toBeCloseTo(originalOz, 2);
    });

    it('converts common hydration amounts correctly', () => {
      // 8 oz glass
      expect(8 * OZ_TO_ML).toBeCloseTo(237, 0);
      // 1 liter ≈ 33.8 oz
      expect(1000 * ML_TO_OZ).toBeCloseTo(33.81, 1);
    });

    it('GAL_TO_OZ is correct', () => {
      expect(GAL_TO_OZ).toBe(128);
    });
  });
});

describe('Weight Validation', () => {
  describe('isValidWeight function', () => {
    it('returns true for valid wrestler weights', () => {
      expect(isValidWeight(125)).toBe(true);
      expect(isValidWeight(165)).toBe(true);
      expect(isValidWeight(285)).toBe(true);
      expect(isValidWeight(150.5)).toBe(true);
    });

    it('returns false for weights below minimum', () => {
      expect(isValidWeight(49)).toBe(false);
      expect(isValidWeight(0)).toBe(false);
      expect(isValidWeight(-10)).toBe(false);
    });

    it('returns false for weights above maximum', () => {
      expect(isValidWeight(401)).toBe(false);
      expect(isValidWeight(500)).toBe(false);
      expect(isValidWeight(1000)).toBe(false);
    });

    it('returns false for non-numeric values', () => {
      expect(isValidWeight(NaN)).toBe(false);
      expect(isValidWeight(Infinity)).toBe(false);
      // @ts-expect-error - testing runtime behavior
      expect(isValidWeight('170')).toBe(false);
      // @ts-expect-error - testing runtime behavior
      expect(isValidWeight(null)).toBe(false);
    });

    it('accepts boundary values', () => {
      expect(isValidWeight(MIN_WEIGHT_LBS)).toBe(true);
      expect(isValidWeight(MAX_WEIGHT_LBS)).toBe(true);
    });
  });

  describe('getWeightValidationError function', () => {
    it('returns null for valid weights', () => {
      expect(getWeightValidationError(170)).toBeNull();
      expect(getWeightValidationError(125)).toBeNull();
    });

    it('returns error message for too-low weights', () => {
      const error = getWeightValidationError(40);
      expect(error).not.toBeNull();
      expect(error).toContain('at least');
      expect(error).toContain(String(MIN_WEIGHT_LBS));
    });

    it('returns error message for too-high weights', () => {
      const error = getWeightValidationError(500);
      expect(error).not.toBeNull();
      expect(error).toContain('less than');
    });

    it('returns error message for non-numeric values', () => {
      expect(getWeightValidationError(NaN)).not.toBeNull();
    });
  });
});

describe('Wrestling Constants', () => {
  describe('WEIGHT_CLASSES', () => {
    it('contains standard NCAA/high school weight classes', () => {
      expect(WEIGHT_CLASSES).toContain(125);
      expect(WEIGHT_CLASSES).toContain(133);
      expect(WEIGHT_CLASSES).toContain(141);
      expect(WEIGHT_CLASSES).toContain(149);
      expect(WEIGHT_CLASSES).toContain(157);
      expect(WEIGHT_CLASSES).toContain(165);
      expect(WEIGHT_CLASSES).toContain(174);
      expect(WEIGHT_CLASSES).toContain(184);
      expect(WEIGHT_CLASSES).toContain(197);
      expect(WEIGHT_CLASSES).toContain(285);
    });

    it('has 10 weight classes total', () => {
      expect(WEIGHT_CLASSES).toHaveLength(10);
    });

    it('is sorted in ascending order', () => {
      for (let i = 1; i < WEIGHT_CLASSES.length; i++) {
        expect(WEIGHT_CLASSES[i]).toBeGreaterThan(WEIGHT_CLASSES[i - 1]);
      }
    });
  });

  describe('PROTOCOLS', () => {
    it('contains all five protocols', () => {
      expect(PROTOCOLS.BODY_COMP).toBe('1');
      expect(PROTOCOLS.MAKE_WEIGHT).toBe('2');
      expect(PROTOCOLS.HOLD_WEIGHT).toBe('3');
      expect(PROTOCOLS.BUILD).toBe('4');
      expect(PROTOCOLS.SPAR).toBe('5');
    });

    it('has unique values for each protocol', () => {
      const values = Object.values(PROTOCOLS);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });
});

describe('Weight Cut Safety Assessment', () => {
  describe('Safety Threshold Constants', () => {
    it('has reasonable safety thresholds defined', () => {
      expect(MAX_SAFE_WEEKLY_LOSS_PERCENT).toBe(1.5);
      expect(MAX_SAFE_TOTAL_CUT_PERCENT).toBe(8);
      expect(CRITICAL_DAYS_THRESHOLD).toBe(2);
      expect(DANGER_DELTA_24H_LBS).toBe(3);
      expect(WARNING_DELTA_48H_LBS).toBe(5);
    });
  });

  describe('assessWeightCutSafety function', () => {
    const targetWeight = 165;

    it('returns safe when at or below target', () => {
      const result = assessWeightCutSafety(165, targetWeight, 3);
      expect(result.level).toBe('safe');

      const underResult = assessWeightCutSafety(163, targetWeight, 3);
      expect(underResult.level).toBe('safe');
    });

    it('returns danger when >3 lbs over in final 24h', () => {
      const result = assessWeightCutSafety(169, targetWeight, 1);
      expect(result.level).toBe('danger');
    });

    it('returns warning when 2-3 lbs over in final 24h', () => {
      const result = assessWeightCutSafety(167.5, targetWeight, 1);
      expect(result.level).toBe('warning');
    });

    it('returns caution when <2 lbs over in final 24h', () => {
      const result = assessWeightCutSafety(166, targetWeight, 1);
      expect(result.level).toBe('caution');
    });

    it('returns danger when >5 lbs over in final 48h', () => {
      const result = assessWeightCutSafety(171, targetWeight, 2);
      expect(result.level).toBe('danger');
    });

    it('returns warning when 3-5 lbs over in final 48h', () => {
      const result = assessWeightCutSafety(169, targetWeight, 2);
      expect(result.level).toBe('warning');
    });

    it('returns caution when <3 lbs over in final 48h', () => {
      const result = assessWeightCutSafety(167, targetWeight, 2);
      expect(result.level).toBe('caution');
    });

    it('returns warning when cut exceeds max safe percentage', () => {
      // 165 * 1.08 = 178.2 (8% over)
      const result = assessWeightCutSafety(180, targetWeight, 5);
      expect(result.level).toBe('warning');
    });

    it('returns caution when significant weight to lose (>5 lbs)', () => {
      const result = assessWeightCutSafety(171, targetWeight, 5);
      expect(result.level).toBe('caution');
    });

    it('returns safe when on track with reasonable margin', () => {
      const result = assessWeightCutSafety(168, targetWeight, 5);
      expect(result.level).toBe('safe');
    });

    it('provides meaningful messages', () => {
      const dangerResult = assessWeightCutSafety(170, targetWeight, 1);
      expect(dangerResult.message).toBeTruthy();
      expect(dangerResult.message.length).toBeGreaterThan(5);

      const safeResult = assessWeightCutSafety(165, targetWeight, 5);
      expect(safeResult.message).toBeTruthy();
    });
  });
});
