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

  // ─── Preferences ─────────────────────────────────────────────────────────
  THEME: 'pfm-theme',
  HAPTICS_ENABLED: 'pfm-haptics-enabled',

  // ─── Notifications ───────────────────────────────────────────────────────
  NOTIFICATION_PREFS: 'pfm-notification-prefs',

  // ─── UI State ────────────────────────────────────────────────────────────
  TOUR_COMPLETED: 'pfm-tour-completed',
  FAB_TOOLTIP_DISMISSED: 'pfm-fab-tooltip-dismissed',
  LAST_WEIGHT_TYPE: 'pfm-last-weight-type',
  LAST_WEIGHT_TYPE_DATE: 'pfm-last-weight-type-date',
  FUEL_GUIDE_AVOID_COLLAPSED: 'fuel-guide-avoid-collapsed',
} as const;

/** Prefix for all PWM keys — used in "clear all data" */
export const STORAGE_PREFIX = 'pwm-';
