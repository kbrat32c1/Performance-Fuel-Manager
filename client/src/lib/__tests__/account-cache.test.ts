import { beforeEach, describe, expect, it } from 'vitest';
import { CACHE_OWNER_KEY, STORAGE_KEYS, claimAccountCache, clearAccountCache } from '../storage-keys';

describe('account cache on a shared device', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEYS.PROFILE_CACHE, '{"name":"A"}');
    localStorage.setItem(STORAGE_KEYS.foodHistory('2026-11-07'), '[]');
    localStorage.setItem(STORAGE_KEYS.DASHBOARD_TOUR_SEEN, 'true');
    localStorage.setItem(STORAGE_KEYS.THEME, 'dark');
    localStorage.setItem(STORAGE_KEYS.trackingUnsynced('user-a'), '{}');
    localStorage.setItem(STORAGE_KEYS.PROFILE, '{"legacy":true}');
    localStorage.setItem('unrelated', 'x');
  });

  it('keeps the cache when the same person signs in again', () => {
    localStorage.setItem(CACHE_OWNER_KEY, 'user-a');
    expect(claimAccountCache('user-a')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.PROFILE_CACHE)).not.toBeNull();
  });

  it("drops another account's data when someone else signs in", () => {
    localStorage.setItem(CACHE_OWNER_KEY, 'user-a');
    expect(claimAccountCache('user-b')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.PROFILE_CACHE)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.foodHistory('2026-11-07'))).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.DASHBOARD_TOUR_SEEN)).toBeNull();
    expect(localStorage.getItem(CACHE_OWNER_KEY)).toBe('user-b');
  });

  it('keeps device settings, per-user unsaved rows, pre-account data and other apps’ keys', () => {
    clearAccountCache();
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEYS.trackingUnsynced('user-a'))).toBe('{}');
    expect(localStorage.getItem(STORAGE_KEYS.PROFILE)).toBe('{"legacy":true}');
    expect(localStorage.getItem('unrelated')).toBe('x');
  });

  it('treats a cache with no recorded owner as not this account', () => {
    expect(claimAccountCache('user-a')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.PROFILE_CACHE)).toBeNull();
  });
});
