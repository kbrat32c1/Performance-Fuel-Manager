import { MIN_WEIGHT_LBS, MAX_WEIGHT_LBS } from './constants';
import type { WeightLog } from './stores/types';

export type DailySlotType = 'morning' | 'pre-practice' | 'post-practice' | 'before-bed';

// hour/minute: the typical time, used for entries made later or for an earlier day.
// from/to: hours when entering it "now" means it was just weighed (to may wrap past midnight).
export const DAILY_SLOTS: { type: DailySlotType; label: string; hour: number; minute: number; from: number; to: number }[] = [
  { type: 'morning', label: 'Morning', hour: 6, minute: 0, from: 3, to: 11 },
  { type: 'pre-practice', label: 'Before practice', hour: 15, minute: 0, from: 11, to: 19 },
  { type: 'post-practice', label: 'After practice', hour: 17, minute: 30, from: 13, to: 22 },
  { type: 'before-bed', label: 'Before bed', hour: 22, minute: 0, from: 19, to: 3 },
];

export type ParsedWeight =
  | { kind: 'empty' }
  | { kind: 'incomplete' }
  | { kind: 'invalid'; message: string }
  | { kind: 'weight'; weight: number };

/**
 * Read what was typed. Blank means "not recorded", never zero. A value still being
 * typed ("15", "157.") is incomplete rather than wrong, so it never triggers an error mid-entry.
 */
export function parseWeightInput(text: string): ParsedWeight {
  const t = text.trim();
  if (!t) return { kind: 'empty' };
  if (/^\d{1,3}\.$/.test(t)) return { kind: 'incomplete' };
  if (!/^\d{1,3}(\.\d)?$/.test(t)) return { kind: 'invalid', message: 'Use pounds with up to one decimal, like 157.4' };
  const weight = Math.round(Number(t) * 10) / 10;
  if (weight < MIN_WEIGHT_LBS) {
    return t.length < 3 ? { kind: 'incomplete' } : { kind: 'invalid', message: `Enter a weight between ${MIN_WEIGHT_LBS} and ${MAX_WEIGHT_LBS} lb` };
  }
  if (weight > MAX_WEIGHT_LBS) return { kind: 'invalid', message: `Enter a weight between ${MIN_WEIGHT_LBS} and ${MAX_WEIGHT_LBS} lb` };
  return { kind: 'weight', weight };
}

export const formatWeight = (w: number) => w.toFixed(1);

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The reading of this type on this calendar day, if any (latest wins). */
export function logForDay(logs: WeightLog[], type: DailySlotType, dateKey: string): WeightLog | undefined {
  return logs
    .filter(l => l.type === type && dayKey(new Date(l.date)) === dateKey)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

/** Most recent earlier readings of the same type, newest first. */
export function recentReadings(logs: WeightLog[], type: DailySlotType, beforeDateKey: string, count = 3) {
  return logs
    .filter(l => l.type === type && dayKey(new Date(l.date)) < beforeDateKey)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, count)
    .map(l => ({ dateKey: dayKey(new Date(l.date)), weight: l.weight }));
}

/** After minus Before, in plain signed numbers. Not a judgment of good or bad. */
export function practiceChange(before: number | undefined, after: number | undefined): string {
  if (before == null || after == null || before <= 0) return '';
  const diff = Math.round((after - before) * 10) / 10;
  if (Math.abs(diff) < 0.05) return 'No change';
  const pct = Math.abs(((after - before) / before) * 100);
  return `${diff < 0 ? '−' : '+'}${Math.abs(diff).toFixed(1)} lb (${pct < 0.1 ? '<0.1' : pct.toFixed(1)}%)`;
}

/**
 * When a new reading is stamped. Today: the actual time if it's within that weigh-in's usual
 * window, otherwise its typical time if that has passed (a morning weight typed in the evening
 * is still a 6 AM weight), otherwise the actual time (an early practice). Earlier days: the
 * typical time.
 */
export function timestampFor(type: DailySlotType, dateKey: string, now: Date = new Date()): Date {
  const slot = DAILY_SLOTS.find(s => s.type === type)!;
  const [y, m, d] = dateKey.split('-').map(Number);
  const typical = new Date(y, m - 1, d, slot.hour, slot.minute, 0);
  if (dateKey !== dayKey(now)) return typical;
  const h = now.getHours();
  const inWindow = slot.from < slot.to ? h >= slot.from && h < slot.to : h >= slot.from || h < slot.to;
  if (inWindow) return now;
  return typical.getTime() <= now.getTime() ? typical : now;
}

// ── Unsaved drafts: kept on the phone until the save is confirmed ──
type Drafts = Record<string, string>;
const draftKey = (userId: string) => `pwm-weigh-in-drafts-${userId}`;
export const draftSlotKey = (dateKey: string, type: DailySlotType) => `${dateKey}|${type}`;

export function loadDrafts(userId: string): Drafts {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveDrafts(userId: string, drafts: Drafts): void {
  try {
    if (Object.keys(drafts).length === 0) localStorage.removeItem(draftKey(userId));
    else localStorage.setItem(draftKey(userId), JSON.stringify(drafts));
  } catch {}
}
