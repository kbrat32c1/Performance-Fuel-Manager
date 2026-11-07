import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { apiUrl, getApiOrigin } from '../api';

describe('apiUrl', () => {
  it('keeps API paths relative on the web', () => {
    expect(getApiOrigin(false)).toBe('');
    expect(apiUrl('/api/foods/search?q=rice', false)).toBe('/api/foods/search?q=rice');
  });

  it('points the iPhone app at the live server', () => {
    expect(apiUrl('/api/ai/coach', true)).toBe('https://performance-fuel-manager.vercel.app/api/ai/coach');
  });
});
