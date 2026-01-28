/**
 * PWM Constants
 * Centralized configuration for weight management calculations and protocols
 */

// Weight class definitions for wrestling
export const WEIGHT_CLASSES = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285] as const;
export type WeightClass = typeof WEIGHT_CLASSES[number];

// Protocol identifiers
export const PROTOCOLS = {
  BODY_COMP: '1',
  MAKE_WEIGHT: '2',
  HOLD_WEIGHT: '3',
  BUILD: '4',
} as const;

export type Protocol = typeof PROTOCOLS[keyof typeof PROTOCOLS];

// Protocol display names
export const PROTOCOL_NAMES: Record<Protocol, string> = {
  [PROTOCOLS.BODY_COMP]: 'Body Comp Phase',
  [PROTOCOLS.MAKE_WEIGHT]: 'Make Weight Phase',
  [PROTOCOLS.HOLD_WEIGHT]: 'Hold Weight Phase',
  [PROTOCOLS.BUILD]: 'Build Phase',
};

// Protocol short names for compact displays
export const PROTOCOL_SHORT_NAMES: Record<Protocol, string> = {
  [PROTOCOLS.BODY_COMP]: 'Body Comp',
  [PROTOCOLS.MAKE_WEIGHT]: 'Make Weight',
  [PROTOCOLS.HOLD_WEIGHT]: 'Hold Weight',
  [PROTOCOLS.BUILD]: 'Build',
};

// Weight multipliers for target calculations
export const WEIGHT_MULTIPLIERS = {
  // Walk-around weight = competition weight × this value
  WALK_AROUND_MAX: 1.07,
  WALK_AROUND_MIN: 1.06,

  // Wednesday PM target (midpoint)
  WEDNESDAY_TARGET_MAX: 1.05,
  WEDNESDAY_TARGET_MIN: 1.04,
  WEDNESDAY_TARGET_MID: 1.045,

  // Friday PM target (critical checkpoint)
  FRIDAY_TARGET_MAX: 1.03,
  FRIDAY_TARGET_MIN: 1.02,
  FRIDAY_TARGET_MID: 1.025,

  // Thursday transition
  THURSDAY_TARGET_MAX: 1.04,
  THURSDAY_TARGET_MIN: 1.03,

  // Daily targets by protocol
  HOLD_WEIGHT_DAILY: 1.03, // 3% over competition weight all day
} as const;

// Water loading adjustments by weight category
export const WATER_LOAD_BONUS = {
  LIGHT: 2,   // < 150 lbs
  MEDIUM: 3,  // 150-174 lbs
  HEAVY: 4,   // 175+ lbs
} as const;

export const WATER_LOAD_THRESHOLDS = {
  MEDIUM_MIN: 150,
  HEAVY_MIN: 175,
} as const;

// Weight category thresholds for water load schedule
export const WEIGHT_CATEGORY_THRESHOLDS = {
  LIGHT_MAX: 141,
  MEDIUM_MAX: 165,
} as const;

// Safety thresholds
export const SAFETY_THRESHOLDS = {
  // Percentage over competition weight that triggers Body Comp recommendation
  BODY_COMP_TRIGGER: 7,

  // Dangerous cut: losing more than 5% in less than these days
  DANGEROUS_CUT_PERCENT: 5,
  DANGEROUS_CUT_DAYS: 3,

  // Rapid/aggressive cut warning threshold
  RAPID_CUT_DAYS: 7,
} as const;

// Status thresholds for on-track/borderline/risk calculations
export const STATUS_THRESHOLDS = {
  ON_TRACK_BUFFER: 1.5,  // Within 1.5 lbs of target = on track
  BORDERLINE_BUFFER: 3,  // Within 3 lbs = borderline
  // Above 3 lbs = at risk
} as const;

// Macro ratios by protocol (displayed as strings)
export const MACRO_RATIOS: Record<Protocol, string> = {
  [PROTOCOLS.BODY_COMP]: '40/40/20',
  [PROTOCOLS.MAKE_WEIGHT]: '35/40/25',
  [PROTOCOLS.HOLD_WEIGHT]: '40/35/25',
  [PROTOCOLS.BUILD]: '45/30/25',
};

// Protein targets (grams per lb of body weight)
export const PROTEIN_TARGETS = {
  BODY_COMP_MIN: 1.0,
  BODY_COMP_MAX: 1.2,
  MAKE_WEIGHT_MIN: 0.9,
  MAKE_WEIGHT_MAX: 1.1,
  HOLD_WEIGHT_MIN: 0.8,
  HOLD_WEIGHT_MAX: 1.0,
  BUILD_MIN: 1.0,
  BUILD_MAX: 1.2,
} as const;

// Carb targets by protocol and day
export const CARB_TARGETS = {
  // Body Comp Phase - low carb
  BODY_COMP: {
    METABOLIC_MIN: 50,
    METABOLIC_MAX: 75,
    TRANSITION_MIN: 30,
    TRANSITION_MAX: 50,
    PERFORMANCE_MIN: 20,
    PERFORMANCE_MAX: 40,
  },
  // Make Weight Phase
  MAKE_WEIGHT: {
    METABOLIC_MIN: 75,
    METABOLIC_MAX: 125,
    TRANSITION_MIN: 50,
    TRANSITION_MAX: 75,
    PERFORMANCE_MIN: 30,
    PERFORMANCE_MAX: 50,
  },
  // Hold Weight Phase
  HOLD_WEIGHT: {
    METABOLIC_MIN: 125,
    METABOLIC_MAX: 175,
    TRANSITION_MIN: 100,
    TRANSITION_MAX: 125,
    PERFORMANCE_MIN: 75,
    PERFORMANCE_MAX: 100,
  },
  // Build Phase
  BUILD: {
    MIN: 200,
    MAX: 300,
  },
} as const;

// Water load schedule by weight category (gallons)
export const WATER_SCHEDULE = {
  LIGHT: {
    MON: '1.0 gal',
    TUE: '1.25 gal',
    WED: '1.5 gal',
    THU: '1.25 gal',
    FRI: '0.25-0.5 gal',
    SAT: 'Rehydrate',
    SUN: '1.0 gal',
  },
  MEDIUM: {
    MON: '1.25 gal',
    TUE: '1.5 gal',
    WED: '1.75 gal',
    THU: '1.5 gal',
    FRI: '0.25-0.5 gal',
    SAT: 'Rehydrate',
    SUN: '1.25 gal',
  },
  HEAVY: {
    MON: '1.5 gal',
    TUE: '1.75 gal',
    WED: '2.0 gal',
    THU: '1.75 gal',
    FRI: '0.25-0.5 gal',
    SAT: 'Rehydrate',
    SUN: '1.5 gal',
  },
} as const;

// Phase definitions
export const PHASES = {
  METABOLIC: 'metabolic',      // Mon-Wed
  TRANSITION: 'transition',    // Thu
  PERFORMANCE_PREP: 'performance-prep', // Fri
  LAST_24H: 'last-24h',        // Sat (competition day)
  RECOVERY: 'recovery',        // Sun
} as const;

export type Phase = typeof PHASES[keyof typeof PHASES];

// Day of week constants (JavaScript getDay() values)
export const DAYS = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;

// Log type definitions
export const LOG_TYPES = {
  MORNING: 'morning',
  PRE_PRACTICE: 'pre-practice',
  POST_PRACTICE: 'post-practice',
  BEFORE_BED: 'before-bed',
  EXTRA_BEFORE: 'extra-before',
  EXTRA_AFTER: 'extra-after',
} as const;

export type LogType = typeof LOG_TYPES[keyof typeof LOG_TYPES];

// Default log times (hours in 24h format)
export const LOG_TIMES = {
  [LOG_TYPES.MORNING]: 7,
  [LOG_TYPES.PRE_PRACTICE]: 15,
  [LOG_TYPES.POST_PRACTICE]: 17,
  [LOG_TYPES.BEFORE_BED]: 22,
  [LOG_TYPES.EXTRA_BEFORE]: 18,
  [LOG_TYPES.EXTRA_AFTER]: 18,
} as const;

// Rehydration calculations
export const REHYDRATION = {
  // Fluid oz per lb lost (range)
  FLUID_OZ_PER_LB_MIN: 16,
  FLUID_OZ_PER_LB_MAX: 24,

  // Sodium mg per lb lost (range)
  SODIUM_MG_PER_LB_MIN: 500,
  SODIUM_MG_PER_LB_MAX: 700,
} as const;

// UI Constants
export const UI = {
  // Minimum touch target size (iOS recommendation)
  MIN_TOUCH_TARGET: 44,

  // Maximum content width for mobile layout
  MAX_CONTENT_WIDTH: 448, // max-w-md

  // Animation durations (ms)
  ANIMATION_FAST: 150,
  ANIMATION_NORMAL: 300,
  ANIMATION_SLOW: 500,

  // Toast duration
  TOAST_DURATION: 5000,
} as const;

// LocalStorage keys
export const STORAGE_KEYS = {
  PROFILE: 'pwm-profile',
  LOGS: 'pwm-logs',
  DAILY_TRACKING: 'pwm-daily-tracking',
  TANKS: 'pwm-tanks',
  RECOVERY_ELAPSED: 'pwm-recovery-elapsed',
  RECOVERY_START: 'pwm-recovery-start',
  RECOVERY_ACTIVE: 'pwm-recovery-active',
  RECOVERY_CHECKLIST: 'pwm-recovery-checklist',
  RECOVERY_WEIGHIN: 'pwm-recovery-weighin',
  MATCH_TIMER_ELAPSED: 'pwm-match-timer-elapsed',
  MATCH_TIMER_START: 'pwm-match-timer-start',
  MATCH_TIMER_ACTIVE: 'pwm-match-timer-active',
  MATCH_COUNT: 'pwm-match-count',
  THEME: 'pwm-theme',
} as const;

// =============================================================================
// CENTRALIZED WEIGHT TARGET SYSTEM
// All weight targets should be calculated using these functions for consistency
// =============================================================================

/**
 * Weight target multipliers by days until weigh-in
 * These are the SINGLE SOURCE OF TRUTH for all weight calculations
 */
export const WEIGHT_TARGET_BY_DAYS_OUT = {
  // Days until weigh-in -> multiplier of target weight class
  // Note: Water loading days (5, 4, 3) add 2-4 lbs ON TOP of these multipliers
  5: 1.07,  // 5 days out: walk-around + water loading (+2-4 lbs)
  4: 1.06,  // 4 days out: peak water loading (+2-4 lbs)
  3: 1.05,  // 3 days out: last load day (+2-4 lbs)
  2: 1.04,  // 2 days out: flush day (138 AM for 133 class, ~136 after practice)
  1: 1.03,  // 1 day out: critical checkpoint (137 lbs for 133 class)
  0: 1.00,  // Competition day: make weight
  [-1]: 1.07, // Recovery day: back to walk-around
} as const;

/**
 * Water loading range (lbs above baseline) - consistent 2-4 lbs
 */
export const WATER_LOADING_RANGE = {
  MIN: 2,
  MAX: 4,
} as const;

/**
 * Days that include water loading bonus (protocols 1 & 2 only)
 */
export const WATER_LOADING_DAYS = [5, 4, 3, 2] as const; // 5, 4, 3, 2 days out (still drinking 1.25 gal Thu)

/**
 * Get the weight multiplier for a given number of days until weigh-in
 */
export function getWeightMultiplier(daysUntil: number): number {
  if (daysUntil < 0) return WEIGHT_TARGET_BY_DAYS_OUT[-1]; // Recovery
  if (daysUntil === 0) return WEIGHT_TARGET_BY_DAYS_OUT[0]; // Competition
  if (daysUntil === 1) return WEIGHT_TARGET_BY_DAYS_OUT[1]; // Critical
  if (daysUntil === 2) return WEIGHT_TARGET_BY_DAYS_OUT[2]; // Flush
  if (daysUntil === 3) return WEIGHT_TARGET_BY_DAYS_OUT[3]; // Last load
  if (daysUntil === 4) return WEIGHT_TARGET_BY_DAYS_OUT[4]; // Peak load
  if (daysUntil === 5) return WEIGHT_TARGET_BY_DAYS_OUT[5]; // First load
  // 6+ days out: maintenance at walk-around
  return WEIGHT_TARGET_BY_DAYS_OUT[5]; // 1.07 (walk-around)
}

/**
 * Check if a given day is a water loading day
 */
export function isWaterLoadingDay(daysUntil: number, protocol: string): boolean {
  if (protocol !== PROTOCOLS.BODY_COMP && protocol !== PROTOCOLS.MAKE_WEIGHT) {
    return false;
  }
  return WATER_LOADING_DAYS.includes(daysUntil as 5 | 4 | 3 | 2);
}

/**
 * Calculate the target weight for a given day
 * This is the SINGLE function to use for all weight target displays
 */
export function calculateTargetWeight(
  targetWeightClass: number,
  daysUntil: number,
  protocol: string,
  includeWaterLoading: boolean = true
): { base: number; withWaterLoad: number | null; range: { min: number; max: number } | null } {
  const multiplier = getWeightMultiplier(daysUntil);
  const base = Math.round(targetWeightClass * multiplier);

  const waterLoading = includeWaterLoading && isWaterLoadingDay(daysUntil, protocol);

  if (waterLoading) {
    return {
      base,
      withWaterLoad: base + WATER_LOADING_RANGE.MAX, // Use max for single display
      range: {
        min: base + WATER_LOADING_RANGE.MIN,
        max: base + WATER_LOADING_RANGE.MAX,
      },
    };
  }

  return {
    base,
    withWaterLoad: null,
    range: null,
  };
}

/**
 * Get a formatted weight target string for display
 */
export function formatWeightTarget(
  targetWeightClass: number,
  daysUntil: number,
  protocol: string
): string {
  const target = calculateTargetWeight(targetWeightClass, daysUntil, protocol);

  if (target.range) {
    return `${target.range.min}-${target.range.max}`;
  }

  return `${target.base}`;
}

/**
 * Get phase name based on days until weigh-in
 */
export function getPhaseForDaysUntil(daysUntil: number): string {
  if (daysUntil < 0) return 'Recover';
  if (daysUntil === 0) return 'Compete';
  if (daysUntil === 1) return 'Cut';
  if (daysUntil === 2) return 'Cut';
  if (daysUntil >= 3 && daysUntil <= 5) return 'Load';
  return 'Train';
}
