/**
 * Centralized localStorage key constants.
 *
 * All localStorage keys used throughout the app are defined here.
 * This prevents key collisions, makes keys discoverable, and enables
 * type-safe access patterns.
 */

// ─── Core Data ───────────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  /** Athlete profile JSON */
  PROFILE: 'pwm-profile',
  /** Weight / weigh-in logs JSON array */
  LOGS: 'pwm-logs',
  /** Daily tracking (water, macros, slices) per date */
  DAILY_TRACKING: 'pwm-daily-tracking',
  /** Fast-read cache for daily tracking (avoids full parse) */
  DAILY_TRACKING_CACHE: 'pwm-daily-tracking-cache',
  /** Fuel tanks state */
  TANKS: 'pwm-tanks',

  // ─── User Foods ──────────────────────────────────────────────────────────
  CUSTOM_FOODS: 'pwm-custom-foods',
  CUSTOM_MEALS: 'pwm-custom-meals',
  SPAR_CUSTOM_FOODS: 'pwm-spar-custom-foods',
  SPAR_CUSTOM_MEALS: 'pwm-spar-custom-meals',
  FAVORITES: 'pwm-favorites',

  // ─── Competition / Recovery ──────────────────────────────────────────────
  COMP_MODE: 'pwm-comp-mode',
  COMP_ACTIVE: 'pwm-comp-active',
  COMP_START: 'pwm-comp-start',
  COMP_ELAPSED: 'pwm-comp-elapsed',
  COMP_MATCH: 'pwm-comp-match',
  COMP_TIME_TO_MATCH: 'pwm-comp-time-to-match',
  COMP_TIME_BETWEEN: 'pwm-comp-time-between',
  COMP_WI_RECOVERY_USED: 'pwm-comp-wi-recovery-used',
  COMP_CHECKLIST: 'pwm-comp-checklist',
  MATCH_PREP_CHECKLIST: 'pwm-match-prep-checklist',
  RECOVERY_WEIGHIN: 'pwm-recovery-weighin',
  RECOVERY_WEIGHIN_ENTERED: 'pwm-recovery-weighin-entered',
  RECOVERY_ALERTS: 'pwm-recovery-alerts',
  RECOVERY_NOTIFICATIONS: 'pwm-recovery-notifications',

  // ─── State Flags ─────────────────────────────────────────────────────────
  WEIGH_IN_CLEARED: 'pwm-weigh-in-cleared',
  NEXT_CYCLE_DISMISSED: 'pwm-next-cycle-dismissed',

  // ─── Food History (date-keyed) ───────────────────────────────────────────
  /** SPAR food log for a date — key is `pwm-spar-history-{yyyy-MM-dd}` */
  sparHistory: (dateKey: string) => `pwm-spar-history-${dateKey}` as const,
  /** Macro food log for a date — key is `pwm-food-history-{yyyy-MM-dd}` */
  foodHistory: (dateKey: string) => `pwm-food-history-${dateKey}` as const,

  // ─── Recent Foods ────────────────────────────────────────────────────────
  MACRO_RECENT_FOODS: 'pwm-macro-recent-foods',

  // ─── Caching ────────────────────────────────────────────────────────────
  /** Cached profile for instant startup (updated after Supabase fetch) */
  PROFILE_CACHE: 'pwm-profile-cache',
  /** Cached weight logs for instant startup */
  WEIGHT_LOGS_CACHE: 'pwm-weight-logs-cache',
  /** Daily-tracking rows not yet confirmed by Supabase, per user */
  trackingUnsynced: (userId: string) => `pwm-tracking-unsynced-${userId}` as const,

  // ─── Preferences ─────────────────────────────────────────────────────────
  THEME: 'pwm-theme',
  HAPTICS_ENABLED: 'pwm-haptics-enabled',

  // ─── Notifications ───────────────────────────────────────────────────────
  NOTIFICATION_PREFS: 'pwm-notification-prefs',

  // ─── UI State ────────────────────────────────────────────────────────────
  DASHBOARD_TOUR_SEEN: 'pfm-dashboard-tour-seen',
  FAB_TOOLTIP_DISMISSED: 'pfm-fab-tooltip-dismissed',
  LAST_WEIGHT_TYPE: 'pfm-last-weight-type',
  LAST_WEIGHT_TYPE_DATE: 'pfm-last-weight-type-date',
  FUEL_GUIDE_AVOID_COLLAPSED: 'fuel-guide-avoid-collapsed',
  /** Health day date when recovery-ready modal was last shown (prevents re-trigger) */
  RECOVERY_READY_SHOWN: 'pwm-recovery-ready-shown',
} as const;

/** Prefix for all PWM keys — used in "clear all data" */
export const STORAGE_PREFIX = 'pwm-';

// ─── Account separation on shared devices ────────────────────────────────────
/** Which signed-in user the cached data on this device belongs to. */
export const CACHE_OWNER_KEY = 'pwm-cache-owner';
/** Device settings that are not anyone's personal data. */
const DEVICE_KEYS: string[] = [STORAGE_KEYS.THEME, STORAGE_KEYS.HAPTICS_ENABLED, STORAGE_KEYS.NOTIFICATION_PREFS];
const LEGACY_LOCAL_KEYS: string[] = [STORAGE_KEYS.PROFILE, STORAGE_KEYS.LOGS, STORAGE_KEYS.DAILY_TRACKING, STORAGE_KEYS.TANKS];

function isAccountKey(key: string): boolean {
  if (!(key.startsWith(STORAGE_PREFIX) || key.startsWith('pfm-'))) return false;
  if (DEVICE_KEYS.includes(key)) return false;
  // Unsaved rows are already stored per user and are sent when that user signs back in.
  if (key.startsWith('pwm-tracking-unsynced-')) return false;
  // Data from before accounts existed waits to be moved into the first account (store migration).
  if (LEGACY_LOCAL_KEYS.includes(key)) return false;
  return true;
}

/** Remove the previous account's cached profile, logs, food history and screen state. */
export function clearAccountCache(storage: Storage = localStorage): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k) keys.push(k); }
    keys.filter(isAccountKey).forEach(key => storage.removeItem(key));
  } catch { /* storage unavailable */ }
}

/**
 * Make the cached data on this device belong to `userId`. Returns true when it
 * belonged to a different account and was cleared.
 *
 * Data with no recorded owner (installs from before this check, or a device after
 * sign-out, which already cleared account data) is kept and claimed: local-only custom
 * foods and meals still need to reach the store's one-time upload to the cloud.
 */
export function claimAccountCache(userId: string, storage: Storage = localStorage): boolean {
  try {
    const owner = storage.getItem(CACHE_OWNER_KEY);
    if (owner === userId) return false;
    if (owner === null) { storage.setItem(CACHE_OWNER_KEY, userId); return false; }
    clearAccountCache(storage);
    storage.setItem(CACHE_OWNER_KEY, userId);
    return true;
  } catch {
    return false;
  }
}
