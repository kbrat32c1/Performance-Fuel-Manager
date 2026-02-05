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
// WEIGHT CUT SAFETY THRESHOLDS
// Based on NWCA (National Wrestling Coaches Association) guidelines
// and sports medicine best practices
// =============================================================================

/**
 * Maximum safe weight loss per week (percentage of body weight)
 * Source: NWCA Optimal Performance Calculator guidelines
 * Exceeding this increases risk of dehydration, muscle loss, and performance decline
 */
export const MAX_SAFE_WEEKLY_LOSS_PERCENT = 1.5;

/**
 * Maximum total weight cut from walk-around weight (percentage)
 * Source: NCAA Wrestling Weight Management Program
 * Larger cuts significantly increase health risks
 */
export const MAX_SAFE_TOTAL_CUT_PERCENT = 8;

/**
 * Days before weigh-in when aggressive cutting becomes high risk
 * At this point, only water manipulation should be used
 */
export const CRITICAL_DAYS_THRESHOLD = 2;

/**
 * Pounds over target that triggers DANGER alert in final 24 hours
 * This amount is extremely difficult to cut safely
 */
export const DANGER_DELTA_24H_LBS = 3;

/**
 * Pounds over target that triggers WARNING alert in final 48 hours
 */
export const WARNING_DELTA_48H_LBS = 5;

/**
 * Minimum hydration level (specific gravity) before cutting
 * Source: NCAA hydration testing threshold
 * Below 1.025 indicates adequate hydration
 */
export const MIN_HYDRATION_SPECIFIC_GRAVITY = 1.025;

/**
 * Safety assessment levels for weight cutting
 */
export type SafetyLevel = 'safe' | 'caution' | 'warning' | 'danger';

/**
 * Assess safety level based on weight delta and time remaining
 */
export function assessWeightCutSafety(
  currentWeight: number,
  targetWeight: number,
  daysUntilWeighIn: number
): { level: SafetyLevel; message: string } {
  const delta = currentWeight - targetWeight;
  const percentOver = (delta / targetWeight) * 100;

  // Already at or below target
  if (delta <= 0) {
    return { level: 'safe', message: 'On target' };
  }

  // Final 24 hours
  if (daysUntilWeighIn <= 1) {
    if (delta > DANGER_DELTA_24H_LBS) {
      return { level: 'danger', message: `${delta.toFixed(1)} lbs in <24h is dangerous` };
    }
    if (delta > 2) {
      return { level: 'warning', message: 'Aggressive water cut needed' };
    }
    return { level: 'caution', message: 'Final push - sip water only' };
  }

  // Final 48 hours
  if (daysUntilWeighIn <= CRITICAL_DAYS_THRESHOLD) {
    if (delta > WARNING_DELTA_48H_LBS) {
      return { level: 'danger', message: 'Behind schedule - high risk' };
    }
    if (delta > 3) {
      return { level: 'warning', message: 'Tight timeline - extra cardio needed' };
    }
    return { level: 'caution', message: 'On pace - stay disciplined' };
  }

  // More than 2 days out
  if (percentOver > MAX_SAFE_TOTAL_CUT_PERCENT) {
    return { level: 'warning', message: `${percentOver.toFixed(1)}% cut is aggressive` };
  }

  if (delta > 5) {
    return { level: 'caution', message: 'Significant weight to lose' };
  }

  return { level: 'safe', message: 'On track' };
}

// =============================================================================
// WEIGHT CLASSES & PROTOCOLS
// =============================================================================

// Weight class definitions for wrestling
export const WEIGHT_CLASSES = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285] as const;
export type WeightClass = typeof WEIGHT_CLASSES[number];

// Protocol identifiers
export const PROTOCOLS = {
  BODY_COMP: '1',
  MAKE_WEIGHT: '2',
  HOLD_WEIGHT: '3',
  BUILD: '4',
  SPAR: '5',
} as const;

export type Protocol = typeof PROTOCOLS[keyof typeof PROTOCOLS];

// Protocol display names
export const PROTOCOL_NAMES: Record<Protocol, string> = {
  [PROTOCOLS.BODY_COMP]: 'Body Comp Phase',
  [PROTOCOLS.MAKE_WEIGHT]: 'Make Weight Phase',
  [PROTOCOLS.HOLD_WEIGHT]: 'Hold Weight Phase',
  [PROTOCOLS.BUILD]: 'Build Phase',
  [PROTOCOLS.SPAR]: 'SPAR Nutrition',
};

// Protocol short names for compact displays
export const PROTOCOL_SHORT_NAMES: Record<Protocol, string> = {
  [PROTOCOLS.BODY_COMP]: 'Body Comp',
  [PROTOCOLS.MAKE_WEIGHT]: 'Make Weight',
  [PROTOCOLS.HOLD_WEIGHT]: 'Hold Weight',
  [PROTOCOLS.BUILD]: 'Build',
  [PROTOCOLS.SPAR]: 'SPAR',
};

// Nutrition mode type — slices (spar) or grams (sugar)
export type NutritionMode = 'spar' | 'sugar';

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
  [PROTOCOLS.SPAR]: '35/40/25',
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

// =============================================================================
// WATER & SODIUM PROTOCOL (Research-based: oz/lb body mass scaling)
// Sources: PubMed 29182412 (Reale et al.), ISSN Position Stand PMC11894756, Gatorade SSI
// Protocol: 3 days load → 1 day restrict → 1 day sips → weigh-in → rehydrate
// =============================================================================

/**
 * Water loading protocol by day (fluid ounces per pound of body weight).
 * Conversion: ml/kg × 0.01534 = oz/lb  (1 ml = 0.03381 oz, 1 kg = 2.2046 lb)
 * Research: 100 ml/kg ≈ 1.53 oz/lb, 15 ml/kg ≈ 0.23 oz/lb.
 * Research shows 100 ml/kg loading produces ~3.2% BM loss vs ~2.4% at 40 ml/kg.
 * Days indexed by daysUntilWeighIn (5=Mon, 4=Tue, 3=Wed, 2=Thu, 1=Fri, 0=Sat).
 */
export const WATER_OZ_PER_LB = {
  5: 1.2,   // Mon: Baseline loading ≈80 ml/kg (~1.0-1.5 gal depending on size)
  4: 1.5,   // Tue: Peak loading ≈100 ml/kg — maximize diuresis
  3: 1.5,   // Wed: Peak loading ≈100 ml/kg — peak hydration
  2: 0.3,   // Thu: Sharp restriction ≈20 ml/kg — ADH still suppressed, high urine output continues
  1: 0.08,  // Fri: Sips only ≈5 ml/kg — final flush
  0: 0,     // Sat: Weigh-in → rehydrate immediately after
  [-1]: 0.75,// Sun: Normalize ≈50 ml/kg — return to baseline
} as const;

/**
 * Sodium targets (mg/day) by daysUntilWeighIn.
 * Salt-loading Mon-Wed trains kidneys to excrete aggressively;
 * sudden restriction Thu-Fri causes continued sodium (and water) excretion.
 * SAFETY: Never eliminate sodium completely — causes dangerous imbalances.
 */
export const SODIUM_MG_BY_DAY = {
  5: { target: 5000, label: 'High — salt-load', color: 'text-amber-500' },
  4: { target: 5000, label: 'High — salt-load', color: 'text-amber-500' },
  3: { target: 5000, label: 'High — salt-load', color: 'text-amber-500' },
  2: { target: 2500, label: 'Normal — stop adding salt', color: 'text-primary' },
  1: { target: 1000, label: 'Minimal — under 1,000mg', color: 'text-orange-500' },
  0: { target: 0, label: 'Reintroduce post weigh-in', color: 'text-cyan-500' },
  [-1]: { target: 3000, label: 'Normal — replenish', color: 'text-green-500' },
} as const;

/**
 * Compute the water target in fluid ounces for a given day and body weight.
 * Returns the raw oz value for use in hydration tracking.
 */
// Max water loading cap (oz) — ~2.5 gal. Prevents unsafe volumes for heavyweights.
export const MAX_WATER_LOADING_OZ = 320;

export function getWaterTargetOz(daysUntil: number, weightLbs: number): number {
  if (daysUntil === 0) return 0; // Weigh-in day — rehydrate after
  const key = daysUntil < 0 ? -1 : Math.min(daysUntil, 5);
  const ozPerLb = WATER_OZ_PER_LB[key as keyof typeof WATER_OZ_PER_LB] ?? 0.5;
  const raw = Math.round(ozPerLb * weightLbs);
  // Cap loading days (ozPerLb > 0.5) to prevent unsafe volumes for heavyweights
  return ozPerLb > 0.5 ? Math.min(raw, MAX_WATER_LOADING_OZ) : raw;
}

/**
 * Get formatted water target string (e.g. "1.50 gal", "Sips only", "Rehydrate").
 * Used for weekly plan and explanatory text where gallon-scale numbers make sense.
 */
export function getWaterTargetGallons(daysUntil: number, weightLbs: number): string {
  if (daysUntil === 0) return 'Rehydrate';
  const key = daysUntil < 0 ? -1 : Math.min(daysUntil, 5);
  const ozPerLb = WATER_OZ_PER_LB[key as keyof typeof WATER_OZ_PER_LB] ?? 0.5;
  if (ozPerLb <= 0.1) return 'Sips only';
  let totalOz = ozPerLb * weightLbs;
  // Cap loading days for heavyweights
  if (ozPerLb > 0.5) totalOz = Math.min(totalOz, MAX_WATER_LOADING_OZ);
  const gallons = totalOz / 128;
  // Round to nearest 0.25
  const rounded = Math.round(gallons * 4) / 4;
  return `${rounded.toFixed(rounded % 1 === 0 ? 1 : 2)} gal`;
}

/**
 * Get sodium info for a given day.
 */
export function getSodiumTarget(daysUntil: number) {
  const key = daysUntil < 0 ? -1 : Math.min(daysUntil, 5);
  return SODIUM_MG_BY_DAY[key as keyof typeof SODIUM_MG_BY_DAY] ?? SODIUM_MG_BY_DAY[-1];
}

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
  CHECK_IN: 'check-in',
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
 * Mon-Wed only (5,4,3 days out). Thursday (2 days out) is the
 * restriction/cutoff phase — water intake drops sharply to trigger
 * continued high urine output via suppressed ADH.
 */
export const WATER_LOADING_DAYS = [5, 4, 3] as const;

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
  return WATER_LOADING_DAYS.includes(daysUntil as 5 | 4 | 3);
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
  if (daysUntil === 2) return 'Prep';
  if (daysUntil >= 3 && daysUntil <= 5) return 'Load';
  return 'Train';
}
