import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { addDays, subDays, differenceInDays, getDay, parseISO, format, startOfDay } from 'date-fns';
import { supabase, type UserFoodsJson, type MacroCustomFood, type MacroCustomMeal, type SparCustomFood, type SparCustomMealData } from './supabase';
import { useAuth } from './auth';
import { toast } from '@/hooks/use-toast';
import {
  getWeightMultiplier,
  isWaterLoadingDay as checkWaterLoadingDay,
  calculateTargetWeight,
  WATER_LOADING_RANGE,
  PROTOCOLS,
  LOG_TYPES,
  CORE_WEIGH_IN_TYPES,
  getWaterTargetOz,
  getWaterTargetGallons,
  STATUS_THRESHOLDS,
  isValidWeight,
  getWeightValidationError,
} from './constants';
import { STORAGE_KEYS, STORAGE_PREFIX } from './storage-keys';
import { SUGAR_FOODS } from './food-data';
import {
  calculateSparSlicesV2,
  type Goal as SparV2Goal,
  type GoalIntensity,
  type MaintainPriority,
  type TrainingSessions,
  type WorkdayActivity,
  type SparV2Input,
  type SparV2Output,
} from './spar-calculator-v2';
import { getCompetitionCalorieAdjustment } from './spar-competition-adjuster';
import { computeCutScore, type CutScoreInput } from './cut-score';

// ─── Supabase Database Row Types ───────────────────────────────────────────
interface SupabaseDailyTrackingRow {
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

interface SupabaseWeightLogRow {
  id: string;
  weight: number;
  date: string;
  type: string;
}

// Types
export type Protocol = '1' | '2' | '3' | '4' | '5' | '6';
// 1: Extreme Cut Phase (12%+ above class, multi-day depletion)
// 2: Rapid Cut Phase (7-12% above class, short-term glycogen + water manipulation)
// 3: Optimal Cut Phase (Within 6-7% of class, glycogen management, performance protected)
// 4: Gain Phase (Off-season, performance and strength focus)
// 5: SPAR Nutrition (Balanced eating — slice-based portion counting)
// 6: SPAR Competition (SPAR nutrition + competition water loading & cycle timing)

export type Status = 'on-track' | 'borderline' | 'risk';

export type Phase = 'metabolic' | 'transition' | 'performance-prep' | 'last-24h' | 'recovery';

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
  nextCyclePromptDismissed?: boolean; // True when user dismissed the post-comp prompt (one-time)
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

const defaultUserFoods: UserFoodsData = {
  customFoods: [],
  customMeals: [],
  sparCustomFoods: [],
  sparCustomMeals: [],
  favorites: [],
};

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

interface StoreContextType {
  profile: AthleteProfile;
  fuelTanks: FuelTanks;
  logs: WeightLog[];
  dailyTracking: DailyTracking[];
  userFoods: UserFoodsData;
  isLoading: boolean;
  updateProfile: (updates: Partial<AthleteProfile>) => void;
  updateUserFoods: (updates: Partial<UserFoodsData>) => void;
  addLog: (log: Omit<WeightLog, 'id'>) => void;
  updateLog: (id: string, updates: Partial<WeightLog>) => void;
  deleteLog: (id: string) => void;
  updateDailyTracking: (date: string, updates: Partial<Omit<DailyTracking, 'date'>>) => void;
  getDailyTracking: (date: string) => DailyTracking;
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
    dailyAvgLoss: number | null; // Net morning-to-morning (includes food/water intake)
    grossDailyLoss: number | null; // Gross loss capacity (drift + practice)
    avgOvernightDrift: number | null;
    avgDriftRateOzPerHr: number | null;
    avgLoadingDrift: number | null;
    avgCutDrift: number | null;
    avgPracticeLoss: number | null;
    avgSweatRateOzPerHr: number | null;
    daytimeBmrDrift: number;         // Estimated metabolic loss during awake non-active hours
    emaSleepHours: number;           // EMA-weighted average sleep hours per night
    emaPracticeHours: number;        // EMA-weighted average practice duration in hours
    todayRemainingComponents: { sleep: number; practice: number } | null; // Individual components of today's remaining loss
    projectedSaturday: number | null; // Phase-aware projection
    pace: 'ahead' | 'on-track' | 'behind' | null;
    morningWeights: Array<{ day: string; weight: number; date: Date }>;
    // Recent raw data for detail cards (newest first, up to 5)
    recentDrifts: number[];           // Last 5 overnight drift values (lbs)
    recentDriftRates: number[];       // Last 5 drift rates (lbs/hr)
    recentSleepHours: number[];       // Last 5 sleep durations (hours)
    recentPracticeLosses: number[];   // Last 5 practice losses (lbs)
    recentPracticeSweatRates: number[]; // Last 5 practice sweat rates (lbs/hr)
    recentPracticeDurations: number[]; // Last 5 practice durations (hours)
    // Trend direction for each metric ('up' = improving/losing more, 'down' = declining, 'stable')
    trends: {
      drift: 'up' | 'down' | 'stable';
      practice: 'up' | 'down' | 'stable';
      driftRate: 'up' | 'down' | 'stable';
      sweatRate: 'up' | 'down' | 'stable';
    };
    // Confidence: how many data points back each projection metric
    confidence: {
      driftSamples: number;
      practiceSamples: number;
      level: 'high' | 'medium' | 'low' | 'none';
    };
    // Monte Carlo make-weight probability
    makeWeightProb: {
      probability: number;         // 0-100
      worstCase: number;           // 90th percentile — worst realistic outcome
      median: number;              // 50th percentile — most likely outcome
      includesExtraWork: boolean;  // true if extra workout was factored in
    } | null;
    // Today's progress: how much lost so far vs expected
    todayProgress: {
      lostSoFar: number;
      expectedTotal: number;
      pctComplete: number;
    } | null;
    // Logging streak
    loggingStreak: number;         // consecutive days with at least 1 log
    todayCoreLogged: number;       // how many of core types logged today
    todayCoreTotal: number;        // expected core types (3 on comp day, 4 otherwise)
    // Week-over-week comparison
    weekOverWeek: {
      thisWeekAvgDrift: number | null;
      lastWeekAvgDrift: number | null;
      thisWeekAvgPractice: number | null;
      lastWeekAvgPractice: number | null;
    } | null;
    // All weigh-ins this week for velocity sparkline (oldest first)
    weekWeighIns: Array<{ day: string; weight: number; type: string }>;
    // Personal records
    personalRecords: {
      bestDrift: number | null;         // biggest single-night drift
      bestPracticeLoss: number | null;  // biggest single practice loss
      bestDriftRate: number | null;     // highest lbs/hr while sleeping
      bestSweatRate: number | null;     // highest practice sweat rate
      totalLostThisWeek: number | null; // total weight lost this comp week
    };
    // Time-to-target: when they'll hit weight class based on current drift rate
    timeToTarget: {
      etaHours: number | null;         // hours from now to hit target
      etaTime: string | null;          // formatted time (e.g. "4:30 AM")
      lbsRemaining: number;            // how much left to lose
      ratePerHour: number | null;      // current loss rate lbs/hr
    } | null;
    // Historical fallback (all-time EMA) — for display when cycle has no data yet
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
    suggestedAdjustment: number; // negative = reduce calories, positive = increase
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
  getCutScore: () => import('./cut-score').CutScoreResult;
}

/**
 * Exponential Moving Average — gives more weight to recent values.
 * Alpha=0.4: most recent value gets ~40%, next ~24%, next ~14%, etc.
 * Expects values in newest-first order (from sortedLogs).
 */
const EMA_ALPHA = 0.4;
function computeEMA(values: number[]): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  // Start from oldest, accumulate toward newest
  let ema = values[values.length - 1];
  for (let i = values.length - 2; i >= 0; i--) {
    ema = EMA_ALPHA * values[i] + (1 - EMA_ALPHA) * ema;
  }
  return ema;
}

const defaultProfile: AthleteProfile = {
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

const defaultTanks: FuelTanks = {
  water: 4.5,    // Variable
  glycogen: 1.2, // Variable
  gut: 1.8,      // Variable
  fat: 12.0,     // Semi-fixed
  muscle: 148.9, // Protected
};

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  const [profile, setProfile] = useState<AthleteProfile>(defaultProfile);
  const [fuelTanks, setFuelTanks] = useState<FuelTanks>(defaultTanks);
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [dailyTracking, setDailyTracking] = useState<DailyTracking[]>(() => {
    // Restore from localStorage cache immediately so food data is visible before Supabase loads
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.DAILY_TRACKING_CACHE);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [userFoods, setUserFoods] = useState<UserFoodsData>(defaultUserFoods);

  // Check if there's localStorage data that could be migrated
  const hasLocalStorageData = useCallback(() => {
    const savedProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);
    const savedLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        // Check if they completed onboarding (has real data)
        return parsed.currentWeight > 0 || parsed.targetWeightClass !== 157;
      } catch (e) {
        console.warn('Failed to parse localStorage profile:', e);
        return false;
      }
    }
    return false;
  }, []);

  // Load data from Supabase when user logs in
  const loadFromSupabase = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileData && !profileError) {
        // Parse dates as local time to avoid timezone shifts
        // Supabase returns dates as "YYYY-MM-DD" strings which get interpreted as UTC
        const parseLocalDate = (dateStr: string): Date => {
          const [year, month, day] = dateStr.split('-').map(Number);
          return new Date(year, month - 1, day, 12, 0, 0); // noon to avoid DST issues
        };

        // If last_name is empty but name has a space, split it (one-time migration)
        let loadedName = profileData.name || 'Athlete';
        let loadedLastName = profileData.last_name || '';
        if (!loadedLastName && loadedName.includes(' ')) {
          const parts = loadedName.trim().split(/\s+/);
          loadedName = parts[0];
          loadedLastName = parts.slice(1).join(' ');
          // Persist the split back to Supabase
          supabase.from('profiles').update({ name: loadedName, last_name: loadedLastName }).eq('user_id', user.id);
        }

        setProfile({
          name: loadedName,
          lastName: loadedLastName,
          currentWeight: profileData.current_weight || 0,
          targetWeightClass: profileData.target_weight_class || 157,
          weighInDate: parseLocalDate(profileData.weigh_in_date),
          weighInTime: profileData.weigh_in_time || '07:00',
          matchDate: parseLocalDate(profileData.weigh_in_date),
          dashboardMode: 'pro',
          protocol: String(profileData.protocol) as Protocol,
          status: 'on-track',
          simulatedDate: profileData.simulated_date ? parseLocalDate(profileData.simulated_date) : null,
          hasCompletedOnboarding: profileData.has_completed_onboarding || false,
          // SPAR fields (v1)
          heightInches: profileData.height_inches || undefined,
          age: profileData.age || undefined,
          gender: profileData.gender as 'male' | 'female' | undefined,
          activityLevel: profileData.activity_level as AthleteProfile['activityLevel'],
          nutritionPreference: (profileData.nutrition_preference === 'sugar' ? 'sugar' : 'spar') as AthleteProfile['nutritionPreference'],
          trackPracticeWeighIns: profileData.track_practice_weigh_ins || false,
          targetWeight: profileData.target_weight || undefined,
          // SPAR v2 fields
          sparV2: profileData.spar_v2 || false,
          sparGoal: profileData.spar_goal as SparV2Goal || undefined,
          goalIntensity: profileData.goal_intensity as GoalIntensity || undefined,
          maintainPriority: profileData.maintain_priority as MaintainPriority || undefined,
          trainingSessions: profileData.training_sessions as TrainingSessions || undefined,
          workdayActivity: profileData.workday_activity as WorkdayActivity || undefined,
          goalWeightLbs: profileData.goal_weight_lbs || undefined,
          bodyFatPercent: profileData.body_fat_percent || undefined,
          customProteinPerLb: profileData.custom_protein_per_lb || undefined,
          customFatPercent: profileData.custom_fat_percent || undefined,
          customCarbPercent: profileData.custom_carb_percent || undefined,
          lastCalcWeight: profileData.last_calc_weight || undefined,
          lastCheckInDate: profileData.last_check_in_date || undefined,
          // UI state flags stored in localStorage (no Supabase column)
          weighInCleared: (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.WEIGH_IN_CLEARED) || 'false'); } catch { return false; } })(),
          nextCyclePromptDismissed: (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.NEXT_CYCLE_DISMISSED) || 'false'); } catch { return false; } })(),
        });
        // Load user_foods from the same profile row
        const uf = (profileData.user_foods && typeof profileData.user_foods === 'object')
          ? profileData.user_foods as UserFoodsJson
          : null;

        const loadedUserFoods: UserFoodsData = {
          customFoods: uf?.custom_foods || [],
          customMeals: uf?.custom_meals || [],
          sparCustomFoods: uf?.spar_custom_foods || [],
          sparCustomMeals: uf?.spar_custom_meals || [],
          favorites: uf?.favorites || [],
        };

        // Auto-migrate localStorage user foods if Supabase is empty
        const hasNoSupabaseFoods = loadedUserFoods.customFoods.length === 0
          && loadedUserFoods.customMeals.length === 0
          && loadedUserFoods.sparCustomFoods.length === 0
          && loadedUserFoods.sparCustomMeals.length === 0
          && loadedUserFoods.favorites.length === 0;

        if (hasNoSupabaseFoods && typeof window !== 'undefined') {
          try {
            const lsCF = localStorage.getItem(STORAGE_KEYS.CUSTOM_FOODS);
            const lsCM = localStorage.getItem(STORAGE_KEYS.CUSTOM_MEALS);
            const lsSCF = localStorage.getItem(STORAGE_KEYS.SPAR_CUSTOM_FOODS);
            const lsSCM = localStorage.getItem(STORAGE_KEYS.SPAR_CUSTOM_MEALS);
            const lsFav = localStorage.getItem(STORAGE_KEYS.FAVORITES);

            const migrated: UserFoodsData = {
              customFoods: lsCF ? JSON.parse(lsCF) : [],
              customMeals: lsCM ? JSON.parse(lsCM) : [],
              sparCustomFoods: lsSCF ? JSON.parse(lsSCF) : [],
              sparCustomMeals: lsSCM ? JSON.parse(lsSCM) : [],
              favorites: lsFav ? JSON.parse(lsFav) : [],
            };

            const hasLocalData = migrated.customFoods.length > 0
              || migrated.customMeals.length > 0
              || migrated.sparCustomFoods.length > 0
              || migrated.sparCustomMeals.length > 0
              || migrated.favorites.length > 0;

            if (hasLocalData) {
              const payload: UserFoodsJson = {
                custom_foods: migrated.customFoods,
                custom_meals: migrated.customMeals,
                spar_custom_foods: migrated.sparCustomFoods,
                spar_custom_meals: migrated.sparCustomMeals,
                favorites: migrated.favorites,
              };
              await supabase.from('profiles').update({ user_foods: payload }).eq('user_id', user!.id);
              setUserFoods(migrated);
            } else {
              setUserFoods(loadedUserFoods);
            }
          } catch (e) {
            console.warn('User foods localStorage migration failed:', e);
            setUserFoods(loadedUserFoods);
          }
        } else {
          setUserFoods(loadedUserFoods);
        }
      } else {
        // No profile found - user needs to complete onboarding
        setProfile(defaultProfile);
        setLogs([]);
        setDailyTracking([]);
        setUserFoods(defaultUserFoods);
      }

      // Load weight logs
      const { data: logsData, error: logsError } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (logsData && !logsError) {
        setLogs(logsData.map(log => {
          // Handle both full ISO timestamps and date-only strings from Supabase
          // Date-only strings like "2024-01-15" get parsed as UTC midnight by new Date(),
          // which shifts back a day in negative UTC offsets. Detect and fix this.
          let logDate: Date;
          if (typeof log.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(log.date)) {
            const [year, month, day] = log.date.split('-').map(Number);
            logDate = new Date(year, month - 1, day, 12, 0, 0); // noon local to avoid TZ shift
          } else {
            logDate = new Date(log.date);
          }
          return {
            id: log.id,
            weight: log.weight,
            date: logDate,
            type: log.type as WeightLog['type'],
            ...(log.duration !== undefined && log.duration !== null && { duration: log.duration }),
            ...(log.sleep_hours !== undefined && log.sleep_hours !== null && { sleepHours: log.sleep_hours }),
          };
        }));
      }

      // Load daily tracking
      const { data: trackingData, error: trackingError } = await supabase
        .from('daily_tracking')
        .select('*')
        .eq('user_id', user.id);

      if (trackingData && !trackingError) {
        const mapped = trackingData.map((t: SupabaseDailyTrackingRow) => ({
          date: t.date,
          waterConsumed: t.water_consumed || 0,
          carbsConsumed: t.carbs_consumed || 0,
          proteinConsumed: t.protein_consumed || 0,
          noPractice: t.no_practice ?? false,
          proteinSlices: t.protein_slices || 0,
          carbSlices: t.carb_slices || 0,
          vegSlices: t.veg_slices || 0,
          fruitSlices: t.fruit_slices || 0,
          fatSlices: t.fat_slices || 0,
          nutritionMode: t.nutrition_mode || undefined,
          foodLog: t.food_log || [],
        }));
        setDailyTracking(mapped);
        // Update localStorage cache with authoritative Supabase data
        try { localStorage.setItem(STORAGE_KEYS.DAILY_TRACKING_CACHE, JSON.stringify(mapped)); } catch {}
      }
    } catch (error) {
      console.error('Error loading from Supabase:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Migrate localStorage data to Supabase
  const migrateLocalStorageToSupabase = async () => {
    if (!user) return;

    let profileOk = false;
    let logsOk = false;
    let trackingOk = false;

    try {
      // Get localStorage data
      const savedProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);
      const savedLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
      const savedTracking = localStorage.getItem(STORAGE_KEYS.DAILY_TRACKING);

      // Migrate profile
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        const { error } = await supabase.from('profiles').upsert({
          user_id: user.id,
          name: parsed.name || 'Athlete',
          current_weight: parsed.currentWeight || 0,
          target_weight_class: parsed.targetWeightClass || 157,
          weigh_in_date: parsed.weighInDate ? new Date(parsed.weighInDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          weigh_in_time: parsed.weighInTime || '07:00',
          protocol: parseInt(parsed.protocol) || 2,
          has_completed_onboarding: true,
          simulated_date: null,
        }, { onConflict: 'user_id' });
        if (error) throw new Error(`Profile migration failed: ${error.message}`);
        profileOk = true;
      } else {
        profileOk = true;
      }

      // Migrate logs
      if (savedLogs) {
        const parsedLogs = JSON.parse(savedLogs);
        const validTypes = Object.values(LOG_TYPES) as string[];
        const logsToInsert = parsedLogs
          .filter((log: { type: string; weight: number; date: string }) => validTypes.includes(log.type))
          .map((log: { type: string; weight: number; date: string }) => ({
            user_id: user.id,
            weight: log.weight,
            date: new Date(log.date).toISOString(),
            type: log.type,
          }));

        if (logsToInsert.length > 0) {
          const { error } = await supabase.from('weight_logs').insert(logsToInsert);
          if (error) throw new Error(`Logs migration failed: ${error.message}`);
        }
        logsOk = true;
      } else {
        logsOk = true;
      }

      // Migrate daily tracking
      if (savedTracking) {
        const parsedTracking = JSON.parse(savedTracking);
        const trackingToInsert = parsedTracking.map((t: { date: string; carbsConsumed?: number; proteinConsumed?: number; waterConsumed?: number }) => ({
          user_id: user.id,
          date: t.date,
          carbs_consumed: t.carbsConsumed || 0,
          protein_consumed: t.proteinConsumed || 0,
          water_consumed: t.waterConsumed || 0,
        }));

        if (trackingToInsert.length > 0) {
          for (const tracking of trackingToInsert) {
            const { error } = await supabase.from('daily_tracking').upsert(tracking, {
              onConflict: 'user_id,date'
            });
            if (error) throw new Error(`Tracking migration failed: ${error.message}`);
          }
        }
        trackingOk = true;
      } else {
        trackingOk = true;
      }

      // Only clear localStorage if ALL migrations succeeded
      if (profileOk && logsOk && trackingOk) {
        localStorage.removeItem(STORAGE_KEYS.PROFILE);
        localStorage.removeItem(STORAGE_KEYS.LOGS);
        localStorage.removeItem(STORAGE_KEYS.DAILY_TRACKING);
        localStorage.removeItem(STORAGE_KEYS.TANKS);
      }

      // Reload from Supabase
      await loadFromSupabase();
    } catch (error) {
      console.error('Migration error:', error);
      throw error; // Re-throw so landing page can show error to user
    }
  };

  // Load data when user changes
  useEffect(() => {
    if (user) {
      loadFromSupabase();
    } else {
      // Reset to defaults when logged out
      setProfile(defaultProfile);
      setLogs([]);
      setDailyTracking([]);
      setUserFoods(defaultUserFoods);
      setIsLoading(false);
    }
  }, [user, loadFromSupabase]);

  // Save profile to Supabase
  const updateProfile = async (updates: Partial<AthleteProfile>) => {
    // Check if this is ONLY a simulatedDate change (date navigation, not a real settings change)
    const isOnlySimulatedDateChange = Object.keys(updates).length === 1 && 'simulatedDate' in updates;

    // Ensure dates are Date objects
    const normalizedUpdates = { ...updates };
    if (normalizedUpdates.weighInDate && !(normalizedUpdates.weighInDate instanceof Date)) {
      normalizedUpdates.weighInDate = new Date(normalizedUpdates.weighInDate);
    }
    if (normalizedUpdates.simulatedDate && !(normalizedUpdates.simulatedDate instanceof Date)) {
      normalizedUpdates.simulatedDate = new Date(normalizedUpdates.simulatedDate);
    }

    const newProfile = { ...profile, ...normalizedUpdates };
    setProfile(newProfile);

    if (user) {
      try {
        const weighInDateStr = newProfile.weighInDate instanceof Date
          ? newProfile.weighInDate.toISOString().split('T')[0]
          : new Date(newProfile.weighInDate).toISOString().split('T')[0];

        const simulatedDateStr = newProfile.simulatedDate
          ? (newProfile.simulatedDate instanceof Date
              ? newProfile.simulatedDate.toISOString().split('T')[0]
              : new Date(newProfile.simulatedDate).toISOString().split('T')[0])
          : null;

        // Core fields that should always exist in database
        const corePayload: Record<string, any> = {
          user_id: user.id,
          name: newProfile.name,
          last_name: newProfile.lastName || '',
          current_weight: newProfile.currentWeight,
          target_weight_class: newProfile.targetWeightClass,
          weigh_in_date: weighInDateStr,
          weigh_in_time: newProfile.weighInTime || '07:00',
          protocol: parseInt(newProfile.protocol),
          has_completed_onboarding: newProfile.hasCompletedOnboarding || false,
          simulated_date: simulatedDateStr,
        };

        // SPAR fields - may not exist in older databases
        const sparFields: Record<string, any> = {
          height_inches: newProfile.heightInches || null,
          age: newProfile.age || null,
          gender: newProfile.gender || null,
          activity_level: newProfile.activityLevel || null,
        };

        // SPAR v2 fields
        const sparV2Fields: Record<string, any> = {
          spar_v2: newProfile.sparV2 || false,
          spar_goal: newProfile.sparGoal || null,
          goal_intensity: newProfile.goalIntensity || null,
          maintain_priority: newProfile.maintainPriority || null,
          training_sessions: newProfile.trainingSessions || null,
          workday_activity: newProfile.workdayActivity || null,
          goal_weight_lbs: newProfile.goalWeightLbs || null,
          body_fat_percent: newProfile.bodyFatPercent || null,
          custom_protein_per_lb: newProfile.customProteinPerLb || null,
          custom_fat_percent: newProfile.customFatPercent || null,
          custom_carb_percent: newProfile.customCarbPercent || null,
          last_calc_weight: newProfile.lastCalcWeight || null,
          last_check_in_date: newProfile.lastCheckInDate || null,
        };

        // Optional fields - may not exist
        const optionalFields: Record<string, any> = {
          nutrition_preference: newProfile.nutritionPreference || 'spar',
          target_weight: newProfile.targetWeight || null,
          track_practice_weigh_ins: newProfile.trackPracticeWeighIns || false,
        };

        // Store UI state flags in localStorage (no Supabase column needed)
        try {
          localStorage.setItem(STORAGE_KEYS.WEIGH_IN_CLEARED, JSON.stringify(newProfile.weighInCleared || false));
          localStorage.setItem(STORAGE_KEYS.NEXT_CYCLE_DISMISSED, JSON.stringify(newProfile.nextCyclePromptDismissed || false));
        } catch {};

        // Try with all fields first (including v2)
        let profilePayload = { ...corePayload, ...sparFields, ...sparV2Fields, ...optionalFields };
        let { error: upsertError } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'user_id' });

        if (!upsertError) {
          // Only show toast for real settings changes, not date navigation
          if (!isOnlySimulatedDateChange) {
            toast({ title: 'Settings saved', description: 'Your changes have been saved.', duration: 2000 });
          }
        }

        // If error, show it but DON'T fall back to saving without v2 fields
        // (that would overwrite user's v2 settings!)
        if (upsertError) {
          console.error('Profile save failed:', upsertError.message, upsertError.code, upsertError.details);
          toast({ title: 'Save failed', description: `Error: ${upsertError.message}`, variant: 'destructive' });
          // DON'T fall back - just report the error
          return;
        }

        // OLD FALLBACK CODE - DISABLED to prevent overwriting v2 settings
        // This code block is intentionally disabled and kept for reference only
      } catch (error) {
        console.error('Error saving profile:', error);
        toast({ title: 'Save failed', description: 'Your changes may not be saved. Please try again.', variant: 'destructive' });
      }
    }
  };

  // Save user foods (custom foods, meals, favorites) to Supabase
  const updateUserFoods = async (updates: Partial<UserFoodsData>) => {
    const newUserFoods = { ...userFoods, ...updates };
    setUserFoods(newUserFoods); // Optimistic update

    // Also persist to localStorage as fallback for non-auth / offline
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_FOODS, JSON.stringify(newUserFoods.customFoods));
      localStorage.setItem(STORAGE_KEYS.CUSTOM_MEALS, JSON.stringify(newUserFoods.customMeals));
      localStorage.setItem(STORAGE_KEYS.SPAR_CUSTOM_FOODS, JSON.stringify(newUserFoods.sparCustomFoods));
      localStorage.setItem(STORAGE_KEYS.SPAR_CUSTOM_MEALS, JSON.stringify(newUserFoods.sparCustomMeals));
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(newUserFoods.favorites));
    } catch { /* localStorage unavailable */ }

    if (user) {
      try {
        const payload: UserFoodsJson = {
          custom_foods: newUserFoods.customFoods,
          custom_meals: newUserFoods.customMeals,
          spar_custom_foods: newUserFoods.sparCustomFoods,
          spar_custom_meals: newUserFoods.sparCustomMeals,
          favorites: newUserFoods.favorites,
        };

        const { error } = await supabase.from('profiles').update({
          user_foods: payload,
        }).eq('user_id', user.id);

        if (error) {
          console.error('Error saving user foods:', error.message);
          // Don't show toast for every food save — too noisy
        }
      } catch (error) {
        console.error('Error saving user foods:', error);
      }
    }
  };

  // Add log to Supabase
  const addLog = async (log: Omit<WeightLog, 'id'>) => {
    // Weight validation: ensure weight is within reasonable bounds
    const weightError = getWeightValidationError(log.weight);
    if (weightError) {
      toast({
        title: "Invalid weight",
        description: weightError,
        variant: "destructive",
      });
      return;
    }

    // Duplicate prevention: core weigh-in types + check-in allow only one per day
    const UNIQUE_PER_DAY_TYPES = [...CORE_WEIGH_IN_TYPES, LOG_TYPES.CHECK_IN];
    if (UNIQUE_PER_DAY_TYPES.includes(log.type as any)) {
      const logDay = format(startOfDay(new Date(log.date)), 'yyyy-MM-dd');
      const duplicate = logs.find(l =>
        l.type === log.type &&
        format(startOfDay(new Date(l.date)), 'yyyy-MM-dd') === logDay
      );
      if (duplicate) {
        toast({
          title: "Already logged",
          description: `You already have a ${log.type} weigh-in for today. Edit or delete the existing entry instead.`,
          variant: "destructive",
        });
        return;
      }
    }

    const tempId = Math.random().toString(36).substr(2, 9);
    const newLog = { ...log, id: tempId };

    // Capture previous state for rollback
    const previousLogs = logs;
    const previousProfile = profile;

    // Optimistic update
    setLogs(prev => [newLog, ...prev]);

    // Only update currentWeight if this log is the most recent by date
    const mostRecentLog = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const isNewest = !mostRecentLog || new Date(log.date).getTime() >= new Date(mostRecentLog.date).getTime();
    if (isNewest) {
      const target = calculateTarget();
      setProfile(prev => ({
        ...prev,
        currentWeight: log.weight,
        status: log.weight <= target + STATUS_THRESHOLDS.ON_TRACK_BUFFER ? 'on-track' : 'borderline'
      }));
    }

    if (user) {
      try {
        // Only insert valid log types (all weight log types)
        const validTypes = Object.values(LOG_TYPES);
        if (validTypes.includes(log.type)) {
          const insertData: {
            user_id: string;
            weight: number;
            date: string;
            type: string;
            duration?: number;
            sleep_hours?: number;
          } = {
            user_id: user.id,
            weight: log.weight,
            date: log.date.toISOString(),
            type: log.type,
          };
          if (log.duration !== undefined) insertData.duration = log.duration;
          if (log.sleepHours !== undefined) insertData.sleep_hours = log.sleepHours;

          const { data, error } = await supabase.from('weight_logs').insert(insertData).select().single();

          if (error) {
            // Rollback on error
            setLogs(previousLogs);
            setProfile(previousProfile);
            console.error('Error adding log:', error, 'Code:', error.code, 'Details:', error.details, 'Message:', error.message);
            const errorDetail = error.message || error.code || 'Unknown error';
            toast({ title: "Sync failed", description: `Could not save weight log: ${errorDetail}`, variant: "destructive" });
            return;
          }

          if (data) {
            // Update with real ID
            setLogs(prev => prev.map(l => l.id === tempId ? { ...l, id: data.id } : l));
          }
        }

        // Only update profile weight in Supabase if this is the newest log
        if (isNewest) {
          const { error: profileError } = await supabase.from('profiles').update({
            current_weight: log.weight,
          }).eq('user_id', user.id);

          if (profileError) {
            console.error('Error updating profile weight:', profileError);
          }
        }
      } catch (error) {
        // Rollback on exception
        setLogs(previousLogs);
        setProfile(previousProfile);
        console.error('Error adding log:', error);
        const errorDetail = error instanceof Error ? error.message : 'Network error';
        toast({ title: "Sync failed", description: `Could not save weight log: ${errorDetail}`, variant: "destructive" });
      }
    }
  };

  const updateLog = async (id: string, updates: Partial<WeightLog>) => {
    // Weight validation: ensure weight is within reasonable bounds
    if (updates.weight !== undefined) {
      const weightError = getWeightValidationError(updates.weight);
      if (weightError) {
        toast({
          title: "Invalid weight",
          description: weightError,
          variant: "destructive",
        });
        return;
      }
    }

    // Capture previous state for rollback
    const previousLogs = logs;
    const previousProfile = profile;

    setLogs(prev => prev.map(log =>
      log.id === id ? { ...log, ...updates } : log
    ));

    // Only update currentWeight/status if editing the most recent log
    if (updates.weight !== undefined) {
      const mostRecentLog = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      if (mostRecentLog && mostRecentLog.id === id) {
        const target = calculateTarget();
        setProfile(prev => ({
          ...prev,
          currentWeight: updates.weight!,
          status: updates.weight! <= target + STATUS_THRESHOLDS.ON_TRACK_BUFFER ? 'on-track' : 'borderline'
        }));
      }
    }

    if (user) {
      try {
        const updateData: {
          weight?: number;
          date?: string;
          type?: string;
          duration?: number;
          sleep_hours?: number;
        } = {};
        if (updates.weight !== undefined) updateData.weight = updates.weight;
        if (updates.date !== undefined) updateData.date = updates.date.toISOString();
        if (updates.type !== undefined) updateData.type = updates.type;
        if (updates.duration !== undefined) updateData.duration = updates.duration;
        if (updates.sleepHours !== undefined) updateData.sleep_hours = updates.sleepHours;

        const { error } = await supabase.from('weight_logs').update(updateData).eq('id', id);

        if (error) {
          // Rollback on error
          setLogs(previousLogs);
          setProfile(previousProfile);
          console.error('Error updating log:', error);
          toast({ title: "Sync failed", description: "Could not update weight log. Please try again.", variant: "destructive" });
          return;
        }

        // Only sync currentWeight to DB if editing the most recent log
        if (updates.weight !== undefined) {
          const mostRecentLog = [...previousLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
          if (mostRecentLog && mostRecentLog.id === id) {
            const { error: profileError } = await supabase.from('profiles').update({
              current_weight: updates.weight,
            }).eq('user_id', user.id);

            if (profileError) {
              console.error('Error updating profile weight:', profileError);
            }
          }
        }
      } catch (error) {
        // Rollback on exception
        setLogs(previousLogs);
        setProfile(previousProfile);
        console.error('Error updating log:', error);
        toast({ title: "Sync failed", description: "Could not update weight log. Please try again.", variant: "destructive" });
      }
    }
  };

  const deleteLog = async (id: string) => {
    // Capture previous state for rollback
    const previousLogs = logs;

    setLogs(prev => prev.filter(log => log.id !== id));

    if (user) {
      try {
        const { error } = await supabase.from('weight_logs').delete().eq('id', id);

        if (error) {
          // Rollback on error
          setLogs(previousLogs);
          console.error('Error deleting log:', error);
          toast({ title: "Sync failed", description: "Could not delete weight log. Please try again.", variant: "destructive" });
        }
      } catch (error) {
        // Rollback on exception
        setLogs(previousLogs);
        console.error('Error deleting log:', error);
        toast({ title: "Sync failed", description: "Could not delete weight log. Please try again.", variant: "destructive" });
      }
    }
  };

  const getDailyTracking = (date: string): DailyTracking => {
    const existing = dailyTracking.find(d => d.date === date);
    if (existing) {
      return {
        ...existing,
        waterConsumed: existing.waterConsumed ?? 0,
        carbsConsumed: existing.carbsConsumed ?? 0,
        proteinConsumed: existing.proteinConsumed ?? 0,
        noPractice: existing.noPractice ?? false,
        proteinSlices: existing.proteinSlices ?? 0,
        carbSlices: existing.carbSlices ?? 0,
        vegSlices: existing.vegSlices ?? 0,
        fruitSlices: existing.fruitSlices ?? 0,
        fatSlices: existing.fatSlices ?? 0,
        nutritionMode: existing.nutritionMode,
        foodLog: existing.foodLog ?? [],
      };
    }
    return { date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0, noPractice: false, proteinSlices: 0, carbSlices: 0, vegSlices: 0, fruitSlices: 0, fatSlices: 0, foodLog: [] };
  };

  const updateDailyTracking = async (date: string, updates: Partial<Omit<DailyTracking, 'date'>>) => {
    // Capture previous state for rollback
    const previousTracking = dailyTracking;

    // Compute merged values BEFORE setState to avoid stale read
    const existing = getDailyTracking(date);
    const merged = {
      waterConsumed: updates.waterConsumed ?? existing.waterConsumed,
      carbsConsumed: updates.carbsConsumed ?? existing.carbsConsumed,
      proteinConsumed: updates.proteinConsumed ?? existing.proteinConsumed,
      noPractice: updates.noPractice ?? existing.noPractice,
      proteinSlices: updates.proteinSlices ?? existing.proteinSlices,
      carbSlices: updates.carbSlices ?? existing.carbSlices,
      vegSlices: updates.vegSlices ?? existing.vegSlices,
      fruitSlices: updates.fruitSlices ?? existing.fruitSlices,
      fatSlices: updates.fatSlices ?? existing.fatSlices,
      nutritionMode: updates.nutritionMode ?? existing.nutritionMode,
      foodLog: updates.foodLog ?? existing.foodLog,
    };

    setDailyTracking(prev => {
      const found = prev.find(d => d.date === date);
      let next: DailyTracking[];
      if (found) {
        next = prev.map(d => d.date === date ? { ...d, ...updates } : d);
      } else {
        next = [...prev, { date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0, proteinSlices: 0, carbSlices: 0, vegSlices: 0, fruitSlices: 0, fatSlices: 0, ...updates }];
      }
      // Persist to localStorage as offline fallback
      try { localStorage.setItem(STORAGE_KEYS.DAILY_TRACKING_CACHE, JSON.stringify(next)); } catch {}
      return next;
    });

    if (user) {
      try {
        // Try full upsert with all columns (including SPAR fields)
        const fullPayload: Record<string, any> = {
          user_id: user.id,
          date: date,
          carbs_consumed: merged.carbsConsumed,
          protein_consumed: merged.proteinConsumed,
          water_consumed: merged.waterConsumed,
          no_practice: merged.noPractice ?? false,
          protein_slices: merged.proteinSlices ?? 0,
          carb_slices: merged.carbSlices ?? 0,
          veg_slices: merged.vegSlices ?? 0,
          fruit_slices: merged.fruitSlices ?? 0,
          fat_slices: merged.fatSlices ?? 0,
          nutrition_mode: merged.nutritionMode ?? null,
          food_log: merged.foodLog ?? [],
        };

        const { error } = await supabase.from('daily_tracking').upsert(fullPayload, { onConflict: 'user_id,date' });

        if (error) {
          // If the error mentions missing columns, fall back to core fields only
          if (error.message?.includes('column') || error.code === '42703') {
            console.warn('SPAR columns not in DB yet, falling back to core fields:', error.message);
            const { error: fallbackError } = await supabase.from('daily_tracking').upsert({
              user_id: user.id,
              date: date,
              carbs_consumed: merged.carbsConsumed,
              protein_consumed: merged.proteinConsumed,
              water_consumed: merged.waterConsumed,
              no_practice: merged.noPractice ?? false,
              food_log: merged.foodLog ?? [],
            }, { onConflict: 'user_id,date' });

            if (fallbackError) {
              setDailyTracking(previousTracking);
              try { localStorage.setItem(STORAGE_KEYS.DAILY_TRACKING_CACHE, JSON.stringify(previousTracking)); } catch {}
              console.error('Error updating daily tracking (fallback):', fallbackError);
              toast({ title: "Sync failed", description: "Could not save tracking data. Please try again.", variant: "destructive" });
            }
          } else {
            setDailyTracking(previousTracking);
            try { localStorage.setItem(STORAGE_KEYS.DAILY_TRACKING_CACHE, JSON.stringify(previousTracking)); } catch {}
            console.error('Error updating daily tracking:', error);
            toast({ title: "Sync failed", description: "Could not save tracking data. Please try again.", variant: "destructive" });
          }
        }
      } catch (error) {
        // Rollback on exception
        setDailyTracking(previousTracking);
        try { localStorage.setItem(STORAGE_KEYS.DAILY_TRACKING_CACHE, JSON.stringify(previousTracking)); } catch {}
        console.error('Error updating daily tracking:', error);
        toast({ title: "Sync failed", description: "Could not save tracking data. Please try again.", variant: "destructive" });
      }
    }
  };

  const resetData = async () => {
    setProfile(defaultProfile);
    setFuelTanks(defaultTanks);
    setLogs([]);
    setDailyTracking([]);
    setUserFoods(defaultUserFoods);

    if (user) {
      try {
        // Delete logs and tracking data
        await supabase.from('weight_logs').delete().eq('user_id', user.id);
        await supabase.from('daily_tracking').delete().eq('user_id', user.id);

        // Reset profile to require onboarding again (instead of deleting)
        const fiveDaysOut = addDays(new Date(), 5);
        await supabase.from('profiles').update({
          has_completed_onboarding: false,
          current_weight: 0,
          target_weight_class: 157,
          protocol: 2,
          simulated_date: null,
          weigh_in_date: fiveDaysOut.toISOString().split('T')[0],
          user_foods: {},
        }).eq('user_id', user.id);
      } catch (error) {
        console.error('Error resetting data:', error);
      }
    }

    // Remove only PWM keys instead of clearing all localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
    });
  };

  // Clear only weight logs (not full reset)
  const clearLogs = async () => {
    const previousLogs = logs;
    setLogs([]);

    if (user) {
      try {
        const { error } = await supabase.from('weight_logs').delete().eq('user_id', user.id);
        if (error) {
          // Rollback on error
          setLogs(previousLogs);
          console.error('Error clearing logs:', error);
          toast({ title: "Error", description: "Could not clear weight logs. Please try again.", variant: "destructive" });
          return;
        }
        toast({ title: "Logs cleared", description: "Your weight logs have been cleared." });
      } catch (error) {
        setLogs(previousLogs);
        console.error('Error clearing logs:', error);
        toast({ title: "Error", description: "Could not clear weight logs. Please try again.", variant: "destructive" });
      }
    }
  };

  const calculateTarget = () => {
    const w = profile.targetWeightClass;
    const protocol = profile.protocol;
    const daysUntil = getDaysUntilWeighIn();

    // Protocol 4 (Gain Phase) - no cutting, stay at weight class
    if (protocol === '4') {
      return w;
    }

    // Protocol 5 (SPAR General) - no water loading, flat weight targets
    if (protocol === '5') {
      if (daysUntil === 0) return w; // Competition
      return Math.round(w * getWeightMultiplier(daysUntil));
    }

    // Protocols 1, 2, 3, & 6 - use centralized calculation (includes water loading)
    // This includes water loading bonus during water loading days for consistency
    const targetCalc = calculateTargetWeight(w, daysUntil, protocol);
    // Return water-loaded target if applicable, otherwise base
    return targetCalc.withWaterLoad || targetCalc.base;
  };

  const getCheckpoints = () => {
      const w = profile.targetWeightClass;
      const protocol = profile.protocol;
      const daysUntilWeighIn = getDaysUntilWeighIn();
      const waterLoading = isWaterLoadingDay();

      // Use centralized multipliers from constants.ts
      // Walk-around (5 days out): uses getWeightMultiplier(5) = 1.07
      // Mid-week (3 days out): uses getWeightMultiplier(3) = 1.05
      // Critical (1 day out): uses getWeightMultiplier(1) = 1.03
      const walkAroundLow = Math.round(w * getWeightMultiplier(4)); // 1.06
      const walkAroundHigh = Math.round(w * getWeightMultiplier(5)); // 1.07
      const midWeekBaselineLow = Math.round(w * getWeightMultiplier(2)); // 1.04
      const midWeekBaselineHigh = Math.round(w * getWeightMultiplier(3)); // 1.05
      const criticalLow = Math.round(w * 1.02); // Slightly below critical target
      const criticalHigh = Math.round(w * getWeightMultiplier(1)); // 1.03

      // Water loading applies to protocols 1 & 2
      const isWaterLoadingProtocol = protocol === '1' || protocol === '2';

      // Context for current day based on days until weigh-in
      let currentDayContext = '';
      if (isWaterLoadingProtocol) {
        if (daysUntilWeighIn < 0) {
          currentDayContext = 'Recovery day - return to walk-around weight with protein refeed';
        } else if (daysUntilWeighIn === 0) {
          currentDayContext = 'Competition day - hit weight class, then rehydrate immediately';
        } else if (daysUntilWeighIn === 1) {
          currentDayContext = `CRITICAL: Must be ${criticalLow}-${criticalHigh} lbs by evening for safe overnight cut`;
        } else if (daysUntilWeighIn === 2) {
          currentDayContext = 'Water restriction day — zero fiber, ADH still flushing.';
        } else if (daysUntilWeighIn === 3) {
          currentDayContext = `Last load day - checkpoint is ${midWeekBaselineLow}-${midWeekBaselineHigh} lbs. Water restriction starts tomorrow.`;
        } else if (daysUntilWeighIn === 4) {
          currentDayContext = 'Peak loading day - continue high water intake';
        } else if (daysUntilWeighIn === 5) {
          currentDayContext = 'Water loading day - stay hydrated, weight may fluctuate';
        } else {
          currentDayContext = 'Maintenance - stay at walk-around weight until cut week begins';
        }
      } else if (protocol === '3') {
        currentDayContext = 'Hold weight protocol - minimal cutting, stay near walk-around';
      } else {
        currentDayContext = 'Build phase - no weight cutting required';
      }

      // Calculate water loading tolerance message using centralized constants
      const waterLoadingAdjustment = waterLoading
        ? `Expect +${WATER_LOADING_RANGE.MIN} to +${WATER_LOADING_RANGE.MAX} lbs above baseline from water loading`
        : '';

      return {
          walkAround: `${walkAroundLow} - ${walkAroundHigh} lbs`,
          wedTarget: `${midWeekBaselineLow} - ${midWeekBaselineHigh} lbs`,
          friTarget: `${criticalLow} - ${criticalHigh} lbs`,
          waterLoadingAdjustment,
          isWaterLoadingDay: waterLoading,
          currentDayContext
      };
  };

  const getRehydrationPlan = (lostWeight: number) => {
    // Research-based: 16-24 oz fluid per lb lost, 500-700 mg sodium per lb lost
    const fluidMin = Math.round(lostWeight * 16);
    const fluidMax = Math.round(lostWeight * 24);
    const sodiumMin = Math.round(lostWeight * 500);
    const sodiumMax = Math.round(lostWeight * 700);

    return {
      fluidRange: `${fluidMin}-${fluidMax} oz`,
      sodiumRange: `${sodiumMin}-${sodiumMax}mg`,
      glycogen: "40-50g Dextrose/Rice Cakes"
    };
  };

  // Helper: Get days until weigh-in (used throughout for protocol timing)
  // Uses startOfDay to avoid timezone/time-of-day issues with differenceInDays
  // Returns 999 when no active weigh-in date (weighInCleared)
  // Memoized — this is called by nearly every other getter
  const daysUntilWeighInMemo = useMemo(() => {
    if (profile.weighInCleared) return 999;
    const today = startOfDay(profile.simulatedDate || new Date());
    const weighIn = startOfDay(profile.weighInDate);
    return differenceInDays(weighIn, today);
  }, [profile.weighInCleared, profile.simulatedDate, profile.weighInDate]);
  const getDaysUntilWeighIn = useCallback((): number => daysUntilWeighInMemo, [daysUntilWeighInMemo]);

  // Helper: Get formatted time until weigh-in at 30-min granularity
  const getTimeUntilWeighIn = (): string => {
    if (profile.weighInCleared) return '';
    const now = profile.simulatedDate || new Date();
    const weighIn = new Date(profile.weighInDate);
    const [h, m] = (profile.weighInTime || '07:00').split(':').map(Number);
    weighIn.setHours(h, m, 0, 0);
    const diff = weighIn.getTime() - now.getTime();
    if (diff <= 0) return 'WEIGH-IN TIME';
    const totalMinutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    // Round to nearest 30-min increment
    const roundedMin = minutes >= 15 && minutes < 45 ? 30 : minutes >= 45 ? 0 : 0;
    const displayHours = minutes >= 45 ? hours + 1 : hours;
    const days = Math.floor(displayHours / 24);
    const remainHours = displayHours % 24;
    if (days === 0) {
      return roundedMin === 30 ? `${hours}h 30m` : `${displayHours}h`;
    }
    if (roundedMin === 30) {
      return `${days}d ${hours % 24}h 30m`;
    }
    return remainHours === 0 ? `${days}d` : `${days}d ${remainHours}h`;
  };

  // Helper: Check if we're in post-competition recovery (day after weigh-in)
  const isRecoveryDay = (): boolean => {
    const daysUntil = getDaysUntilWeighIn();
    // Recovery is the day after competition (daysUntil is negative)
    // Or if weigh-in was yesterday/today and it's past weigh-in time
    return daysUntil < 0 && daysUntil >= -1;
  };

  // Helper: Get water loading bonus based on weight class
  // <150 lbs = +2 lbs, 150-174 lbs = +3 lbs, 175+ lbs = +4 lbs
  const getWaterLoadBonus = (): number => {
    const w = profile.targetWeightClass;
    if (w >= 175) return 4;
    if (w >= 150) return 3;
    return 2;
  };

  // Helper: Check if today is a water loading day
  // Uses centralized WATER_LOADING_DAYS from constants.ts for consistency
  const isWaterLoadingDay = (): boolean => {
    const protocol = profile.protocol;
    const daysUntil = getDaysUntilWeighIn();
    return checkWaterLoadingDay(daysUntil, protocol);
  };

  const getPhase = (): Phase => {
    const daysUntilWeighIn = getDaysUntilWeighIn();

    // Post-competition recovery
    if (daysUntilWeighIn < 0) return 'recovery';

    // Competition day
    if (daysUntilWeighIn === 0) return 'last-24h';

    // Based on days until weigh-in (not day of week)
    // 6+ days out: maintenance/metabolic phase
    // 5 days out: water loading day 1
    // 4 days out: water loading day 2 (peak)
    // 3 days out: water loading day 3
    // 2 days out: water restriction day, zero fiber transition
    // 1 day out: performance prep (sip only, final cut)
    // 0 days: competition

    if (daysUntilWeighIn >= 6) return 'metabolic'; // Maintenance/build phase
    if (daysUntilWeighIn >= 3) return 'metabolic'; // Water loading phase (days 5,4,3) - same phase, different hydration
    if (daysUntilWeighIn === 2) return 'transition'; // Water restriction day, zero fiber
    if (daysUntilWeighIn === 1) return 'performance-prep'; // Cut day

    return 'metabolic';
  };

  const getHydrationTarget = () => {
    const daysUntilWeighIn = getDaysUntilWeighIn();

    // SPAR General (5) uses regular hydration - no competition water loading/restriction
    // Note: SPAR Competition (6) falls through to competition water loading below
    if (profile.protocol === '5') {
      const morningLogs = logs.filter(l => l.type === 'morning' || l.type === 'weigh-in');
      const mostRecentMorning = morningLogs.length > 0
        ? [...morningLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : null;
      const athleteWeight = mostRecentMorning
        ? mostRecentMorning.weight
        : logs.length > 0
          ? [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].weight
          : profile.currentWeight || 150;
      // Standard daily hydration: 0.5-0.6 oz per lb body weight
      const targetOz = Math.round(athleteWeight * 0.55);
      const gallons = targetOz / 128;
      const rounded = Math.round(gallons * 4) / 4;
      const amount = `${rounded.toFixed(rounded % 1 === 0 ? 1 : 2)} gal`;
      return { amount, type: 'Regular', note: 'Daily hydration goal', targetOz };
    }

    // Competition protocols (1-4) use the centralized oz/lb hydration system
    const hydration = getHydrationForDaysUntil(daysUntilWeighIn);

    // Add contextual note based on days out
    let note = "Maintenance hydration";
    if (daysUntilWeighIn < 0) note = "Rehydrate fully";
    else if (daysUntilWeighIn === 0) note = "Post-weigh-in rehydration";
    else if (daysUntilWeighIn === 1) note = "Sip only — final cut";
    else if (daysUntilWeighIn === 2) note = "Water restriction — zero fiber, ADH still flushing";
    else if (daysUntilWeighIn === 3) note = "Water loading day 3 (peak)";
    else if (daysUntilWeighIn === 4) note = "Water loading day 2 (peak)";
    else if (daysUntilWeighIn === 5) note = "Water loading day 1";
    else if (daysUntilWeighIn === 6) note = "Prep for water loading";

    return { amount: hydration.amount, type: hydration.type, note, targetOz: hydration.targetOz };
  };

  // Hydration target for any daysUntil value (used by getWeeklyPlan for consistency)
  const getHydrationForDaysUntil = (daysUntil: number): { amount: string; targetOz: number; type: string } => {
    // Use walk-around weight for hydration scaling.
    // During training phase (6+ days out), most recent log of any type is best
    // (morning weights from cut week are too low for walk-around scaling).
    // During comp week, morning weight is more representative.
    let athleteWeight: number;
    if (daysUntil > 5) {
      // Training phase: use most recent log (closer to walk-around)
      athleteWeight = logs.length > 0
        ? [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].weight
        : Math.round(profile.targetWeightClass * 1.07);
    } else {
      // Comp week: use morning weight for more accurate scaling
      const morningLogs = logs.filter(l => l.type === 'morning' || l.type === 'weigh-in');
      const mostRecentMorning = morningLogs.length > 0
        ? [...morningLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : null;
      athleteWeight = mostRecentMorning
        ? mostRecentMorning.weight
        : logs.length > 0
          ? [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].weight
          : Math.round(profile.targetWeightClass * 1.07);
    }

    const targetOz = getWaterTargetOz(daysUntil, athleteWeight);
    const amount = getWaterTargetGallons(daysUntil, athleteWeight);

    // Determine type label based on phase
    let type = "Regular";
    if (daysUntil === 0) type = "Rehydrate";
    else if (daysUntil === 1) type = "Sip Only";
    else if (daysUntil === 2) type = "Restriction";
    else if (daysUntil >= 3 && daysUntil <= 5) type = "Loading";
    else if (daysUntil < 0) type = "Recovery";

    return { amount, targetOz, type };
  };

  // ─── Nutrition Mode ───
  const getNutritionMode = (): 'spar' | 'sugar' => {
    return profile.nutritionPreference === 'sugar' ? 'sugar' : 'spar';
  };

  // ─── SPAR Slice Targets (cached) ───
  // Protocol 5/6: BMR → TDEE → macro-protocol-based slice split
  // Protocols 1-4: Derive slices from their gram-based macro targets
  const sliceTargetsCacheRef = useRef<{ key: string; value: any }>({ key: '', value: null });
  const getSliceTargets = () => {
    const protocol = profile.protocol;
    // Cache key: all profile fields that affect slice calculation
    const cacheKey = `${protocol}|${profile.currentWeight}|${profile.targetWeightClass}|${profile.gender}|${profile.age}|${profile.heightInches}|${profile.trainingSessions}|${profile.workdayActivity}|${profile.sparGoal}|${profile.goalIntensity}|${profile.maintainPriority}|${profile.goalWeightLbs}|${profile.bodyFatPercent}|${profile.customProteinPerLb}|${profile.customFatPercent}|${profile.customCarbPercent}|${profile.sparV2}|${daysUntilWeighInMemo}`;
    if (sliceTargetsCacheRef.current.key === cacheKey && sliceTargetsCacheRef.current.value) {
      return sliceTargetsCacheRef.current.value;
    }
    const _compute = () => {

    // Protocol 6 (SPAR Competition): SPAR v2 calculator with competition calorie override
    if (protocol === '6') {
      const daysUntil = getDaysUntilWeighIn();
      const compAdj = getCompetitionCalorieAdjustment({
        currentWeight: profile.currentWeight || profile.targetWeightClass,
        targetWeightClass: profile.targetWeightClass,
        daysUntilWeighIn: daysUntil,
      });

      const v2Input: SparV2Input = {
        sex: (profile.gender || 'male') as 'male' | 'female',
        age: profile.age || 16,
        heightInches: profile.heightInches || 66,
        weightLbs: profile.currentWeight || profile.targetWeightClass,
        trainingSessions: profile.trainingSessions || '3-4',
        workdayActivity: profile.workdayActivity || 'mostly_sitting',
        goal: compAdj.sparGoal,
        goalIntensity: compAdj.goalIntensity,
        calorieOverride: compAdj.calorieAdjustment,
        // Nerd mode options
        bodyFatPercent: profile.bodyFatPercent,
        customProteinPerLb: profile.customProteinPerLb,
        customFatPercent: profile.customFatPercent,
        customCarbPercent: profile.customCarbPercent,
      };

      const v2Result = calculateSparSlicesV2(v2Input);
      return {
        protein: v2Result.proteinPalms,
        carb: v2Result.carbFists,
        veg: v2Result.vegFists,
        fruit: v2Result.fruitPieces,
        fat: v2Result.fatThumbs,
        totalCalories: v2Result.totalSliceCalories,
        bmr: v2Result.bmr,
        tdee: v2Result.tdee,
        calorieAdjustment: v2Result.calorieAdjustment,
        isV2: true,
        proteinGrams: v2Result.proteinGrams,
        carbGramsTotal: v2Result.carbGramsTotal,
        fatGrams: v2Result.fatGrams,
        proteinPerLb: v2Result.proteinPerLb,
        competitionReason: compAdj.reason,
      };
    }

    // Protocols 1-4: Convert gram targets into slices
    // This uses the existing getMacroTargets() which already knows the protocol + day
    if (protocol !== '5') {
      const macroTargets = getMacroTargets();
      // Protein: grams → slices (1 palm ≈ 25g protein ≈ 110 cal)
      const proteinSlices = macroTargets.protein.max > 0
        ? Math.max(1, Math.round(macroTargets.protein.max / 25))
        : 0;
      // Carbs: grams → slices (1 fist carb ≈ 26g carbs per SPAR v2 spec)
      const carbSlices = macroTargets.carbs.max > 0
        ? Math.max(1, Math.round(macroTargets.carbs.max / 26))
        : 0;
      // Protocols 1-4 are Sugar Diet (macro/gram-based) — only protein & carb rings
      // Veg/fruit/fat rings are NOT shown; those are SPAR v2 (Protocol 5) only
      const vegSlices = 0;
      const fruitSlices = 0;
      const fatSlices = 0;
      const totalCal = (proteinSlices * 110) + (carbSlices * 120);
      return { protein: proteinSlices, carb: carbSlices, veg: vegSlices, fruit: fruitSlices, fat: fatSlices, totalCalories: totalCal, isV2: false };
    }

    // Protocol 5: Check if using v2 calculator
    // Auto-detect v2: if user has height AND age, they went through v2 onboarding
    const shouldUseV2 = profile.sparV2 || (profile.heightInches && profile.age);
    if (shouldUseV2) {
      // Use SPAR v2 calculator (5 slice types, protein anchored to bodyweight)
      const v2Input: SparV2Input = {
        sex: (profile.gender || 'male') as 'male' | 'female',
        age: profile.age || 16,
        heightInches: profile.heightInches || 66,
        weightLbs: profile.currentWeight || profile.targetWeightClass,
        trainingSessions: profile.trainingSessions || '3-4',
        workdayActivity: profile.workdayActivity || 'mostly_sitting',
        goal: profile.sparGoal || 'maintain',
        goalIntensity: profile.goalIntensity,
        maintainPriority: profile.maintainPriority,
        goalWeightLbs: profile.goalWeightLbs,
        // Nerd mode options
        bodyFatPercent: profile.bodyFatPercent,
        customProteinPerLb: profile.customProteinPerLb,
        customFatPercent: profile.customFatPercent,
        customCarbPercent: profile.customCarbPercent,
      };

      const v2Result = calculateSparSlicesV2(v2Input);
      return {
        protein: v2Result.proteinPalms,
        carb: v2Result.carbFists,
        veg: v2Result.vegFists,
        fruit: v2Result.fruitPieces,
        fat: v2Result.fatThumbs,
        totalCalories: v2Result.totalSliceCalories,
        bmr: v2Result.bmr,
        tdee: v2Result.tdee,
        calorieAdjustment: v2Result.calorieAdjustment,
        isV2: true,
        proteinGrams: v2Result.proteinGrams,
        carbGramsTotal: v2Result.carbGramsTotal,
        fatGrams: v2Result.fatGrams,
        proteinPerLb: v2Result.proteinPerLb,
      };
    }

    // Protocol 5 legacy fallback: use v2 calculator with defaults
    // (All P5 users should have v2 data, but handle edge cases gracefully)
    const fallbackInput: SparV2Input = {
      sex: (profile.gender || 'male') as 'male' | 'female',
      age: profile.age || 16,
      heightInches: profile.heightInches || 66,
      weightLbs: profile.currentWeight || profile.targetWeightClass,
      trainingSessions: profile.trainingSessions || '3-4',
      workdayActivity: profile.workdayActivity || 'mostly_sitting',
      goal: profile.sparGoal || 'maintain',
      goalIntensity: profile.goalIntensity,
      maintainPriority: profile.maintainPriority,
      goalWeightLbs: profile.goalWeightLbs,
      bodyFatPercent: profile.bodyFatPercent,
      customProteinPerLb: profile.customProteinPerLb,
      customFatPercent: profile.customFatPercent,
      customCarbPercent: profile.customCarbPercent,
    };
    const fallbackResult = calculateSparSlicesV2(fallbackInput);
    return {
      protein: fallbackResult.proteinPalms,
      carb: fallbackResult.carbFists,
      veg: fallbackResult.vegFists,
      fruit: fallbackResult.fruitPieces,
      fat: fallbackResult.fatThumbs,
      totalCalories: fallbackResult.totalSliceCalories,
      bmr: fallbackResult.bmr,
      tdee: fallbackResult.tdee,
      calorieAdjustment: fallbackResult.calorieAdjustment,
      isV2: true,
      proteinGrams: fallbackResult.proteinGrams,
      carbGramsTotal: fallbackResult.carbGramsTotal,
      fatGrams: fallbackResult.fatGrams,
      proteinPerLb: fallbackResult.proteinPerLb,
    };
    }; // end _compute
    const result = _compute();
    sliceTargetsCacheRef.current = { key: cacheKey, value: result };
    return result;
  };

  const getMacroTargets = () => {
    const w = profile.currentWeight || profile.targetWeightClass;
    const protocol = profile.protocol;
    const daysUntilWeighIn = getDaysUntilWeighIn();

    // Weight-awareness: check how far over target the athlete currently is
    // This modifies the targets returned below when significantly overweight on cut/prep days
    const getWeightAdjustedResult = (result: { carbs: { min: number; max: number }; protein: { min: number; max: number }; ratio: string }) => {
      // Only apply weight adjustments on days 1-3 (cut & prep days)
      if (daysUntilWeighIn < 1 || daysUntilWeighIn > 3) return result;

      // Get latest weight from today's logs
      const today = startOfDay(profile.simulatedDate || new Date());
      const todayStr = format(today, 'yyyy-MM-dd');
      const todayLogs = logs
        .filter(l => format(startOfDay(new Date(l.date)), 'yyyy-MM-dd') === todayStr)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latestWeight = todayLogs.length > 0 ? todayLogs[0].weight : 0;
      if (latestWeight === 0) return result;

      const overTarget = latestWeight - profile.targetWeightClass;
      const pctOver = (overTarget / profile.targetWeightClass) * 100;

      // Also factor in days remaining — 1 day out is more critical than 3 days out
      const dayMultiplier = daysUntilWeighIn === 1 ? 1.5 : daysUntilWeighIn === 2 ? 1.2 : 1.0;
      const effectivePctOver = pctOver * dayMultiplier;

      // 10%+ effective (e.g., 8%+ on day 1, or 12%+ on day 3) — DO NOT EAT
      if (effectivePctOver >= 10) {
        return {
          carbs: { min: 0, max: 0 },
          protein: { min: 0, max: 0 },
          ratio: result.ratio,
          weightWarning: `${overTarget.toFixed(1)} lbs over with ${daysUntilWeighIn} day${daysUntilWeighIn > 1 ? 's' : ''} left. Do not eat — any food adds weight. Focus entirely on extra workouts and water cut.`,
        };
      }
      // 7-10% effective — near-zero, survival only
      if (effectivePctOver >= 7) {
        return {
          carbs: { min: 0, max: Math.round(result.carbs.max * 0.15) },
          protein: { min: 0, max: Math.round(result.protein.max * 0.2) },
          ratio: result.ratio,
          weightWarning: `${overTarget.toFixed(1)} lbs over — eat only if you feel faint. Every gram counts. Extra workouts are the priority.`,
        };
      }
      // 5-7% effective — heavily restrict
      if (effectivePctOver >= 5) {
        return {
          carbs: { min: Math.round(result.carbs.min * 0.3), max: Math.round(result.carbs.max * 0.4) },
          protein: { min: Math.round(result.protein.min * 0.5), max: Math.round(result.protein.max * 0.5) },
          ratio: result.ratio,
          weightWarning: `${overTarget.toFixed(1)} lbs over — minimize intake. Focus on extra workouts and water cut.`,
        };
      }
      // 3-5% effective — moderate reduction
      if (effectivePctOver >= 3) {
        return {
          carbs: { min: Math.round(result.carbs.min * 0.6), max: Math.round(result.carbs.max * 0.7) },
          protein: { min: Math.round(result.protein.min * 0.8), max: Math.round(result.protein.max * 0.8) },
          ratio: result.ratio,
          weightWarning: `${overTarget.toFixed(1)} lbs over target — reduce intake and add extra workouts.`,
        };
      }
      return result;
    };

    // Get base targets from protocol, then apply weight adjustment
    const getBaseTargets = (): { carbs: { min: number; max: number }; protein: { min: number; max: number }; ratio: string } => {

    // Protocol 1: Extreme Cut (AGGRESSIVE)
    // Extended 0 protein period, maximum FGF21 activation
    if (protocol === '1') {
      // Recovery: day after competition (1.4g/lb full recovery)
      if (daysUntilWeighIn < 0) {
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: Math.round(w * 1.4), max: Math.round(w * 1.4) },
          ratio: "Full Recovery"
        };
      }
      // Competition day: 1.0g/lb protein (aggressive refeed post-weigh-in)
      if (daysUntilWeighIn === 0) {
        return {
          carbs: { min: 150, max: 300 },
          protein: { min: Math.round(w * 1.0), max: Math.round(w * 1.0) },
          ratio: "Low Carb / Protein Refeed"
        };
      }
      // 1 day out (performance prep): 0.20g/lb protein evening only - GDF15 peak
      if (daysUntilWeighIn === 1) {
        return {
          carbs: { min: 200, max: 300 },
          protein: { min: Math.round(w * 0.2), max: Math.round(w * 0.2) },
          ratio: "Fructose + MCT (Evening Protein)"
        };
      }
      // 2-5 days out (water loading / metabolic): 0g protein (fructose only - max fat burning)
      if (daysUntilWeighIn >= 2 && daysUntilWeighIn <= 5) {
        return {
          carbs: { min: 250, max: 400 },
          protein: { min: 0, max: 0 },
          ratio: "Fructose Only (60:40)"
        };
      }
      // 6+ days out: maintenance with moderate protein
      return {
        carbs: { min: 300, max: 450 },
        protein: { min: 75, max: 100 },
        ratio: "Maintenance"
      };
    }

    // Protocol 2: Rapid Cut (STANDARD weekly cut)
    if (protocol === '2') {
      // Recovery: day after competition (1.4g/lb recovery refeed)
      if (daysUntilWeighIn < 0) {
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: Math.round(w * 1.4), max: Math.round(w * 1.4) },
          ratio: "Full Recovery"
        };
      }
      // Competition day: 0.5g/lb (post-weigh-in rebuild)
      if (daysUntilWeighIn === 0) {
        return {
          carbs: { min: 200, max: 400 },
          protein: { min: Math.round(w * 0.5), max: Math.round(w * 0.5) },
          ratio: "Fast Carbs (Between Matches)"
        };
      }
      // 1-2 days out (transition/performance prep): 60g protein (collagen + seafood)
      if (daysUntilWeighIn >= 1 && daysUntilWeighIn <= 2) {
        return {
          carbs: { min: 300, max: 400 },
          protein: { min: 60, max: 60 },
          ratio: "Glucose Heavy (Switch to Starch)"
        };
      }
      // 3 days out: 25g protein (collagen + leucine at dinner)
      if (daysUntilWeighIn === 3) {
        return {
          carbs: { min: 325, max: 450 },
          protein: { min: 25, max: 25 },
          ratio: "Fructose Heavy (60:40)"
        };
      }
      // 4-5 days out (water loading): 0g protein (fructose only)
      if (daysUntilWeighIn >= 4 && daysUntilWeighIn <= 5) {
        return {
          carbs: { min: 325, max: 450 },
          protein: { min: 0, max: 0 },
          ratio: "Fructose Heavy (60:40)"
        };
      }
      // 6+ days out: maintenance with moderate protein
      return {
        carbs: { min: 300, max: 450 },
        protein: { min: 75, max: 100 },
        ratio: "Maintenance"
      };
    }

    // Protocol 3: Optimal Cut Phase
    if (protocol === '3') {
      // Recovery: day after competition (1.4g/lb)
      if (daysUntilWeighIn < 0) {
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: Math.round(w * 1.4), max: Math.round(w * 1.4) },
          ratio: "Full Recovery"
        };
      }
      // Competition day: 0.5g/lb
      if (daysUntilWeighIn === 0) {
        return {
          carbs: { min: 200, max: 400 },
          protein: { min: Math.round(w * 0.5), max: Math.round(w * 0.5) },
          ratio: "Competition Day"
        };
      }
      // 1-2 days out: 100g protein (performance glucose)
      if (daysUntilWeighIn >= 1 && daysUntilWeighIn <= 2) {
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: 100, max: 100 },
          ratio: "Performance (Glucose)"
        };
      }
      // 3-4 days out: 75g protein (mixed)
      if (daysUntilWeighIn >= 3 && daysUntilWeighIn <= 4) {
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: 75, max: 75 },
          ratio: "Mixed Fructose/Glucose"
        };
      }
      // 5 days out: 25g protein (fructose heavy)
      if (daysUntilWeighIn === 5) {
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: 25, max: 25 },
          ratio: "Fructose Heavy"
        };
      }
      // 6+ days out: maintenance
      return {
        carbs: { min: 300, max: 450 },
        protein: { min: 100, max: 100 },
        ratio: "Maintenance"
      };
    }

    // Protocol 4: Gain Phase (Off-season)
    if (protocol === '4') {
      // Recovery: day after competition (1.6g/lb max protein)
      if (daysUntilWeighIn < 0) {
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: Math.round(w * 1.6), max: Math.round(w * 1.6) },
          ratio: "Full Recovery (Max Protein)"
        };
      }
      // Competition day: 0.8g/lb
      if (daysUntilWeighIn === 0) {
        return {
          carbs: { min: 200, max: 400 },
          protein: { min: Math.round(w * 0.8), max: Math.round(w * 0.8) },
          ratio: "Competition Day"
        };
      }
      // 1-4 days out: 125g protein (glucose emphasis)
      if (daysUntilWeighIn >= 1 && daysUntilWeighIn <= 4) {
        return {
          carbs: { min: 350, max: 600 },
          protein: { min: 125, max: 125 },
          ratio: "Glucose Emphasis"
        };
      }
      // 5 days out: 100g protein (balanced carbs)
      if (daysUntilWeighIn === 5) {
        return {
          carbs: { min: 350, max: 600 },
          protein: { min: 100, max: 100 },
          ratio: "Balanced Carbs"
        };
      }
      // 6+ days out: build phase maintenance
      return {
        carbs: { min: 350, max: 600 },
        protein: { min: 125, max: 150 },
        ratio: "Gain Phase"
      };
    }

    return {
      carbs: { min: 300, max: 400 },
      protein: { min: 75, max: 100 },
      ratio: "Balanced"
    };
    }; // end getBaseTargets

    return getWeightAdjustedResult(getBaseTargets());
  };

  const getFoodLists = () => {
    // Food data is now sourced from food-data.ts (single source of truth)
    return {
      highFructose: SUGAR_FOODS.highFructose,
      highGlucose: SUGAR_FOODS.highGlucose,
      balanced: SUGAR_FOODS.balanced,
      zeroFiber: SUGAR_FOODS.zeroFiber,
      protein: SUGAR_FOODS.protein,
      avoid: SUGAR_FOODS.avoid,
      recovery: SUGAR_FOODS.recovery,
      tournament: SUGAR_FOODS.tournament,
      supplements: SUGAR_FOODS.supplements,
      fuelTanks: SUGAR_FOODS.fuelTanks,
    };
  };

  // Get protocol-specific and day-specific food recommendations
  // Uses daysUntilWeighIn for all timing to support any weigh-in day
  const getTodaysFoods = () => {
    const protocol = profile.protocol;
    const daysUntil = getDaysUntilWeighIn();
    const foods = getFoodLists();

    // Default lists
    let carbs: Array<{ name: string; ratio: string; serving: string; carbs: number; note?: string; timing?: string }> = foods.balanced;
    let protein: Array<{ name: string; serving: string; protein: number; note?: string; timing?: string }> = foods.protein;
    let avoid = foods.avoid;
    let carbsLabel = "Balanced Carbs";
    let proteinLabel = "Standard Protein";

    // Protocol 1: Extreme Cut (AGGRESSIVE - extended no protein)
    if (protocol === '1') {
      if (daysUntil >= 2 && daysUntil <= 5) {
        // 5-2 days out: High fructose, NO protein (max FGF21)
        const dayNumber = 6 - daysUntil; // Day 1-4 of no protein
        carbs = foods.highFructose;
        protein = []; // No protein allowed
        avoid = [
          { name: "ALL protein", reason: "Max FGF21 activation - no protein until day before" },
          { name: "Starch", reason: "Fructose only for fat oxidation" },
          { name: "Fat", reason: "Keep calories from fructose" }
        ];
        carbsLabel = "Fructose Only (60:40)";
        proteinLabel = `NO PROTEIN (Day ${dayNumber} of 4)`;
      } else if (daysUntil === 1) {
        // 1 day out: Fructose + MCT, small protein evening only (GDF15 peak)
        carbs = foods.highFructose;
        protein = foods.protein.filter(p => p.name.toLowerCase().includes("collagen"));
        avoid = [
          { name: "Heavy protein", reason: "Only 0.2g/lb evening collagen" },
          { name: "Fiber", reason: "Clear gut for weigh-in" }
        ];
        carbsLabel = "Fructose + MCT Oil";
        proteinLabel = "Evening Only (0.2g/lb)";
      } else if (daysUntil === 0) {
        // Competition day: Protein refeed (1.0g/lb) - aggressive rebuild
        carbs = foods.balanced;
        protein = foods.protein;
        avoid = [
          { name: "High fiber", reason: "Keep gut light during competition" }
        ];
        carbsLabel = "Low-Carb / Moderate Fat";
        proteinLabel = "PROTEIN REFEED (1.0g/lb)";
      } else if (daysUntil < 0) {
        // Recovery day: Full recovery
        carbs = foods.recovery;
        protein = foods.protein;
        avoid = [];
        carbsLabel = "Full Recovery (All Carbs)";
        proteinLabel = "High Protein (1.4g/lb)";
      } else {
        // 6+ days out: Maintenance
        carbs = foods.balanced;
        protein = foods.protein;
        avoid = [];
        carbsLabel = "Maintenance (All Carbs)";
        proteinLabel = "Standard Protein";
      }
    }
    // Protocol 2: Rapid Cut (STANDARD weekly cut)
    else if (protocol === '2') {
      if (daysUntil >= 4 && daysUntil <= 5) {
        // 5-4 days out: High fructose, NO protein
        carbs = foods.highFructose;
        protein = []; // No protein allowed
        avoid = foods.avoid.filter(a =>
          a.name.includes("Mon-Wed") || a.name.includes("Protein")
        );
        carbsLabel = "Fructose Heavy (60:40)";
        proteinLabel = "NO PROTEIN";
      } else if (daysUntil === 3) {
        // 3 days out: High fructose, 25g collagen + leucine at dinner
        carbs = foods.highFructose;
        protein = foods.protein.filter(p => p.name.toLowerCase().includes("collagen"));
        avoid = foods.avoid.filter(a =>
          a.name.includes("Mon-Wed") || (!a.name.includes("Collagen") && a.name.includes("Protein"))
        );
        carbsLabel = "Fructose Heavy (60:40)";
        proteinLabel = "25g Collagen (Dinner)";
      } else if (daysUntil === 1 || daysUntil === 2) {
        // 2-1 days out: Glucose/starch, 60g protein (collagen + seafood)
        carbs = daysUntil === 1 ? foods.zeroFiber : foods.highGlucose;
        protein = foods.protein.filter(p =>
          p.timing?.includes("Thu-Fri") || p.timing?.includes("Wed-Fri") || p.timing?.includes("Mon-Fri")
        );
        avoid = foods.avoid.filter(a =>
          a.name.includes("Thu-Fri") || a.name.includes("Fiber")
        );
        carbsLabel = daysUntil === 1 ? "Zero Fiber (Critical)" : "Glucose Heavy (Switch Day)";
        proteinLabel = "60g Protein (Collagen + Seafood)";
      } else if (daysUntil === 0) {
        // Competition day - 0.5g/lb post-weigh-in
        carbs = foods.tournament;
        protein = foods.protein.filter(p =>
          p.timing?.includes("Competition") || p.note?.includes("Until wrestling")
        );
        avoid = [
          { name: "Heavy protein pre-match", reason: "No protein until wrestling is over" },
          { name: "Fiber", reason: "Gut weight" },
          { name: "Fat", reason: "Slow digestion" }
        ];
        carbsLabel = "Fast Carbs (Between Matches)";
        proteinLabel = "0.5g/lb After Weigh-In";
      } else if (daysUntil < 0) {
        // Recovery day - 1.4g/lb
        carbs = foods.recovery;
        protein = foods.protein.filter(p =>
          p.timing?.includes("Post-comp") || p.timing?.includes("Sunday") || p.timing?.includes("Sun")
        );
        avoid = [];
        carbsLabel = "Full Recovery (All Carbs)";
        proteinLabel = "High Protein (1.4g/lb)";
      } else {
        // 6+ days out: Maintenance
        carbs = foods.balanced;
        protein = foods.protein;
        avoid = [];
        carbsLabel = "Maintenance (All Carbs)";
        proteinLabel = "Standard Protein";
      }
    }
    // Protocol 3: Optimal Cut
    else if (protocol === '3') {
      if (daysUntil === 5) {
        // 5 days out: Fructose heavy, 25g protein (collagen)
        carbs = foods.highFructose;
        protein = foods.protein.filter(p => p.name.toLowerCase().includes("collagen"));
        avoid = [{ name: "Heavy protein", reason: "Keep light on protein today" }];
        carbsLabel = "Fructose Heavy";
        proteinLabel = "25g Protein (Collagen)";
      } else if (daysUntil === 3 || daysUntil === 4) {
        // 4-3 days out: Mixed carbs, 75g protein
        carbs = foods.balanced;
        protein = foods.protein.filter(p =>
          p.timing?.includes("Thu-Fri") || p.timing?.includes("Wed-Fri") || p.timing?.includes("Mon-Fri") ||
          p.name.toLowerCase().includes("collagen") || p.name.toLowerCase().includes("egg")
        );
        avoid = [{ name: "High fat proteins", reason: "Stick to lean sources" }];
        carbsLabel = "Mixed Fructose/Glucose";
        proteinLabel = "75g Protein";
      } else if (daysUntil === 1 || daysUntil === 2) {
        // 2-1 days out: Glucose/performance, 100g protein
        carbs = foods.highGlucose;
        protein = foods.protein.filter(p =>
          p.timing?.includes("Thu-Fri") || p.timing?.includes("Wed-Fri") || p.timing?.includes("Mon-Fri")
        );
        avoid = foods.avoid.filter(a => a.name.includes("Fiber"));
        carbsLabel = "Performance (Glucose)";
        proteinLabel = "100g Protein";
      } else if (daysUntil === 0) {
        // Competition day
        carbs = foods.tournament;
        protein = foods.protein.filter(p => p.timing?.includes("Competition"));
        avoid = [{ name: "Heavy protein", reason: "Keep it light until done" }];
        carbsLabel = "Competition Day";
        proteinLabel = "Minimal Until Done";
      } else if (daysUntil < 0) {
        // Recovery day
        carbs = foods.recovery;
        protein = foods.protein.filter(p =>
          p.timing?.includes("Post-comp") || p.timing?.includes("Sunday")
        );
        avoid = [];
        carbsLabel = "Full Recovery";
        proteinLabel = "High Protein (1.4g/lb)";
      } else {
        // 6+ days out: Maintenance
        carbs = foods.balanced;
        protein = foods.protein;
        avoid = [];
        carbsLabel = "Maintenance";
        proteinLabel = "Standard Protein";
      }
    }
    // Protocol 4: Gain Phase
    else if (protocol === '4') {
      if (daysUntil === 0) {
        // Competition day
        carbs = foods.tournament;
        protein = foods.protein.filter(p => p.timing?.includes("Competition") || p.timing?.includes("Post-comp"));
        avoid = [{ name: "Heavy meals pre-match", reason: "Stay light until done" }];
        carbsLabel = "Competition Day";
        proteinLabel = "0.8g/lb After";
      } else if (daysUntil < 0) {
        // Recovery day: Max recovery
        carbs = foods.recovery;
        protein = foods.protein; // All protein allowed
        avoid = [];
        carbsLabel = "Full Recovery";
        proteinLabel = "MAX Protein (1.6g/lb)";
      } else if (daysUntil === 5) {
        // 5 days out: Slightly lower protein
        carbs = [...foods.balanced, ...foods.highGlucose.slice(0, 5)];
        protein = foods.protein.filter(p => !p.timing?.includes("Competition"));
        avoid = [{ name: "Junk food", reason: "Focus on quality calories" }];
        carbsLabel = "Balanced (All Quality Carbs)";
        proteinLabel = "100g Protein";
      } else {
        // Training days - all foods allowed
        carbs = [...foods.balanced, ...foods.highGlucose.slice(0, 5)];
        protein = foods.protein.filter(p => !p.timing?.includes("Competition"));
        avoid = [{ name: "Junk food", reason: "Focus on quality calories" }];
        carbsLabel = "Balanced (All Quality Carbs)";
        proteinLabel = "125g Protein";
      }
    }

    return { carbs, protein, avoid, carbsLabel, proteinLabel };
  };

  // Uses daysUntilWeighIn for all timing to support any weigh-in day
  const getFuelingGuide = () => {
    const w = profile.currentWeight || profile.targetWeightClass;
    const protocol = profile.protocol;
    const daysUntil = getDaysUntilWeighIn();

    // Protocol 1: Extreme Cut (AGGRESSIVE)
    if (protocol === '1') {
      // 5-2 days out: 0g protein (max FGF21)
      if (daysUntil >= 2 && daysUntil <= 5) {
        return {
          ratio: "Fructose Only (60:40)",
          protein: "0g",
          carbs: "250-400g",
          allowed: ["Fruit", "Juice", "Honey", "Agave"],
          avoid: ["ALL Protein", "Starch", "Fat"]
        };
      }
      // 1 day out: 0.2g/lb evening (GDF15 peak)
      if (daysUntil === 1) {
        return {
          ratio: "Fructose + MCT (GDF15 Peak)",
          protein: `${Math.round(w * 0.2)}g (Evening Only)`,
          carbs: "200-300g",
          allowed: ["Fruit", "Juice", "MCT Oil", "Collagen (Evening)"],
          avoid: ["Heavy Protein", "Fiber", "Starch"]
        };
      }
      // Competition day: 1.0g/lb (aggressive refeed)
      if (daysUntil === 0) {
        return {
          ratio: "Protein Refeed (Low Carb)",
          protein: `${Math.round(w * 1.0)}g (1.0g/lb)`,
          carbs: "150-300g",
          allowed: ["All Protein", "Moderate Fat", "Low Carb"],
          avoid: ["High Fiber"]
        };
      }
      // Recovery day: 1.4g/lb
      if (daysUntil < 0) {
        return {
          ratio: "Full Recovery",
          protein: `${Math.round(w * 1.4)}g (1.4g/lb)`,
          carbs: "300-450g",
          allowed: ["Whole Eggs", "Beef/Steak", "Chicken", "Rice", "All Fruits/Veg"],
          avoid: ["Nothing - full recovery day"]
        };
      }
    }

    // Protocol 2: Rapid Cut (STANDARD)
    if (protocol === '2') {
      // 5-4 days out: 0g protein
      if (daysUntil >= 4 && daysUntil <= 5) {
        return {
          ratio: "Fructose Heavy (60:40)",
          protein: "0g",
          carbs: "325-450g",
          allowed: ["Fruit", "Juice", "Honey", "Agave"],
          avoid: ["ALL Protein", "Starch", "Fat"]
        };
      }
      // 3 days out: 25g protein (dinner only)
      if (daysUntil === 3) {
        return {
          ratio: "Fructose + Collagen",
          protein: "25g (Dinner Only)",
          carbs: "325-450g",
          allowed: ["Fruit", "Juice", "Honey", "Collagen + Leucine (Dinner)"],
          avoid: ["Starch", "Meat", "Fat"]
        };
      }
      // 2-1 days out: 60g protein
      if (daysUntil === 1 || daysUntil === 2) {
        return {
          ratio: daysUntil === 1 ? "Glucose Heavy (Zero Fiber)" : "Glucose Heavy (Switch to Starch)",
          protein: "60g/day",
          carbs: daysUntil === 1 ? "250-350g" : "300-400g",
          allowed: ["White Rice", "Potato", "Dextrose", "Collagen", "Seafood"],
          avoid: daysUntil === 1 ? ["ALL Fiber", "Fruits", "Vegetables"] : ["Fiber (Fruits/Veg)", "Fatty Meat"]
        };
      }
      // Competition day: 0.5g/lb
      if (daysUntil === 0) {
        return {
          ratio: "Competition Day",
          protein: `0g until done, then ${Math.round(w * 0.5)}g`,
          carbs: "Fast carbs between matches",
          allowed: ["Rice Cakes", "Gummy Bears", "Juice", "Electrolytes", "Dextrose"],
          avoid: ["Protein until wrestling is over", "Fiber", "Fat"]
        };
      }
      // Recovery day: 1.4g/lb
      if (daysUntil < 0) {
        return {
          ratio: "Full Recovery",
          protein: `${Math.round(w * 1.4)}g (1.4g/lb)`,
          carbs: "300-450g",
          allowed: ["Whole Eggs", "Beef/Steak", "Chicken", "Rice", "Potatoes", "All Fruits/Veg"],
          avoid: ["Nothing - full recovery day"]
        };
      }
    }

    if (protocol === '3') {
      // 5 days out: 25g protein
      if (daysUntil === 5) {
        return {
          ratio: "Fructose Heavy",
          protein: "25g",
          carbs: "300-450g",
          allowed: ["Fruit", "Juice", "Collagen + Leucine"],
          avoid: ["Starch", "Fat"]
        };
      }
      // 4-3 days out: 75g protein
      if (daysUntil === 3 || daysUntil === 4) {
        return {
          ratio: "Mixed Fructose/Glucose",
          protein: "75g/day",
          carbs: "300-450g",
          allowed: ["Fruit", "Rice", "Lean Protein", "Egg Whites", "Collagen"],
          avoid: ["High Fat"]
        };
      }
      // 2-1 days out: 100g protein
      if (daysUntil === 1 || daysUntil === 2) {
        return {
          ratio: "Performance (Glucose)",
          protein: "100g/day",
          carbs: "300-450g",
          allowed: ["Rice", "Potato", "Chicken", "Seafood", "Dextrose"],
          avoid: ["Fiber"]
        };
      }
      // Competition day: 0.5g/lb
      if (daysUntil === 0) {
        return {
          ratio: "Competition Day",
          protein: `0g until done, then ${Math.round(w * 0.5)}g`,
          carbs: "Fast carbs between matches",
          allowed: ["Rice Cakes", "Gummy Bears", "Juice", "Electrolytes"],
          avoid: ["Protein until done", "Fiber", "Fat"]
        };
      }
      // Recovery day: 1.4g/lb
      if (daysUntil < 0) {
        return {
          ratio: "Full Recovery",
          protein: `${Math.round(w * 1.4)}g (1.4g/lb)`,
          carbs: "300-450g",
          allowed: ["Whole Eggs", "Beef", "Chicken", "Rice", "All Fruits/Veg"],
          avoid: ["Nothing - full recovery"]
        };
      }
    }

    if (protocol === '4') {
      // 5 days out: 100g protein
      if (daysUntil === 5) {
        return {
          ratio: "Balanced Carbs",
          protein: "100g",
          carbs: "350-600g",
          allowed: ["Balanced Carbs", "Whole Protein", "Collagen"],
          avoid: ["Junk Food"]
        };
      }
      // 4-1 days out: 125g protein
      if (daysUntil >= 1 && daysUntil <= 4) {
        return {
          ratio: "Glucose Emphasis",
          protein: "125g/day",
          carbs: "350-600g",
          allowed: ["Rice", "Potatoes", "Chicken", "Seafood", "Collagen"],
          avoid: ["Excessive Fiber pre-workout"]
        };
      }
      // Competition day: 0.8g/lb
      if (daysUntil === 0) {
        return {
          ratio: "Competition Day",
          protein: `Minimal until done, then ${Math.round(w * 0.8)}g`,
          carbs: "Fast carbs between matches",
          allowed: ["Rice Cakes", "Gummy Bears", "Juice", "Electrolytes"],
          avoid: ["Fiber", "Fat", "Heavy protein until done"]
        };
      }
      // Recovery day: 1.6g/lb
      if (daysUntil < 0) {
        return {
          ratio: "Full Recovery",
          protein: `${Math.round(w * 1.6)}g (1.6g/lb - Max Protein)`,
          carbs: "High - rebuild glycogen",
          allowed: ["Whole Eggs", "Beef/Steak", "Chicken", "Rice", "Potatoes", "Oatmeal", "All Fruits/Veg"],
          avoid: ["Nothing - eat everything quality"]
        };
      }
    }

    return { ratio: "Balanced", allowed: ["Clean Carbs", "Lean Protein"], avoid: ["Junk"] };
  };

  const getTodaysFocus = () => {
    const phase = getPhase();
    const protocol = profile.protocol;
    const isOver = profile.currentWeight > calculateTarget();
    const fuel = getFuelingGuide();

    let title = "Maintain Baseline";
    let actions: string[] = [];
    let warning = undefined;

    if (protocol === '1') {
       title = "Today's Mission: Extreme Cut";
       actions.push(`Hit Protein Target: ${fuel.protein || '0g'}`);
       actions.push(`Hit Carb Target: ${fuel.carbs || 'High'}`);
       if (phase === 'metabolic') actions.push("Maximize Fat Burning (Strict No Protein)");
       if (phase === 'performance-prep') actions.push("Reintroduce Protein Evening (0.2g/lb)");
    } else if (protocol === '2') {
       title = "Today's Mission: Rapid Cut";
       actions.push(`Hit Protein Target: ${fuel.protein}`);
       actions.push(`Hit Carb Target: ${fuel.carbs}`);
       if (phase === 'metabolic') actions.push("Maximize Fat Burning (Keep Protein Low)");
       if (phase === 'transition') actions.push("Switch to Glucose/Starch + Seafood");
    } else if (protocol === '3') {
       title = "Today's Mission: Optimal Cut";
       actions.push("Focus on Performance & Recovery");
       actions.push(`Hit Protein Target: ${fuel.protein}`);
    } else if (protocol === '4') {
       title = "Today's Mission: Gain";
       actions.push("Focus on Muscle Growth & Weight Gain");
       actions.push(`Hit Protein Target: ${fuel.protein}`);
       actions.push(`Hit Carb Target: ${fuel.carbs}`);
    }

    if (phase === 'transition') {
      actions.push("ELIMINATE FIBER (No veggies/fruit)");
      actions.push("Eat Collagen + Leucine (Dinner)");
    } else if (phase === 'performance-prep') {
       actions.push("Ensure ZERO Fiber Intake");
       actions.push("Monitor Weight Drift Hourly");
    }

    if (isOver && phase !== 'last-24h') {
      warning = "Weight high - Verify protocol adherence";
    }

    return { title, actions, warning };
  };

  // Helper to get days until weigh-in for a specific day of the CURRENT week
  // Uses today's actual calendar week (Mon-Sun), not the weigh-in week
  const getDaysUntilForDay = (dayNum: number): number => {
    // dayNum: 0=Sun, 1=Mon, 2=Tue, etc.
    const today = startOfDay(profile.simulatedDate || new Date());
    const todayDow = getDay(today); // 0=Sun, 6=Sat
    // Find Monday of the current week
    const daysBackToMonday = todayDow === 0 ? 6 : todayDow - 1;
    const currentWeekMonday = startOfDay(addDays(today, -daysBackToMonday));
    // Target day relative to Monday of current week
    const dayOffset = dayNum === 0 ? 6 : dayNum - 1;
    const targetDate = startOfDay(addDays(currentWeekMonday, dayOffset));
    const weighIn = startOfDay(profile.weighInDate);
    return differenceInDays(weighIn, targetDate);
  };

  // Shared: apply weight-based macro override to today's entry in any weekly plan
  const applyWeightAdjustmentToToday = (plan: DayPlan[]): DayPlan[] => {
    const todayEntry = plan.find(d => d.isToday);
    if (!todayEntry) return plan;

    const daysUntil = getDaysUntilWeighIn();
    // Only adjust on cut/prep days (1-3 days out)
    if (daysUntil < 1 || daysUntil > 3) return plan;

    // Get latest weight
    const today = startOfDay(profile.simulatedDate || new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    const todayLogs = logs
      .filter(l => format(startOfDay(new Date(l.date)), 'yyyy-MM-dd') === todayStr)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestWeight = todayLogs.length > 0 ? todayLogs[0].weight : 0;
    if (latestWeight === 0) return plan;

    if (!profile.targetWeightClass || profile.targetWeightClass <= 0) return plan;
    const overTarget = latestWeight - profile.targetWeightClass;
    const pctOver = (overTarget / profile.targetWeightClass) * 100;
    const dayMultiplier = daysUntil === 1 ? 1.5 : daysUntil === 2 ? 1.2 : 1.0;
    const effectivePctOver = pctOver * dayMultiplier;

    if (effectivePctOver < 3) return plan;

    return plan.map(d => {
      if (!d.isToday) return d;
      if (effectivePctOver >= 10) {
        return { ...d, carbs: { min: 0, max: 0 }, protein: { min: 0, max: 0 }, weightWarning: `${overTarget.toFixed(1)} lbs over target with ${daysUntil} day${daysUntil > 1 ? 's' : ''} left. Do not eat.` };
      }
      if (effectivePctOver >= 7) {
        return { ...d, carbs: { min: 0, max: Math.round(d.carbs.max * 0.15) }, protein: { min: 0, max: Math.round(d.protein.max * 0.2) }, weightWarning: `${overTarget.toFixed(1)} lbs over — eat only if you feel faint.` };
      }
      if (effectivePctOver >= 5) {
        return { ...d, carbs: { min: Math.round(d.carbs.min * 0.3), max: Math.round(d.carbs.max * 0.4) }, protein: { min: Math.round(d.protein.min * 0.5), max: Math.round(d.protein.max * 0.5) }, weightWarning: `${overTarget.toFixed(1)} lbs over — minimize intake.` };
      }
      return { ...d, carbs: { min: Math.round(d.carbs.min * 0.6), max: Math.round(d.carbs.max * 0.7) }, protein: { min: Math.round(d.protein.min * 0.8), max: Math.round(d.protein.max * 0.8) }, weightWarning: `${overTarget.toFixed(1)} lbs over — reduce intake.` };
    });
  };

  const getWeeklyPlan = (): DayPlan[] => {
    const w = profile.targetWeightClass;
    const today = startOfDay(profile.simulatedDate || new Date());
    const currentDayOfWeek = getDay(today);
    const protocol = profile.protocol;

    const isHeavy = w >= 175;
    const isMedium = w >= 150 && w < 175;
    const waterLoadBonus = isHeavy ? 4 : isMedium ? 3 : 2;

    const galToOz = (gal: number) => Math.round(gal * 128);

    // Build array of dates from today through weigh-in + 1 recovery day
    const weighIn = startOfDay(profile.weighInDate);
    const daysUntilWeighInLocal = differenceInDays(weighIn, today);
    // Show at least 7 days, but extend to weigh-in + 1 if further out
    const totalDays = Math.max(7, daysUntilWeighInLocal + 2); // +1 for competition, +1 for recovery
    const dateRange: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      dateRange.push(startOfDay(addDays(today, i)));
    }

    // Helper to get the actual calendar date for a given day-of-week in the CURRENT week
    const getDateForDay = (dayNum: number): Date => {
      const todayDow = getDay(today); // 0=Sun, 6=Sat
      const daysBackToMonday = todayDow === 0 ? 6 : todayDow - 1;
      const currentWeekMonday = startOfDay(addDays(today, -daysBackToMonday));
      const dayOffset = dayNum === 0 ? 6 : dayNum - 1;
      return startOfDay(addDays(currentWeekMonday, dayOffset));
    };

    // Helper to get phase name based on days until weigh-in
    const getPhaseForDays = (daysUntil: number): string => {
      if (daysUntil < 0) return 'Recover';
      if (daysUntil === 0) return 'Compete';
      if (daysUntil <= 2) return 'Cut';
      if (daysUntil <= 5) return 'Load';
      return 'Train';
    };

    // Use centralized water loading check from constants
    const isWaterLoadingForDays = (daysUntil: number): boolean => {
      return checkWaterLoadingDay(daysUntil, protocol);
    };

    // Protocol 5 (SPAR Nutrition) — Clean eating, no weight cutting
    // No water loading, no phases. Standard hydration. Slice-based nutrition.
    if (protocol === '5') {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const sparWeight = profile.targetWeight || profile.targetWeightClass;

      // Standard hydration for SPAR: ~0.55 oz/lb body weight
      const athleteW = profile.currentWeight || Math.round(sparWeight * 1.07);
      const sparWaterOz = Math.round(athleteW * 0.55);
      const sparGallons = sparWaterOz / 128;
      const sparRounded = Math.round(sparGallons * 4) / 4;
      const sparWaterStr = `${sparRounded.toFixed(sparRounded % 1 === 0 ? 1 : 2)} gal`;

      // Get slice targets for nutrition display
      const sparSlices = getSliceTargets();

      const sparDays: DayPlan[] = dateRange.map((date, i) => {
        const dayNum = getDay(date);
        const daysUntil = differenceInDays(weighIn, date);

        let phase = 'Train';
        if (daysUntil < 0) phase = 'Recover';
        else if (daysUntil === 0) phase = 'Compete';
        else if (daysUntil === 1) phase = 'Light';

        return {
          day: dayNames[dayNum],
          dayNum,
          date,
          phase,
          weightTarget: sparWeight,
          water: {
            amount: daysUntil === 0 ? 'Rehydrate' : sparWaterStr,
            targetOz: sparWaterOz,
            type: daysUntil === 0 ? 'Rehydrate' : 'Regular',
          },
          carbs: { min: sparSlices.carbGramsTotal || 0, max: sparSlices.carbGramsTotal || 0 },
          protein: { min: sparSlices.proteinGrams || 0, max: sparSlices.proteinGrams || 0 },
          isToday: i === 0,
          isTomorrow: i === 1,
        };
      });
      return applyWeightAdjustmentToToday(sparDays);
    }

    // Protocol 6 (SPAR Competition) — SPAR portions + competition water loading
    // Same timeline as P1-P4 but with SPAR slice-based nutrition that auto-adjusts
    if (protocol === '6') {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      const sparCompDays: DayPlan[] = dateRange.map((date, i) => {
        const dayNum = getDay(date);
        const daysUntil = differenceInDays(weighIn, date);
        const phase = getPhaseForDays(daysUntil);

        // Get competition-adjusted calorie info for this day
        const compAdj = getCompetitionCalorieAdjustment({
          currentWeight: profile.currentWeight || profile.targetWeightClass,
          targetWeightClass: profile.targetWeightClass,
          daysUntilWeighIn: daysUntil,
        });

        // Build SPAR input with competition calorie override for this specific day
        const dayV2Input: SparV2Input = {
          sex: (profile.gender || 'male') as 'male' | 'female',
          age: profile.age || 16,
          heightInches: profile.heightInches || 66,
          weightLbs: profile.currentWeight || profile.targetWeightClass,
          trainingSessions: profile.trainingSessions || '3-4',
          workdayActivity: profile.workdayActivity || 'mostly_sitting',
          goal: compAdj.sparGoal,
          goalIntensity: compAdj.goalIntensity,
          calorieOverride: compAdj.calorieAdjustment,
          bodyFatPercent: profile.bodyFatPercent,
          customProteinPerLb: profile.customProteinPerLb,
          customFatPercent: profile.customFatPercent,
          customCarbPercent: profile.customCarbPercent,
        };
        const daySlices = calculateSparSlicesV2(dayV2Input);

        // Use competition water loading (same as P1-P4)
        const waterData = getHydrationForDaysUntil(daysUntil);

        // Weight target uses competition calculation with water loading
        const targetCalc = calculateTargetWeight(w, daysUntil, protocol);
        const weightTarget = targetCalc.withWaterLoad || targetCalc.base;

        return {
          day: dayNames[dayNum],
          dayNum,
          date,
          phase,
          weightTarget,
          water: {
            amount: waterData.amount,
            targetOz: waterData.targetOz,
            type: waterData.type,
          },
          carbs: { min: daySlices.carbGramsTotal, max: daySlices.carbGramsTotal },
          protein: { min: daySlices.proteinGrams, max: daySlices.proteinGrams },
          isToday: i === 0,
          isTomorrow: i === 1,
          isWaterLoading: isWaterLoadingForDays(daysUntil),
        };
      });
      return applyWeightAdjustmentToToday(sparCompDays);
    }

    // Protocol 4 (Gain Phase) - No weight cutting, maintain/gain weight
    // Uses days-until-weigh-in for competition/recovery timing
    if (protocol === '4') {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      const buildDays: DayPlan[] = dateRange.map((date, i) => {
        const dayNum = getDay(date);
        const daysUntil = differenceInDays(weighIn, date);

        // Determine phase based on days until weigh-in
        let phase = 'Train';
        let carbs = { min: 350, max: 600 };
        let protein = { min: 125, max: 125 };
        let water = {
          amount: isHeavy ? '1.5 gal' : isMedium ? '1.25 gal' : '1.0 gal',
          targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0),
          type: 'Regular'
        };

        if (daysUntil < 0) {
          // Recovery day (day after competition)
          phase = 'Recover';
          carbs = { min: 300, max: 450 };
          protein = { min: Math.round(w * 1.6), max: Math.round(w * 1.6) };
        } else if (daysUntil === 0) {
          // Competition day
          phase = 'Compete';
          carbs = { min: 200, max: 400 };
          protein = { min: Math.round(w * 0.8), max: Math.round(w * 0.8) };
        } else if (daysUntil === 1) {
          // Day before competition - light training
          phase = 'Light';
          water = {
            amount: isHeavy ? '1.25 gal' : isMedium ? '1.0 gal' : '0.75 gal',
            targetOz: galToOz(isHeavy ? 1.25 : isMedium ? 1.0 : 0.75),
            type: 'Regular'
          };
        } else if (daysUntil === 5) {
          // 5 days out - slightly lower protein
          protein = { min: 100, max: 100 };
        }

        return {
          day: dayNames[dayNum],
          dayNum,
          date,
          phase,
          weightTarget: w, // Morning target (primary data point)
          water,
          carbs,
          protein,
          isToday: i === 0,
          isTomorrow: i === 1
        };
      });
      return applyWeightAdjustmentToToday(buildDays);
    }

    // Protocol 3 (Optimal Cut) - Maintenance-level nutrition WITH water loading
    // P3 wrestlers are at walk-around weight (~6-7% above competition weight),
    // so they still need water manipulation to make weight safely on Saturday.
    // Uses centralized hydration (getHydrationForDaysUntil) and water loading schedule.
    // Macros stay maintenance-level per the FGF21 P3 table (different from P1/P2's aggressive carb changes).
    if (protocol === '3') {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      const holdDays: DayPlan[] = dateRange.map((date, i) => {
        const dayNum = getDay(date);
        const daysUntil = differenceInDays(weighIn, date);

        // Use centralized weight calculation (now includes water loading bonus for P3)
        const targetCalc = calculateTargetWeight(w, daysUntil, protocol);
        const baseWeight = Math.round(w * getWeightMultiplier(daysUntil));

        // Use centralized hydration target (water loading on days 5-4-3, restriction on 2, sips on 1)
        const hydration = getHydrationForDaysUntil(daysUntil);

        // Use centralized weight: if water loading day, use range max; otherwise base
        const weightTarget = targetCalc.range ? targetCalc.range.max
          : daysUntil === 0 ? w // Competition day: must hit weight class
          : baseWeight;

        // Default values — P3 maintenance-level macros
        let phase = getPhaseForDays(daysUntil);
        let carbs = { min: 300, max: 450 };
        let protein = { min: 75, max: 75 };
        let water = { amount: hydration.amount, targetOz: hydration.targetOz, type: hydration.type };
        let waterLoadingNote: string | undefined;
        let isCriticalCheckpoint = false;

        if (daysUntil < 0) {
          // Recovery day
          protein = { min: Math.round(w * 1.4), max: Math.round(w * 1.4) };
          waterLoadingNote = 'Recovery day - return to walk-around weight with protein refeed';
        } else if (daysUntil === 0) {
          // Competition day
          carbs = { min: 200, max: 400 };
          protein = { min: Math.round(w * 0.5), max: Math.round(w * 0.5) };
        } else if (daysUntil === 1) {
          // Day before competition - sips only
          protein = { min: 100, max: 100 };
          isCriticalCheckpoint = true;
          waterLoadingNote = `CRITICAL: Must be ${Math.round(w * 1.02)}-${baseWeight} lbs by evening for safe cut`;
        } else if (daysUntil === 2) {
          // 2 days out - water restriction day
          protein = { min: 100, max: 100 };
          waterLoadingNote = `Water restriction day — ADH still suppressed, body keeps flushing. ZERO fiber. Sips only tomorrow.`;
        } else if (daysUntil === 3) {
          // Last load day
          protein = { min: 25, max: 25 };
          waterLoadingNote = `Last load day — still +${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs. Water restriction starts tomorrow.`;
        } else if (daysUntil === 4) {
          // Peak water loading day
          protein = { min: 0, max: 0 };
          waterLoadingNote = `Peak loading day - heaviest day is normal (+${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs)`;
        } else if (daysUntil === 5) {
          // First water loading day
          protein = { min: 0, max: 0 };
          waterLoadingNote = `Water loading day - expect +${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs water weight`;
        }
        // 6+ days out stays at defaults (maintenance)

        return {
          day: dayNames[dayNum],
          dayNum,
          date,
          phase,
          weightTarget,
          water,
          carbs,
          protein,
          isToday: i === 0,
          isTomorrow: i === 1,
          waterLoadingNote,
          isCriticalCheckpoint
        };
      });
      return applyWeightAdjustmentToToday(holdDays);
    }

    // Protocols 1 & 2 (Extreme Cut & Rapid Cut) - Full cutting protocol
    // Uses days-until-weigh-in for all timing:
    // 5 days out: Water loading starts (walk-around + water bonus)
    // 4 days out: Peak water loading
    // 3 days out: Last load day
    // 2 days out: Flush/transition (zero fiber)
    // 1 day out: Critical checkpoint (sip only)
    // 0 days: Competition day
    // -1 day: Recovery
    // 6+ days out: Maintenance/build phase

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const days: DayPlan[] = dateRange.map((date, i) => {
      const dayNum = getDay(date);
      const daysUntil = differenceInDays(weighIn, date);
      const isWaterLoading = isWaterLoadingForDays(daysUntil);

      // Use centralized weight calculation
      const targetCalc = calculateTargetWeight(w, daysUntil, protocol);
      const baseWeight = Math.round(w * getWeightMultiplier(daysUntil));

      // Use centralized hydration target for consistency
      const hydration = getHydrationForDaysUntil(daysUntil);

      // Use centralized weight: if water loading day, use range max; otherwise base
      const weightTarget = targetCalc.range ? targetCalc.range.max
        : daysUntil === 0 ? w // Competition day: must hit weight class
        : baseWeight;

      // Default values
      let phase = getPhaseForDays(daysUntil);
      let carbs = { min: 300, max: 450 };
      let protein = { min: 75, max: 100 };
      let water = { amount: hydration.amount, targetOz: hydration.targetOz, type: hydration.type };
      let waterLoadingNote: string | undefined;
      let isCriticalCheckpoint = false;

      if (daysUntil < 0) {
        // Recovery day (day after competition)
        carbs = { min: 300, max: 450 };
        protein = { min: Math.round(w * 1.4), max: Math.round(w * 1.4) };
        waterLoadingNote = 'Recovery day - return to walk-around weight with protein refeed';
      } else if (daysUntil === 0) {
        // Competition day
        carbs = { min: 200, max: 400 };
        protein = { min: Math.round(w * 0.5), max: Math.round(w * 0.5) };
      } else if (daysUntil === 1) {
        // Critical checkpoint - day before competition (sip only)
        carbs = { min: 250, max: 350 };
        protein = { min: 50, max: 60 };
        isCriticalCheckpoint = true;
        waterLoadingNote = `CRITICAL: Must be ${Math.round(w * 1.02)}-${baseWeight} lbs by evening for safe cut`;
      } else if (daysUntil === 2) {
        // 2 days out - water RESTRICTION day. ADH still suppressed from loading → high urine output continues.
        carbs = { min: 325, max: 450 };
        protein = { min: 50, max: 60 };
        waterLoadingNote = `Water restriction day — ADH still suppressed, body keeps flushing. ZERO fiber. Sips only tomorrow.`;
      } else if (daysUntil === 3) {
        // Last load day (day 3 of loading)
        carbs = { min: 325, max: 450 };
        protein = { min: 25, max: 25 };
        waterLoadingNote = `Last load day — still +${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs. Water restriction starts tomorrow.`;
      } else if (daysUntil === 4) {
        // Peak water loading day
        carbs = { min: 325, max: 450 };
        protein = { min: 0, max: 0 };
        waterLoadingNote = `Peak loading day - heaviest day is normal (+${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs)`;
      } else if (daysUntil === 5) {
        // First water loading day
        carbs = { min: 325, max: 450 };
        protein = { min: 0, max: 0 };
        waterLoadingNote = `Water loading day - expect +${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs water weight`;
      }
      // 6+ days out stays at defaults (maintenance)

      return {
        day: dayNames[dayNum],
        dayNum,
        date,
        phase,
        weightTarget,
        water,
        carbs,
        protein,
        isToday: i === 0,
        isTomorrow: i === 1,
        waterLoadingNote,
        isCriticalCheckpoint
      };
    });

    // Apply weight-based adjustments to today's entry (same logic as getMacroTargets weight adjustment)
    return applyWeightAdjustmentToToday(days);
  };

  const getTomorrowPlan = (): DayPlan | null => {
    const plan = getWeeklyPlan();
    return plan.find(d => d.isTomorrow) || null;
  };

  const getNextTarget = () => {
    const todayTarget = calculateTarget();
    const daysUntil = getDaysUntilWeighIn();

    // Tomorrow's target uses the centralized calculation
    const tomorrowDaysUntil = daysUntil - 1;
    const tomorrowCalc = calculateTargetWeight(profile.targetWeightClass, tomorrowDaysUntil, profile.protocol);
    // Use the water-loaded value if applicable, otherwise base
    const tomorrowTarget = tomorrowCalc.withWaterLoad || tomorrowCalc.base;

    // Always show tomorrow's morning target as the next goal
    // Morning weigh-in is the primary data point for tracking progress
    return { label: "Tomorrow AM", weight: tomorrowTarget, description: "Morning Target" };
  };

  const getDriftMetrics = () => {
    // Sort logs newest-first by date
    const sorted = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let overnightSum = 0;
    let overnightCount = 0;
    let sessionSum = 0;
    let sessionCount = 0;

    // For each morning log, find the most recent preceding post-practice (overnight drift)
    // For each post-practice log, find the most recent preceding pre-practice (session loss)
    const morningLogs = sorted.filter(l => l.type === 'morning');
    const postPracticeLogs = sorted.filter(l => l.type === 'post-practice');
    const prePracticeLogs = sorted.filter(l => l.type === 'pre-practice');

    // Overnight drift: morning weight vs previous day's post-practice
    for (const morning of morningLogs) {
      const morningTime = new Date(morning.date).getTime();
      // Find the closest post-practice BEFORE this morning (6-16 hours prior)
      const match = postPracticeLogs.find(pp => {
        const ppTime = new Date(pp.date).getTime();
        const diffHours = (morningTime - ppTime) / (1000 * 60 * 60);
        return diffHours > 6 && diffHours < 16;
      });
      if (match) {
        overnightSum += (match.weight - morning.weight);
        overnightCount++;
      }
    }

    // Session loss: pre-practice vs post-practice (same session, within 4 hours)
    const usedPostIds = new Set<string>();
    for (const pre of prePracticeLogs) {
      const preTime = new Date(pre.date).getTime();
      // Find the closest post-practice AFTER this pre-practice (within 4 hours)
      const match = postPracticeLogs.find(pp => {
        if (usedPostIds.has(pp.id)) return false;
        const ppTime = new Date(pp.date).getTime();
        const diffHours = (ppTime - preTime) / (1000 * 60 * 60);
        return diffHours > 0 && diffHours < 4;
      });
      if (match) {
        usedPostIds.add(match.id);
        sessionSum += (pre.weight - match.weight);
        sessionCount++;
      }
    }

    return {
        overnight: overnightCount > 0 ? (overnightSum / overnightCount) : null,
        session: sessionCount > 0 ? (sessionSum / sessionCount) : null
    };
  };

  // Calculate extra workout statistics from logged extra-before/extra-after pairs
  const getExtraWorkoutStats = (): { avgLoss: number | null; avgSweatRateOzPerHr: number | null; totalWorkouts: number; todayWorkouts: number; todayLoss: number } => {
    const today = startOfDay(profile.simulatedDate || new Date());
    const todayStr = format(today, 'yyyy-MM-dd');

    // Find all extra-before logs and pair them with their extra-after
    const extraBeforeLogs = logs.filter(l => l.type === 'extra-before')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const extraAfterLogs = logs.filter(l => l.type === 'extra-after')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const workoutLosses: number[] = [];
    const sweatRates: number[] = [];
    let todayWorkouts = 0;
    let todayLoss = 0;
    const usedAfterIds = new Set<string>();

    for (const before of extraBeforeLogs) {
      const beforeTime = new Date(before.date).getTime();
      const beforeDay = format(startOfDay(new Date(before.date)), 'yyyy-MM-dd');

      // Find the closest matching after log on the same day, within 3 hours, not already used
      let bestAfter: typeof extraAfterLogs[0] | null = null;
      let bestTimeDiff = Infinity;

      for (const a of extraAfterLogs) {
        if (usedAfterIds.has(a.id)) continue;
        const afterTime = new Date(a.date).getTime();
        const afterDay = format(startOfDay(new Date(a.date)), 'yyyy-MM-dd');
        // Must be same day
        if (afterDay !== beforeDay) continue;
        const timeDiff = afterTime - beforeTime;
        // Must be after the before log, within 3 hours (workout + logging time)
        if (timeDiff >= 0 && timeDiff < 3 * 60 * 60 * 1000 && timeDiff < bestTimeDiff) {
          bestAfter = a;
          bestTimeDiff = timeDiff;
        }
      }

      if (bestAfter) {
        usedAfterIds.add(bestAfter.id);
        const loss = before.weight - bestAfter.weight;
        if (loss > 0) { // Only count if weight was lost
          workoutLosses.push(loss);

          // Calculate sweat rate (lbs/hr) if duration is available
          if (bestAfter.duration && bestAfter.duration > 0) {
            const ozPerHr = loss / (bestAfter.duration / 60);
            sweatRates.push(ozPerHr);
          }

          // Check if this workout is from today
          if (beforeDay === todayStr) {
            todayWorkouts++;
            todayLoss += loss;
          }
        }
      }
    }

    // Reverse so newest is first for EMA (recency bias)
    workoutLosses.reverse();
    sweatRates.reverse();

    return {
      avgLoss: computeEMA(workoutLosses),
      avgSweatRateOzPerHr: computeEMA(sweatRates),
      totalWorkouts: workoutLosses.length,
      todayWorkouts,
      todayLoss
    };
  };

  const getStatus = (): {
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
  } => {
    const waterLoading = isWaterLoadingDay();
    const descentData = getWeekDescentData();

    // Get morning weight and most recent weigh-in today
    const today = startOfDay(profile.simulatedDate || new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    const todayMorningLog = logs.find(l =>
      format(startOfDay(new Date(l.date)), 'yyyy-MM-dd') === todayStr && (l.type === 'morning' || l.type === 'weigh-in')
    );
    const morningWeight = todayMorningLog?.weight || 0;

    // Most recent weigh-in of any type (mirrors getWeekDescentData logic)
    const allTodayStatusLogs = logs.filter(l =>
      format(startOfDay(new Date(l.date)), 'yyyy-MM-dd') === todayStr
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestWeight = allTodayStatusLogs.length > 0 ? allTodayStatusLogs[0].weight : morningWeight;

    // During training phase (6+ days out), use morning weight for status — before-bed
    // weight is inflated from food/water intake and isn't representative of actual progress.
    // During comp week, use latest weight for real-time tracking.
    const daysUntilStatus = getDaysUntilWeighIn();
    const currentWeight = (daysUntilStatus > 5 && morningWeight > 0) ? morningWeight : latestWeight;

    if (morningWeight === 0 && latestWeight === 0) {
      return { status: 'on-track', label: 'LOG WEIGHT', color: 'text-muted-foreground', bgColor: 'bg-muted/30', contextMessage: 'Log morning weight' };
    }

    // calculateTarget() already includes water loading for protocols 1 & 2
    // So we DON'T add water bonus again - just compare directly to the target
    const target = calculateTarget();
    // Use current weight for diff so status updates throughout the day
    const diff = currentWeight - target;
    // Whether projection shows making weight (within 0.5 lb tolerance)
    const projectedToMakeWeight = descentData.projectedSaturday !== null && descentData.daysRemaining > 0
      && descentData.projectedSaturday <= profile.targetWeightClass + 0.5;

    // Check if projection shows we won't make weight
    let projectionWarning: string | undefined;
    let recommendation: {
      extraWorkoutsNeeded: number;
      totalWorkoutsNeeded: number;
      todayWorkoutsDone: number;
      todayLoss: number;
      message: string;
      urgency: 'moderate' | 'high' | 'critical';
      switchProtocol: boolean;
      avgExtraWorkoutLoss: number | null;
    } | undefined;

    if (descentData.projectedSaturday !== null && descentData.daysRemaining > 0) {
      const projectedOver = descentData.projectedSaturday - profile.targetWeightClass;
      // Any projection over target weight class is a warning - you need to hit exactly target on weigh-in day
      // Allow small tolerance (0.5 lbs) for measurement variance
      if (projectedOver > 0.5) {
        const isLoadingPhase = descentData.daysRemaining >= 3;
        projectionWarning = `Projected ${projectedOver.toFixed(1)} lbs over by weigh-in` +
          (isLoadingPhase ? ' (based on morning weight — practice dips recover during loading)' : '');

        // Calculate recommendation based on how much over and days remaining
        const extraStats = getExtraWorkoutStats();
        const daysRemaining = descentData.daysRemaining;

        // Workout loss estimate priority:
        // 1. Actual extra workout average (if they've logged extra workouts)
        // 2. Practice sweat rate × 0.75 hr (45 min estimated extra session)
        // 3. Average practice loss (from regular practice data)
        // 4. No estimate — tell them to log a workout
        const practiceSweatRate = descentData.avgSweatRateOzPerHr; // in lbs/hr now
        const avgWorkoutLoss = extraStats.avgLoss
          ?? (practiceSweatRate !== null ? practiceSweatRate * 0.75 : null)
          ?? descentData.avgPracticeLoss
          ?? null;

        // Calculate how many extra workouts needed
        const workoutsNeeded = avgWorkoutLoss !== null && avgWorkoutLoss > 0
          ? Math.ceil(projectedOver / avgWorkoutLoss)
          : null;

        // Base recommendation object with common fields
        const baseRec = {
          totalWorkoutsNeeded: workoutsNeeded ?? 0,
          todayWorkoutsDone: extraStats.todayWorkouts,
          todayLoss: extraStats.todayLoss,
          avgExtraWorkoutLoss: extraStats.avgLoss
        };

        // Build data source note — prefer lbs/hr sweat rate for clarity
        const hasNoData = avgWorkoutLoss === null;
        const dataSource = practiceSweatRate !== null
          ? ` Your sweat rate: ${practiceSweatRate.toFixed(1)} lbs/hr.`
          : extraStats.avgLoss !== null
          ? ` Avg ${extraStats.avgLoss.toFixed(1)} lb loss per extra session.`
          : descentData.avgPracticeLoss !== null
          ? ` Avg ${Math.abs(descentData.avgPracticeLoss).toFixed(1)} lb loss per practice.`
          : '';
        const estimateNote = hasNoData
          ? ' Log a workout to get personalized estimates.'
          : `${dataSource}${isLoadingPhase ? ' Estimate updates as you log.' : ''}`;

        // Determine urgency and message based on how much over and days remaining
        const workoutStr = workoutsNeeded !== null
          ? `${workoutsNeeded} extra workout${workoutsNeeded > 1 ? 's' : ''} needed before weigh-in.${estimateNote}`
          : `${projectedOver.toFixed(1)} lbs over.${estimateNote}`;

        // Protocol-aware switch advice
        const isAlreadyExtremeCut = profile.protocol === '1';
        const protocolAdvice = isAlreadyExtremeCut
          ? 'Maximize extra workouts and water cut.'
          : 'Switch to Extreme Cut protocol.';
        const protocolAdviceHigh = isAlreadyExtremeCut
          ? 'Increase workout intensity.'
          : 'Consider switching protocols.';

        if (projectedOver > 4) {
          // 4+ lbs over - critical
          if (daysRemaining < 3) {
            recommendation = {
              ...baseRec,
              extraWorkoutsNeeded: workoutsNeeded ?? 0,
              message: `DANGER: ${projectedOver.toFixed(1)} lbs over with ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left. Consider moving up a weight class.`,
              urgency: 'critical',
              switchProtocol: !isAlreadyExtremeCut
            };
          } else {
            recommendation = {
              ...baseRec,
              extraWorkoutsNeeded: workoutsNeeded ?? 0,
              message: `${workoutStr} ${protocolAdvice}`,
              urgency: 'critical',
              switchProtocol: !isAlreadyExtremeCut
            };
          }
        } else if (projectedOver > 2) {
          // 2-4 lbs over - high urgency
          if (daysRemaining < 3) {
            recommendation = {
              ...baseRec,
              extraWorkoutsNeeded: workoutsNeeded ?? 0,
              message: `${workoutStr} ${protocolAdviceHigh}`,
              urgency: 'high',
              switchProtocol: !isAlreadyExtremeCut
            };
          } else {
            recommendation = {
              ...baseRec,
              extraWorkoutsNeeded: workoutsNeeded ?? 0,
              message: `${workoutStr} ${isAlreadyExtremeCut ? 'Stay the course.' : 'OR switch protocol.'}`,
              urgency: 'high',
              switchProtocol: false
            };
          }
        } else {
          // 0.5-2 lbs over - moderate
          recommendation = {
            ...baseRec,
            extraWorkoutsNeeded: workoutsNeeded ?? 0,
            message: workoutStr,
            urgency: 'moderate',
            switchProtocol: false
          };
        }

        // Adjust message if they have logged extra workouts today
        if (extraStats.todayWorkouts > 0 && workoutsNeeded !== null) {
          const remainingWorkouts = Math.max(0, workoutsNeeded - extraStats.todayWorkouts);
          if (remainingWorkouts === 0) {
            recommendation.message = `Today's workout${extraStats.todayWorkouts > 1 ? 's' : ''} helped (-${extraStats.todayLoss.toFixed(1)} lbs). Still ${projectedOver.toFixed(1)} lbs over - keep cutting.`;
          } else {
            recommendation.message = `${remainingWorkouts} more workout${remainingWorkouts > 1 ? 's' : ''} needed before weigh-in. Today: -${extraStats.todayLoss.toFixed(1)} lbs.`;
          }
          recommendation.extraWorkoutsNeeded = remainingWorkouts;
        }
      }
    }

    // Build contextMessage — a human-readable one-liner for the command bar
    const overClass = currentWeight - profile.targetWeightClass;
    const buildContextMessage = (): string => {
      if (overClass > 0) return `${currentWeight.toFixed(1)} lbs · ${overClass.toFixed(1)} over ${profile.targetWeightClass}`;
      return `${currentWeight.toFixed(1)} lbs · on weight`;
    };
    const contextMessage = buildContextMessage();

    // On water loading days, target already includes +2-4 lb water weight allowance
    // diff <= 0 means at or below the water-adjusted target (on track)
    // diff > 0 means over even the generous water loading allowance
    if (waterLoading) {
      if (diff <= 0) {
        if (projectionWarning) {
          return { status: 'borderline', label: 'CHECK PROJECTION', color: 'text-orange-500', bgColor: 'bg-orange-500/20', contextMessage, projectionWarning, recommendation };
        }
        return { status: 'on-track', label: 'ON TRACK', color: 'text-green-500', bgColor: 'bg-green-500/20', contextMessage };
      }
      // Slightly over water loading target (within 2 lbs) - borderline
      if (diff <= 2) {
        if (projectedToMakeWeight && !projectionWarning) {
          return { status: 'on-track', label: 'ON TRACK', color: 'text-green-500', bgColor: 'bg-green-500/20', contextMessage, waterLoadingNote: `+${diff.toFixed(1)} lbs above target (loading)` };
        }
        return { status: 'borderline', label: 'CLOSE', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', contextMessage, waterLoadingNote: `+${diff.toFixed(1)} lbs above target`, projectionWarning, recommendation };
      }
      // Significantly over - upgrade to borderline if projection shows making weight
      if (projectedToMakeWeight && !projectionWarning) {
        return { status: 'borderline', label: 'CLOSE', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', contextMessage, waterLoadingNote: `+${diff.toFixed(1)} lbs above target (loading)` };
      }
      return { status: 'risk', label: 'AT RISK', color: 'text-destructive', bgColor: 'bg-destructive/20', contextMessage, waterLoadingNote: `+${diff.toFixed(1)} lbs above target`, projectionWarning, recommendation };
    }

    // ── Training phase (6+ days out): wider tolerance ──
    // Being 5-10 lbs over target is EXPECTED during training — the cut hasn't started yet.
    // Walk-around weight is naturally higher. Don't alarm the athlete.
    const daysUntil = getDaysUntilWeighIn();
    const isTrainingPhase = daysUntil > 5;

    if (isTrainingPhase) {
      // During training, compare to walk-around weight (target × 1.07)
      // If within ~3 lbs of walk-around, they're fine
      const walkAroundTarget = profile.targetWeightClass * 1.07;
      const walkAroundDiff = currentWeight - walkAroundTarget;

      if (walkAroundDiff <= 2) {
        // At or near walk-around weight — holding well
        return { status: 'on-track', label: 'HOLDING', color: 'text-green-500', bgColor: 'bg-green-500/20', contextMessage };
      }
      if (walkAroundDiff <= 5) {
        // A bit above walk-around but still manageable with time
        return { status: 'borderline', label: 'MONITOR', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', contextMessage };
      }
      // Well above walk-around even for training — flag it
      return { status: 'risk', label: 'HIGH', color: 'text-orange-500', bgColor: 'bg-orange-500/20', contextMessage, projectionWarning, recommendation };
    }

    // ── Comp week (0-5 days out): original precision logic ──
    // Non water-loading days — factor projection into status level
    if (diff <= 1) {
      // Close to target — downgrade if projection shows missing weight
      if (projectionWarning) {
        return { status: 'borderline', label: 'CHECK PROJECTION', color: 'text-orange-500', bgColor: 'bg-orange-500/20', contextMessage, projectionWarning, recommendation };
      }
      return { status: 'on-track', label: 'ON TRACK', color: 'text-green-500', bgColor: 'bg-green-500/20', contextMessage };
    }
    if (diff <= 3) {
      // Moderately over — upgrade to ON TRACK if projection shows making weight
      if (projectedToMakeWeight && !projectionWarning) {
        return { status: 'on-track', label: 'ON TRACK', color: 'text-green-500', bgColor: 'bg-green-500/20', contextMessage };
      }
      return { status: 'borderline', label: 'CLOSE', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', contextMessage, projectionWarning, recommendation };
    }
    // Significantly over — upgrade to BORDERLINE if projection shows making weight
    if (projectedToMakeWeight && !projectionWarning) {
      return { status: 'borderline', label: 'CLOSE', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', contextMessage };
    }
    return { status: 'risk', label: 'AT RISK', color: 'text-destructive', bgColor: 'bg-destructive/20', contextMessage, projectionWarning, recommendation };
  };

  const getDailyPriority = (): { priority: string; subtext?: string; urgency: 'normal' | 'high' | 'critical'; icon: string; actionType?: 'log-weight' | 'log-workout' | 'check-food' } => {
    const protocol = profile.protocol;
    const daysUntilWeighIn = getDaysUntilWeighIn();
    const statusData = getStatus();

    // Build projection/recommendation subtext — uses recommendation.message which
    // already contains workout count + data source (sweat rate, practice loss, or "log to personalize")
    const buildSubtext = (): string | undefined => {
      if (statusData.projectionWarning && statusData.recommendation) {
        return `${statusData.projectionWarning}. ${statusData.recommendation.message}`;
      }
      if (statusData.projectionWarning) {
        return statusData.projectionWarning;
      }
      if (statusData.waterLoadingNote) {
        return `${statusData.waterLoadingNote} — normal during water loading.`;
      }
      return undefined;
    };

    // SPAR Nutrition protocols (5 = General, 6 = Competition)
    if (protocol === '5' || protocol === '6') {
      const sliceTargets = getSliceTargets();
      const todayStr = format(startOfDay(profile.simulatedDate || new Date()), 'yyyy-MM-dd');
      const tracking = getDailyTracking(todayStr);
      const pLogged = tracking.proteinSlices || 0;
      const cLogged = tracking.carbSlices || 0;
      const vLogged = tracking.vegSlices || 0;
      const totalLogged = pLogged + cLogged + vLogged;
      const totalTarget = sliceTargets.protein + sliceTargets.carb + sliceTargets.veg;

      if (daysUntilWeighIn === 0) {
        return { priority: "COMPETE — rehydrate smart, fuel between matches", subtext: buildSubtext(), urgency: 'high', icon: 'trophy' };
      }
      if (daysUntilWeighIn < 0) {
        return { priority: "RECOVERY — eat clean, hit your slices, rebuild", subtext: buildSubtext(), urgency: 'normal', icon: 'heart' };
      }
      // P6 competition-specific priorities
      if (protocol === '6') {
        if (daysUntilWeighIn === 1) {
          return { priority: "WATER CUT — minimal portions, sip only", subtext: buildSubtext(), urgency: 'critical', icon: 'scale', actionType: 'log-weight' };
        }
        if (daysUntilWeighIn === 2) {
          return { priority: "WATER CUT — light portions, restrict water", subtext: buildSubtext(), urgency: 'high', icon: 'droplet' };
        }
        if (daysUntilWeighIn <= 5) {
          const note = sliceTargets.competitionReason ? ` (${sliceTargets.competitionReason})` : '';
          if (totalLogged === 0) {
            return { priority: `WATER LOAD — hit ${totalTarget} slices${note}`, subtext: 'Peak hydration today. Tap Fuel to start tracking.', urgency: 'normal', icon: 'droplet', actionType: 'check-food' };
          }
        }
      }
      if (totalLogged === 0) {
        return { priority: `Hit your ${totalTarget} slices today — ${sliceTargets.protein}P / ${sliceTargets.carb}C / ${sliceTargets.veg}V`, subtext: 'No slices logged yet. Tap Fuel to start tracking.', urgency: 'normal', icon: 'apple', actionType: 'check-food' };
      }
      if (totalLogged >= totalTarget) {
        return { priority: "All slices hit! Train hard, stay hydrated.", subtext: `${pLogged}P / ${cLogged}C / ${vLogged}V — target reached`, urgency: 'normal', icon: 'check' };
      }
      const remaining = totalTarget - totalLogged;
      return { priority: `${remaining} slices left — ${Math.max(0, sliceTargets.protein - pLogged)}P / ${Math.max(0, sliceTargets.carb - cLogged)}C / ${Math.max(0, sliceTargets.veg - vLogged)}V`, subtext: buildSubtext(), urgency: 'normal', icon: 'apple', actionType: 'check-food' };
    }

    // Protocol 4 (Gain Phase) - different priorities
    if (protocol === '4') {
      if (daysUntilWeighIn < 0) {
        return { priority: "FULL RECOVERY - 1.6g/lb protein, high carbs, repair muscle tissue", subtext: buildSubtext(), urgency: 'high', icon: 'bed' };
      }
      if (daysUntilWeighIn === 0) {
        return { priority: "COMPETE - fast carbs between matches, minimal protein until done", subtext: buildSubtext(), urgency: 'high', icon: 'trophy' };
      }
      if (daysUntilWeighIn === 1) {
        return { priority: "Light session - competition prep if needed", subtext: buildSubtext(), urgency: 'normal', icon: 'target' };
      }
      // 2+ days out - normal training
      return { priority: "Train hard - fuel for muscle growth", subtext: buildSubtext(), urgency: 'normal', icon: 'dumbbell' };
    }

    // Protocols 1, 2, 3 - use days-until-weigh-in for priorities
    if (daysUntilWeighIn < 0) {
      return { priority: "RECOVERY DAY - protein refeed, rebuild glycogen stores", subtext: buildSubtext(), urgency: 'normal', icon: 'heart' };
    }
    if (daysUntilWeighIn === 0) {
      return { priority: "COMPETE - rehydrate smart, fuel between matches", subtext: buildSubtext(), urgency: 'high', icon: 'trophy' };
    }
    if (daysUntilWeighIn === 1) {
      return { priority: "SIP ONLY - monitor weight hourly. Final push to make weight.", subtext: buildSubtext(), urgency: 'critical', icon: 'scale', actionType: 'log-weight' };
    }
    if (daysUntilWeighIn === 2) {
      return { priority: "ZERO FIBER - check every bite. Water weight dropping.", subtext: buildSubtext(), urgency: 'high', icon: 'alert', actionType: 'check-food' };
    }
    if (daysUntilWeighIn === 3) {
      return { priority: "Peak water day - hit your full water target", subtext: buildSubtext(), urgency: 'normal', icon: 'droplets' };
    }
    if (daysUntilWeighIn === 4) {
      return { priority: "Continue loading - fructose heavy, peak water intake tomorrow", subtext: buildSubtext(), urgency: 'normal', icon: 'droplets' };
    }
    if (daysUntilWeighIn === 5) {
      return { priority: "Fill the tank - high fructose carbs, max hydration starts", subtext: buildSubtext(), urgency: 'normal', icon: 'droplets' };
    }
    // 6+ days out - protocol-specific training guidance
    if (protocol === '1') {
      return { priority: `${daysUntilWeighIn} days out — fructose-only fueling, zero protein windows`, subtext: buildSubtext(), urgency: 'normal', icon: 'flame' };
    }
    if (protocol === '2') {
      return { priority: `${daysUntilWeighIn} days out — follow macro targets, water loading starts at 5 days`, subtext: buildSubtext(), urgency: 'normal', icon: 'droplets' };
    }
    if (protocol === '3') {
      return { priority: `${daysUntilWeighIn} days out — train hard, eat balanced`, subtext: buildSubtext(), urgency: 'normal', icon: 'check' };
    }
    return { priority: `${daysUntilWeighIn} days out — train hard, eat normally`, subtext: buildSubtext(), urgency: 'normal', icon: 'check' };
  };

  const weekDescentCacheRef = useRef<{ key: string; value: any }>({ key: '', value: null });
  const getWeekDescentData = () => {
    const today = startOfDay(profile.simulatedDate || new Date());
    // Cache key: profile fields + logs length/latest date (cheap proxy for log changes)
    const latestLog = logs.length > 0 ? logs[logs.length - 1].date.getTime() : 0;
    const wdCacheKey = `${profile.weighInDate?.getTime?.() || ''}|${profile.targetWeightClass}|${profile.currentWeight}|${profile.protocol}|${profile.simulatedDate?.getTime?.() || ''}|${profile.trackPracticeWeighIns}|${logs.length}|${latestLog}|${daysUntilWeighInMemo}|${dailyTracking.length}`;
    if (weekDescentCacheRef.current.key === wdCacheKey && weekDescentCacheRef.current.value) {
      return weekDescentCacheRef.current.value;
    }
    const targetWeight = profile.targetWeightClass;
    const daysRemaining = Math.max(0, differenceInDays(startOfDay(profile.weighInDate), today));

    const morningWeights: Array<{ day: string; weight: number; date: Date }> = [];

    // ═══ CYCLE START — anchored to weigh-in date, not day of week ═══
    // The cycle starts the day after the last competition, or N days before weigh-in.
    // No Monday dependency — competitions can be on any day.
    const todayHasWeighIn = logs.some(l => {
      const ld = new Date(l.date);
      return l.type === 'weigh-in' &&
        ld.getFullYear() === today.getFullYear() &&
        ld.getMonth() === today.getMonth() &&
        ld.getDate() === today.getDate();
    });
    const effectiveWeighInDate = todayHasWeighIn ? new Date(today) : new Date(profile.weighInDate);

    let cycleStart: Date;
    // Find the most recent weigh-in BEFORE today to mark end of previous cycle
    const lastCompWeighIn = [...logs]
      .filter(l => l.type === 'weigh-in' && startOfDay(new Date(l.date)).getTime() < today.getTime())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (lastCompWeighIn) {
      // Start from the day after the last competition
      cycleStart = new Date(startOfDay(new Date(lastCompWeighIn.date)));
      cycleStart.setDate(cycleStart.getDate() + 1);
      cycleStart.setHours(0, 0, 0, 0);
    } else {
      // No previous competition — use weigh-in date minus 6 days or today minus 6 days
      const wiMinus6 = new Date(startOfDay(effectiveWeighInDate));
      wiMinus6.setDate(wiMinus6.getDate() - 6);
      const todayMinus6 = new Date(today);
      todayMinus6.setDate(today.getDate() - 6);
      cycleStart = new Date(Math.max(wiMinus6.getTime(), todayMinus6.getTime()));
      cycleStart.setHours(0, 0, 0, 0);
    }

    // Clamp: never look back more than 13 days (avoid stale data contamination)
    const maxLookback = new Date(today);
    maxLookback.setDate(today.getDate() - 13);
    maxLookback.setHours(0, 0, 0, 0);
    if (cycleStart.getTime() < maxLookback.getTime()) {
      cycleStart = maxLookback;
    }
    // Must be <= today
    if (cycleStart.getTime() > today.getTime()) {
      cycleStart = new Date(today);
    }

    // Collect morning weights from cycle start through today
    const cycleDays = differenceInDays(today, cycleStart) + 1;
    const weighInDateStart = startOfDay(effectiveWeighInDate);
    for (let i = 0; i < cycleDays; i++) {
      const checkDate = new Date(cycleStart);
      checkDate.setDate(cycleStart.getDate() + i);
      if (checkDate > today) break;

      const morningLog = logs.find(log => {
        const logDate = new Date(log.date);
        return (log.type === 'morning' || log.type === 'weigh-in') &&
          logDate.getFullYear() === checkDate.getFullYear() &&
          logDate.getMonth() === checkDate.getMonth() &&
          logDate.getDate() === checkDate.getDate();
      });

      if (morningLog) {
        const daysOut = differenceInDays(weighInDateStart, checkDate);
        morningWeights.push({
          day: daysOut > 0 ? `${daysOut}d` : daysOut === 0 ? 'WI' : 'R',
          weight: morningLog.weight,
          date: new Date(checkDate)
        });
      }
    }

    const startWeight = morningWeights.length > 0 ? morningWeights[0].weight : null;
    const latestMorningWeight = morningWeights.length > 0 ? morningWeights[morningWeights.length - 1].weight : null;

    // For projections, use the most recent weigh-in of ANY type (morning, check-in, post-practice, etc.)
    // This gives real-time projection updates whenever they step on the scale
    const todayStr = format(today, 'yyyy-MM-dd');
    const allTodayLogs = logs.filter(l => {
      const logDate = new Date(l.date);
      return format(startOfDay(logDate), 'yyyy-MM-dd') === todayStr;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Check if this day has an official weigh-in log (competition day indicator)
    const officialWeighInLog = allTodayLogs.find(l => l.type === 'weigh-in');
    const isCompDay = daysRemaining === 0 || !!officialWeighInLog;

    // On competition day, use the official weigh-in weight (not BED rehydration weight)
    // During training phase (6+ days out), use morning weight — before-bed weight is
    // inflated from food/water and isn't representative of actual progress.
    // During comp week, use latest weight for real-time projection updates.
    const mostRecentWeighIn = allTodayLogs.length > 0 ? allTodayLogs[0].weight : latestMorningWeight;
    const todayMorningLog = allTodayLogs.find(l => l.type === 'morning');
    const todayMorningWeight = todayMorningLog?.weight ?? null;
    const isTrainingPhaseForWeight = daysRemaining > 5;
    const currentWeight = (isCompDay && officialWeighInLog)
      ? officialWeighInLog.weight
      : (isTrainingPhaseForWeight && todayMorningWeight !== null)
        ? todayMorningWeight
        : mostRecentWeighIn;

    // Total lost: start weight to current (most recent weigh-in of any type)
    const totalLost = startWeight && currentWeight ? startWeight - currentWeight : null;

    // Net daily average (morning-to-morning, includes food/water intake)
    let dailyAvgLoss: number | null = null;
    if (morningWeights.length >= 2 && startWeight && latestMorningWeight) {
      const firstDate = morningWeights[0].date;
      const lastDate = morningWeights[morningWeights.length - 1].date;
      const actualDaysBetween = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
      dailyAvgLoss = (startWeight - latestMorningWeight) / actualDaysBetween;
    }

    // Calculate gross loss capacity from drift and practice metrics
    // Only use THIS cycle's data. Previous cycles may reflect a completely different
    // body state (dehydrated, bad cut, different approach). Each cycle is its own context.
    // Early in the cycle with few data points, we fall back to historical data for display.
    const sortedLogs = [...logs]
      .filter(l => l.date.getTime() >= cycleStart.getTime())
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    // === Phase-aware overnight drift with EMA recency weighting ===
    // Separate loading-day drifts (3+ days out) from cut-day drifts (1-2 days out)
    // because athletes lose significantly less overnight as they get closer to weight class.
    // EMA (alpha=0.4) gives ~40% weight to most recent, ~24% to next, ~14% to next, etc.

    const loadingDrifts: number[] = []; // 3+ days out
    const cutDrifts: number[] = [];     // 1-2 days out
    const allDrifts: number[] = [];     // all drifts for overall average
    const driftRates: number[] = [];    // lbs/hr drift rates (when sleep hours available)

    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const current = sortedLogs[i]; // morning log
      const prev = sortedLogs[i + 1]; // previous night's log
      if (current.type === 'morning' && (prev.type === 'post-practice' || prev.type === 'before-bed')) {
        const hoursDiff = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 4 && hoursDiff < 16) {
          const drift = prev.weight - current.weight;
          allDrifts.push(drift);

          // Calculate overnight drift rate (lbs/hr)
          // Only use before-bed → morning pairs where we can isolate the overnight period.
          // IMPORTANT: Use the timestamp gap (hoursDiff) instead of reported sleepHours.
          // sleepHours only captures actual sleep, but the weigh-in gap includes awake time
          // before falling asleep. Using sleepHours inflates the rate because the numerator
          // (total weight lost overnight) includes awake drift that the denominator misses.
          // hoursDiff = actual elapsed time between before-bed and morning weigh-ins.
          if (drift > 0 && prev.type === 'before-bed') {
            if (hoursDiff > 0) {
              const lbsPerHr = drift / hoursDiff;
              driftRates.push(lbsPerHr);
            }
          }

          // Classify by phase: which day was the "night" (prev log) on?
          const prevDate = startOfDay(new Date(prev.date));
          const daysOut = differenceInDays(startOfDay(profile.weighInDate), prevDate);
          if (daysOut >= 3) {
            loadingDrifts.push(drift);
          } else if (daysOut >= 1) {
            cutDrifts.push(drift);
          }
        }
      }
    }

    // Practice losses (sweat rate) with EMA
    const practiceLosses: number[] = [];
    const practiceSweatRates: number[] = [];
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const post = sortedLogs[i];
      const pre = sortedLogs[i + 1];
      if (post.type === 'post-practice' && pre.type === 'pre-practice') {
        const hoursDiff = (post.date.getTime() - pre.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff < 6) {
          const loss = pre.weight - post.weight;
          practiceLosses.push(loss);
          // Calculate sweat rate (lbs/hr): use explicit duration if available, otherwise estimate from timestamps
          // Minimum 15 min (0.25 hr) for timestamp fallback to avoid division by near-zero
          if (loss > 0) {
            const practiceHrs = post.duration && post.duration > 0
              ? post.duration / 60
              : (hoursDiff >= 0.25 ? hoursDiff : null); // fallback with minimum threshold
            if (practiceHrs !== null && practiceHrs > 0) {
              const ozPerHr = loss / practiceHrs;
              // Sanity check: reject rates above 6 lbs/hr (physiologically impossible)
              if (ozPerHr <= 6) {
                practiceSweatRates.push(ozPerHr);
              }
            }
          }
        }
      }
    }

    // EMA-weighted averages (recency-biased)
    const avgOvernightDrift = computeEMA(allDrifts);
    const avgLoadingDrift = computeEMA(loadingDrifts);
    const avgCutDrift = computeEMA(cutDrifts);
    const avgPracticeLoss = computeEMA(practiceLosses);
    const avgSweatRateOzPerHr = computeEMA(practiceSweatRates);
    const avgDriftRateOzPerHr = computeEMA(driftRates);

    // === EMA averages for sleep & practice hours ===
    // These are used for daytime BMR drift, projection breakdown, and displayed as stats.
    const sleepHoursData: number[] = [];
    for (const log of sortedLogs) {
      if (log.type === 'morning' && log.sleepHours && log.sleepHours > 0) {
        sleepHoursData.push(log.sleepHours);
        if (sleepHoursData.length >= 5) break;
      }
    }
    const emaSleepHours = sleepHoursData.length > 0 ? (computeEMA(sleepHoursData) || 8) : 8;

    const practiceDurations: number[] = [];
    for (const log of sortedLogs) {
      if (log.type === 'post-practice' && log.duration && log.duration > 0) {
        practiceDurations.push(log.duration / 60); // convert min to hours
        if (practiceDurations.length >= 5) break;
      }
    }
    const emaPracticeHours = practiceDurations.length > 0 ? (computeEMA(practiceDurations) || 2) : 2;

    // === Daytime BMR drift for cut days ===
    // On cut days, athletes lose weight through BMR even while awake and not practicing.
    // This is separate from overnight drift (already tracked) and practice sweat (already tracked).
    // awake BMR hours = 24 - sleep - practice - extra workouts
    // We use the overnight drift rate (lbs/hr) as a proxy for daytime metabolic rate.
    //
    // For TODAY: use actual logged sleep hours and actual practice duration (if logged).
    // For FUTURE days: use EMA averages since those haven't happened yet.
    let daytimeBmrDrift = 0;       // today's drift (uses actual data where available)
    let futureDaytimeBmrDrift = 0; // future cut day drift (uses EMA averages)
    if (avgDriftRateOzPerHr !== null && avgDriftRateOzPerHr > 0) {
      // Future cut day drift (all EMA, no extras since we can't predict those)
      const futureAwakeHours = Math.max(0, 24 - emaSleepHours - emaPracticeHours);
      futureDaytimeBmrDrift = futureAwakeHours * avgDriftRateOzPerHr;

      // --- Today's drift: use actual logged data where available ---
      // Sleep: use today's morning log sleepHours if available, else EMA
      const todayMorningLog = allTodayLogs.find(l => l.type === 'morning' && l.sleepHours && l.sleepHours > 0);
      const todaySleepHours = todayMorningLog ? todayMorningLog.sleepHours! : emaSleepHours;

      // Practice: use today's post-practice duration if already logged, else EMA
      const todayPracticeLog = allTodayLogs.find(l => l.type === 'post-practice' && l.duration && l.duration > 0);
      const todayPracticeHours = todayPracticeLog ? todayPracticeLog.duration! / 60 : emaPracticeHours;

      // Extra workouts: always actual from today's logs
      const todayExtraMinutes = allTodayLogs
        .filter(l => l.type === 'extra-after' && l.duration && l.duration > 0)
        .reduce((sum, l) => sum + (l.duration || 0), 0);
      const todayExtraHours = todayExtraMinutes / 60;

      // Today's awake non-active hours
      const todayAwakeHours = Math.max(0, 24 - todaySleepHours - todayPracticeHours - todayExtraHours);
      daytimeBmrDrift = todayAwakeHours * avgDriftRateOzPerHr;
    }

    // Gross daily loss capacity = overnight drift + practice loss
    // Now phase-aware: loading days use loading drift, cut days use cut drift
    // Use absolute values since these represent weight LOST (always positive capacity)
    let grossDailyLoss: number | null = null;
    if (avgOvernightDrift !== null) {
      grossDailyLoss = Math.abs(avgOvernightDrift) + Math.abs(avgPracticeLoss || 0);
    }
    // Phase-specific gross capacity for more accurate projections
    const loadingDrift = avgLoadingDrift !== null ? Math.abs(avgLoadingDrift) : (avgOvernightDrift !== null ? Math.abs(avgOvernightDrift) : 0);
    const cutDrift = avgCutDrift !== null ? Math.abs(avgCutDrift) : (avgOvernightDrift !== null ? Math.abs(avgOvernightDrift) * 0.6 : 0);
    const practice = avgPracticeLoss !== null ? Math.abs(avgPracticeLoss) : 0;

    // Hybrid projection: uses different strategies for loading vs cut days.
    //
    // LOADING DAYS (3+ days out): Project from latest MORNING weight using net daily loss.
    //   Mid-day weights are misleadingly low because the athlete eats/drinks back after practice.
    //   Post-practice weight of 142 doesn't mean tomorrow's morning will be 142 - drift.
    //   Tomorrow morning = today's morning - net daily loss (accounts for eating back).
    //
    // CUT DAYS (1-2 days out): Project from most recent weigh-in using remaining losses.
    //   The athlete is NOT eating/drinking back, so every loss sticks.
    //   Post-practice 142 → overnight drift → tomorrow morning ≈ 142 - 1.8 = 140.2
    //   This is the real-time approach — updates with every weigh-in.
    let projectedSaturday: number | null = null;
    // Track individual components of today's remaining loss for breakdown display
    let todayRemainingComponents: { sleep: number; practice: number } | null = null;

    if (daysRemaining > 0) {
      const hasDriftData = avgOvernightDrift !== null && Math.abs(avgOvernightDrift!) > 0;
      const hasNetData = dailyAvgLoss !== null && dailyAvgLoss > 0;
      const hasGrossData = grossDailyLoss !== null && grossDailyLoss > 0;
      const isLoadingToday = daysRemaining >= 3;

      // Phase-aware drift: use the right drift for today's phase
      const todayDrift = isLoadingToday ? loadingDrift : cutDrift;

      if (hasDriftData || hasNetData) {
        let projected: number;

        // Step 1: Handle today based on phase
        if (isLoadingToday && latestMorningWeight) {
          // LOADING DAY: start from morning weight, apply net daily loss for today
          // This ignores mid-day dips because athlete eats/drinks back
          projected = latestMorningWeight;
          const todayLoss = hasNetData ? dailyAvgLoss! : (hasGrossData ? grossDailyLoss! * 0.2 : 0);
          projected -= todayLoss;
        } else if (currentWeight) {
          // CUT DAY (or no morning weight): start from most recent weigh-in
          // Apply only remaining losses based on what's already happened
          // Projection uses sleep drift + practice only (conservative, measurable).
          // Daytime BMR drift is shown as informational but NOT included in projections
          // because the overnight drift rate is too noisy to reliably extrapolate across 16+ awake hours.
          projected = currentWeight;
          const lastLogType = allTodayLogs.length > 0 ? allTodayLogs[0].type : null;
          let todayRemainingLoss = 0;
          let remainingSleep = 0;
          let remainingPractice = 0;

          if (lastLogType) {
            if (lastLogType === 'morning' || lastLogType === 'weigh-in' || lastLogType === 'pre-practice') {
              remainingSleep = todayDrift;
              remainingPractice = practice;
              todayRemainingLoss = practice + todayDrift;
            } else if (lastLogType === 'post-practice' || lastLogType === 'before-bed') {
              remainingSleep = todayDrift;
              remainingPractice = 0;
              todayRemainingLoss = todayDrift;
            } else if (lastLogType === 'extra-after') {
              // Extra workout done — check if regular practice already happened today
              const hasPracticeLog = allTodayLogs.some(l => l.type === 'post-practice');
              remainingSleep = todayDrift;
              remainingPractice = hasPracticeLog ? 0 : practice;
              todayRemainingLoss = hasPracticeLog ? todayDrift : (practice + todayDrift);
            } else if (lastLogType === 'check-in' || lastLogType === 'extra-before') {
              const hasPracticeLog = allTodayLogs.some(l => l.type === 'post-practice');
              remainingSleep = todayDrift;
              remainingPractice = hasPracticeLog ? 0 : practice;
              todayRemainingLoss = hasPracticeLog ? todayDrift : (practice + todayDrift);
            }
          } else {
            remainingSleep = todayDrift;
            remainingPractice = practice;
            todayRemainingLoss = practice + todayDrift;
          }
          todayRemainingComponents = { sleep: remainingSleep, practice: remainingPractice };
          projected -= todayRemainingLoss;
        } else if (latestMorningWeight) {
          projected = latestMorningWeight;
        } else {
          // No weight data at all — can't project
          projected = 0;
        }

        // Only calculate future days and set projection if we have a real starting weight
        if (projected > 0) {
          // Step 2: Future full days — use phase-specific drift for each day
          for (let d = daysRemaining - 1; d > 0; d--) {
            if (d >= 3) {
              // Future loading day: net morning-to-morning loss
              const loadingLoss = hasNetData ? dailyAvgLoss! : (hasGrossData ? grossDailyLoss! * 0.2 : 0);
              projected -= loadingLoss;
            } else {
              // Future cut day: drift + practice only (conservative — daytime BMR excluded from projections)
              const cutDayGross = cutDrift + practice;
              if (cutDayGross > 0) {
                projected -= cutDayGross;
              } else if (hasGrossData) {
                projected -= grossDailyLoss!;
              } else if (hasNetData) {
                projected -= dailyAvgLoss! * 2.5;
              }
            }
          }

          projectedSaturday = projected;
        }
      } else if (latestMorningWeight) {
        // No trend data yet - use latest morning weight as baseline
        projectedSaturday = latestMorningWeight;
      } else if (currentWeight) {
        projectedSaturday = currentWeight;
      }
    }

    let pace: 'ahead' | 'on-track' | 'behind' | null = null;
    if (currentWeight && targetWeight) {
      const daysUntil = getDaysUntilWeighIn();
      const isTraining = daysUntil > 5;

      if (isTraining) {
        // Training phase: compare to walk-around weight, not daily target
        // Being 5-10 lbs above target weight class is expected
        const walkAround = profile.targetWeightClass * 1.07;
        const walkDiff = currentWeight - walkAround;

        if (walkDiff <= 0) pace = 'ahead';
        else if (walkDiff <= 3) pace = 'on-track';
        else pace = 'behind';  // Only "behind" if well above walk-around
      } else {
        // Comp week: precise tracking against daily target
        // calculateTarget() already includes water loading for protocols 1 & 2
        const effectiveTarget = calculateTarget();
        const diff = currentWeight - effectiveTarget;

        // Small tolerance for measurement variance (1.5 lbs)
        const tolerance = 1.5;

        if (diff <= -1) pace = 'ahead';
        else if (diff <= tolerance) pace = 'on-track';
        else pace = 'behind';
      }
    }

    // ═══ TREND ARROWS: compare recent 2 vs previous 2 ═══
    const computeTrend = (arr: number[]): 'up' | 'down' | 'stable' => {
      if (arr.length < 3) return 'stable';
      // arr is newest-first; recent = avg of [0,1], previous = avg of [2,3]
      const recent = (arr[0] + arr[1]) / 2;
      const prev = arr.length >= 4 ? (arr[2] + arr[3]) / 2 : arr[2];
      const pctChange = (recent - prev) / Math.max(Math.abs(prev), 0.01);
      if (pctChange > 0.08) return 'up';   // >8% increase = trending up (more loss)
      if (pctChange < -0.08) return 'down'; // >8% decrease = trending down (less loss)
      return 'stable';
    };
    const trends = {
      drift: computeTrend(allDrifts),
      practice: computeTrend(practiceLosses),
      driftRate: computeTrend(driftRates),
      sweatRate: computeTrend(practiceSweatRates),
    };

    // ═══ CONFIDENCE: based on data point counts ═══
    const driftSamples = allDrifts.length;
    const practiceSamples = practiceLosses.length;
    const minSamples = Math.min(driftSamples, practiceSamples);
    const confidenceLevel: 'high' | 'medium' | 'low' | 'none' =
      minSamples >= 5 ? 'high' : minSamples >= 3 ? 'medium' : minSamples >= 1 ? 'low' : 'none';
    const confidence = { driftSamples, practiceSamples, level: confidenceLevel };

    // ═══ MONTE CARLO MAKE-WEIGHT PROBABILITY ═══
    // Runs 2000 simulations using actual variance in drift & practice data.
    // Uses the SAME phase-specific means as the deterministic projection.
    // When the projection says the athlete is BEHIND, the Monte Carlo includes the
    // recommended extra workout (using sweat rate × time needed) so the probability
    // answers "how likely to make weight IF you do the recommended work?"
    // This prevents showing 0% next to "38 min of extra work needed" — contradictory UX.
    let makeWeightProb: { probability: number; worstCase: number; median: number; includesExtraWork: boolean } | null = null;
    if (projectedSaturday !== null && currentWeight && daysRemaining > 0 && allDrifts.length >= 1) {
      // EMA-weighted standard deviation: recent data points contribute more to variance,
      // matching how the mean is calculated. Alpha=0.4 same as computeEMA.
      const emaStdDev = (arr: number[], emaMean: number): number => {
        if (arr.length < 2) return 0;
        const alpha = 0.4;
        let weightedSum = 0;
        let totalWeight = 0;
        for (let i = 0; i < arr.length; i++) {
          const w = Math.pow(1 - alpha, i); // newest first: i=0 gets weight 1, i=1 gets 0.6, etc.
          weightedSum += w * (arr[i] - emaMean) ** 2;
          totalWeight += w;
        }
        return Math.sqrt(weightedSum / totalWeight);
      };
      // Cap std dev at a fraction of the mean to keep variance realistic.
      // 25% cap means a 1.3 lb mean drift has max std of 0.325 —
      // so 95% of draws fall in ~0.65 to ~1.95 lbs (reasonable night-to-night range).
      const cappedStd = (rawStd: number, mean: number, maxFrac = 0.25): number => {
        const cap = Math.abs(mean) * maxFrac;
        return Math.min(rawStd, Math.max(cap, 0.05));
      };
      // Seeded PRNG (mulberry32) — deterministic results for same inputs, no flickering
      let seed = Math.round(
        (currentWeight || 0) * 1000 +
        (targetWeight || 0) * 100 +
        daysRemaining * 10 +
        allDrifts.length +
        practiceLosses.length
      );
      const seededRandom = (): number => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
      // Box-Muller transform for normal random (using seeded PRNG)
      const randn = (): number => {
        let u = 0, v = 0;
        while (u === 0) u = seededRandom();
        while (v === 0) v = seededRandom();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      };

      // Phase-specific means (matching deterministic projection)
      // When we have <2 phase-specific samples, use 20% of the mean as default std dev
      // instead of falling back to allDrifts — allDrifts mixes loading + cut phases
      // and the wildly different values inflate variance unrealistically.
      const cutDriftMean = cutDrift;
      const cutDriftStd = cappedStd(
        cutDrifts.length >= 2 ? emaStdDev(cutDrifts, cutDriftMean) : cutDriftMean * 0.2,
        cutDriftMean
      );
      const loadDriftMean = loadingDrift;
      const loadDriftStd = cappedStd(
        loadingDrifts.length >= 2 ? emaStdDev(loadingDrifts, loadDriftMean) : loadDriftMean * 0.2,
        loadDriftMean
      );
      const practiceMean = practice;
      const practiceStd = cappedStd(
        practiceLosses.length >= 2 ? emaStdDev(practiceLosses, practiceMean) : 0,
        practiceMean
      );
      const netDailyMean = dailyAvgLoss || 0;

      // Simulate a loss value: normal distribution around the mean.
      // Only floor at 0 — you can't gain weight from sleeping or working out.
      // The capped std dev (25% of mean) already prevents wild draws.
      // No asymmetric floor: draws below the mean are just as valid as draws above.
      const simLoss = (mean: number, std: number): number => {
        const draw = mean + randn() * std;
        return Math.max(0, draw);
      };

      const SIMS = 2000;
      const results: number[] = [];
      const isLoadingToday = daysRemaining >= 3;

      // If the deterministic projection says they're behind, include the recommended
      // extra workout in the simulation. No buffers — exact gap coverage.
      // The Monte Carlo gives the honest probability of making weight with the plan.
      const sweatRate = avgSweatRateOzPerHr; // lbs/hr (name is legacy)
      let extraWorkoutMean = 0;
      let extraWorkoutStd = 0;
      if (projectedSaturday > targetWeight && sweatRate && sweatRate > 0) {
        const gap = projectedSaturday - targetWeight;
        const minutesNeeded = Math.round((gap / sweatRate) * 60);
        const cappedMinutes = Math.min(minutesNeeded, 60);
        extraWorkoutMean = sweatRate * (cappedMinutes / 60);
        extraWorkoutStd = cappedStd(extraWorkoutMean * 0.15, extraWorkoutMean);
      }

      for (let s = 0; s < SIMS; s++) {
        let w: number;

        // Step 1: Today — use same remaining-component logic as projection
        if (isLoadingToday && latestMorningWeight) {
          w = latestMorningWeight;
          w -= netDailyMean > 0 ? simLoss(netDailyMean, loadDriftStd) : 0;
        } else if (currentWeight && todayRemainingComponents) {
          w = currentWeight;
          if (todayRemainingComponents.sleep > 0) {
            w -= simLoss(todayRemainingComponents.sleep, cutDriftStd);
          }
          if (todayRemainingComponents.practice > 0) {
            w -= simLoss(todayRemainingComponents.practice, practiceStd);
          }
        } else if (currentWeight) {
          w = currentWeight;
        } else {
          w = latestMorningWeight || 0;
        }

        // Step 1b: Extra workout — included when projection says behind
        if (extraWorkoutMean > 0) {
          w -= simLoss(extraWorkoutMean, extraWorkoutStd);
        }

        // Step 2: Future full days
        for (let d = daysRemaining - 1; d > 0; d--) {
          if (d >= 3) {
            w -= netDailyMean > 0
              ? simLoss(netDailyMean, loadDriftStd)
              : simLoss(loadDriftMean * 0.2, loadDriftStd * 0.3);
          } else {
            w -= simLoss(cutDriftMean, cutDriftStd);
            w -= simLoss(practiceMean, practiceStd);
          }
        }
        results.push(w);
      }

      results.sort((a, b) => a - b);
      const madeWeight = results.filter(r => r <= targetWeight).length;
      let rawProb = Math.round((madeWeight / SIMS) * 100);

      // No artificial floors — let the Monte Carlo speak honestly.
      // The simulation already uses EMA-weighted means and capped variance,
      // so the probability reflects the real data.

      makeWeightProb = {
        probability: rawProb,
        worstCase: results[Math.floor(SIMS * 0.90)],
        median: results[Math.floor(SIMS * 0.5)],
        includesExtraWork: extraWorkoutMean > 0,
      };
    }

    // ═══ TODAY'S PROGRESS ═══
    let todayProgress: { lostSoFar: number; expectedTotal: number; pctComplete: number } | null = null;
    if (allTodayLogs.length > 0 && latestMorningWeight) {
      const morningLog = allTodayLogs.find(l => l.type === 'morning' || l.type === 'weigh-in');
      const morningW = morningLog?.weight || latestMorningWeight;
      const latestW = allTodayLogs[0].weight;
      const lostSoFar = Math.max(0, morningW - latestW);
      // Expected total for today = drift + practice (if cut day) or net daily (if loading)
      const isLoadingToday = daysRemaining >= 3;
      const expectedTotal = isLoadingToday
        ? (dailyAvgLoss || 0)
        : ((avgOvernightDrift || 0) + (avgPracticeLoss || 0));
      const pctComplete = expectedTotal > 0 ? Math.min(100, Math.round((lostSoFar / expectedTotal) * 100)) : 0;
      todayProgress = { lostSoFar, expectedTotal, pctComplete };
    }

    // ═══ LOGGING STREAK ═══
    let loggingStreak = 0;
    {
      const todayDate = startOfDay(profile.simulatedDate || new Date());
      for (let d = 0; d < 60; d++) { // check up to 60 days back
        const checkDate = new Date(todayDate);
        checkDate.setDate(todayDate.getDate() - d);
        const hasLog = logs.some(l => {
          const ld = startOfDay(new Date(l.date));
          return ld.getTime() === checkDate.getTime();
        });
        if (hasLog) loggingStreak++;
        else break;
      }
    }
    const isCompetitionDayForCore = daysRemaining === 0 || !!officialWeighInLog;
    // Determine if practice weigh-ins should count today
    const todayTrack = getDailyTracking(todayStr);
    const isRestDay = todayTrack.noPractice ?? false;
    const isSpar = profile.protocol === '5' || profile.protocol === '6';
    const hasPracticeLogs = allTodayLogs.some(l => l.type === 'pre-practice' || l.type === 'post-practice');
    const shouldCountPractice = isSpar
      ? (profile.trackPracticeWeighIns && !isRestDay) || hasPracticeLogs
      : (!isRestDay || hasPracticeLogs);
    const todayCoreTypes = isCompetitionDayForCore
      ? ['morning', 'weigh-in', 'before-bed']   // comp day: AM, Official, BED
      : shouldCountPractice
        ? ['morning', 'pre-practice', 'post-practice', 'before-bed']  // practice day: 4
        : ['morning', 'before-bed'];  // rest day or SPAR without practice tracking: 2
    const todayCoreLogged = todayCoreTypes
      .filter(t => allTodayLogs.some(l => l.type === t || (t === 'morning' && l.type === 'weigh-in'))).length;
    const todayCoreTotal = todayCoreTypes.length;

    // ═══ WEEK-OVER-WEEK COMPARISON ═══
    let weekOverWeek: { thisWeekAvgDrift: number | null; lastWeekAvgDrift: number | null; thisWeekAvgPractice: number | null; lastWeekAvgPractice: number | null } | null = null;
    {
      const todayDate = startOfDay(profile.simulatedDate || new Date());
      const dayOfWeek = todayDate.getDay(); // 0=Sun
      const thisWeekStart = new Date(todayDate);
      thisWeekStart.setDate(todayDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // Monday
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(thisWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(thisWeekStart);

      const isInRange = (date: Date, start: Date, end: Date) => {
        const d = startOfDay(new Date(date));
        return d >= start && d < end;
      };

      // Split drifts by week (use the morning log date as the reference)
      const thisWeekDrifts: number[] = [];
      const lastWeekDrifts: number[] = [];
      const thisWeekPractice: number[] = [];
      const lastWeekPractice: number[] = [];

      for (let i = 0; i < sortedLogs.length - 1; i++) {
        const current = sortedLogs[i];
        const prev = sortedLogs[i + 1];
        // Overnight drift
        if (current.type === 'morning' && (prev.type === 'post-practice' || prev.type === 'before-bed')) {
          const hoursDiff = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
          if (hoursDiff > 4 && hoursDiff < 16) {
            const drift = prev.weight - current.weight;
            if (isInRange(current.date, thisWeekStart, new Date(todayDate.getTime() + 86400000))) {
              thisWeekDrifts.push(drift);
            } else if (isInRange(current.date, lastWeekStart, lastWeekEnd)) {
              lastWeekDrifts.push(drift);
            }
          }
        }
        // Practice loss
        if (current.type === 'post-practice' && prev.type === 'pre-practice') {
          const hoursDiff = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
          if (hoursDiff < 6) {
            const loss = prev.weight - current.weight;
            if (isInRange(current.date, thisWeekStart, new Date(todayDate.getTime() + 86400000))) {
              thisWeekPractice.push(loss);
            } else if (isInRange(current.date, lastWeekStart, lastWeekEnd)) {
              lastWeekPractice.push(loss);
            }
          }
        }
      }

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      weekOverWeek = {
        thisWeekAvgDrift: avg(thisWeekDrifts),
        lastWeekAvgDrift: avg(lastWeekDrifts),
        thisWeekAvgPractice: avg(thisWeekPractice),
        lastWeekAvgPractice: avg(lastWeekPractice),
      };
    }

    // ═══ CYCLE WEIGH-INS (for velocity sparkline) ═══
    // All weigh-ins this cycle, oldest first, for plotting the descent curve
    const weekWeighIns: Array<{ day: string; weight: number; type: string }> = [];
    {
      // Collect the first weigh-in of each day this cycle (morning preferred)
      for (let i = 0; i < cycleDays; i++) {
        const checkDate = new Date(cycleStart);
        checkDate.setDate(cycleStart.getDate() + i);
        if (checkDate > today) break;

        const dayLogs = logs.filter(l => {
          const ld = startOfDay(new Date(l.date));
          return ld.getTime() === checkDate.getTime();
        }).sort((a, b) => {
          // Prefer morning, then earliest
          const typePriority = (t: string) => t === 'weigh-in' ? 0 : t === 'morning' ? 0 : t === 'pre-practice' ? 1 : 2;
          const pa = typePriority(a.type), pb = typePriority(b.type);
          return pa !== pb ? pa - pb : new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        if (dayLogs.length > 0) {
          const daysOut = differenceInDays(weighInDateStart, checkDate);
          weekWeighIns.push({
            day: daysOut > 0 ? `${daysOut}d` : daysOut === 0 ? 'WI' : 'R',
            weight: dayLogs[0].weight,
            type: dayLogs[0].type,
          });
        }
      }
    }

    // ═══ PERSONAL RECORDS ═══
    const personalRecords = {
      bestDrift: allDrifts.length > 0 ? Math.max(...allDrifts) : null,
      bestPracticeLoss: practiceLosses.length > 0 ? Math.max(...practiceLosses) : null,
      bestDriftRate: driftRates.length > 0 ? Math.max(...driftRates) : null,
      bestSweatRate: practiceSweatRates.length > 0 ? Math.max(...practiceSweatRates) : null,
      totalLostThisWeek: weekWeighIns.length >= 2
        ? weekWeighIns[0].weight - weekWeighIns[weekWeighIns.length - 1].weight
        : null,
    };

    // ═══ TIME-TO-TARGET COUNTDOWN ═══
    // Based on drift rate (lbs/hr), estimate when they'll hit target weight
    let timeToTarget: { etaHours: number | null; etaTime: string | null; lbsRemaining: number; ratePerHour: number | null } | null = null;
    if (currentWeight && currentWeight > targetWeight) {
      const lbsRemaining = currentWeight - targetWeight;
      // Use drift rate as the passive loss rate; if practice is still expected, factor it in
      const driftRatePerHr = avgDriftRateOzPerHr; // lbs/hr while sleeping
      const remainingComp = todayRemainingComponents;

      if (driftRatePerHr && driftRatePerHr > 0) {
        // Estimate: remaining practice loss happens instantly (during practice),
        // then drift rate covers the rest over time
        const practiceRemaining = remainingComp ? remainingComp.practice : 0;
        const afterPractice = lbsRemaining - practiceRemaining;

        if (afterPractice <= 0) {
          // Practice alone will get them there
          timeToTarget = { etaHours: 0, etaTime: 'After practice', lbsRemaining, ratePerHour: driftRatePerHr };
        } else {
          const hoursNeeded = afterPractice / driftRatePerHr;
          const now = profile.simulatedDate || new Date();
          const etaDate = new Date(now.getTime() + hoursNeeded * 3600000);
          const hours = etaDate.getHours();
          const minutes = etaDate.getMinutes();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
          const etaTime = `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;

          timeToTarget = { etaHours: hoursNeeded, etaTime, lbsRemaining, ratePerHour: driftRatePerHr };
        }
      } else {
        timeToTarget = { etaHours: null, etaTime: null, lbsRemaining, ratePerHour: null };
      }
    }

    // ═══ HISTORICAL FALLBACK — for display when cycle has no data yet ═══
    // When the current cycle is fresh (no drift/practice pairs), compute from ALL logs
    // so the Cut Lab shows historical physiology instead of being empty.
    // NOT used for projections — only for display.
    const cycleHasOwnDriftData = allDrifts.length > 0;
    const cycleHasOwnPracticeData = practiceLosses.length > 0;

    let historicalDrift: number | null = null;
    let historicalDriftRate: number | null = null;
    let historicalPracticeLoss: number | null = null;
    let historicalSweatRate: number | null = null;
    let historicalRecentDrifts: number[] = [];
    let historicalRecentPracticeLosses: number[] = [];
    let historicalRecentSweatRates: number[] = [];
    let historicalRecentDriftRates: number[] = [];
    let historicalRecentSleepHours: number[] = [];

    if (!cycleHasOwnDriftData || !cycleHasOwnPracticeData) {
      // Compute from ALL logs (no cycle filter)
      const allSortedLogs = [...logs].sort((a, b) => b.date.getTime() - a.date.getTime());
      const histDrifts: number[] = [];
      const histDriftRates: number[] = [];
      const histPracticeLosses: number[] = [];
      const histSweatRates: number[] = [];
      const histSleepHours: number[] = [];

      // Overnight drifts from all history
      for (let i = 0; i < allSortedLogs.length - 1; i++) {
        const morning = allSortedLogs[i];
        const prev = allSortedLogs[i + 1];
        if ((morning.type === 'morning' || morning.type === 'weigh-in') &&
            (prev.type === 'before-bed' || prev.type === 'post-practice')) {
          const hoursDiff = (morning.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
          if (hoursDiff >= 4 && hoursDiff <= 16) {
            const drift = prev.weight - morning.weight;
            if (drift > 0 && drift < 8) {
              histDrifts.push(drift);
              if (morning.sleepHours && morning.sleepHours > 0) {
                histDriftRates.push(drift / morning.sleepHours);
              }
            }
          }
        }
        if (histDrifts.length >= 10) break;
      }

      // Practice losses from all history
      for (let i = 0; i < allSortedLogs.length - 1; i++) {
        const post = allSortedLogs[i];
        const pre = allSortedLogs[i + 1];
        if (post.type === 'post-practice' && pre.type === 'pre-practice') {
          const hoursDiff = (post.date.getTime() - pre.date.getTime()) / (1000 * 60 * 60);
          if (hoursDiff < 6) {
            const loss = pre.weight - post.weight;
            histPracticeLosses.push(loss);
            if (loss > 0) {
              const hrs = post.duration && post.duration > 0 ? post.duration / 60 : (hoursDiff >= 0.25 ? hoursDiff : null);
              if (hrs !== null && hrs > 0) {
                const rate = loss / hrs;
                if (rate <= 6) histSweatRates.push(rate);
              }
            }
          }
        }
        if (histPracticeLosses.length >= 10) break;
      }

      // Sleep hours from all history
      for (const log of allSortedLogs) {
        if (log.type === 'morning' && log.sleepHours && log.sleepHours > 0) {
          histSleepHours.push(log.sleepHours);
          if (histSleepHours.length >= 5) break;
        }
      }

      if (!cycleHasOwnDriftData && histDrifts.length > 0) {
        historicalDrift = computeEMA(histDrifts);
        historicalDriftRate = computeEMA(histDriftRates);
        historicalRecentDrifts = histDrifts.slice(0, 5);
        historicalRecentDriftRates = histDriftRates.slice(0, 5);
        historicalRecentSleepHours = histSleepHours;
      }
      if (!cycleHasOwnPracticeData && histPracticeLosses.length > 0) {
        historicalPracticeLoss = computeEMA(histPracticeLosses);
        historicalSweatRate = computeEMA(histSweatRates);
        historicalRecentPracticeLosses = histPracticeLosses.slice(0, 5);
        historicalRecentSweatRates = histSweatRates.slice(0, 5);
      }
    }

    const result = {
      startWeight,
      currentWeight,
      targetWeight,
      daysRemaining,
      totalLost,
      dailyAvgLoss,
      grossDailyLoss,
      avgOvernightDrift,
      avgDriftRateOzPerHr,
      avgLoadingDrift,
      avgCutDrift,
      avgPracticeLoss,
      avgSweatRateOzPerHr,
      daytimeBmrDrift,
      emaSleepHours,
      emaPracticeHours,
      todayRemainingComponents,
      projectedSaturday,
      pace,
      morningWeights,
      recentDrifts: allDrifts.length > 0 ? allDrifts.slice(0, 5) : historicalRecentDrifts,
      recentDriftRates: driftRates.length > 0 ? driftRates.slice(0, 5) : historicalRecentDriftRates,
      recentSleepHours: sleepHoursData.length > 0 ? sleepHoursData.slice(0, 5) : historicalRecentSleepHours,
      recentPracticeLosses: practiceLosses.length > 0 ? practiceLosses.slice(0, 5) : historicalRecentPracticeLosses,
      recentPracticeSweatRates: practiceSweatRates.length > 0 ? practiceSweatRates.slice(0, 5) : historicalRecentSweatRates,
      recentPracticeDurations: practiceDurations.slice(0, 5),
      trends,
      confidence,
      makeWeightProb,
      todayProgress,
      loggingStreak,
      todayCoreLogged,
      todayCoreTotal,
      weekOverWeek,
      weekWeighIns,
      personalRecords,
      timeToTarget,
      // Historical fallback fields
      historicalDrift,
      historicalDriftRate,
      historicalPracticeLoss,
      historicalSweatRate,
      cycleHasOwnDriftData,
      cycleHasOwnPracticeData,
    };
    weekDescentCacheRef.current = { key: wdCacheKey, value: result };
    return result;
  };

  // Check if today has a morning weight logged — used to gate Cut Score display
  const hasTodayMorningWeight = (): boolean => {
    const today = startOfDay(profile.simulatedDate || new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    return logs.some(l => {
      const logDate = new Date(l.date);
      return (l.type === 'morning' || l.type === 'weigh-in') &&
        format(startOfDay(logDate), 'yyyy-MM-dd') === todayStr;
    });
  };

  // Uses daysUntilWeighIn for all timing to support any weigh-in day
  const getHistoryInsights = () => {
    const now = profile.simulatedDate || new Date();
    const daysUntilWeighIn = getDaysUntilWeighIn();
    const weighInDate = startOfDay(profile.weighInDate);

    // Get all logs sorted by date (newest first)
    const sortedLogs = [...logs].sort((a, b) => b.date.getTime() - a.date.getTime());

    // Separate morning weights by week (include official weigh-ins)
    const morningLogs = sortedLogs.filter(l => l.type === 'morning' || l.type === 'weigh-in');

    // Calculate overnight drift (morning weight - previous night's weight)
    const overnightDrifts: number[] = [];
    const historyDriftRates: number[] = [];
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const current = sortedLogs[i];
      const prev = sortedLogs[i + 1];

      if (current.type === 'morning' && (prev.type === 'post-practice' || prev.type === 'before-bed')) {
        const hoursDiff = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 4 && hoursDiff < 16) {
          const drift = prev.weight - current.weight;
          overnightDrifts.push(drift);
          // Overnight drift rate — only from before-bed → morning pairs (mirrors getWeekDescentData)
          // Use timestamp gap (hoursDiff) not sleepHours to avoid inflated rates
          if (drift > 0 && prev.type === 'before-bed') {
            if (hoursDiff > 0) {
              const lbsPerHr = drift / hoursDiff;
              historyDriftRates.push(lbsPerHr);
            }
          }
        }
      }
    }

    // Calculate practice weight loss (pre - post) and sweat rate
    const practiceLosses: number[] = [];
    const historySweatRates: number[] = [];
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const post = sortedLogs[i];
      const pre = sortedLogs[i + 1];

      if (post.type === 'post-practice' && pre.type === 'pre-practice') {
        const hoursDiff = (post.date.getTime() - pre.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff < 6) {
          const loss = pre.weight - post.weight;
          practiceLosses.push(loss);
          if (loss > 0) {
            const practiceHrs = post.duration && post.duration > 0
              ? post.duration / 60
              : (hoursDiff >= 0.25 ? hoursDiff : null);
            if (practiceHrs !== null && practiceHrs > 0) {
              const ozPerHr = loss / practiceHrs;
              if (ozPerHr <= 6) {
                historySweatRates.push(ozPerHr);
              }
            }
          }
        }
      }
    }

    // Get weights from 1 day before weigh-in (final cut day) - relative to weigh-in date
    const dayBeforeWeighInWeights = morningLogs.filter(l => {
      const logDate = startOfDay(l.date);
      const daysBeforeWeighIn = differenceInDays(weighInDate, logDate);
      return daysBeforeWeighIn === 1;
    }).slice(0, 4);

    // Get competition day weights (weigh-in day)
    const competitionDayWeights = morningLogs.filter(l => {
      const logDate = startOfDay(l.date);
      const daysBeforeWeighIn = differenceInDays(weighInDate, logDate);
      return daysBeforeWeighIn === 0;
    }).slice(0, 4);

    // Calculate final cut success (how much lost on day before weigh-in)
    const finalCuts: number[] = [];
    for (const dayBefore of dayBeforeWeighInWeights) {
      const twoDaysBeforeLog = morningLogs.find(l => {
        const daysDiff = (dayBefore.date.getTime() - l.date.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff > 0 && daysDiff < 2;
      });
      if (twoDaysBeforeLog) {
        finalCuts.push(twoDaysBeforeLog.weight - dayBefore.weight);
      }
    }

    // Calculate week-over-week trend (same day comparison across weeks)
    const weekAgoLogs = morningLogs.filter(l => {
      const daysDiff = differenceInDays(now, l.date);
      return daysDiff >= 6 && daysDiff <= 8;
    });
    const weeklyTrend = weekAgoLogs.length > 0 && morningLogs.length > 0
      ? weekAgoLogs[0].weight - morningLogs[0].weight
      : null;

    // Real-time phase-aware projection (mirrors getWeekDescentData logic)
    // Starts from most recent weigh-in, applies remaining today losses + future day losses
    const latestMorningWeight = morningLogs.length > 0 ? morningLogs[0].weight : null;

    // Calculate net daily loss from morning weights
    let netDailyLoss: number | null = null;
    if (morningLogs.length >= 2) {
      const oldestMorning = morningLogs[morningLogs.length - 1];
      const newestMorning = morningLogs[0];
      const daysBetween = Math.max(1, Math.round(
        (newestMorning.date.getTime() - oldestMorning.date.getTime()) / (1000 * 60 * 60 * 24)
      ));
      netDailyLoss = (oldestMorning.weight - newestMorning.weight) / daysBetween;
      if (netDailyLoss <= 0) netDailyLoss = null;
    }

    // Calculate gross capacity components (EMA-weighted)
    const avgOvernightLoss = computeEMA(overnightDrifts);
    const avgPracticeLossVal = computeEMA(practiceLosses);
    const grossCapacity = avgOvernightLoss !== null
      ? Math.abs(avgOvernightLoss) + Math.abs(avgPracticeLossVal || 0)
      : null;
    const hasDriftData = avgOvernightLoss !== null && Math.abs(avgOvernightLoss) > 0;
    const hasPracticeData = avgPracticeLossVal !== null && Math.abs(avgPracticeLossVal) > 0;
    const hasGrossData = grossCapacity !== null && grossCapacity > 0;
    const hasNetData = netDailyLoss !== null;

    // Daytime BMR drift for cut days (mirrors getWeekDescentData logic)
    const avgHistoryDriftRate = computeEMA(historyDriftRates);
    let historyDaytimeBmr = 0;
    if (avgHistoryDriftRate !== null && avgHistoryDriftRate > 0) {
      const sleepData: number[] = [];
      for (const log of sortedLogs) {
        if (log.type === 'morning' && log.sleepHours && log.sleepHours > 0) {
          sleepData.push(log.sleepHours);
          if (sleepData.length >= 5) break;
        }
      }
      const avgSleep = sleepData.length > 0 ? (computeEMA(sleepData) || 8) : 8;
      const pracDurations: number[] = [];
      for (const log of sortedLogs) {
        if (log.type === 'post-practice' && log.duration && log.duration > 0) {
          pracDurations.push(log.duration / 60);
          if (pracDurations.length >= 5) break;
        }
      }
      const avgPracHrs = pracDurations.length > 0 ? (computeEMA(pracDurations) || 2) : 2;
      const awakeNonActive = Math.max(0, 24 - avgSleep - avgPracHrs);
      historyDaytimeBmr = awakeNonActive * avgHistoryDriftRate;
    }

    // Hybrid projection (mirrors getWeekDescentData logic)
    // Loading days: project from morning weight (mid-day dips are temporary — athlete eats back)
    // Cut days: project from most recent weigh-in (losses stick — no eating back)
    const today = startOfDay(profile.simulatedDate || new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    const allTodayLogs = logs.filter(l => {
      const logDate = new Date(l.date);
      return format(startOfDay(logDate), 'yyyy-MM-dd') === todayStr;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const mostRecentWeight = allTodayLogs.length > 0 ? allTodayLogs[0].weight : latestMorningWeight;
    const isLoadingToday = daysUntilWeighIn >= 3;

    let projectedSaturday: number | null = null;
    if (daysUntilWeighIn > 0 && (hasDriftData || hasNetData)) {
      const drift = hasDriftData ? Math.abs(avgOvernightLoss!) : 0;
      const practice = hasPracticeData ? Math.abs(avgPracticeLossVal!) : 0;
      let projected: number;

      // Step 1: Handle today based on phase
      if (isLoadingToday && latestMorningWeight) {
        // Loading day: start from morning weight, apply net daily loss
        projected = latestMorningWeight;
        const todayLoss = hasNetData ? netDailyLoss! : (hasGrossData ? grossCapacity! * 0.2 : 0);
        projected -= todayLoss;
      } else if (mostRecentWeight) {
        // Cut day: start from most recent weigh-in, apply remaining losses + daytime BMR
        projected = mostRecentWeight;
        const lastLogType = allTodayLogs.length > 0 ? allTodayLogs[0].type : null;
        let todayRemainingLoss = 0;

        // Projection uses sleep drift + practice only (daytime BMR excluded — too noisy)
        if (lastLogType) {
          if (lastLogType === 'morning' || lastLogType === 'weigh-in' || lastLogType === 'pre-practice') {
            todayRemainingLoss = practice + drift;
          } else if (lastLogType === 'post-practice' || lastLogType === 'before-bed') {
            todayRemainingLoss = drift;
          } else if (lastLogType === 'extra-after') {
            todayRemainingLoss = practice + drift;
          } else if (lastLogType === 'check-in' || lastLogType === 'extra-before') {
            const hasPracticeLog = allTodayLogs.some(l => l.type === 'post-practice');
            todayRemainingLoss = hasPracticeLog ? drift : (practice + drift);
          }
        } else {
          todayRemainingLoss = practice + drift;
        }
        projected -= todayRemainingLoss;
      } else if (latestMorningWeight) {
        projected = latestMorningWeight;
      } else {
        projected = 0;
      }

      // Only calculate future days if we have a real starting weight
      if (projected > 0) {
        // Step 2: Future full days
        for (let d = daysUntilWeighIn - 1; d > 0; d--) {
          if (d >= 3) {
            const loadingLoss = hasNetData ? netDailyLoss! : (hasGrossData ? grossCapacity! * 0.2 : 0);
            projected -= loadingLoss;
          } else {
            // Future cut day: gross capacity only (daytime BMR excluded from projections)
            if (hasGrossData) {
              projected -= grossCapacity!;
            } else if (hasNetData) {
              projected -= netDailyLoss! * 2.5;
            }
          }
        }
      }

      if (projected > 0) {
        projectedSaturday = projected;
      }
    }

    return {
      avgOvernightDrift: computeEMA(overnightDrifts),
      avgDriftRateOzPerHr: computeEMA(historyDriftRates),
      avgPracticeLoss: computeEMA(practiceLosses),
      avgSweatRateOzPerHr: computeEMA(historySweatRates),
      avgFridayCut: finalCuts.length > 0
        ? finalCuts.reduce((a, b) => a + b, 0) / finalCuts.length
        : null,
      weeklyTrend,
      projectedSaturday,
      daysUntilSat: daysUntilWeighIn, // Keep old property name for backward compat
      totalLogsThisWeek: sortedLogs.filter(l => {
        const daysDiff = (now.getTime() - l.date.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 7;
      }).length,
      hasEnoughData: overnightDrifts.length >= 2 || practiceLosses.length >= 2,
      lastFridayWeight: dayBeforeWeighInWeights.length > 0 ? dayBeforeWeighInWeights[0].weight : null,
      lastSaturdayWeight: competitionDayWeights.length > 0 ? competitionDayWeights[0].weight : null,
      madeWeightLastWeek: competitionDayWeights.length > 0 && competitionDayWeights[0].weight <= profile.targetWeightClass
    };
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MACRO ADJUSTMENT — detects plateaus and suggests calorie changes
  // ═══════════════════════════════════════════════════════════════════════════════
  const getAdaptiveAdjustment = () => {
    const now = profile.simulatedDate || new Date();

    // Get last 5 morning weights
    const morningLogs = logs
      .filter(l => l.type === 'morning' || l.type === 'weigh-in')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    const recentWeights = morningLogs.map(l => ({
      date: format(new Date(l.date), 'yyyy-MM-dd'),
      weight: l.weight,
    }));

    // Need at least 3 days of data
    if (morningLogs.length < 3) {
      return {
        isPlateaued: false,
        plateauDays: 0,
        suggestedAdjustment: 0,
        reason: 'Need at least 3 days of weight data',
        recentWeights,
        variance: 0,
        expectedLoss: 0,
        actualLoss: 0,
      };
    }

    // Calculate variance (standard deviation)
    const weights = morningLogs.map(l => l.weight);
    const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
    const squaredDiffs = weights.map(w => Math.pow(w - mean, 2));
    const variance = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / weights.length);

    // Calculate actual weight change over the period
    const oldestWeight = morningLogs[morningLogs.length - 1].weight;
    const newestWeight = morningLogs[0].weight;
    const daysBetween = Math.max(1, differenceInDays(
      new Date(morningLogs[0].date),
      new Date(morningLogs[morningLogs.length - 1].date)
    ));
    const actualLoss = oldestWeight - newestWeight;
    const actualDailyLoss = actualLoss / daysBetween;

    // Expected loss based on calorie deficit (3500 cal = 1 lb)
    // Get current calorie adjustment from profile
    const sliceTargets = getSliceTargets();
    const calorieAdjustment = sliceTargets.calorieAdjustment || 0;
    const expectedDailyLoss = Math.abs(calorieAdjustment) / 3500; // lbs per day
    const expectedLoss = expectedDailyLoss * daysBetween;

    // Plateau detection: variance < 0.3 lbs AND actual loss much less than expected
    const isPlateaued = variance < 0.35 && daysBetween >= 3 && (
      (calorieAdjustment < 0 && actualLoss < expectedLoss * 0.3) || // Cutting but not losing
      (calorieAdjustment > 0 && actualLoss > -expectedLoss * 0.3)   // Building but gaining too fast
    );

    // Count plateau days (consecutive days with minimal change)
    let plateauDays = 0;
    if (isPlateaued) {
      for (let i = 0; i < weights.length - 1; i++) {
        if (Math.abs(weights[i] - weights[i + 1]) < 0.3) {
          plateauDays++;
        } else {
          break;
        }
      }
      plateauDays = Math.max(plateauDays, daysBetween);
    }

    // Calculate suggested adjustment
    let suggestedAdjustment = 0;
    let reason = '';

    if (isPlateaued) {
      if (calorieAdjustment < 0) {
        // On a cut, weight stalled → reduce by 100 cal
        suggestedAdjustment = -100;
        reason = `Weight stalled at ~${mean.toFixed(1)} lbs for ${plateauDays}+ days. Consider reducing calories by 100.`;
      } else if (calorieAdjustment > 0) {
        // On a bulk, gaining too fast → reduce surplus
        suggestedAdjustment = -50;
        reason = `Gaining faster than expected. Consider reducing surplus by 50 cal to stay lean.`;
      } else {
        // Maintenance, but weight drifting
        if (actualLoss < -0.5) {
          suggestedAdjustment = 100;
          reason = `Unintentional weight gain detected. Consider reducing by 100 cal.`;
        } else if (actualLoss > 0.5) {
          suggestedAdjustment = 100;
          reason = `Unintentional weight loss detected. Consider adding 100 cal.`;
        }
      }
    } else if (calorieAdjustment < 0 && actualDailyLoss > expectedDailyLoss * 1.5) {
      // Losing faster than expected — might want to slow down to preserve muscle
      suggestedAdjustment = 50;
      reason = `Losing faster than expected (${(actualDailyLoss * 7).toFixed(1)} lbs/week). Consider adding 50 cal to preserve muscle.`;
    }

    return {
      isPlateaued,
      plateauDays,
      suggestedAdjustment,
      reason,
      recentWeights,
      variance: Math.round(variance * 100) / 100,
      expectedLoss: Math.round(expectedLoss * 100) / 100,
      actualLoss: Math.round(actualLoss * 100) / 100,
    };
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // WEEKLY COMPLIANCE REPORT — tracks how well user hits macro targets
  // ═══════════════════════════════════════════════════════════════════════════════
  const getWeeklyCompliance = () => {
    const now = profile.simulatedDate || new Date();
    const targets = getSliceTargets();

    // Get last 7 days of daily tracking
    const weekData: Array<{
      date: string;
      protein: { consumed: number; target: number };
      carb: { consumed: number; target: number };
      veg: { consumed: number; target: number };
      fruit: { consumed: number; target: number };
      fat: { consumed: number; target: number };
    }> = [];

    for (let i = 0; i < 7; i++) {
      const date = subDays(now, i);
      const dateKey = format(date, 'yyyy-MM-dd');
      const tracking = getDailyTracking(dateKey);

      // Only count days where user logged something
      const hasData = tracking.proteinSlices > 0 || tracking.carbSlices > 0 ||
                      tracking.vegSlices > 0 || (tracking.fruitSlices || 0) > 0 ||
                      (tracking.fatSlices || 0) > 0;

      if (hasData) {
        weekData.push({
          date: dateKey,
          protein: { consumed: tracking.proteinSlices, target: targets.protein },
          carb: { consumed: tracking.carbSlices, target: targets.carb },
          veg: { consumed: tracking.vegSlices, target: targets.veg },
          fruit: { consumed: tracking.fruitSlices || 0, target: targets.fruit },
          fat: { consumed: tracking.fatSlices || 0, target: targets.fat },
        });
      }
    }

    const daysTracked = weekData.length;

    // Calculate compliance for each category
    const calcCompliance = (category: 'protein' | 'carb' | 'veg' | 'fruit' | 'fat') => {
      if (daysTracked === 0) return { percentage: 0, avgConsumed: 0, avgTarget: 0 };

      const totalConsumed = weekData.reduce((sum, d) => sum + d[category].consumed, 0);
      const totalTarget = weekData.reduce((sum, d) => sum + d[category].target, 0);
      const avgConsumed = totalConsumed / daysTracked;
      const avgTarget = totalTarget / daysTracked;

      // Percentage: how close to target (cap at 100% if over)
      const percentage = totalTarget > 0
        ? Math.min(100, Math.round((totalConsumed / totalTarget) * 100))
        : 0;

      return {
        percentage,
        avgConsumed: Math.round(avgConsumed * 10) / 10,
        avgTarget: Math.round(avgTarget * 10) / 10,
      };
    };

    const compliance = {
      protein: calcCompliance('protein'),
      carb: calcCompliance('carb'),
      veg: calcCompliance('veg'),
      fruit: calcCompliance('fruit'),
      fat: calcCompliance('fat'),
    };

    // Find best and worst categories
    const categories = ['protein', 'carb', 'veg', 'fruit', 'fat'] as const;
    const validCategories = categories.filter(c => compliance[c].avgTarget > 0);

    let bestCategory = 'protein';
    let worstCategory = 'protein';
    let bestPct = 0;
    let worstPct = 100;

    for (const cat of validCategories) {
      if (compliance[cat].percentage > bestPct) {
        bestPct = compliance[cat].percentage;
        bestCategory = cat;
      }
      if (compliance[cat].percentage < worstPct) {
        worstPct = compliance[cat].percentage;
        worstCategory = cat;
      }
    }

    // Generate insight
    let insight = '';
    if (daysTracked === 0) {
      insight = 'Start tracking to see your weekly compliance stats!';
    } else if (daysTracked < 3) {
      insight = `Only ${daysTracked} day${daysTracked === 1 ? '' : 's'} tracked. Log more for accurate insights.`;
    } else if (worstPct < 70) {
      const catLabel = worstCategory === 'protein' ? 'protein' :
                       worstCategory === 'carb' ? 'carbs' :
                       worstCategory === 'veg' ? 'veggies' :
                       worstCategory === 'fruit' ? 'fruit' : 'fats';
      insight = `You're under-hitting ${catLabel} (${worstPct}%). Try adding 1 extra serving at dinner.`;
    } else if (bestPct > 100) {
      const catLabel = bestCategory === 'protein' ? 'protein' :
                       bestCategory === 'carb' ? 'carbs' :
                       bestCategory === 'veg' ? 'veggies' :
                       bestCategory === 'fruit' ? 'fruit' : 'fats';
      insight = `Great ${catLabel} intake! Make sure other macros are balanced too.`;
    } else if (worstPct >= 85) {
      insight = 'Excellent compliance across all categories! Keep it up.';
    } else {
      insight = `Focus on ${worstCategory} — currently at ${worstPct}% of target.`;
    }

    return {
      ...compliance,
      daysTracked,
      bestCategory,
      worstCategory,
      insight,
    };
  };

  // ═══ CUT SCORE ═══
  // Maps store data → CutScoreInput → computeCutScore()
  const getCutScore = () => {
    const descentData = getWeekDescentData();
    const daysUntil = getDaysUntilWeighIn();
    const hydration = getHydrationTarget();

    // Get today's food tracking
    const todayStr = format(profile.simulatedDate || new Date(), 'yyyy-MM-dd');
    const todayFood = getDailyTracking(todayStr);
    const sliceTargets = getSliceTargets();

    // Total food servings: sum of all slice types logged today
    const foodServingsLogged = (todayFood.proteinSlices || 0) +
                                (todayFood.carbSlices || 0) +
                                (todayFood.vegSlices || 0) +
                                (todayFood.fruitSlices || 0) +
                                (todayFood.fatSlices || 0);

    // Total food servings target: sum of all slice targets
    const foodServingsTarget = (sliceTargets.protein || 0) +
                                (sliceTargets.carb || 0) +
                                (sliceTargets.veg || 0) +
                                (sliceTargets.fruit || 0) +
                                (sliceTargets.fat || 0);

    const input: CutScoreInput = {
      // Weight pillar
      projectedSaturday: descentData.projectedSaturday,
      targetWeight: descentData.targetWeight,
      currentWeight: descentData.currentWeight,
      grossDailyLoss: descentData.grossDailyLoss,
      daysRemaining: daysUntil,

      // Recovery pillar — basic tier
      recentSleepHours: descentData.recentSleepHours,
      avgOvernightDrift: descentData.avgOvernightDrift,
      // Enhanced/Premium tiers — future (fields are optional, omitted = undefined)

      // Protocol pillar — basic tier
      foodServingsLogged,
      foodServingsTarget,
      waterConsumedOz: todayFood.waterConsumed || 0,
      waterTargetOz: hydration.targetOz || 0,
    };

    return computeCutScore(input);
  };

  // Memoize context value to prevent unnecessary re-renders of consumers
  // Only re-creates when actual state or function references change
  const contextValue = useMemo(() => ({
    profile,
    fuelTanks,
    logs,
    dailyTracking,
    userFoods,
    isLoading,
    updateProfile,
    updateUserFoods,
    addLog,
    updateLog,
    deleteLog,
    updateDailyTracking,
    getDailyTracking,
    resetData,
    clearLogs,
    migrateLocalStorageToSupabase,
    hasLocalStorageData,
    calculateTarget,
    getWaterLoadBonus,
    isWaterLoadingDay,
    getDaysUntilWeighIn,
    getDaysUntilForDay,
    getTimeUntilWeighIn,
    getPhase,
    getTodaysFocus,
    getHydrationTarget,
    getMacroTargets,
    getFuelingGuide,
    getNutritionMode,
    getSliceTargets,
    getRehydrationPlan,
    getCheckpoints,
    getWeeklyPlan,
    getTomorrowPlan,
    getNextTarget,
    getDriftMetrics,
    getExtraWorkoutStats,
    getStatus,
    getDailyPriority,
    getWeekDescentData,
    hasTodayMorningWeight,
    getFoodLists,
    getTodaysFoods,
    getHistoryInsights,
    getAdaptiveAdjustment,
    getWeeklyCompliance,
    getCutScore
  }), [profile, fuelTanks, logs, dailyTracking, userFoods, isLoading,
       updateProfile, updateUserFoods, addLog, updateLog, deleteLog,
       updateDailyTracking, getDailyTracking, resetData, clearLogs,
       migrateLocalStorageToSupabase, hasLocalStorageData,
       calculateTarget, getWaterLoadBonus, isWaterLoadingDay,
       getDaysUntilWeighIn, getDaysUntilForDay, getTimeUntilWeighIn,
       getPhase, getTodaysFocus, getHydrationTarget, getMacroTargets,
       getFuelingGuide, getNutritionMode, getSliceTargets,
       getRehydrationPlan, getCheckpoints, getWeeklyPlan, getTomorrowPlan,
       getNextTarget, getDriftMetrics, getExtraWorkoutStats, getStatus,
       getDailyPriority, getWeekDescentData, hasTodayMorningWeight,
       getFoodLists, getTodaysFoods, getHistoryInsights,
       getAdaptiveAdjustment, getWeeklyCompliance, getCutScore]);

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}
