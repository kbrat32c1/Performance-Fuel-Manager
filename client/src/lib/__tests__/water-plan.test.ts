import { describe, it, expect } from 'vitest';
import {
  getWaterTargetOz, getWaterTargetGallons, getSodiumPlan,
  calculateTargetWeight, getPhaseForDaysUntil, isWaterLoadingDay,
} from '../constants';

describe('water loading on (Kevin\'s FINAL_13 week)', () => {
  it('uses gallons by weigh-in class', () => {
    expect([5, 4, 3, 2].map(d => getWaterTargetGallons(d, 135, true, 133))).toEqual(['1.0 gal', '1.25 gal', '1.50 gal', '1.25 gal']);
    expect([5, 4, 3, 2].map(d => getWaterTargetGallons(d, 160, true, 157))).toEqual(['1.25 gal', '1.50 gal', '1.75 gal', '1.50 gal']);
    expect([5, 4, 3, 2].map(d => getWaterTargetOz(d, 160, true, 157))).toEqual([160, 192, 224, 192]);
    expect([5, 4, 3, 2].map(d => getWaterTargetGallons(d, 200, true, 197))).toEqual(['1.50 gal', '1.75 gal', '2.0 gal', '1.75 gal']);
  });

  it('puts heavyweights in the top column', () => {
    expect(getWaterTargetOz(3, 280, true, 285)).toBe(256);
  });

  it('keeps training days on normal drinking', () => {
    expect(getWaterTargetOz(6, 160, true, 157)).toBe(112);
  });

  it('reduces the day before, without sips only', () => {
    expect(getWaterTargetGallons(1, 160, true, 157)).toBe('0.25-0.5 gal');
    expect(getWaterTargetOz(1, 160, true, 157)).toBe(64);
    expect(getWaterTargetGallons(0, 160, true, 157)).toBe('Rehydrate');
  });

  it('uses the group table the day after', () => {
    expect(getWaterTargetOz(-1, 160, true, 157)).toBe(160);
  });

  it('has no salt-load, and never zero the day before', () => {
    expect([5, 4, 3, 2, 1].map(d => getSodiumPlan(d).label)).toEqual(['Normal', 'Normal', 'Normal to moderate', 'Low', 'Very low']);
  });

  it('counts water loading through 2 days out, without raising the target', () => {
    expect(calculateTargetWeight(157, 2, '2')).toEqual({ base: 163, waterLoading: true });
    expect(calculateTargetWeight(157, 1, '2')).toEqual({ base: 162, waterLoading: false });
  });

  it('keeps the base target and Load days', () => {
    expect(calculateTargetWeight(157, 4, '2')).toEqual({ base: 166, waterLoading: true });
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
    for (const d of [5, 4, 3, 2, 1]) expect(getSodiumPlan(d, false).label).toBe('Normal');
  });

  it('has no water loading or Load days', () => {
    expect(isWaterLoadingDay(4, '2', false)).toBe(false);
    expect(calculateTargetWeight(157, 4, '2', false)).toEqual({ base: 166, waterLoading: false });
    expect([6, 5, 3, 2, 1, 0].map(d => getPhaseForDaysUntil(d, false))).toEqual(['Train', 'Train', 'Train', 'Cut', 'Cut', 'Compete']);
  });
});
