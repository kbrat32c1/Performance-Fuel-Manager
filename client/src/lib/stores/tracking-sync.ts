import type { DailyTracking } from './types';
import { STORAGE_KEYS } from '../storage-keys';

/**
 * Daily-tracking rows the cloud has not confirmed yet, keyed by date.
 * Stored per user so a different account on the same device never uploads them.
 */
export type UnsyncedRows = Record<string, DailyTracking>;

export type TrackingSyncState = 'saved' | 'saving' | 'unsaved' | 'offline';

export interface TrackingSyncStatus {
  state: TrackingSyncState;
  /** Number of days with changes the cloud has not confirmed */
  pendingCount: number;
}

export function loadUnsyncedRows(userId: string): UnsyncedRows {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.trackingUnsynced(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveUnsyncedRows(userId: string, rows: UnsyncedRows): void {
  try {
    const key = STORAGE_KEYS.trackingUnsynced(userId);
    if (Object.keys(rows).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(rows));
  } catch {}
}

/**
 * Combine the cloud copy with rows that still have unsaved local changes.
 * Unsaved local rows win, because they are newer than anything the cloud has.
 */
export function mergeCloudWithUnsynced(cloud: DailyTracking[], unsynced: UnsyncedRows): DailyTracking[] {
  const dates = Object.keys(unsynced);
  if (dates.length === 0) return cloud;
  const merged = cloud.map(row => unsynced[row.date] ?? row);
  const cloudDates = new Set(cloud.map(row => row.date));
  for (const date of dates) {
    if (!cloudDates.has(date)) merged.push(unsynced[date]);
  }
  return merged;
}

export function toFullPayload(userId: string, row: DailyTracking): Record<string, unknown> {
  return {
    user_id: userId,
    date: row.date,
    carbs_consumed: row.carbsConsumed ?? 0,
    protein_consumed: row.proteinConsumed ?? 0,
    water_consumed: row.waterConsumed ?? 0,
    no_practice: row.noPractice ?? false,
    protein_slices: row.proteinSlices ?? 0,
    carb_slices: row.carbSlices ?? 0,
    veg_slices: row.vegSlices ?? 0,
    fruit_slices: row.fruitSlices ?? 0,
    fat_slices: row.fatSlices ?? 0,
    nutrition_mode: row.nutritionMode ?? null,
    food_log: row.foodLog ?? [],
  };
}

export function toCorePayload(userId: string, row: DailyTracking): Record<string, unknown> {
  return {
    user_id: userId,
    date: row.date,
    carbs_consumed: row.carbsConsumed ?? 0,
    protein_consumed: row.proteinConsumed ?? 0,
    water_consumed: row.waterConsumed ?? 0,
    no_practice: row.noPractice ?? false,
    food_log: row.foodLog ?? [],
  };
}

/** Retry delay after consecutive failures: 2s, 4s, 8s … capped at 60s. */
export function retryDelayMs(failures: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, failures - 1));
}

export function deriveSyncState(pendingCount: number, inFlight: boolean, online: boolean): TrackingSyncState {
  if (pendingCount === 0) return 'saved';
  if (!online) return 'offline';
  if (inFlight) return 'saving';
  return 'unsaved';
}
