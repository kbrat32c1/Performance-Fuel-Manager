import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const healthRow = vi.fn();
vi.mock('../supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => healthRow() }) }) }) }),
  },
}));
vi.mock('../auth-headers', () => ({ authHeaders: async () => ({}) }));

import { getWhoopStatus, hasRecoveryForDate, syncWhoop, whoopSyncDue } from '../whoop';

afterEach(() => { vi.restoreAllMocks(); rpc.mockReset(); healthRow.mockReset(); });

describe('WHOOP client failures', () => {
  it('a dropped connection returns an error message instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(syncWhoop()).resolves.toMatch(/Couldn't reach SPAR/);
  });

  it('a failed status check is "error", not "not connected"', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '500', message: 'upstream timeout' } });
    await expect(getWhoopStatus()).resolves.toBe('error');
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getWhoopStatus()).resolves.toBe('error');
  });

  it('a missing database function is still "unavailable"', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'function whoop_status not found' } });
    await expect(getWhoopStatus()).resolves.toBe('unavailable');
  });

  it('no row means not connected', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(getWhoopStatus()).resolves.toMatchObject({ connected: false });
  });
});

describe('how soon WHOOP syncs again', () => {
  const syncedAt = Date.parse('2026-11-09T11:17:00Z');
  const status = { connected: true, connectedAt: null, lastSyncedAt: new Date(syncedAt).toISOString(), lastError: null };
  const minutesLater = (m: number) => syncedAt + m * 60_000;

  it('waits 3 hours once today is in', () => {
    expect(whoopSyncDue(status, minutesLater(40))).toBe(false);
    expect(whoopSyncDue(status, minutesLater(181))).toBe(true);
  });

  it("waits only 10 minutes while today's recovery is missing", () => {
    expect(whoopSyncDue(status, minutesLater(9), true)).toBe(false);
    expect(whoopSyncDue(status, minutesLater(11), true)).toBe(true);
  });

  it('never syncs when not connected', () => {
    expect(whoopSyncDue({ ...status, connected: false }, minutesLater(600), true)).toBe(false);
  });

  it('counts a day as waiting only when its recovery score is missing', async () => {
    healthRow.mockResolvedValue({ data: { recovery_score: 18 }, error: null });
    await expect(hasRecoveryForDate('u', '2026-11-09')).resolves.toBe(true);
    healthRow.mockResolvedValue({ data: { recovery_score: null }, error: null });
    await expect(hasRecoveryForDate('u', '2026-11-09')).resolves.toBe(false);
    healthRow.mockResolvedValue({ data: null, error: null });
    await expect(hasRecoveryForDate('u', '2026-11-09')).resolves.toBe(false);
  });

  it('keeps the normal wait when the check fails', async () => {
    healthRow.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(hasRecoveryForDate('u', '2026-11-09')).resolves.toBe(true);
    healthRow.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(hasRecoveryForDate('u', '2026-11-09')).resolves.toBe(true);
  });
});
