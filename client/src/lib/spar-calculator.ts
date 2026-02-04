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
export type Gender = 'male' | 'female';

/**
 * SPAR Macro Protocols
 * Six unified protocols - each defines BOTH the macro split AND the calorie adjustment
 */
export type SparMacroProtocol = 'performance' | 'maintenance' | 'recomp' | 'build' | 'fatloss' | 'custom';

export interface SparMacroConfig {
  id: SparMacroProtocol;
  name: string;
  shortName: string;
  description: string;
  carbs: number;        // percentage
  protein: number;      // percentage
  fat: number;          // percentage
  calorieAdjustment: number;  // +/- calories from TDEE
  weeklyChange: string; // human-readable weekly change
  whoFor: string;
}

/**
 * Custom macro settings interface
 * Used when sparMacroProtocol === 'custom'
 */
export interface CustomMacros {
  carbs: number;           // percentage (0-100)
  protein: number;         // percentage (0-100)
  fat: number;             // percentage (0-100)
  calorieAdjustment: number; // +/- calories from TDEE
}

/**
 * The six SPAR macro protocols
 * Each protocol defines BOTH the macro split AND the calorie strategy
 */
export const SPAR_MACRO_PROTOCOLS: Record<SparMacroProtocol, SparMacroConfig> = {
  performance: {
    id: 'performance',
    name: 'Sports Performance',
    shortName: 'Performance',
    description: 'Fuel training & recovery',
    carbs: 55,
    protein: 25,
    fat: 20,
    calorieAdjustment: 0,
    weeklyChange: 'Maintain weight',
    whoFor: 'In-season athletes, two-a-days, competition weeks',
  },
  maintenance: {
    id: 'maintenance',
    name: 'Balanced Maintenance',
    shortName: 'Maintain',
    description: 'Sustain current weight',
    carbs: 45,
    protein: 25,
    fat: 30,
    calorieAdjustment: 0,
    weeklyChange: 'Maintain weight',
    whoFor: 'Active adults, 2-4x/week training, long-term sustainability',
  },
  recomp: {
    id: 'recomp',
    name: 'Body Recomposition',
    shortName: 'Recomp',
    description: 'Build muscle, lose fat',
    carbs: 40,
    protein: 30,
    fat: 30,
    calorieAdjustment: 0,
    weeklyChange: 'Maintain weight',
    whoFor: 'Off-season athletes wanting slow body composition change',
  },
  build: {
    id: 'build',
    name: 'Muscle Building',
    shortName: 'Build',
    description: 'Gain strength & size',
    carbs: 50,
    protein: 30,
    fat: 20,
    calorieAdjustment: 500,
    weeklyChange: '~1 lb/week gain',
    whoFor: 'Off-season athletes, bulking phase, strength focus',
  },
  fatloss: {
    id: 'fatloss',
    name: 'Fat Loss',
    shortName: 'Fat Loss',
    description: 'Lose ~1 lb/week',
    carbs: 30,
    protein: 35,
    fat: 35,
    calorieAdjustment: -500,
    weeklyChange: '~1 lb/week loss',
    whoFor: 'Weight loss focus, weight-class athletes cutting',
  },
  custom: {
    id: 'custom',
    name: 'Custom Plan',
    shortName: 'Custom',
    description: 'Set your own targets',
    carbs: 40,
    protein: 30,
    fat: 30,
    calorieAdjustment: 0,
    weeklyChange: 'You decide',
    whoFor: 'Experienced users who know their ideal macro ratios',
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
 * @param customMacros - Used when macroProtocol === 'custom'
 */
function getMacroSplitForProtocol(
  macroProtocol: SparMacroProtocol,
  customMacros?: CustomMacros
): { protein: number; carb: number; veg: number } {
  // For custom protocol, use the user's custom macros
  let carbPercent: number;
  let proteinPercent: number;

  if (macroProtocol === 'custom' && customMacros) {
    carbPercent = customMacros.carbs;
    proteinPercent = customMacros.protein;
  } else {
    const config = SPAR_MACRO_PROTOCOLS[macroProtocol];
    if (!config) return DEFAULT_MACRO_SPLIT;
    carbPercent = config.carbs;
    proteinPercent = config.protein;
  }

  // Protocol defines C/P/F percentages, but slices track P/C/V
  // Veggies are always recommended regardless of macro split (fiber, micronutrients)
  // We'll use a base veggie allocation then divide remaining between protein and carbs
  const vegPercent = 0.15; // ~15% of calories from veggies (fiber/micronutrients)
  const remainingPercent = 1 - vegPercent;

  // Scale protein and carb percentages to fill the remaining 85%
  const totalProteinCarb = proteinPercent + carbPercent;
  const scaledProtein = (proteinPercent / totalProteinCarb) * remainingPercent;
  const scaledCarb = (carbPercent / totalProteinCarb) * remainingPercent;

  return {
    protein: scaledProtein,
    carb: scaledCarb,
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
  calorieAdjustment?: number;
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
 * The protocol now includes both the macro split AND the calorie adjustment
 * @param macroProtocol - SPAR macro protocol (defaults to 'maintenance')
 * @param customMacros - Custom C/P/F percentages + calorie adjustment when macroProtocol === 'custom'
 */
export function calculateSliceTargets(
  weightLbs: number,
  heightInches: number,
  age: number,
  gender: Gender,
  activityLevel: ActivityLevel,
  macroProtocol: SparMacroProtocol = 'maintenance',
  customMacros?: CustomMacros,
): SliceTargets {
  const bmr = calculateBMR(weightLbs, heightInches, age, gender);
  const tdee = calculateTDEE(bmr, activityLevel);

  // Get calorie adjustment from protocol (or custom macros)
  let calorieAdjustment = 0;
  if (macroProtocol === 'custom' && customMacros) {
    calorieAdjustment = customMacros.calorieAdjustment || 0;
  } else {
    const config = SPAR_MACRO_PROTOCOLS[macroProtocol];
    calorieAdjustment = config?.calorieAdjustment || 0;
  }

  const adjusted = tdee + calorieAdjustment;

  // Minimum floor — never go below 1200 cal
  const targetCals = Math.max(adjusted, 1200);

  // Get macro split based on selected protocol (pass custom macros if applicable)
  const macroSplit = getMacroSplitForProtocol(macroProtocol, customMacros);

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
    calorieAdjustment,
  };
}

/**
 * Calculate what the target calories would be for each protocol
 * Used to display calorie previews in protocol selector
 */
export function getProtocolCaloriePreview(
  weightLbs: number,
  heightInches: number,
  age: number,
  gender: Gender,
  activityLevel: ActivityLevel,
): Record<SparMacroProtocol, number> {
  const bmr = calculateBMR(weightLbs, heightInches, age, gender);
  const tdee = calculateTDEE(bmr, activityLevel);

  const previews: Record<SparMacroProtocol, number> = {} as Record<SparMacroProtocol, number>;

  for (const [id, config] of Object.entries(SPAR_MACRO_PROTOCOLS)) {
    const adjusted = tdee + config.calorieAdjustment;
    previews[id as SparMacroProtocol] = Math.max(1200, Math.round(adjusted));
  }

  return previews;
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
