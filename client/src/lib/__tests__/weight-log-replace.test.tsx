import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// In-memory weight_logs table. Writes can be made to fail.
const db = vi.hoisted(() => ({
  weightLogs: [] as Record<string, any>[],
  failWrites: false,
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
      then: (res: any, rej?: any) => Promise.resolve(run()).then(res, rej),
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

  it('inserts a new row when there is nothing to replace', async () => {
    const { result } = await loadedStore();
    db.weightLogs = [];
    await act(async () => { await result.current.addLog({ weight: 136.8, date: morning, type: 'morning' }); });
    expect(db.weightLogs).toHaveLength(1);
  });
});
