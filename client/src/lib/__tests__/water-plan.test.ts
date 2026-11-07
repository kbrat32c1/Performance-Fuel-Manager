import { describe, it, expect } from 'vitest';
import {
  getWaterTargetOz, getWaterTargetGallons, getSodiumTarget,
  calculateTargetWeight, getPhaseForDaysUntil, isWaterLoadingDay,
} from '../constants';

describe('water loading on (the default — unchanged plan)', () => {
  it('keeps the existing schedule by days before weigh-in', () => {
    expect([6, 5, 4, 3, 2].map(d => getWaterTargetOz(d, 160))).toEqual([112, 192, 240, 240, 48]);
    expect(getWaterTargetGallons(1, 160)).toBe('Sips only');
    expect(getWaterTargetGallons(0, 160)).toBe('Rehydrate');
  });

  it('keeps the existing sodium plan', () => {
    expect([5, 4, 3, 2, 1].map(d => getSodiumTarget(d).target)).toEqual([5000, 5000, 5000, 2500, 1000]);
  });

  it('keeps the loading allowance and Load days', () => {
    expect(calculateTargetWeight(157, 4, '2').range).toEqual({ min: 168, max: 170 });
    expect([6, 5, 3, 2, 1, 0].map(d => getPhaseForDaysUntil(d))).toEqual(['Train', 'Load', 'Load', 'Cut', 'Cut', 'Compete']);
  });
});

describe('water loading off (drink normally)', () => {
  it('is the same normal amount every day before weigh-in', () => {
    const amounts = [6, 5, 4, 3, 2, 1].map(d => getWaterTargetOz(d, 160, false));
    expect(new Set(amounts)).toEqual(new Set([112]));
    expect(getWaterTargetGallons(1, 160, false)).not.toBe('Sips only');
    expect(getWaterTargetGallons(0, 160, false)).toBe('Rehydrate');
  });

  it('keeps sodium normal', () => {
    for (const d of [5, 4, 3, 2, 1]) expect(getSodiumTarget(d, false).target).toBe(3000);
  });

  it('drops the loading allowance and Load days', () => {
    expect(isWaterLoadingDay(4, '2', false)).toBe(false);
    expect(calculateTargetWeight(157, 4, '2', false).range).toBeNull();
    expect([6, 5, 3, 2, 1, 0].map(d => getPhaseForDaysUntil(d, false))).toEqual(['Train', 'Train', 'Train', 'Cut', 'Cut', 'Compete']);
  });
});
