import { addDays } from 'date-fns';
import type {
  MacroCustomFood,
  MacroCustomMeal,
  SparCustomFood,
  SparCustomMealData,
} from '../supabase';
import type {
  Goal as SparV2Goal,
  GoalIntensity,
  MaintainPriority,
  TrainingSessions,
  WorkdayActivity,
} from '../spar-calculator-v2';
import type { CutScoreResult } from '../cut-score';
import type { TrackingSyncStatus } from './tracking-sync';

// ─── Protocol & Status ──────────────────────────────────────────────────────

export type Protocol = '1' | '2' | '3' | '4' | '5' | '6';
// 1: Extreme Cut Phase (12%+ above class, multi-day depletion)
// 2: Rapid Cut Phase (7-12% above class, short-term glycogen + water manipulation)
// 3: Optimal Cut Phase (Within 6-7% of class, glycogen management, performance protected)
// 4: Gain Phase (Off-season, performance and strength focus)
// 5: SPAR Nutrition (Balanced eating — slice-based portion counting)
// 6: SPAR Competition (SPAR nutrition + competition water loading & cycle timing)

export type Status = 'on-track' | 'borderline' | 'risk';

export type Phase = 'metabolic' | 'transition' | 'performance-prep' | 'last-24h' | 'recovery';

// ─── Core Data Types ────────────────────────────────────────────────────────

export interface FuelTanks {
  water: number;    // lbs
  glycogen: number; // lbs
  gut: number;      // lbs
  fat: number;      // lbs
  muscle: number;   // lbs
}

export interface AthleteProfile {
  name: string;
  lastName: string;
  currentWeight: number;
  targetWeightClass: number;
  targetWeight?: number; // Custom target weight for SPAR users (optional, defaults to targetWeightClass)
  weighInDate: Date;
  weighInTime: string; // "HH:MM" format, e.g. "07:00"
  matchDate: Date;
  dashboardMode: 'pro';
  protocol: Protocol;
  status: Status;
  simulatedDate: Date | null;
  hasCompletedOnboarding?: boolean;
  // SPAR Nutrition profile fields
  heightInches?: number;
  age?: number;
  gender?: 'male' | 'female';
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very-active';
  nutritionPreference: 'spar' | 'sugar'; // slices or grams
  trackPracticeWeighIns?: boolean; // For SPAR users who still want to track practice weight loss
  waterLoading?: boolean; // Opt-in water loading plan (off = steady hydration all week)

  // SPAR v2 fields
  sparV2?: boolean; // Flag to indicate using v2 calculator
  sparGoal?: SparV2Goal; // 'lose' | 'maintain' | 'gain'
  goalIntensity?: GoalIntensity; // 'lean' | 'aggressive' - for lose/gain
  maintainPriority?: MaintainPriority; // 'general' | 'performance' - for maintain
  trainingSessions?: TrainingSessions; // '1-2' | '3-4' | '5-6' | '7+'
  workdayActivity?: WorkdayActivity; // 'mostly_sitting' | 'on_feet_some' | 'on_feet_most'
  goalWeightLbs?: number; // Target weight for lose/gain goals
  // Nerd mode options
  bodyFatPercent?: number; // Enables Cunningham formula (0-100)
  customProteinPerLb?: number; // Override protein g/lb
  customFatPercent?: number; // Override fat % of remaining calories
  customCarbPercent?: number; // Override carb % of remaining calories
  // Weight tracking for smart features
  lastCalcWeight?: number; // Weight used for last slice calculation
  lastCheckInDate?: string; // ISO date of last check-in prompt
  weighInCleared?: boolean; // True when user has no active weigh-in date
  nextCyclePromptDismissed?: boolean | string; // weigh-in date (yyyy-MM-dd) the post-weigh-in prompt was finished for
}

export interface WeightLog {
  id: string;
  date: Date;
  weight: number;
  type: 'morning' | 'pre-practice' | 'post-practice' | 'before-bed' | 'extra-before' | 'extra-after' | 'check-in' | 'weigh-in';
  urineColor?: number; // 1-8
  notes?: string;
  duration?: number; // workout duration in minutes (stored on post-practice and extra-after logs)
  sleepHours?: number; // hours of sleep (stored on morning logs for drift rate calculation)
}

export interface WaterLog {
  id: string;
  date: Date;
  amount: number; // in oz
}

// Meal section for FatSecret-style diary grouping
export type MealSection = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

/** Infer meal section from a timestamp based on hour of day */
export function inferMealSection(timestamp: string): MealSection {
  const hour = new Date(timestamp).getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 17 && hour < 21) return 'dinner';
  return 'snacks';
}

// Unified food log entry — works for both SPAR and Sugar modes
export interface FoodLogEntry {
  id: string;
  name: string;
  timestamp: string; // ISO string
  mode: 'spar' | 'sugar';
  mealSection?: MealSection;   // FatSecret-style meal grouping (auto-inferred if missing)
  // SPAR mode fields (v2 adds 'fruit' and 'fat')
  sliceType?: 'protein' | 'carb' | 'veg' | 'fruit' | 'fat';
  sliceCount?: number;         // usually 1, but could be 0.5 or 2
  // Sugar mode fields
  macroType?: 'carbs' | 'protein';
  amount?: number;             // grams
  category?: string;           // fructose, glucose, zerofiber, protein, custom, meals
  liquidOz?: number;           // for juices/liquids that also count as water
  gramAmount?: number;         // gram equivalent per slice for cross-sync undo
}

export interface DailyTracking {
  date: string; // YYYY-MM-DD format
  waterConsumed: number; // oz
  carbsConsumed: number; // grams
  proteinConsumed: number; // grams
  noPractice?: boolean; // rest day — hides PRE/POST slots
  // SPAR slice tracking
  proteinSlices: number;
  carbSlices: number;
  vegSlices: number;
  // SPAR v2 additional slice types
  fruitSlices?: number;
  fatSlices?: number;
  nutritionMode?: 'spar' | 'sugar'; // which mode was active when food was logged
  foodLog?: FoodLogEntry[];          // persisted food log
}

// Synced user foods data — mirrors UserFoodsJson but with client-friendly types
export interface UserFoodsData {
  customFoods: MacroCustomFood[];       // MacroTracker custom foods
  customMeals: MacroCustomMeal[];       // MacroTracker custom meals
  sparCustomFoods: SparCustomFood[];    // SparTracker custom foods
  sparCustomMeals: SparCustomMealData[];// SparTracker custom meals
  favorites: string[];                  // Composite keys like "spar:Chicken Breast"
}

export interface DayPlan {
  day: string;
  dayNum: number;
  date: Date;
  phase: string;
  weightTarget: number; // Morning weigh-in target (primary data point)
  water: { amount: string; targetOz: number; type: string };
  carbs: { min: number; max: number };
  protein: { min: number; max: number };
  isToday: boolean;
  isTomorrow: boolean;
  waterLoadingNote?: string;
  isCriticalCheckpoint?: boolean;
  weightWarning?: string;
}

// ─── Supabase Database Row Types ────────────────────────────────────────────

export interface SupabaseDailyTrackingRow {
  date: string;
  water_consumed: number;
  carbs_consumed: number;
  protein_consumed: number;
  no_practice?: boolean;
  protein_slices?: number;
  carb_slices?: number;
  veg_slices?: number;
  fruit_slices?: number;
  fat_slices?: number;
  nutrition_mode?: 'spar' | 'sugar';
  food_log?: FoodLogEntry[];
}

export interface SupabaseWeightLogRow {
  id: string;
  weight: number;
  date: string;
  type: string;
}

// ─── Store Context Type ─────────────────────────────────────────────────────

export interface StoreContextType {
  profile: AthleteProfile;
  fuelTanks: FuelTanks;
  logs: WeightLog[];
  dailyTracking: DailyTracking[];
  userFoods: UserFoodsData;
  isLoading: boolean;
  updateProfile: (updates: Partial<AthleteProfile>, options?: { silent?: boolean }) => void;
  updateUserFoods: (updates: Partial<UserFoodsData>) => void;
  /** Resolves to the saved log's id, or null when it was rejected or did not save */
  addLog: (log: Omit<WeightLog, 'id'>) => Promise<string | null>;
  /** Resolves to true once the change is saved */
  updateLog: (id: string, updates: Partial<WeightLog>) => Promise<boolean>;
  deleteLog: (id: string) => void;
  updateDailyTracking: (date: string, updates: Partial<Omit<DailyTracking, 'date'>>) => void;
  getDailyTracking: (date: string) => DailyTracking;
  /** Whether daily-tracking edits (food, water, slices) have reached the cloud */
  trackingSyncStatus: TrackingSyncStatus;
  /** Retry any unsaved daily-tracking edits now */
  retryTrackingSync: () => void;
  resetData: () => Promise<void>;
  clearLogs: () => Promise<void>;
  migrateLocalStorageToSupabase: () => Promise<void>;
  hasLocalStorageData: () => boolean;
  calculateTarget: () => number;
  getWaterLoadBonus: () => number;
  isWaterLoadingDay: () => boolean;
  getDaysUntilWeighIn: () => number;
  getDaysUntilForDay: (dayNum: number) => number;
  getTimeUntilWeighIn: () => string;
  getPhase: () => Phase;
  getTodaysFocus: () => { title: string; actions: string[], warning?: string };
  getHydrationTarget: () => { amount: string; type: string; note: string; targetOz: number };
  getMacroTargets: () => { carbs: { min: number; max: number }; protein: { min: number; max: number }; ratio: string; note?: string; weightWarning?: string };
  getFuelingGuide: () => { allowed: string[]; avoid: string[]; ratio: string; protein?: string; carbs?: string };
  getNutritionMode: () => 'spar' | 'sugar';
  getSliceTargets: () => {
    protein: number;
    carb: number;
    veg: number;
    fruit: number;
    fat: number;
    totalCalories: number;
    bmr?: number;
    tdee?: number;
    activityLevel?: string;
    calorieAdjustment?: number;
    // v2 additional fields
    isV2?: boolean;
    proteinGrams?: number;
    carbGramsTotal?: number;
    fatGrams?: number;
    proteinPerLb?: number;
  };
  /** Targets as they applied on a given day (yyyy-MM-dd), for viewing or grading past days */
  getTargetsForDate: (dateKey: string) => {
    daysUntilWeighIn: number;
    macros: ReturnType<StoreContextType['getMacroTargets']>;
    slices: ReturnType<StoreContextType['getSliceTargets']>;
    hydration: ReturnType<StoreContextType['getHydrationTarget']>;
  };
  getCheckpoints: () => {
    walkAround: string;
    wedTarget: string;
    friTarget: string;
    waterLoadingAdjustment: string;
    isWaterLoadingDay: boolean;
    currentDayContext: string;
  };
  getRehydrationPlan: (lostWeight: number) => { fluidRange: string; sodiumRange: string; glycogen: string };
  getWeeklyPlan: () => DayPlan[];
  getTomorrowPlan: () => DayPlan | null;
  getNextTarget: () => { label: string; weight: number; description: string } | null;
  getDriftMetrics: () => { overnight: number | null; session: number | null };
  getStatus: () => {
    status: Status;
    label: string;
    color: string;
    bgColor: string;
    contextMessage: string;
    waterLoadingNote?: string;
    projectionWarning?: string;
    recommendation?: {
      extraWorkoutsNeeded: number;
      totalWorkoutsNeeded: number;
      todayWorkoutsDone: number;
      todayLoss: number;
      message: string;
      urgency: 'moderate' | 'high' | 'critical';
      switchProtocol: boolean;
      avgExtraWorkoutLoss: number | null;
    };
  };
  getExtraWorkoutStats: () => { avgLoss: number | null; avgSweatRateOzPerHr: number | null; totalWorkouts: number; todayWorkouts: number; todayLoss: number };
  getDailyPriority: () => { priority: string; urgency: 'normal' | 'high' | 'critical'; icon: string };
  getWeekDescentData: () => {
    startWeight: number | null;
    currentWeight: number | null;
    targetWeight: number;
    daysRemaining: number;
    totalLost: number | null;
    dailyAvgLoss: number | null;
    grossDailyLoss: number | null;
    avgOvernightDrift: number | null;
    avgDriftRateOzPerHr: number | null;
    avgLoadingDrift: number | null;
    avgCutDrift: number | null;
    avgPracticeLoss: number | null;
    avgSweatRateOzPerHr: number | null;
    daytimeBmrDrift: number;
    emaSleepHours: number;
    emaPracticeHours: number;
    todayRemainingComponents: { sleep: number; practice: number } | null;
    projectedSaturday: number | null;
    pace: 'ahead' | 'on-track' | 'behind' | null;
    morningWeights: Array<{ day: string; weight: number; date: Date }>;
    recentDrifts: number[];
    recentDriftRates: number[];
    recentSleepHours: number[];
    recentPracticeLosses: number[];
    recentPracticeSweatRates: number[];
    recentPracticeDurations: number[];
    trends: {
      drift: 'up' | 'down' | 'stable';
      practice: 'up' | 'down' | 'stable';
      driftRate: 'up' | 'down' | 'stable';
      sweatRate: 'up' | 'down' | 'stable';
    };
    confidence: {
      driftSamples: number;
      practiceSamples: number;
      level: 'high' | 'medium' | 'low' | 'none';
    };
    makeWeightProb: {
      probability: number;
      worstCase: number;
      median: number;
      includesExtraWork: boolean;
    } | null;
    todayProgress: {
      lostSoFar: number;
      expectedTotal: number;
      pctComplete: number;
    } | null;
    loggingStreak: number;
    todayCoreLogged: number;
    todayCoreTotal: number;
    weekOverWeek: {
      thisWeekAvgDrift: number | null;
      lastWeekAvgDrift: number | null;
      thisWeekAvgPractice: number | null;
      lastWeekAvgPractice: number | null;
    } | null;
    weekWeighIns: Array<{ day: string; weight: number; type: string }>;
    personalRecords: {
      bestDrift: number | null;
      bestPracticeLoss: number | null;
      bestDriftRate: number | null;
      bestSweatRate: number | null;
      totalLostThisWeek: number | null;
    };
    timeToTarget: {
      etaHours: number | null;
      etaTime: string | null;
      lbsRemaining: number;
      ratePerHour: number | null;
    } | null;
    historicalDrift: number | null;
    historicalDriftRate: number | null;
    historicalPracticeLoss: number | null;
    historicalSweatRate: number | null;
    cycleHasOwnDriftData: boolean;
    cycleHasOwnPracticeData: boolean;
  };
  hasTodayMorningWeight: () => boolean;
  getFoodLists: () => {
    highFructose: Array<{ name: string; ratio: string; serving: string; carbs: number; note?: string }>;
    balanced: Array<{ name: string; ratio: string; serving: string; carbs: number; note?: string }>;
    highGlucose: Array<{ name: string; ratio: string; serving: string; carbs: number; note?: string }>;
    zeroFiber: Array<{ name: string; ratio: string; serving: string; carbs: number; note?: string }>;
    recovery: Array<{ name: string; ratio: string; serving: string; carbs: number; note?: string }>;
    protein: Array<{ name: string; serving: string; protein: number; note?: string; timing?: string }>;
    avoid: Array<{ name: string; reason: string }>;
    tournament: Array<{ name: string; ratio: string; serving: string; carbs: number; timing?: string; note?: string }>;
    supplements: Array<{ name: string; serving: string; note?: string }>;
    fuelTanks: Array<{ name: string; loseRate: string; replenishRate: string; performanceCost: string; declinePoint: string }>;
  };
  getTodaysFoods: () => {
    carbs: Array<{ name: string; ratio: string; serving: string; carbs: number; note?: string; timing?: string }>;
    protein: Array<{ name: string; serving: string; protein: number; note?: string; timing?: string }>;
    avoid: Array<{ name: string; reason: string }>;
    carbsLabel: string;
    proteinLabel: string;
  };
  getHistoryInsights: () => {
    avgOvernightDrift: number | null;
    avgDriftRateOzPerHr: number | null;
    avgPracticeLoss: number | null;
    avgSweatRateOzPerHr: number | null;
    avgFridayCut: number | null;
    weeklyTrend: number | null;
    projectedSaturday: number | null;
    daysUntilSat: number;
    totalLogsThisWeek: number;
    hasEnoughData: boolean;
    lastFridayWeight: number | null;
    lastSaturdayWeight: number | null;
    madeWeightLastWeek: boolean;
  };
  getAdaptiveAdjustment: () => {
    isPlateaued: boolean;
    plateauDays: number;
    suggestedAdjustment: number;
    reason: string;
    recentWeights: Array<{ date: string; weight: number }>;
    variance: number;
    expectedLoss: number;
    actualLoss: number;
  };
  getWeeklyCompliance: () => {
    protein: { percentage: number; avgConsumed: number; avgTarget: number };
    carb: { percentage: number; avgConsumed: number; avgTarget: number };
    veg: { percentage: number; avgConsumed: number; avgTarget: number };
    fruit: { percentage: number; avgConsumed: number; avgTarget: number };
    fat: { percentage: number; avgConsumed: number; avgTarget: number };
    daysTracked: number;
    bestCategory: string;
    worstCategory: string;
    insight: string;
  };
  getCutScore: (healthData?: { hrv?: number | null; restingHeartRate?: number | null; sleepScore?: number | null; recoveryScore?: number | null; strainScore?: number | null }) => CutScoreResult;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const defaultUserFoods: UserFoodsData = {
  customFoods: [],
  customMeals: [],
  sparCustomFoods: [],
  sparCustomMeals: [],
  favorites: [],
};

export const defaultProfile: AthleteProfile = {
  name: 'Athlete',
  lastName: '',
  currentWeight: 0,
  targetWeightClass: 157,
  weighInDate: addDays(new Date(), 5), // 5 days out
  weighInTime: '07:00', // Default 7 AM weigh-in
  matchDate: addDays(new Date(), 5),
  dashboardMode: 'pro',
  protocol: '2', // Default to Rapid Cut Phase
  status: 'on-track',
  simulatedDate: null,
  hasCompletedOnboarding: false,
  nutritionPreference: 'spar', // Default to slices
};

export const defaultTanks: FuelTanks = {
  water: 4.5,    // Variable
  glycogen: 1.2, // Variable
  gut: 1.8,      // Variable
  fat: 12.0,     // Semi-fixed
  muscle: 148.9, // Protected
};
