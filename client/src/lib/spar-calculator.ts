/**
 * SPAR Nutrition Calculator
 * Simple as Pie for Achievable Results
 *
 * Calculates daily slice targets based on BMR → TDEE → calorie allocation.
 * Each "slice" is a portion:
 *   - Protein: 1 palm (~4oz, ~110 cal)
 *   - Complex Carb: 1 fist (~½ cup cooked, ~120 cal)
 *   - Veggie/Fruit: 1 fist (~50 cal avg)
 */

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very-active';
export type WeeklyGoal = 'cut' | 'maintain' | 'build';
export type Gender = 'male' | 'female';

/**
 * SPAR Macro Protocols
 * Four distinct macro splits for different goals
 */
export type SparMacroProtocol = 'sports' | 'maintenance' | 'recomp' | 'fatloss';

export interface SparMacroConfig {
  id: SparMacroProtocol;
  name: string;
  shortName: string;
  description: string;
  carbs: number;   // percentage
  protein: number; // percentage
  fat: number;     // percentage
  whoFor: string;
}

/**
 * The four SPAR macro protocols
 * Order: Performance → Health → Aesthetics → Weight Loss
 */
export const SPAR_MACRO_PROTOCOLS: Record<SparMacroProtocol, SparMacroConfig> = {
  sports: {
    id: 'sports',
    name: 'Sports Performance',
    shortName: 'Performance',
    description: 'Fuel output and recovery',
    carbs: 55,
    protein: 25,
    fat: 20,
    whoFor: 'In-season athletes, two-a-days, competition weeks',
  },
  maintenance: {
    id: 'maintenance',
    name: 'Balanced Maintenance',
    shortName: 'Maintain',
    description: 'Live well without thinking',
    carbs: 45,
    protein: 25,
    fat: 30,
    whoFor: 'Active adults, 2-4x/week training, long-term sustainability',
  },
  recomp: {
    id: 'recomp',
    name: 'Body Recomposition',
    shortName: 'Recomp',
    description: 'Lean out while training',
    carbs: 40,
    protein: 30,
    fat: 30,
    whoFor: 'Off-season athletes, slow cut without suffering',
  },
  fatloss: {
    id: 'fatloss',
    name: 'Fat Loss Control',
    shortName: 'Fat Loss',
    description: 'Lose weight predictably',
    carbs: 30,
    protein: 35,
    fat: 35,
    whoFor: 'Weight loss focus, weight-class athletes off-season',
  },
};

// Activity multipliers (from SPAR Excel spreadsheet)
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  'sedentary': 1.2,
  'light': 1.375,
  'moderate': 1.55,
  'active': 1.725,      // wrestlers in-season
  'very-active': 1.9,
};

// Goal calorie adjustments
const GOAL_ADJUSTMENTS: Record<WeeklyGoal, number> = {
  'cut': -500,        // ~1 lb/week loss
  'maintain': 0,
  'build': 300,       // lean gain
};

// Calories per slice by category
const CALORIES_PER_SLICE = {
  protein: 110,   // ~4oz palm-sized lean protein
  carb: 120,      // ~½ cup cooked complex carb
  veg: 50,        // ~1 fist veggies/fruit (lower cal density)
};

// Default macro split (used as fallback)
const DEFAULT_MACRO_SPLIT = {
  protein: 0.35,  // 35% of calories from protein
  carb: 0.40,     // 40% from complex carbs
  veg: 0.25,      // 25% from veggies/fruit
};

/**
 * Get macro split for a given protocol
 * Converts protocol percentages to slice-friendly ratios
 * Note: Fat is not tracked as slices, so we redistribute to carbs/protein/veg
 */
function getMacroSplitForProtocol(macroProtocol: SparMacroProtocol): { protein: number; carb: number; veg: number } {
  const config = SPAR_MACRO_PROTOCOLS[macroProtocol];
  if (!config) return DEFAULT_MACRO_SPLIT;

  // Protocol defines C/P/F percentages, but slices track P/C/V
  // Veggies are always recommended regardless of macro split (fiber, micronutrients)
  // We'll use a base veggie allocation then divide remaining between protein and carbs
  const vegPercent = 0.15; // ~15% of calories from veggies (fiber/micronutrients)
  const remainingPercent = 1 - vegPercent;

  // Scale protein and carb percentages to fill the remaining 85%
  const totalProteinCarb = config.protein + config.carbs;
  const proteinPercent = (config.protein / totalProteinCarb) * remainingPercent;
  const carbPercent = (config.carbs / totalProteinCarb) * remainingPercent;

  return {
    protein: proteinPercent,
    carb: carbPercent,
    veg: vegPercent,
  };
}

export interface SliceTargets {
  protein: number;
  carb: number;
  veg: number;
  totalCalories: number;
  bmr: number;
  tdee: number;
  macroProtocol?: SparMacroProtocol;
}

/**
 * Calculate BMR using Mifflin-St Jeor equation
 * More accurate for athletes than Harris-Benedict
 */
export function calculateBMR(
  weightLbs: number,
  heightInches: number,
  age: number,
  gender: Gender,
): number {
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightInches * 2.54;

  if (gender === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || 1.725);
}

/**
 * Calculate daily slice targets from profile data
 * @param macroProtocol - Optional SPAR macro protocol (defaults to 'maintenance')
 */
export function calculateSliceTargets(
  weightLbs: number,
  heightInches: number,
  age: number,
  gender: Gender,
  activityLevel: ActivityLevel,
  weeklyGoal: WeeklyGoal,
  macroProtocol: SparMacroProtocol = 'maintenance',
): SliceTargets {
  const bmr = calculateBMR(weightLbs, heightInches, age, gender);
  const tdee = calculateTDEE(bmr, activityLevel);
  const adjusted = tdee + (GOAL_ADJUSTMENTS[weeklyGoal] || 0);

  // Minimum floor — never go below 1200 cal
  const targetCals = Math.max(adjusted, 1200);

  // Get macro split based on selected protocol
  const macroSplit = getMacroSplitForProtocol(macroProtocol);

  const proteinCals = targetCals * macroSplit.protein;
  const carbCals = targetCals * macroSplit.carb;
  const vegCals = targetCals * macroSplit.veg;

  return {
    protein: Math.max(2, Math.round(proteinCals / CALORIES_PER_SLICE.protein)),
    carb: Math.max(2, Math.round(carbCals / CALORIES_PER_SLICE.carb)),
    veg: Math.max(3, Math.round(vegCals / CALORIES_PER_SLICE.veg)),
    totalCalories: Math.round(targetCals),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    macroProtocol,
  };
}

/**
 * Get a human-readable activity level description
 */
export function getActivityDescription(level: ActivityLevel): string {
  const descriptions: Record<ActivityLevel, string> = {
    'sedentary': 'Little or no exercise',
    'light': 'Light exercise 1-3 days/week',
    'moderate': 'Moderate exercise 3-5 days/week',
    'active': 'Hard exercise 6-7 days/week',
    'very-active': 'Very hard exercise, 2x/day training',
  };
  return descriptions[level] || descriptions['active'];
}
