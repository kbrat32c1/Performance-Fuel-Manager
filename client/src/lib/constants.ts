/**
 * SPAR Nutrition Constants
 * Centralized configuration for weight management calculations and protocols
 */

// =============================================================================
// UNIT CONVERSION CONSTANTS
// Single source of truth for all unit conversions - use these everywhere!
// =============================================================================

/**
 * Pounds to kilograms conversion factor
 * Source: International System of Units (SI)
 * 1 lb = 0.45359237 kg (exact definition)
 */
export const LBS_TO_KG = 0.453592;
export const KG_TO_LBS = 2.20462;

/**
 * Inches to centimeters conversion factor
 * Source: International System of Units (SI)
 * 1 inch = 2.54 cm (exact definition)
 */
export const INCHES_TO_CM = 2.54;
export const CM_TO_INCHES = 0.393701;

/**
 * Fluid ounces to milliliters conversion factor
 * Source: US customary units
 * 1 fl oz (US) = 29.5735 ml
 */
export const OZ_TO_ML = 29.5735;
export const ML_TO_OZ = 0.033814;

/**
 * Gallons to fluid ounces
 * 1 US gallon = 128 fl oz
 */
export const GAL_TO_OZ = 128;

// =============================================================================
// WEIGHT VALIDATION CONSTANTS
// Safety bounds for weight entries
// =============================================================================

/**
 * Minimum reasonable weight for a wrestler (lbs)
 * Below this triggers validation error
 */
export const MIN_WEIGHT_LBS = 50;

/**
 * Maximum reasonable weight for a wrestler (lbs)
 * Above this triggers validation error
 */
export const MAX_WEIGHT_LBS = 400;

/**
 * Validate a weight value is within reasonable bounds
 */
export function isValidWeight(weightLbs: number): boolean {
  return (
    typeof weightLbs === 'number' &&
    !isNaN(weightLbs) &&
    weightLbs >= MIN_WEIGHT_LBS &&
    weightLbs <= MAX_WEIGHT_LBS
  );
}

/**
 * Get validation error message for invalid weight
 */
export function getWeightValidationError(weightLbs: number): string | null {
  if (typeof weightLbs !== 'number' || isNaN(weightLbs)) {
    return 'Weight must be a number';
  }
  if (weightLbs < MIN_WEIGHT_LBS) {
    return `Weight must be at least ${MIN_WEIGHT_LBS} lbs`;
  }
  if (weightLbs > MAX_WEIGHT_LBS) {
    return `Weight must be less than ${MAX_WEIGHT_LBS} lbs`;
  }
  return null;
}


// =============================================================================
// WEIGHT CLASSES & PROTOCOLS
// =============================================================================

// Weight class definitions for wrestling
export const WEIGHT_CLASSES = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285] as const;
export type WeightClass = typeof WEIGHT_CLASSES[number];

// Protocol identifiers
export const PROTOCOLS = {
  EXTREME_CUT: '1',
  RAPID_CUT: '2',
  OPTIMAL_CUT: '3',
  GAIN: '4',
  SPAR: '5',
  SPAR_COMPETITION: '6',
} as const;

export type Protocol = typeof PROTOCOLS[keyof typeof PROTOCOLS];

// Protocol display names
export const PROTOCOL_NAMES: Record<Protocol, string> = {
  [PROTOCOLS.EXTREME_CUT]: 'Extreme Cut Phase',
  [PROTOCOLS.RAPID_CUT]: 'Rapid Cut Phase',
  [PROTOCOLS.OPTIMAL_CUT]: 'Optimal Cut Phase',
  [PROTOCOLS.GAIN]: 'Gain Phase',
  [PROTOCOLS.SPAR]: 'SPAR Nutrition',
  [PROTOCOLS.SPAR_COMPETITION]: 'SPAR Competition',
};

// Protocol short names for compact displays
export const PROTOCOL_SHORT_NAMES: Record<Protocol, string> = {
  [PROTOCOLS.EXTREME_CUT]: 'Extreme Cut',
  [PROTOCOLS.RAPID_CUT]: 'Rapid Cut',
  [PROTOCOLS.OPTIMAL_CUT]: 'Optimal Cut',
  [PROTOCOLS.GAIN]: 'Gain',
  [PROTOCOLS.SPAR]: 'SPAR',
  [PROTOCOLS.SPAR_COMPETITION]: 'SPAR Comp',
};

// Nutrition mode type — slices (spar) or grams (sugar)
export type NutritionMode = 'spar' | 'sugar';

// ── Protocol classification helpers ──────────────────────────────────────────
// Use these throughout the codebase instead of scattered protocol === '5' checks
/** SPAR-style nutrition (portion/slice tracking): Protocol 5 (general) or 6 (competition) */
export const isSparNutrition = (p: string): boolean => p === '5' || p === '6';
/** Competition protocol (weigh-in date, water loading, competition cycle): everything except SPAR General */
export const isCompetitionProtocol = (p: string): boolean => p !== '5';

// Activity levels for SPAR calculator
export const ACTIVITY_LEVELS = {
  SEDENTARY: 'sedentary',
  LIGHT: 'light',
  MODERATE: 'moderate',
  ACTIVE: 'active',
  VERY_ACTIVE: 'very-active',
} as const;

export type ActivityLevel = typeof ACTIVITY_LEVELS[keyof typeof ACTIVITY_LEVELS];

export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  [ACTIVITY_LEVELS.SEDENTARY]: 'Sedentary (little/no exercise)',
  [ACTIVITY_LEVELS.LIGHT]: 'Light (1-3 days/week)',
  [ACTIVITY_LEVELS.MODERATE]: 'Moderate (3-5 days/week)',
  [ACTIVITY_LEVELS.ACTIVE]: 'Active (6-7 days/week)',
  [ACTIVITY_LEVELS.VERY_ACTIVE]: 'Very Active (2x/day training)',
};

// Weekly goal options for SPAR
export const WEEKLY_GOALS = {
  CUT: 'cut',
  MAINTAIN: 'maintain',
  BUILD: 'build',
} as const;

export type WeeklyGoal = typeof WEEKLY_GOALS[keyof typeof WEEKLY_GOALS];

export const WEEKLY_GOAL_LABELS: Record<WeeklyGoal, string> = {
  [WEEKLY_GOALS.CUT]: 'Cut (lose ~1 lb/week)',
  [WEEKLY_GOALS.MAINTAIN]: 'Maintain weight',
  [WEEKLY_GOALS.BUILD]: 'Build (lean gain)',
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
  OPTIMAL_CUT_DAILY: 1.03, // 3% over competition weight all day
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
  // Scale % over class at which a preseason athlete with no body fat % is asked for it
  EXTREME_CUT_TRIGGER: 12,
  // Body fat % above which Extreme Cut (a fat-loss block) is recommended — preseason only
  EXTREME_CUT_BODY_FAT: 12,
  // A weigh-in at least this many days away counts as preseason
  PRESEASON_MIN_DAYS: 28,

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
  [PROTOCOLS.EXTREME_CUT]: '40/40/20',
  [PROTOCOLS.RAPID_CUT]: '35/40/25',
  [PROTOCOLS.OPTIMAL_CUT]: '40/35/25',
  [PROTOCOLS.GAIN]: '45/30/25',
  [PROTOCOLS.SPAR]: '35/40/25',
  [PROTOCOLS.SPAR_COMPETITION]: '40/35/25',
};

// Protein targets (grams per lb of body weight)
export const PROTEIN_TARGETS = {
  EXTREME_CUT_MIN: 1.0,
  EXTREME_CUT_MAX: 1.2,
  RAPID_CUT_MIN: 0.9,
  RAPID_CUT_MAX: 1.1,
  OPTIMAL_CUT_MIN: 0.8,
  OPTIMAL_CUT_MAX: 1.0,
  GAIN_MIN: 1.0,
  GAIN_MAX: 1.2,
} as const;

// Carb targets by protocol and day
export const CARB_TARGETS = {
  // Extreme Cut Phase - low carb
  EXTREME_CUT: {
    METABOLIC_MIN: 50,
    METABOLIC_MAX: 75,
    TRANSITION_MIN: 30,
    TRANSITION_MAX: 50,
    PERFORMANCE_MIN: 20,
    PERFORMANCE_MAX: 40,
  },
  // Rapid Cut Phase
  RAPID_CUT: {
    METABOLIC_MIN: 75,
    METABOLIC_MAX: 125,
    TRANSITION_MIN: 50,
    TRANSITION_MAX: 75,
    PERFORMANCE_MIN: 30,
    PERFORMANCE_MAX: 50,
  },
  // Optimal Cut Phase
  OPTIMAL_CUT: {
    METABOLIC_MIN: 125,
    METABOLIC_MAX: 175,
    TRANSITION_MIN: 100,
    TRANSITION_MAX: 125,
    PERFORMANCE_MIN: 75,
    PERFORMANCE_MAX: 100,
  },
  // Gain Phase
  GAIN: {
    MIN: 200,
    MAX: 300,
  },
} as const;

// =============================================================================
// WATER & SODIUM PROTOCOL (Research-based: oz/lb body mass scaling)
// Sources: PubMed 29182412 (Reale et al.), ISSN Position Stand PMC11894756, Gatorade SSI
// Protocol: 3 days load → 1 day restrict → 1 day sips → weigh-in → rehydrate
// =============================================================================

/**
 * Water-loading week, gallons per day by weigh-in class (Kevin's FINAL_13, ruled 2026-11-08).
 * Days are daysUntilWeighIn; -1 is the day after. 285 uses the heavy column by Kevin's choice.
 * Day 1 is a range: 0.25-0.5 gal for every class.
 */
export const WATER_LOADING_GALLONS = {
  light:  { 5: 1.0, 4: 1.25, 3: 1.5, 2: 1.25, [-1]: 1.0 },
  medium: { 5: 1.25, 4: 1.5, 3: 1.75, 2: 1.5, [-1]: 1.25 },
  heavy:  { 5: 1.5, 4: 1.75, 3: 2.0, 2: 1.75, [-1]: 1.5 },
} as const;

/** The day before weigh-in, for every class. */
export const REDUCED_WATER_DAY = { minGal: 0.25, maxGal: 0.5 } as const;

/** Normal daily drinking: training days, and every day for athletes with water loading off. */
export const NORMAL_WATER_OZ_PER_LB = 0.7;

/**
 * Sodium targets (mg/day) by daysUntilWeighIn, water loading on.
 * 2,500 and 1,000 mg are the app's estimates for FINAL_13's "Low" and "Very Low".
 * SAFETY: Never eliminate sodium completely.
 */
export const SODIUM_MG_BY_DAY = {
  6: { target: 3000, label: 'Normal', color: 'text-primary' },
  5: { target: 3000, label: 'Normal', color: 'text-primary' },
  4: { target: 3000, label: 'Normal', color: 'text-primary' },
  3: { target: 3000, label: 'Normal to moderate', color: 'text-primary' },
  2: { target: 2500, label: 'Low', color: 'text-amber-500' },
  1: { target: 1000, label: 'Very low — under 1,000mg', color: 'text-amber-500' },
  0: { target: 0, label: 'Reintroduce post weigh-in', color: 'text-cyan-500' },
  [-1]: { target: 3000, label: 'Normal — replenish', color: 'text-green-500' },
} as const;

function waterGroup(weightClass: number): keyof typeof WATER_LOADING_GALLONS {
  if (weightClass <= WEIGHT_CATEGORY_THRESHOLDS.LIGHT_MAX) return 'light';
  if (weightClass <= WEIGHT_CATEGORY_THRESHOLDS.MEDIUM_MAX) return 'medium';
  return 'heavy';
}

function loadingGallons(daysUntil: number, weightClass: number): number | null {
  const key = daysUntil < 0 ? -1 : daysUntil;
  const day = WATER_LOADING_GALLONS[waterGroup(weightClass)] as Record<number, number>;
  return day[key] ?? null;
}

/**
 * Water target in fluid ounces for a given day. On the reduced day it's the top of the range.
 * Loading volumes depend on weigh-in class; normal drinking depends on body weight.
 */
export function getWaterTargetOz(daysUntil: number, weightLbs: number, waterLoading = true, weightClass = weightLbs): number {
  if (daysUntil === 0) return 0; // Weigh-in day — rehydrate after
  if (!waterLoading) return Math.round(NORMAL_WATER_OZ_PER_LB * weightLbs);
  if (daysUntil === 1) return Math.round(REDUCED_WATER_DAY.maxGal * 128);
  const gallons = loadingGallons(daysUntil, weightClass);
  return gallons !== null ? Math.round(gallons * 128) : Math.round(NORMAL_WATER_OZ_PER_LB * weightLbs);
}

/** Formatted water target, e.g. "1.75 gal", "0.25-0.5 gal", "Rehydrate". */
export function getWaterTargetGallons(daysUntil: number, weightLbs: number, waterLoading = true, weightClass = weightLbs): string {
  if (daysUntil === 0) return 'Rehydrate';
  if (waterLoading && daysUntil === 1) return `${REDUCED_WATER_DAY.minGal}-${REDUCED_WATER_DAY.maxGal} gal`;
  const planned = waterLoading ? loadingGallons(daysUntil, weightClass) : null;
  const gallons = planned ?? (NORMAL_WATER_OZ_PER_LB * weightLbs) / 128;
  const rounded = Math.round(gallons * 4) / 4;
  return `${rounded.toFixed(rounded % 1 === 0 ? 1 : 2)} gal`;
}

/**
 * Get sodium info for a given day.
 */
export function getSodiumTarget(daysUntil: number, waterLoading = true) {
  if (!waterLoading) {
    return daysUntil === 0 ? SODIUM_MG_BY_DAY[0] : { target: 3000, label: 'Normal', color: 'text-primary' };
  }
  const key = daysUntil < 0 ? -1 : Math.min(daysUntil, 6);
  return SODIUM_MG_BY_DAY[key as keyof typeof SODIUM_MG_BY_DAY] ?? SODIUM_MG_BY_DAY[-1];
}

// Phase definitions
export const PHASES = {
  METABOLIC: 'metabolic',      // 5-3 days out
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
  CHECK_IN: 'check-in',
  WEIGH_IN: 'weigh-in',
} as const;

export type LogType = typeof LOG_TYPES[keyof typeof LOG_TYPES];

// Core weigh-in types that count toward daily 1/4 completion
export const CORE_WEIGH_IN_TYPES = [
  LOG_TYPES.MORNING,
  LOG_TYPES.PRE_PRACTICE,
  LOG_TYPES.POST_PRACTICE,
  LOG_TYPES.BEFORE_BED,
] as const;

// Default log times (hours in 24h format)
export const LOG_TIMES = {
  [LOG_TYPES.MORNING]: 7,
  [LOG_TYPES.PRE_PRACTICE]: 15,
  [LOG_TYPES.POST_PRACTICE]: 17,
  [LOG_TYPES.BEFORE_BED]: 22,
  [LOG_TYPES.EXTRA_BEFORE]: 18,
  [LOG_TYPES.EXTRA_AFTER]: 18,
  [LOG_TYPES.CHECK_IN]: 12,
  [LOG_TYPES.WEIGH_IN]: 10,
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
  // Note: Water loading days (5, 4, 3, 2) add 2-4 lbs ON TOP of these multipliers
  5: 1.07,  // 5 days out: walk-around + water loading (+2-4 lbs)
  4: 1.06,  // 4 days out: water loading (+2-4 lbs)
  3: 1.05,  // 3 days out: peak water (+2-4 lbs)
  2: 1.04,  // 2 days out: water still high, low sodium (+2-4 lbs)
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
 * Days when an athlete on water loading carries extra water weight.
 * 2 days out counts: FINAL_13 keeps water high that day, and the sharp drop is the day before weigh-in.
 */
export const WATER_LOADING_DAYS = [5, 4, 3, 2] as const;

/**
 * Get the weight multiplier for a given number of days until weigh-in
 */
export function getWeightMultiplier(daysUntil: number): number {
  if (daysUntil < 0) return WEIGHT_TARGET_BY_DAYS_OUT[-1]; // Recovery
  if (daysUntil === 0) return WEIGHT_TARGET_BY_DAYS_OUT[0]; // Competition
  if (daysUntil === 1) return WEIGHT_TARGET_BY_DAYS_OUT[1]; // Critical
  if (daysUntil === 2) return WEIGHT_TARGET_BY_DAYS_OUT[2]; // High water, low sodium
  if (daysUntil === 3) return WEIGHT_TARGET_BY_DAYS_OUT[3]; // Peak water
  if (daysUntil === 4) return WEIGHT_TARGET_BY_DAYS_OUT[4]; // Loading
  if (daysUntil === 5) return WEIGHT_TARGET_BY_DAYS_OUT[5]; // First load
  // 6+ days out: maintenance at walk-around
  return WEIGHT_TARGET_BY_DAYS_OUT[5]; // 1.07 (walk-around)
}

/**
 * Check if a given day is a water loading day
 */
export function isWaterLoadingDay(daysUntil: number, protocol: string, waterLoading = true): boolean {
  if (!waterLoading) return false;
  if (protocol !== PROTOCOLS.EXTREME_CUT && protocol !== PROTOCOLS.RAPID_CUT && protocol !== PROTOCOLS.OPTIMAL_CUT) {
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

  const waterLoading = isWaterLoadingDay(daysUntil, protocol, includeWaterLoading);

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
  protocol: string,
  waterLoading = true
): string {
  const target = calculateTargetWeight(targetWeightClass, daysUntil, protocol, waterLoading);

  if (target.range) {
    return `${target.range.min}-${target.range.max}`;
  }

  return `${target.base}`;
}

/**
 * Get phase name based on days until weigh-in
 */
export function getPhaseForDaysUntil(daysUntil: number, waterLoading = true): string {
  if (daysUntil < 0) return 'Recover';
  if (daysUntil === 0) return 'Compete';
  if (daysUntil <= 2) return 'Cut';
  if (daysUntil <= 5) return waterLoading ? 'Load' : 'Train';
  return 'Train';
}
