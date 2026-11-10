import { describe, expect, it } from 'vitest';
import { toDateOnly, toLocalDate } from '../date-only';

describe('toDateOnly', () => {
  it('keeps the local day for an evening time', () => {
    expect(toDateOnly(new Date(2026, 10, 13, 19, 30))).toBe('2026-11-13');
    expect(toDateOnly(new Date(2026, 10, 13, 23, 59))).toBe('2026-11-13');
  });

  it('keeps the local day just after midnight', () => {
    expect(toDateOnly(new Date(2026, 10, 13, 0, 5))).toBe('2026-11-13');
  });

  it('leaves a plain date alone', () => {
    expect(toDateOnly('2026-11-14')).toBe('2026-11-14');
  });

  it('reads a saved timestamp as the local day', () => {
    const saved = new Date(2026, 10, 13, 19, 30).toISOString();
    expect(toDateOnly(saved)).toBe('2026-11-13');
  });
});

describe('toLocalDate', () => {
  it('reads a plain date as that local day', () => {
    const date = toLocalDate('2026-11-14');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 14]);
    expect(toDateOnly(date)).toBe('2026-11-14');
  });

  it('returns a Date unchanged', () => {
    const date = new Date(2026, 10, 13, 19, 30);
    expect(toLocalDate(date)).toBe(date);
  });
});
