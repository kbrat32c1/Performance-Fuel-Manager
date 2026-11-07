import { describe, it, expect } from 'vitest';
import {
  mergeCloudWithUnsynced,
  retryDelayMs,
  deriveSyncState,
  loadUnsyncedRows,
  saveUnsyncedRows,
  toFullPayload,
} from '../stores/tracking-sync';
import type { DailyTracking } from '../stores/types';

const row = (date: string, overrides: Partial<DailyTracking> = {}): DailyTracking => ({
  date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0,
  proteinSlices: 0, carbSlices: 0, vegSlices: 0, foodLog: [], ...overrides,
});

describe('mergeCloudWithUnsynced', () => {
  it('returns the cloud rows untouched when nothing is unsynced', () => {
    const cloud = [row('2026-11-05', { waterConsumed: 10 })];
    expect(mergeCloudWithUnsynced(cloud, {})).toBe(cloud);
  });

  it('prefers the unsynced local row over the cloud row for the same date', () => {
    const cloud = [row('2026-11-05', { waterConsumed: 10 }), row('2026-11-06', { waterConsumed: 20 })];
    const local = row('2026-11-06', { waterConsumed: 64 });
    const merged = mergeCloudWithUnsynced(cloud, { '2026-11-06': local });
    expect(merged.find(r => r.date === '2026-11-06')).toBe(local);
    expect(merged.find(r => r.date === '2026-11-05')?.waterConsumed).toBe(10);
  });

  it('adds unsynced days the cloud has never seen', () => {
    const local = row('2026-11-07', { carbsConsumed: 40 });
    const merged = mergeCloudWithUnsynced([row('2026-11-05')], { '2026-11-07': local });
    expect(merged).toHaveLength(2);
    expect(merged).toContain(local);
  });
});

describe('unsynced storage', () => {
  it('round-trips rows per user and keeps users apart', () => {
    saveUnsyncedRows('user-a', { '2026-11-07': row('2026-11-07', { waterConsumed: 8 }) });
    expect(loadUnsyncedRows('user-a')['2026-11-07'].waterConsumed).toBe(8);
    expect(loadUnsyncedRows('user-b')).toEqual({});
  });

  it('removes the entry once nothing is pending', () => {
    saveUnsyncedRows('user-c', { '2026-11-07': row('2026-11-07') });
    saveUnsyncedRows('user-c', {});
    expect(localStorage.getItem('pwm-tracking-unsynced-user-c')).toBeNull();
  });

  it('treats corrupt storage as empty', () => {
    localStorage.setItem('pwm-tracking-unsynced-user-d', '{not json');
    expect(loadUnsyncedRows('user-d')).toEqual({});
  });
});

describe('toFullPayload', () => {
  it('maps every tracked field to its database column', () => {
    const payload = toFullPayload('u1', row('2026-11-07', {
      fruitSlices: 2, fatSlices: 1, nutritionMode: 'spar', noPractice: true,
      foodLog: [{ id: 'f1', name: 'Rice', timestamp: '2026-11-07T12:00:00Z', mode: 'sugar' } as any],
    }));
    expect(payload).toMatchObject({
      user_id: 'u1', date: '2026-11-07', fruit_slices: 2, fat_slices: 1,
      nutrition_mode: 'spar', no_practice: true,
    });
    expect((payload.food_log as unknown[]).length).toBe(1);
  });
});

describe('retryDelayMs', () => {
  it('backs off exponentially and caps at one minute', () => {
    expect(retryDelayMs(1)).toBe(2_000);
    expect(retryDelayMs(2)).toBe(4_000);
    expect(retryDelayMs(3)).toBe(8_000);
    expect(retryDelayMs(20)).toBe(60_000);
  });
});

describe('deriveSyncState', () => {
  it('reports saved only when nothing is pending', () => {
    expect(deriveSyncState(0, false, true)).toBe('saved');
    expect(deriveSyncState(0, false, false)).toBe('saved');
  });
  it('reports offline before saving or unsaved', () => {
    expect(deriveSyncState(2, true, false)).toBe('offline');
  });
  it('distinguishes an active save from a failed one', () => {
    expect(deriveSyncState(1, true, true)).toBe('saving');
    expect(deriveSyncState(1, false, true)).toBe('unsaved');
  });
});
