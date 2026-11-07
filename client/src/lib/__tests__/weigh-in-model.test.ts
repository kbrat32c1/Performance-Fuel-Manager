import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseWeightInput, logForDay, recentReadings, practiceChange, timestampFor,
  loadDrafts, saveDrafts, draftSlotKey,
} from '../weigh-in-model';
import type { WeightLog } from '../stores/types';

const log = (type: WeightLog['type'], weight: number, y: number, m: number, d: number, h = 8): WeightLog =>
  ({ id: `${type}-${y}${m}${d}${h}`, type, weight, date: new Date(y, m - 1, d, h) });

describe('parseWeightInput', () => {
  it('treats blank as not recorded, never zero', () => {
    expect(parseWeightInput('')).toEqual({ kind: 'empty' });
    expect(parseWeightInput('   ')).toEqual({ kind: 'empty' });
  });
  it('accepts whole pounds and one decimal', () => {
    expect(parseWeightInput('157')).toEqual({ kind: 'weight', weight: 157 });
    expect(parseWeightInput(' 157.4 ')).toEqual({ kind: 'weight', weight: 157.4 });
  });
  it('waits while a number is still being typed', () => {
    expect(parseWeightInput('15')).toEqual({ kind: 'incomplete' });
    expect(parseWeightInput('157.')).toEqual({ kind: 'incomplete' });
  });
  it('explains values that cannot be a weight', () => {
    expect(parseWeightInput('157.45').kind).toBe('invalid');
    expect(parseWeightInput('abc').kind).toBe('invalid');
    expect(parseWeightInput('450').kind).toBe('invalid');
    expect(parseWeightInput('040').kind).toBe('invalid');
  });
});

describe('readings by day', () => {
  const logs = [
    log('morning', 160.2, 2026, 11, 7, 6),
    log('morning', 161.0, 2026, 11, 6, 6),
    log('morning', 161.4, 2026, 11, 5, 6),
    log('morning', 162.0, 2026, 11, 4, 6),
    log('pre-practice', 163.0, 2026, 11, 6, 15),
  ];

  it('finds the reading of a type on a day', () => {
    expect(logForDay(logs, 'morning', '2026-11-07')?.weight).toBe(160.2);
    expect(logForDay(logs, 'before-bed', '2026-11-07')).toBeUndefined();
  });

  it('lists the last three earlier readings of the same type, newest first', () => {
    expect(recentReadings(logs, 'morning', '2026-11-07').map(r => r.weight)).toEqual([161.0, 161.4, 162.0]);
    expect(recentReadings(logs, 'pre-practice', '2026-11-07').map(r => r.weight)).toEqual([163.0]);
  });
});

describe('practiceChange', () => {
  it('shows After minus Before as plain signed numbers', () => {
    expect(practiceChange(160, 157.6)).toBe('−2.4 lb (1.5%)');
    expect(practiceChange(157, 157.8)).toBe('+0.8 lb (0.5%)');
    expect(practiceChange(157, 157)).toBe('No change');
  });
  it('is blank until both are recorded', () => {
    expect(practiceChange(undefined, 157)).toBe('');
    expect(practiceChange(157, undefined)).toBe('');
  });
});

describe('timestampFor', () => {
  it('uses now for today and a typical time for an earlier day', () => {
    const now = new Date(2026, 10, 7, 13, 5);
    expect(timestampFor('morning', '2026-11-07', now)).toBe(now);
    expect(timestampFor('before-bed', '2026-11-06', now)).toEqual(new Date(2026, 10, 6, 22, 0));
  });
});

describe('drafts', () => {
  beforeEach(() => localStorage.clear());
  it('keeps unsaved values per user', () => {
    saveDrafts('a', { [draftSlotKey('2026-11-07', 'morning')]: '160.2' });
    expect(loadDrafts('a')['2026-11-07|morning']).toBe('160.2');
    expect(loadDrafts('b')).toEqual({});
    saveDrafts('a', {});
    expect(loadDrafts('a')).toEqual({});
  });
});
