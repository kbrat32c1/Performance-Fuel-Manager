import { addDays, format, parseISO } from 'date-fns';

export interface TeamEvent {
  id: string;
  name: string;
  eventDate: string; // yyyy-MM-dd, first weigh-in day
  days: 1 | 2;
}

export interface ScheduledWeighIn {
  event: TeamEvent;
  date: string; // yyyy-MM-dd of this weigh-in day
  day: 1 | 2;
}

export const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

/** Every weigh-in day an event has, in order. */
export function eventDays(event: TeamEvent): string[] {
  const start = parseISO(event.eventDate);
  return Array.from({ length: event.days }, (_, i) => dayKey(addDays(start, i)));
}

/**
 * The athlete's next weigh-in day on or after `todayKey`, skipping events they aren't
 * going to. On day 2 of a tournament this is day 2, so the countdown stays on today.
 */
export function nextScheduledWeighIn(
  events: TeamEvent[],
  skippedIds: string[],
  todayKey: string,
): ScheduledWeighIn | null {
  const skipped = new Set(skippedIds);
  const upcoming = events
    .filter(e => !skipped.has(e.id))
    .sort((a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0));
  for (const event of upcoming) {
    const days = eventDays(event);
    const i = days.findIndex(d => d >= todayKey);
    if (i >= 0) return { event, date: days[i], day: (i + 1) as 1 | 2 };
  }
  return null;
}

/** "Roger Williams Open (day 2), Sun, Nov 15" */
export function describeWeighIn(w: ScheduledWeighIn): string {
  const when = format(parseISO(w.date), 'EEE, MMM d');
  return `${w.event.name}${w.event.days === 2 ? ` (day ${w.day})` : ''}, ${when}`;
}

export function validateEvent(input: { name: string; eventDate: string; days: number }): string | null {
  if (!input.name.trim()) return 'Give the event a name.';
  if (input.name.trim().length > 80) return 'Keep the name under 80 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) return 'Pick the weigh-in date.';
  if (input.days !== 1 && input.days !== 2) return 'Events are 1 or 2 days.';
  return null;
}

const PENDING_CODE = 'pwm-pending-team-code';

/** Remember a team link's code so it survives sign-in and onboarding. */
export function rememberPendingTeamCode(search: string, pathname: string) {
  try {
    const code = new URLSearchParams(search).get('join');
    if (pathname === '/team' && code) localStorage.setItem(PENDING_CODE, code.trim().toUpperCase().slice(0, 6));
  } catch { /* storage blocked */ }
}

export function peekPendingTeamCode(): string {
  try { return localStorage.getItem(PENDING_CODE) ?? ''; } catch { return ''; }
}

export function takePendingTeamCode(): string {
  const code = peekPendingTeamCode();
  try { localStorage.removeItem(PENDING_CODE); } catch { /* storage blocked */ }
  return code;
}
