import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────
type UpsertResult = { error: { message: string; code?: string } | null };

const db = vi.hoisted(() => ({
  trackingRows: [] as Record<string, unknown>[],
  upsertCalls: [] as Record<string, unknown>[],
  upsertImpl: null as null | ((payload: Record<string, unknown>) => Promise<UpsertResult>),
  weightLogDeletes: [] as Record<string, unknown>[],
}));

vi.mock('../supabase', () => {
  const resolved = (value: unknown) => {
    const chain: any = {
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      order: () => chain,
      select: () => chain,
      single: () => Promise.resolve(value),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(value).then(res, rej),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: () => {
          if (table === 'profiles') return resolved({ data: null, error: { message: 'none' } });
          if (table === 'daily_tracking') return resolved({ data: db.trackingRows, error: null });
          return resolved({ data: [], error: null });
        },
        upsert: (payload: Record<string, unknown>) => {
          if (table !== 'daily_tracking') return Promise.resolve({ error: null });
          db.upsertCalls.push(payload);
          return db.upsertImpl ? db.upsertImpl(payload) : Promise.resolve({ error: null });
        },
        update: () => resolved({ error: null }),
        delete: () => {
          const filters: Record<string, unknown> = { table };
          const chain: any = {
            eq: (col: string, val: unknown) => { filters[col] = val; return chain; },
            gte: () => chain,
            lte: () => chain,
            then: (res: (v: unknown) => unknown) => {
              if (table === 'weight_logs') db.weightLogDeletes.push(filters);
              return Promise.resolve({ error: null }).then(res);
            },
          };
          return chain;
        },
        insert: (row: Record<string, unknown>) => resolved({ data: { ...row, id: `db-${Math.random()}` }, error: null }),
      }),
    },
  };
});

vi.mock('../auth', () => {
  const user = { id: 'athlete-1' };
  return { useAuth: () => ({ user }) };
});

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ toast: toastMock, useToast: () => ({ toast: toastMock }) }));

import { StoreProvider, useStore } from '../store';

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;
const UNSYNCED_KEY = 'pwm-tracking-unsynced-athlete-1';
const DATE = '2026-11-07';

function deferred() {
  let resolve!: (v: UpsertResult) => void;
  const promise = new Promise<UpsertResult>(r => { resolve = r; });
  return { promise, resolve };
}

async function renderLoadedStore() {
  const hook = renderHook(() => useStore(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

beforeEach(() => {
  localStorage.clear();
  db.trackingRows = [];
  db.upsertCalls = [];
  db.upsertImpl = null;
  db.weightLogDeletes = [];
  toastMock.mockClear();
});

describe('daily tracking cloud sync', () => {
  it('marks a successful save as saved and leaves nothing pending', async () => {
    const { result } = await renderLoadedStore();

    act(() => { result.current.updateDailyTracking(DATE, { waterConsumed: 16 }); });

    await waitFor(() => expect(result.current.trackingSyncStatus.state).toBe('saved'));
    expect(db.upsertCalls.at(-1)).toMatchObject({ date: DATE, water_consumed: 16 });
    expect(localStorage.getItem(UNSYNCED_KEY)).toBeNull();
  });

  it('keeps a failed save on the device, warns once, and reports it as unsaved', async () => {
    db.upsertImpl = () => Promise.resolve({ error: { message: 'network down' } });
    const { result } = await renderLoadedStore();

    act(() => { result.current.updateDailyTracking(DATE, { carbsConsumed: 45 }); });

    await waitFor(() => expect(result.current.trackingSyncStatus.state).toBe('unsaved'));
    expect(result.current.trackingSyncStatus.pendingCount).toBe(1);
    expect(JSON.parse(localStorage.getItem(UNSYNCED_KEY)!)[DATE].carbsConsumed).toBe(45);
    expect(toastMock).toHaveBeenCalledTimes(1);

    act(() => { result.current.updateDailyTracking(DATE, { carbsConsumed: 90 }); });
    await waitFor(() => expect(db.upsertCalls.length).toBe(2));
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it('does not let a reload overwrite an unsaved log with the older cloud copy', async () => {
    db.upsertImpl = () => Promise.resolve({ error: { message: 'network down' } });
    const first = await renderLoadedStore();
    const entry = { id: 'e1', name: 'Oatmeal', timestamp: `${DATE}T08:00:00Z`, mode: 'sugar' as const, macroType: 'carbs' as const, gramAmount: 30 };
    act(() => { first.result.current.updateDailyTracking(DATE, { foodLog: [entry], carbsConsumed: 30 }); });
    await waitFor(() => expect(first.result.current.trackingSyncStatus.state).toBe('unsaved'));
    first.unmount();

    // Cloud still has the old, empty day. Connection is back.
    db.trackingRows = [{ date: DATE, carbs_consumed: 0, protein_consumed: 0, water_consumed: 0, food_log: [] }];
    db.upsertImpl = null;
    db.upsertCalls = [];

    const second = await renderLoadedStore();
    expect(second.result.current.getDailyTracking(DATE).foodLog).toHaveLength(1);
    await waitFor(() => expect(second.result.current.trackingSyncStatus.state).toBe('saved'));
    expect((db.upsertCalls.at(-1)!.food_log as unknown[]).length).toBe(1);
    expect(localStorage.getItem(UNSYNCED_KEY)).toBeNull();
  });

  it('applies back-to-back edits on top of each other', async () => {
    const { result } = await renderLoadedStore();

    act(() => {
      result.current.updateDailyTracking(DATE, { waterConsumed: 8 });
      result.current.updateDailyTracking(DATE, { carbsConsumed: 25 });
    });

    await waitFor(() => expect(result.current.trackingSyncStatus.state).toBe('saved'));
    const t = result.current.getDailyTracking(DATE);
    expect(t.waterConsumed).toBe(8);
    expect(t.carbsConsumed).toBe(25);
    expect(db.upsertCalls.at(-1)).toMatchObject({ water_consumed: 8, carbs_consumed: 25 });
  });

  it('sends the newest edit after a slow save, so the cloud never ends on stale data', async () => {
    const slow = deferred();
    db.upsertImpl = () => slow.promise;
    const { result } = await renderLoadedStore();

    act(() => { result.current.updateDailyTracking(DATE, { waterConsumed: 8 }); });
    await waitFor(() => expect(result.current.trackingSyncStatus.state).toBe('saving'));

    db.upsertImpl = null;
    act(() => { result.current.updateDailyTracking(DATE, { waterConsumed: 32 }); });
    expect(db.upsertCalls).toHaveLength(1); // second save waits for the first

    await act(async () => { slow.resolve({ error: null }); });

    await waitFor(() => expect(result.current.trackingSyncStatus.state).toBe('saved'));
    expect(db.upsertCalls).toHaveLength(2);
    expect(db.upsertCalls.at(-1)).toMatchObject({ water_consumed: 32 });
  });

  it('ignores updates that explicitly pass undefined', async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.updateDailyTracking(DATE, { waterConsumed: 20 }); });
    act(() => { result.current.updateDailyTracking(DATE, { waterConsumed: undefined, carbsConsumed: 10 }); });
    await waitFor(() => expect(result.current.trackingSyncStatus.state).toBe('saved'));
    expect(result.current.getDailyTracking(DATE).waterConsumed).toBe(20);
  });
});

describe('weight log cloud cleanup', () => {
  it('never deletes earlier extra-workout logs from the same day', async () => {
    const { result } = await renderLoadedStore();

    await act(async () => {
      await result.current.addLog({ weight: 160, date: new Date(2026, 10, 7, 15, 0), type: 'extra-before' });
    });
    await act(async () => {
      await result.current.addLog({ weight: 158.5, date: new Date(2026, 10, 7, 16, 0), type: 'extra-after' });
    });
    await act(async () => {
      await result.current.addLog({ weight: 159, date: new Date(2026, 10, 7, 18, 0), type: 'extra-before' });
    });

    expect(db.weightLogDeletes).toEqual([]);
  });

  it('never deletes before saving one-per-day weigh-in types (a failed save would lose the old weight)', async () => {
    const { result } = await renderLoadedStore();

    await act(async () => {
      await result.current.addLog({ weight: 161, date: new Date(2026, 10, 7, 7, 0), type: 'morning' });
    });

    // Replacement now overwrites in place; see weight-log-replace.test.tsx.
    expect(db.weightLogDeletes).toEqual([]);
  });
});

describe('targets for a past day', () => {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const noonOffset = (days: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days); return d; };

  async function storeTwoDaysOut() {
    const hook = await renderLoadedStore();
    await act(async () => {
      await hook.result.current.updateProfile({
        protocol: '2', targetWeightClass: 157, currentWeight: 168,
        weighInDate: noonOffset(2), simulatedDate: null, weighInCleared: false,
      });
    });
    return hook;
  }

  it('uses that day\'s distance from weigh-in', async () => {
    const { result } = await storeTwoDaysOut();
    expect(result.current.getTargetsForDate(key(noonOffset(0))).daysUntilWeighIn).toBe(2);
    expect(result.current.getTargetsForDate(key(noonOffset(-1))).daysUntilWeighIn).toBe(3);
    expect(result.current.getTargetsForDate(key(noonOffset(-5))).daysUntilWeighIn).toBe(7);
  });

  it('matches what the app shows when its date is set to that day', async () => {
    const { result } = await storeTwoDaysOut();
    const yesterday = noonOffset(-1);
    // A heavy weigh-in yesterday changes yesterday's macro targets only
    await act(async () => {
      await result.current.addLog({ weight: 175, date: yesterday, type: 'morning' });
    });

    const fromHelper = result.current.getTargetsForDate(key(yesterday));

    await act(async () => { await result.current.updateProfile({ simulatedDate: yesterday }); });
    const viaSimulatedDate = {
      macros: result.current.getMacroTargets(),
      slices: result.current.getSliceTargets(),
      hydration: result.current.getHydrationTarget(),
    };

    expect(fromHelper.macros).toEqual(viaSimulatedDate.macros);
    expect(fromHelper.slices).toEqual(viaSimulatedDate.slices);
    expect(fromHelper.hydration).toEqual(viaSimulatedDate.hydration);
  });

  it('gives a past day different targets from today when the plan changed', async () => {
    const { result } = await storeTwoDaysOut();
    const today = result.current.getTargetsForDate(key(noonOffset(0)));
    const weekAgo = result.current.getTargetsForDate(key(noonOffset(-7)));
    expect(weekAgo.hydration.targetOz).not.toBe(today.hydration.targetOz);
  });

  it('leaves today\'s getters untouched afterwards', async () => {
    const { result } = await storeTwoDaysOut();
    const before = result.current.getMacroTargets();
    result.current.getTargetsForDate(key(noonOffset(-6)));
    expect(result.current.getDaysUntilWeighIn()).toBe(2);
    expect(result.current.getMacroTargets()).toEqual(before);
  });
});
