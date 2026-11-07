import { describe, it, expect } from 'vitest';
import {
  getWaterTargetOz, getWaterTargetGallons, getWaterBaseWeight, getSodiumTarget,
  calculateTargetWeight, getPhaseForDaysUntil, isWaterLoadingDay,
} from '../constants';

const ML_PER_KG_TO_OZ_PER_LB = 0.01534;

describe('water plan — steady hydration (default)', () => {
  it('is the same amount every day before weigh-in', () => {
    const amounts = [7, 5, 4, 3, 2, 1].map(d => getWaterTargetOz(d, 160));
    expect(new Set(amounts).size).toBe(1);
    expect(amounts[0]).toBe(112); // 0.7 oz/lb
  });

  it('never drops to sips the day before weigh-in', () => {
    expect(getWaterTargetGallons(1, 160)).toBe('1.0 gal');
  });

  it('says rehydrate on weigh-in day', () => {
    expect(getWaterTargetOz(0, 160)).toBe(0);
    expect(getWaterTargetGallons(0, 160)).toBe('Rehydrate');
  });
});

describe('water plan — water loading on (Reale et al. 2018)', () => {
  it('loads 100 ml/kg on days 4, 3 and 2 out', () => {
    for (const d of [4, 3, 2]) {
      expect(getWaterTargetOz(d, 160, true)).toBe(Math.round(160 * 100 * ML_PER_KG_TO_OZ_PER_LB * 0.9974));
    }
    expect(getWaterTargetGallons(3, 160, true)).toBe('2.0 gal');
  });

  it('drops to 15 ml/kg — not sips — the day before weigh-in', () => {
    const oz = getWaterTargetOz(1, 160, true);
    expect(oz).toBe(37);
    expect(getWaterTargetGallons(1, 160, true)).toBe('37 oz');
  });

  it('is steady outside the loading window', () => {
    expect(getWaterTargetOz(5, 160, true)).toBe(getWaterTargetOz(5, 160));
    expect(getWaterTargetOz(-1, 160, true)).toBe(getWaterTargetOz(-1, 160));
  });

  it('caps any day at 320 oz for heavyweights', () => {
    expect(getWaterTargetOz(3, 285, true)).toBe(320);
  });
});

describe('sodium', () => {
  it('stays normal all week in both plans', () => {
    for (const d of [6, 5, 4, 3, 2, 1, -1]) expect(getSodiumTarget(d).target).toBe(3000);
  });
});

describe('getWaterBaseWeight', () => {
  const weighIn = new Date(2026, 10, 14, 12);
  const log = (day: number, weight: number, type = 'morning') => ({ date: new Date(2026, 10, day, 7), weight, type });

  it('uses the last morning weight from before loading starts', () => {
    const logs = [log(9, 161), log(10, 160.5), log(11, 163.5), log(12, 164)];
    expect(getWaterBaseWeight(logs, weighIn, 157)).toBe(160.5);
  });

  it('falls back to the latest morning weight, then any weight, then walk-around', () => {
    expect(getWaterBaseWeight([log(12, 164)], weighIn, 157)).toBe(164);
    expect(getWaterBaseWeight([log(12, 159, 'post-practice')], weighIn, 157)).toBe(159);
    expect(getWaterBaseWeight([], weighIn, 157)).toBe(168);
  });
});

describe('weight targets and phases follow the switch', () => {
  it('adds the +2-4 lb loading allowance only when loading is on', () => {
    expect(calculateTargetWeight(157, 3, '2').range).toBeNull();
    expect(calculateTargetWeight(157, 3, '2', true).range).toEqual({ min: 167, max: 169 });
    expect(calculateTargetWeight(157, 5, '2', true).range).toBeNull();
    expect(isWaterLoadingDay(2, '2', true)).toBe(true);
    expect(isWaterLoadingDay(2, '2', false)).toBe(false);
  });

  it('labels loading days only when loading is on', () => {
    expect([5, 4, 3, 2, 1, 0].map(d => getPhaseForDaysUntil(d))).toEqual(['Train', 'Train', 'Train', 'Cut', 'Cut', 'Compete']);
    expect([5, 4, 3, 2, 1, 0].map(d => getPhaseForDaysUntil(d, true))).toEqual(['Train', 'Load', 'Load', 'Load', 'Cut', 'Compete']);
  });
});
