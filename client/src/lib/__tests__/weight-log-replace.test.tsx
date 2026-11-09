import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// In-memory weight_logs table. Writes can be made to fail.
const db = vi.hoisted(() => ({
  weightLogs: [] as Record<string, any>[],
  failWrites: false,
  deleteGate: null as Promise<void> | null,
  failDeleteIds: [] as string[],
}));

vi.mock('../supabase', () => {
  const query = (table: string, op: 'select' | 'update' | 'delete', payload?: Record<string, any>) => {
    const filters: Array<(r: Record<string, any>) => boolean> = [];
    let single = false;
    const run = () => {
      if (table !== 'weight_logs') {
        return table === 'profiles' && op === 'select'
          ? { data: null, error: { message: 'none' } }
          : { data: op === 'select' ? [] : null, error: null };
      }
      const rows = db.weightLogs.filter(r => filters.every(f => f(r)));
      if (op === 'delete') {
        if (rows.some(r => db.failDeleteIds.includes(r.id))) return { data: null, error: { message: 'network down' } };
        db.weightLogs = db.weightLogs.filter(r => !rows.includes(r));
        return { data: null, error: null };
      }
      if (op === 'update') {
        if (db.failWrites) return { data: null, error: { message: 'network down' } };
        rows.forEach(r => Object.assign(r, payload));
        return { data: single ? rows[0] ?? null : rows, error: null };
      }
      return { data: single ? rows[0] ?? null : rows, error: null };
    };
    const chain: any = {
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return chain; },
      gte: (c: string, v: string) => { filters.push(r => r[c] >= v); return chain; },
      lte: (c: string, v: string) => { filters.push(r => r[c] <= v); return chain; },
      order: () => chain, limit: () => chain, select: () => chain,
      single: () => { single = true; return Promise.resolve(run()); },
      then: (res: any, rej?: any) => ((op === 'delete' && db.deleteGate) || Promise.resolve()).then(run).then(res, rej),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: () => query(table, 'select'),
        update: (p: Record<string, any>) => query(table, 'update', p),
        delete: () => query(table, 'delete'),
        upsert: () => Promise.resolve({ error: null }),
        insert: (row: Record<string, any>) => {
          const chain: any = {
            select: () => chain,
            single: () => {
              if (table !== 'weight_logs') return Promise.resolve({ data: null, error: null });
              if (db.failWrites) return Promise.resolve({ data: null, error: { message: 'network down' } });
              const saved = { ...row, id: `db-${db.weightLogs.length + 1}` };
              db.weightLogs.push(saved);
              return Promise.resolve({ data: saved, error: null });
            },
          };
          return chain;
        },
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
import { makeUndoDelete } from '../undo-deleted-log';

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;
const morning = new Date('2026-11-07T11:30:00.000Z');
const existingRow = () => ({ id: 'db-old', user_id: 'athlete-1', weight: 137.4, type: 'morning', date: '2026-11-07T11:00:00.000Z' });

async function loadedStore() {
  const hook = renderHook(() => useStore(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

beforeEach(() => {
  localStorage.clear();
  toastMock.mockClear();
  db.failWrites = false;
  db.deleteGate = null;
  db.failDeleteIds = [];
  db.weightLogs = [];
});

describe('saving a weigh-in over a stale copy', () => {
  it('keeps the old weight when the replacement save fails', async () => {
    const { result } = await loadedStore();
    // The database has this morning's weight, but this device doesn't know about it.
    db.weightLogs = [existingRow()];
    db.failWrites = true;

    let id: string | null = 'x';
    await act(async () => { id = await result.current.addLog({ weight: 136.8, date: morning, type: 'morning' }); });

    expect(id).toBeNull();
    expect(db.weightLogs).toHaveLength(1);
    expect(db.weightLogs[0].weight).toBe(137.4);
  });

  it('overwrites the existing row in place when the save succeeds', async () => {
    const { result } = await loadedStore();
    db.weightLogs = [existingRow()];

    let id: string | null = null;
    await act(async () => { id = await result.current.addLog({ weight: 136.8, date: morning, type: 'morning' }); });

    expect(id).toBe('db-old');
    expect(db.weightLogs).toHaveLength(1);
    expect(db.weightLogs[0].weight).toBe(136.8);
  });

  it('clears a duration the new entry does not carry', async () => {
    const { result } = await loadedStore();
    db.weightLogs = [{ ...existingRow(), type: 'post-practice', duration: 120 }];
    await act(async () => { await result.current.addLog({ weight: 136.8, date: morning, type: 'post-practice' }); });
    expect(db.weightLogs).toHaveLength(1);
    expect(db.weightLogs[0].duration).toBeNull();
  });

  it('inserts a new row when there is nothing to replace', async () => {
    const { result } = await loadedStore();
    db.weightLogs = [];
    await act(async () => { await result.current.addLog({ weight: 136.8, date: morning, type: 'morning' }); });
    expect(db.weightLogs).toHaveLength(1);
  });
});

describe('undoing a deleted weigh-in', () => {
  it('restores it through the copy of addLog taken before the delete', async () => {
    db.weightLogs = [existingRow()];
    const { result } = await loadedStore();
    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    const addLogFromBeforeDelete = result.current.addLog;
    const id = result.current.logs[0].id;

    await act(async () => { await result.current.deleteLog(id); });
    expect(db.weightLogs).toHaveLength(0);

    let saved: string | null = null;
    await act(async () => { saved = await addLogFromBeforeDelete({ weight: 137.4, date: morning, type: 'morning' }); });

    expect(saved).not.toBeNull();
    expect(db.weightLogs).toHaveLength(1);
    expect(db.weightLogs[0].weight).toBe(137.4);
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Already logged' }));
  });

  it('survives Undo tapped while the delete is still on its way', async () => {
    db.weightLogs = [existingRow()];
    const { result } = await loadedStore();
    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    const original = result.current.logs[0];
    let release: () => void = () => {};
    db.deleteGate = new Promise<void>(r => { release = r; });

    let deletion: Promise<boolean> = Promise.resolve(false);
    act(() => { deletion = result.current.deleteLog(original.id); });
    const undo = makeUndoDelete([{ log: original, deletion }], result.current.addLog);

    let restored: Promise<boolean> = Promise.resolve(false);
    act(() => { restored = undo(); });
    await act(async () => { release(); expect(await restored).toBe(true); });

    expect(db.weightLogs).toHaveLength(1);
    expect(db.weightLogs[0].weight).toBe(137.4);
  });

  describe.each([
    ['the first delete fails', 'db-before'],
    ['the second delete fails', 'db-after'],
  ])('a before-and-after pair when %s', (_label, failingId) => {
    it('restores only the half that was removed, with Undo tapped mid-delete, and survives a reload', async () => {
      const row = (id: string, type: string, weight: number) => ({ id, user_id: 'athlete-1', weight, type, date: '2026-11-07T11:30:00.000Z' });
      db.weightLogs = [row('db-before', 'extra-before', 170), row('db-after', 'extra-after', 168)];
      const { result, unmount } = await loadedStore();
      await waitFor(() => expect(result.current.logs).toHaveLength(2));
      const before = result.current.logs.find(l => l.id === 'db-before')!;
      const after = result.current.logs.find(l => l.id === 'db-after')!;
      db.failDeleteIds = [failingId];
      let release: () => void = () => {};
      db.deleteGate = new Promise<void>(r => { release = r; });

      let beforeDeletion: Promise<boolean> = Promise.resolve(false);
      let afterDeletion: Promise<boolean> = Promise.resolve(false);
      act(() => {
        beforeDeletion = result.current.deleteLog('db-before');
        afterDeletion = result.current.deleteLog('db-after');
      });
      const undo = makeUndoDelete([{ log: before, deletion: beforeDeletion }, { log: after, deletion: afterDeletion }], result.current.addLog);

      let restored: Promise<boolean> = Promise.resolve(false);
      act(() => { restored = undo(); });
      await act(async () => { release(); expect(await restored).toBe(true); });

      expect(db.weightLogs.map(r => r.weight).sort()).toEqual([168, 170]);
      expect(result.current.logs.map(l => l.weight).sort()).toEqual([168, 170]);

      unmount();
      const reloaded = await loadedStore();
      await waitFor(() => expect(reloaded.result.current.logs).toHaveLength(2));
      expect(reloaded.result.current.logs.map(l => l.weight).sort()).toEqual([168, 170]);
    });
  });

  it('still refuses a real duplicate', async () => {
    db.weightLogs = [existingRow()];
    const { result } = await loadedStore();
    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    let saved: string | null = 'x';
    await act(async () => { saved = await result.current.addLog({ weight: 137, date: new Date(result.current.logs[0].date), type: 'morning' }); });
    expect(saved).toBeNull();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Already logged' }));
  });
});
