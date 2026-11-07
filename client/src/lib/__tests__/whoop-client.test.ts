import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('../auth-headers', () => ({ authHeaders: async () => ({}) }));

import { getWhoopStatus, syncWhoop } from '../whoop';

afterEach(() => { vi.restoreAllMocks(); rpc.mockReset(); });

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
