/**
 * SPAR Nutrition Calculator v2.0
 * Simple as Pie for Achievable Results
 *
 * Key changes from v1.0:
 * - 5 slice categories: Protein, Carbs, Vegetables, Fruit, Fat
 * - Protein anchored to bodyweight (g/lb), not % of calories
 * - Fixed minimums for vegetables (5) and fruit (2)
 * - Activity multiplier from training sessions + workday activity
 * - Nerd mode: Body fat %, custom protein, custom macro split
 */

import { LBS_TO_KG, INCHES_TO_CM } from './constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Sex = 'male' | 'female';

export type Goal = 'lose' | 'maintain' | 'gain';

export type GoalIntensity = 'lean' | 'aggressive';

export type MaintainPriority = 'general' | 'performance';

export type TrainingSessions = '1-2' | '3-4' | '5-6' | '7+';

export type WorkdayActivity = 'mostly_sitting' | 'on_feet_some' | 'on_feet_most';

// ─── Input Interface ──────────────────────────────────────────────────────────

export interface SparV2Input {
  // Required
  sex: Sex;
  age: number;
  heightInches: number;
  weightLbs: number;
  trainingSessions: TrainingSessions;
  workdayActivity: WorkdayActivity;
  goal: Goal;

  // Goal-specific
  goalIntensity?: GoalIntensity;      // For lose/gain: 'lean' or 'aggressive'
  maintainPriority?: MaintainPriority; // For maintain: 'general' or 'performance'
  goalWeightLbs?: number;              // Target weight for lose/gain

  // Nerd mode (optional)
  bodyFatPercent?: number;             // 0-100 scale, enables Cunningham formula
  customProteinPerLb?: number;         // Override g/lb multiplier
  customFatPercent?: number;           // Override fat % of remaining calories
  customCarbPercent?: number;          // Override carb % of remaining calories
}

// ─── Output Interface ─────────────────────────────────────────────────────────

export interface SparV2Output {
  // Daily slice targets
  proteinPalms: number;
  carbFists: number;
  vegFists: number;        // Always 5 minimum
  fruitPieces: number;     // Always 2 minimum
  fatThumbs: number;

  // Calculation details (for UI/debugging)
  bmr: number;
  tdee: number;
  adjustedTdee: number;
  proteinGrams: number;
  carbGramsTotal: number;
  starchCarbGrams: number;
  fatGrams: number;
  totalSliceCalories: number;

  // Protocol info
  calorieAdjustment: number;
  proteinPerLb: number;
  fatCarbSplit: { fat: number; carb: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Activity multiplier matrix: [trainingSessions][workdayActivity]
const ACTIVITY_MATRIX: Record<TrainingSessions, Record<WorkdayActivity, number>> = {
  '1-2': { mostly_sitting: 1.2,  on_feet_some: 1.35, on_feet_most: 1.35 },
  '3-4': { mostly_sitting: 1.35, on_feet_some: 1.55, on_feet_most: 1.55 },
  '5-6': { mostly_sitting: 1.55, on_feet_some: 1.55, on_feet_most: 1.725 },
  '7+':  { mostly_sitting: 1.55, on_feet_some: 1.725, on_feet_most: 1.725 },
};

// Protocol configurations
interface ProtocolConfig {
  proteinPerLb: number;
  calorieAdjustment: number;
  fatPercent: number;   // % of remaining calories after protein + fixed
  carbPercent: number;  // % of remaining calories after protein + fixed
}

const PROTOCOL_CONFIGS: Record<string, ProtocolConfig> = {
  // Lose
  'lose_lean':       { proteinPerLb: 0.85, calorieAdjustment: -250, fatPercent: 50, carbPercent: 50 },
  'lose_aggressive': { proteinPerLb: 0.85, calorieAdjustment: -500, fatPercent: 50, carbPercent: 50 },

  // Maintain
  'maintain_general':     { proteinPerLb: 0.65, calorieAdjustment: 0, fatPercent: 45, carbPercent: 55 },
  'maintain_performance': { proteinPerLb: 0.75, calorieAdjustment: 0, fatPercent: 30, carbPercent: 70 },

  // Gain
  'gain_lean':       { proteinPerLb: 0.95, calorieAdjustment: 250,  fatPercent: 30, carbPercent: 70 },
  'gain_aggressive': { proteinPerLb: 0.95, calorieAdjustment: 500,  fatPercent: 30, carbPercent: 70 },
};

// Slice calorie values
const SLICE_CALORIES = {
  protein: 125,  // 1 palm = ~25g protein × 4 cal + some fat
  carb: 104,     // 1 fist = ~26g carbs × 4 cal
  veg: 32,       // 1 fist = ~8g carbs × 4 cal
  fruit: 100,    // 1 piece = ~25g carbs × 4 cal
  fat: 126,      // 1 thumb = ~14g fat × 9 cal
};

// Slice gram values (for conversion)
const SLICE_GRAMS = {
  protein: 25,   // grams protein per palm
  carb: 26,      // grams carbs per fist
  veg: 8,        // grams carbs per veg fist
  fruit: 25,     // grams carbs per fruit piece
  fat: 14,       // grams fat per thumb
};

// Fixed minimums
const FIXED_VEG_SLICES = 5;
const FIXED_FRUIT_SLICES = 2;
const FIXED_VEG_CARBS = FIXED_VEG_SLICES * SLICE_GRAMS.veg;     // 40g
const FIXED_FRUIT_CARBS = FIXED_FRUIT_SLICES * SLICE_GRAMS.fruit; // 50g
const FIXED_CARBS_TOTAL = FIXED_VEG_CARBS + FIXED_FRUIT_CARBS;   // 90g
const FIXED_VEG_CAL = FIXED_VEG_SLICES * SLICE_CALORIES.veg;     // 160 cal
const FIXED_FRUIT_CAL = FIXED_FRUIT_SLICES * SLICE_CALORIES.fruit; // 200 cal
const FIXED_CAL_TOTAL = FIXED_VEG_CAL + FIXED_FRUIT_CAL;         // 360 cal

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Calculate BMR using Mifflin-St Jeor equation
 *
 * Formula (male):   BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age + 5
 * Formula (female): BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age - 161
 *
 * Source: Mifflin MD, et al. Am J Clin Nutr. 1990;51(2):241-247
 */
function calculateBMR(weightLbs: number, heightInches: number, age: number, sex: Sex): number {
  const weightKg = weightLbs * LBS_TO_KG;
  const heightCm = heightInches * INCHES_TO_CM;

  if (sex === 'male') {
    return (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
  }
  return (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
}

/**
 * Calculate BMR using Cunningham equation (lean mass based)
 * More accurate for lean/muscular individuals
 *
 * Formula: BMR = 500 + (22 × lean body mass in kg)
 *
 * Source: Cunningham JJ. Am J Clin Nutr. 1991;54(6):963-969
 */
function calculateCunninghamBMR(weightLbs: number, bodyFatPercent: number): number {
  const weightKg = weightLbs * LBS_TO_KG;
  const leanMassKg = weightKg * (1 - bodyFatPercent / 100);
  return 500 + (22 * leanMassKg);
}

/**
 * Get activity multiplier from training sessions and workday activity
 */
function getActivityMultiplier(trainingSessions: TrainingSessions, workdayActivity: WorkdayActivity): number {
  return ACTIVITY_MATRIX[trainingSessions]?.[workdayActivity] ?? 1.55;
}

/**
 * Get protocol key from goal and sub-option
 */
function getProtocolKey(input: SparV2Input): string {
  const { goal, goalIntensity, maintainPriority } = input;

  if (goal === 'lose') {
    return `lose_${goalIntensity || 'aggressive'}`;
  }
  if (goal === 'gain') {
    return `gain_${goalIntensity || 'aggressive'}`;
  }
  // maintain
  return `maintain_${maintainPriority || 'general'}`;
}

// ─── Main Calculator ──────────────────────────────────────────────────────────

export function calculateSparSlicesV2(input: SparV2Input): SparV2Output {
  const {
    sex,
    age,
    heightInches,
    weightLbs,
    trainingSessions,
    workdayActivity,
    bodyFatPercent,
    customProteinPerLb,
    customFatPercent,
    customCarbPercent,
  } = input;

  // Step 1: Calculate BMR
  let bmr: number;
  if (bodyFatPercent !== undefined && bodyFatPercent > 0 && bodyFatPercent < 100) {
    // Nerd mode: use Cunningham
    bmr = calculateCunninghamBMR(weightLbs, bodyFatPercent);
  } else {
    // Standard: use Mifflin-St Jeor
    bmr = calculateBMR(weightLbs, heightInches, age, sex);
  }

  // Step 2: Calculate TDEE
  const activityMultiplier = getActivityMultiplier(trainingSessions, workdayActivity);
  const tdee = bmr * activityMultiplier;

  // Step 3: Get protocol config
  const protocolKey = getProtocolKey(input);
  const protocol = PROTOCOL_CONFIGS[protocolKey] ?? PROTOCOL_CONFIGS['maintain_general'];

  // Step 4: Apply calorie adjustment
  const adjustedTdee = Math.max(1200, tdee + protocol.calorieAdjustment);

  // Step 5: Calculate protein (anchored to bodyweight)
  const proteinPerLb = customProteinPerLb ?? protocol.proteinPerLb;
  const proteinGrams = weightLbs * proteinPerLb;
  const proteinCal = proteinGrams * 4;

  // Step 6: Calculate remaining calories (after protein + fixed veg/fruit)
  const remainingCal = adjustedTdee - proteinCal - FIXED_CAL_TOTAL;

  // Step 7: Split remaining between fat and carbs
  const fatPercent = customFatPercent ?? protocol.fatPercent;
  const carbPercent = customCarbPercent ?? protocol.carbPercent;

  // Normalize if custom values don't sum to 100
  const totalPercent = fatPercent + carbPercent;
  const normalizedFatPercent = fatPercent / totalPercent;
  const normalizedCarbPercent = carbPercent / totalPercent;

  const fatCal = remainingCal * normalizedFatPercent;
  const carbCal = remainingCal * normalizedCarbPercent;

  // Step 8: Convert to grams
  const fatGrams = fatCal / 9;
  const carbGramsTotal = carbCal / 4;
  const starchCarbGrams = Math.max(0, carbGramsTotal - FIXED_CARBS_TOTAL);

  // Step 9: Convert to slices
  const proteinPalms = Math.round(proteinGrams / SLICE_GRAMS.protein);
  const carbFists = Math.round(starchCarbGrams / SLICE_GRAMS.carb);
  const fatThumbs = Math.round(fatGrams / SLICE_GRAMS.fat);

  // Step 10: Calculate total slice calories for validation
  const totalSliceCalories =
    (proteinPalms * SLICE_CALORIES.protein) +
    (carbFists * SLICE_CALORIES.carb) +
    (FIXED_VEG_SLICES * SLICE_CALORIES.veg) +
    (FIXED_FRUIT_SLICES * SLICE_CALORIES.fruit) +
    (fatThumbs * SLICE_CALORIES.fat);

  return {
    // Slice targets
    proteinPalms: Math.max(2, proteinPalms),
    carbFists: Math.max(1, carbFists),
    vegFists: FIXED_VEG_SLICES,
    fruitPieces: FIXED_FRUIT_SLICES,
    fatThumbs: Math.max(1, fatThumbs),

    // Calculation details
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    adjustedTdee: Math.round(adjustedTdee),
    proteinGrams: Math.round(proteinGrams),
    carbGramsTotal: Math.round(carbGramsTotal),
    starchCarbGrams: Math.round(starchCarbGrams),
    fatGrams: Math.round(fatGrams),
    totalSliceCalories: Math.round(totalSliceCalories),

    // Protocol info
    calorieAdjustment: protocol.calorieAdjustment,
    proteinPerLb,
    fatCarbSplit: { fat: fatPercent, carb: carbPercent },
  };
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Get human-readable description for training sessions
 */
export function getTrainingDescription(sessions: TrainingSessions): string {
  const descriptions: Record<TrainingSessions, string> = {
    '1-2': '1-2 sessions per week',
    '3-4': '3-4 sessions per week',
    '5-6': '5-6 sessions per week',
    '7+': '7+ sessions per week',
  };
  return descriptions[sessions];
}

/**
 * Get human-readable description for workday activity
 */
export function getWorkdayDescription(activity: WorkdayActivity): string {
  const descriptions: Record<WorkdayActivity, string> = {
    'mostly_sitting': 'Mostly sitting (desk job)',
    'on_feet_some': 'On feet some of the day',
    'on_feet_most': 'On feet most of the day / manual labor',
  };
  return descriptions[activity];
}

/**
 * Get human-readable description for goal + sub-option
 */
export function getGoalDescription(goal: Goal, intensity?: GoalIntensity, priority?: MaintainPriority): string {
  if (goal === 'lose') {
    return intensity === 'lean'
      ? 'Lose weight (gradual, -250 cal)'
      : 'Lose weight (aggressive, -500 cal)';
  }
  if (goal === 'gain') {
    return intensity === 'lean'
      ? 'Gain muscle (lean, +250 cal)'
      : 'Gain muscle (aggressive, +500 cal)';
  }
  // maintain
  return priority === 'performance'
    ? 'Maintain (performance focus, higher carbs)'
    : 'Maintain (general health, balanced)';
}

/**
 * Validate that total slice calories are within acceptable range of target
 */
export function validateSliceCalories(output: SparV2Output, toleranceCal: number = 200): boolean {
  const diff = Math.abs(output.totalSliceCalories - output.adjustedTdee);
  return diff <= toleranceCal;
}

/**
 * Calculate 7-day rolling average weight from an array of weight entries
 */
export function calculate7DayAverage(weights: { date: Date; weight: number }[]): number | null {
  if (weights.length === 0) return null;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentWeights = weights.filter(w => w.date >= sevenDaysAgo);

  if (recentWeights.length === 0) return null;

  const sum = recentWeights.reduce((acc, w) => acc + w.weight, 0);
  return sum / recentWeights.length;
}

/**
 * Check if weight has shifted enough to trigger recalculation
 */
export function shouldRecalculate(lastCalcWeight: number, currentAvgWeight: number, thresholdLbs: number = 2): boolean {
  return Math.abs(currentAvgWeight - lastCalcWeight) >= thresholdLbs;
}

/**
 * Check if user has reached their goal weight
 */
export function hasReachedGoal(goal: Goal, goalWeight: number, currentAvgWeight: number): boolean {
  if (goal === 'lose') {
    return currentAvgWeight <= goalWeight;
  }
  if (goal === 'gain') {
    return currentAvgWeight >= goalWeight;
  }
  return false; // maintain has no goal weight
}
