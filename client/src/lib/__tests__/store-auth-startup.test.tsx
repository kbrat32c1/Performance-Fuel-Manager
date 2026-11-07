import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Auth state the test controls: a fresh page load starts with loading=true and no user yet
const auth = vi.hoisted(() => ({ value: { user: null as null | { id: string }, loading: true } }));
vi.mock('../auth', () => ({ useAuth: () => auth.value }));

vi.mock('../supabase', () => {
  const pending = () => new Promise(() => {});
  const chain: any = { eq: () => chain, order: () => chain, single: pending, then: (r: any) => pending().then(r) };
  return { supabase: { from: () => ({ select: () => chain }) } };
});
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

import { StoreProvider, useStore } from '../store';

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pwm-profile-cache', JSON.stringify({ name: 'Sam', hasCompletedOnboarding: true, targetWeightClass: 157 }));
});

describe('store startup while Supabase restores the session', () => {
  it('keeps the cached profile and stays loading instead of acting signed out', () => {
    auth.value = { user: null, loading: true };
    const { result } = renderHook(() => useStore(), { wrapper });

    // Treating this moment as "signed out" wiped the profile to a not-onboarded default,
    // which made the route guard bounce every deep link (e.g. /weigh-in) to the dashboard.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.profile.hasCompletedOnboarding).toBe(true);
  });

  it('resets once auth confirms nobody is signed in', () => {
    auth.value = { user: null, loading: false };
    const { result } = renderHook(() => useStore(), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.profile.hasCompletedOnboarding).toBe(false);
  });
});
