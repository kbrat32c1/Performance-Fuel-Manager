import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const band = vi.hoisted(() => ({ data: {} as Record<string, unknown>, upserts: [] as Record<string, unknown>[] }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
  registerPlugin: () => ({ syncHealthData: () => Promise.resolve(band.data) }),
}));

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      upsert: (payload: Record<string, unknown>) => {
        band.upserts.push(payload);
        return { select: () => ({ single: () => Promise.resolve({ data: payload, error: null }) }) };
      },
    }),
  },
}));

vi.mock('../healthkit-service', () => ({
  loadHealthData: () => Promise.resolve([]),
  computeRecoveryScoreDetailed: () => ({ score: 70, personalized: false, recommendation: '' }),
  computeStrainScore: () => 5,
}));

import { syncBandToSupabase } from '../v5band-service';
import { isWakeUpSync, getCalendarDateKey } from '../strain-service';

// Saturday Nov 7 2026; stored health day is still Friday Nov 6.
const at = (hour: number) => new Date(2026, 10, 7, hour, 0, 0);

beforeEach(() => {
  localStorage.clear();
  band.upserts = [];
  localStorage.setItem('spar-health-day', '2026-11-06');
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('isWakeUpSync', () => {
  it('needs a full night and a 4 AM – 2 PM wake-up window', () => {
    expect(isWakeUpSync(7.5, 6)).toBe(true);
    expect(isWakeUpSync(3, 4)).toBe(true);
    expect(isWakeUpSync(2.9, 6)).toBe(false);
    expect(isWakeUpSync(7.5, 2)).toBe(false);
    expect(isWakeUpSync(7.5, 14)).toBe(false);
    expect(isWakeUpSync(null, 6)).toBe(false);
  });
});

describe('syncBandToSupabase health-day attribution', () => {
  it('saves a 6 AM wake-up sync to today, not over yesterday', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(6));
    band.data = { sleep_hours: 7.5, hrv: 60 };

    const result = await syncBandToSupabase('athlete-1');

    expect(band.upserts).toHaveLength(1);
    expect(band.upserts[0].date).toBe(getCalendarDateKey(at(6)));
    expect(result?.date).toBe('2026-11-07');
  });

  it('keeps a 2 AM sync with stale sleep on the previous health day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(2));
    band.data = { sleep_hours: 7.5, hrv: 60 };

    await syncBandToSupabase('athlete-1');

    expect(band.upserts[0].date).toBe('2026-11-06');
  });

  it('keeps a mid-sleep 5 AM sync on the previous health day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(5));
    band.data = { sleep_hours: 1.5, hrv: 60 };

    await syncBandToSupabase('athlete-1');

    expect(band.upserts[0].date).toBe('2026-11-06');
  });
});
