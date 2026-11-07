import { describe, it, expect } from 'vitest';
import { nextScheduledWeighIn, describeWeighIn, validateEvent, allowanceForDate, type TeamEvent } from '../team-schedule';

const events: TeamEvent[] = [
  { id: 'dual', name: 'Dual vs Bryant', eventDate: '2026-11-21', days: 1, allowance: 0 },
  { id: 'rw', name: 'Roger Williams Open', eventDate: '2026-11-14', days: 2, allowance: 1 },
  { id: 'cliff', name: 'Cliff Keen', eventDate: '2026-12-04', days: 2, allowance: 0 },
];

describe('nextScheduledWeighIn', () => {
  it('picks the earliest event that has not happened yet, whatever order they were entered', () => {
    expect(nextScheduledWeighIn(events, [], '2026-11-07')).toMatchObject({ date: '2026-11-14', day: 1, event: { id: 'rw' } });
  });

  it('stays on the tournament for day 2', () => {
    expect(nextScheduledWeighIn(events, [], '2026-11-15')).toMatchObject({ date: '2026-11-15', day: 2, event: { id: 'rw' } });
  });

  it('moves to the next event the day after a tournament ends', () => {
    expect(nextScheduledWeighIn(events, [], '2026-11-16')).toMatchObject({ date: '2026-11-21', day: 1, event: { id: 'dual' } });
  });

  it('skips events the athlete is not going to', () => {
    expect(nextScheduledWeighIn(events, ['dual'], '2026-11-16')).toMatchObject({ date: '2026-12-04', event: { id: 'cliff' } });
  });

  it('returns null after the last event', () => {
    expect(nextScheduledWeighIn(events, [], '2026-12-06')).toBeNull();
  });
});

describe('describeWeighIn', () => {
  it('names the day of a two-day tournament', () => {
    expect(describeWeighIn({ event: events[1], date: '2026-11-15', day: 2, allowance: 1 })).toBe('Roger Williams Open (day 2), Sun, Nov 15 · +1 lb');
  });

  it('leaves the day off a dual', () => {
    expect(describeWeighIn({ event: events[0], date: '2026-11-21', day: 1, allowance: 0 })).toBe('Dual vs Bryant, Sat, Nov 21');
  });
});

describe('validateEvent', () => {
  it('needs a name, a date and 1 or 2 days', () => {
    expect(validateEvent({ name: ' ', eventDate: '2026-11-14', days: 1 })).toMatch(/name/);
    expect(validateEvent({ name: 'Open', eventDate: '', days: 1 })).toMatch(/date/);
    expect(validateEvent({ name: 'Open', eventDate: '2026-11-14', days: 3 })).toMatch(/1 or 2/);
    expect(validateEvent({ name: 'Open', eventDate: '2026-11-14', days: 2 })).toBeNull();
  });
});

describe('allowance', () => {
  it('applies only on the last weigh-in day of an event', () => {
    expect(nextScheduledWeighIn(events, [], '2026-11-14')).toMatchObject({ day: 1, allowance: 0 });
    expect(nextScheduledWeighIn(events, [], '2026-11-15')).toMatchObject({ day: 2, allowance: 1 });
  });

  it('can be turned off per event', () => {
    const off = events.map(e => (e.id === 'rw' ? { ...e, allowance: 0 } : e));
    expect(nextScheduledWeighIn(off, [], '2026-11-15')).toMatchObject({ day: 2, allowance: 0 });
  });

  it('looks up the allowance for a weigh-in date', () => {
    expect(allowanceForDate(events, '2026-11-15')).toBe(1);
    expect(allowanceForDate(events, '2026-11-14')).toBe(0);
    expect(allowanceForDate(events, '2026-11-30')).toBe(0);
  });
});
