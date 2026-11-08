import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { addDays, differenceInDays, getDay, parseISO, format, startOfDay } from 'date-fns';
import { supabase, type UserFoodsJson } from './supabase';
import { useAuth } from './auth';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
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
import { STORAGE_KEYS, STORAGE_PREFIX, claimAccountCache, clearAccountCache } from './storage-keys';
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
import { computeWeekDescentData } from './stores/week-descent-calculator';
import { computeDriftMetrics, computeExtraWorkoutStats, computeHistoryInsights, computeAdaptiveAdjustment, computeWeeklyCompliance } from './stores/analytics-calculator';
import {
  loadUnsyncedRows,
  saveUnsyncedRows,
  mergeCloudWithUnsynced,
  toFullPayload,
  toCorePayload,
  retryDelayMs,
  deriveSyncState,
  type UnsyncedRows,
  type TrackingSyncStatus,
} from './stores/tracking-sync';

// ─── Types (re-exported from stores/types.ts) ──────────────────────────────
export type { Protocol, Status, Phase, FuelTanks, AthleteProfile, WeightLog, WaterLog, MealSection, FoodLogEntry, DailyTracking, UserFoodsData, DayPlan, SupabaseDailyTrackingRow, SupabaseWeightLogRow, StoreContextType } from './stores/types';
export { inferMealSection, defaultUserFoods, defaultProfile, defaultTanks } from './stores/types';
import type { Protocol, Status, Phase, FuelTanks, AthleteProfile, WeightLog, WaterLog, MealSection, FoodLogEntry, DailyTracking, UserFoodsData, DayPlan, SupabaseDailyTrackingRow, SupabaseWeightLogRow, StoreContextType } from './stores/types';
import { inferMealSection, defaultUserFoods, defaultProfile, defaultTanks } from './stores/types';

const StoreContext = createContext<StoreContextType | undefined>(undefined);

type MacroRange = { min: number; max: number };
/**
 * Protocol macro tables by days until weigh-in (FGF21 FINAL 13). The daily targets and the
 * weekly plan both read this, so the two screens always show the same numbers.
 */
export function baseMacroTargets(protocol: string, w: number, daysUntilWeighIn: number): { carbs: MacroRange; protein: MacroRange; ratio: string } {

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
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  // ── Instant startup from localStorage caches ──
  // Load cached data immediately so the UI renders without waiting for Supabase.
  // The Supabase fetch will update state in the background once it completes.
  //
  // IMPORTANT: isLoading must ALWAYS start true so ProtectedRoute waits for
  // Supabase to confirm the real profile before making routing decisions.
  // Without this, stale/missing cache causes redirect to onboarding.
  const [isLoading, setIsLoading] = useState(true);

  const [profile, setProfile] = useState<AthleteProfile>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.PROFILE_CACHE);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return defaultProfile;
  });
  const [fuelTanks, setFuelTanks] = useState<FuelTanks>(defaultTanks);
  const [logs, setLogs] = useState<WeightLog[]>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.WEIGHT_LOGS_CACHE);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          // Restore Date objects from ISO strings
          return parsed.map((log: any) => ({
            ...log,
            date: new Date(log.date),
          }));
        }
      }
    } catch {}
    return [];
  });
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

  // ── Daily tracking cloud sync ──
  // Every change is recorded in a per-user "unsynced" store before it is sent.
  // A row leaves that store only after Supabase confirms the exact version we sent,
  // so a failed save survives reloads and is retried instead of being overwritten.
  const userIdRef = useRef<string | null>(user?.id ?? null);
  // Profile saves: sequence number to ignore stale failures, and the latest updateProfile for Retry.
  const profileSaveSeqRef = useRef(0);
  const updateProfileRef = useRef<((u: Partial<AthleteProfile>, o?: { silent?: boolean }) => Promise<void>) | null>(null);
  userIdRef.current = user?.id ?? null;
  const trackingRef = useRef<DailyTracking[]>(dailyTracking);
  useEffect(() => { trackingRef.current = dailyTracking; }, [dailyTracking]);
  const unsyncedRef = useRef<UnsyncedRows>({});
  const inFlightRef = useRef<Set<string>>(new Set());
  const failuresRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failureToastShownRef = useRef(false);
  const [trackingSyncStatus, setTrackingSyncStatus] = useState<TrackingSyncStatus>({ state: 'saved', pendingCount: 0 });

  const refreshSyncStatus = useCallback(() => {
    const pendingCount = Object.keys(unsyncedRef.current).length;
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    setTrackingSyncStatus({ state: deriveSyncState(pendingCount, inFlightRef.current.size > 0, online), pendingCount });
  }, []);

  const upsertTrackingRow = useCallback(async (userId: string, row: DailyTracking): Promise<boolean> => {
    try {
      const { error } = await supabase.from('daily_tracking').upsert(toFullPayload(userId, row), { onConflict: 'user_id,date' });
      if (!error) return true;
      if (error.message?.includes('column') || error.code === '42703') {
        console.warn('SPAR columns not in DB yet, falling back to core fields:', error.message);
        const { error: fallbackError } = await supabase.from('daily_tracking').upsert(toCorePayload(userId, row), { onConflict: 'user_id,date' });
        if (!fallbackError) return true;
        console.error('Error updating daily tracking (fallback):', fallbackError);
        return false;
      }
      console.error('Error updating daily tracking:', error);
      return false;
    } catch (error) {
      console.error('Error updating daily tracking:', error);
      return false;
    }
  }, []);

  const pushTrackingDateRef = useRef<(date: string) => Promise<void>>(async () => {});

  const flushUnsyncedTracking = useCallback(() => {
    for (const date of Object.keys(unsyncedRef.current)) {
      if (!inFlightRef.current.has(date)) void pushTrackingDateRef.current(date);
    }
  }, []);

  const scheduleTrackingRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      flushUnsyncedTracking();
    }, retryDelayMs(failuresRef.current));
  }, [flushUnsyncedTracking]);

  pushTrackingDateRef.current = async (date: string) => {
    const userId = userIdRef.current;
    if (!userId || inFlightRef.current.has(date)) return;
    const row = unsyncedRef.current[date];
    if (!row) return;

    inFlightRef.current.add(date);
    refreshSyncStatus();
    const ok = await upsertTrackingRow(userId, row);
    inFlightRef.current.delete(date);

    if (userIdRef.current !== userId) { refreshSyncStatus(); return; }

    if (ok) {
      failuresRef.current = 0;
      if (unsyncedRef.current[date] === row) {
        const { [date]: _saved, ...rest } = unsyncedRef.current;
        unsyncedRef.current = rest;
        saveUnsyncedRows(userId, rest);
      } else {
        // A newer edit arrived while this one was in flight — send it now.
        void pushTrackingDateRef.current(date);
      }
      if (Object.keys(unsyncedRef.current).length === 0) failureToastShownRef.current = false;
    } else {
      failuresRef.current += 1;
      if (!failureToastShownRef.current) {
        failureToastShownRef.current = true;
        toast({
          title: "Not saved to cloud yet",
          description: "Your log is kept on this device and will retry automatically.",
          variant: "destructive",
        });
      }
      scheduleTrackingRetry();
    }
    refreshSyncStatus();
  };

  const retryTrackingSync = useCallback(() => {
    failuresRef.current = 0;
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    flushUnsyncedTracking();
  }, [flushUnsyncedTracking]);

  useEffect(() => {
    const onOnline = () => retryTrackingSync();
    const onOffline = () => refreshSyncStatus();
    const onVisible = () => { if (document.visibilityState === 'visible') flushUnsyncedTracking(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [retryTrackingSync, refreshSyncStatus, flushUnsyncedTracking]);

  useEffect(() => () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); }, []);

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

    // Always ensure loading is true while fetching from Supabase.
    // isLoading already starts as true, but set it again in case of re-fetch.
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

        const loadedProfile: AthleteProfile = {
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
          waterLoading: profileData.water_loading !== false,
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
        };
        setProfile(loadedProfile);
        // Cache profile for instant startup next time
        try { localStorage.setItem(STORAGE_KEYS.PROFILE_CACHE, JSON.stringify(loadedProfile)); } catch {}
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
        const mappedLogs = logsData.map(log => {
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
        });
        setLogs(mappedLogs);
        // Cache weight logs for instant startup next time
        try { localStorage.setItem(STORAGE_KEYS.WEIGHT_LOGS_CACHE, JSON.stringify(mappedLogs)); } catch {}
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
        // Unsaved local edits are newer than the cloud copy — keep them and re-send.
        const unsynced = loadUnsyncedRows(user.id);
        unsyncedRef.current = unsynced;
        const merged = mergeCloudWithUnsynced(mapped, unsynced);
        trackingRef.current = merged;
        setDailyTracking(merged);
        try { localStorage.setItem(STORAGE_KEYS.DAILY_TRACKING_CACHE, JSON.stringify(merged)); } catch {}
        refreshSyncStatus();
        flushUnsyncedTracking();
      } else {
        // Cloud unreachable — keep the cached rows and layer unsaved edits on top.
        const unsynced = loadUnsyncedRows(user.id);
        unsyncedRef.current = unsynced;
        const merged = mergeCloudWithUnsynced(trackingRef.current, unsynced);
        trackingRef.current = merged;
        setDailyTracking(merged);
        refreshSyncStatus();
        if (Object.keys(unsynced).length > 0) scheduleTrackingRetry();
      }
    } catch (error) {
      console.error('Error loading from Supabase:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, refreshSyncStatus, flushUnsyncedTracking, scheduleTrackingRetry]);

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

  // Load data when user changes. While Supabase is still restoring the session on a fresh
  // page load, user is null but nobody has signed out: keep the cached data and keep loading,
  // or the route guard sees a blank, not-onboarded profile and bounces deep links to the dashboard.
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      // Shared phone: if the cached data on this device is someone else's, drop it
      // (from storage and from what's on screen) before loading this account.
      if (claimAccountCache(user.id)) {
        setProfile(defaultProfile);
        setLogs([]);
        setDailyTracking([]);
        setUserFoods(defaultUserFoods);
        setIsLoading(true);
      }
      loadFromSupabase();
    } else {
      clearAccountCache();
      // Reset to defaults when logged out. Unsynced rows stay in that user's
      // localStorage entry and are sent the next time they sign in.
      unsyncedRef.current = {};
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      refreshSyncStatus();
      setProfile(defaultProfile);
      setLogs([]);
      setDailyTracking([]);
      setUserFoods(defaultUserFoods);
      setIsLoading(false);
    }
  }, [user, authLoading, loadFromSupabase, refreshSyncStatus]);

  // Save profile to Supabase
  const updateProfile = async (updates: Partial<AthleteProfile>, options?: { silent?: boolean }) => {
    const saveSeq = ++profileSaveSeqRef.current;
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

    const previousProfile = profile;
    const newProfile = { ...profile, ...normalizedUpdates };
    setProfile(newProfile);

    // A failed save must not leave the screen showing a plan that isn't stored:
    // put the old settings back and offer to try again.
    const revertAfterFailedSave = (detail?: string) => {
      // A newer save has already gone through; rolling back would undo it.
      if (saveSeq !== profileSaveSeqRef.current) return;
      // Undo only the fields this save changed, against whatever is current now.
      setProfile(current => {
        const reverted = { ...current } as Record<string, unknown>;
        for (const key of Object.keys(normalizedUpdates)) {
          reverted[key] = (previousProfile as unknown as Record<string, unknown>)[key];
        }
        return reverted as unknown as AthleteProfile;
      });
      try {
        localStorage.setItem(STORAGE_KEYS.WEIGH_IN_CLEARED, JSON.stringify(previousProfile.weighInCleared || false));
        localStorage.setItem(STORAGE_KEYS.NEXT_CYCLE_DISMISSED, JSON.stringify(previousProfile.nextCyclePromptDismissed || false));
      } catch {}
      toast({
        title: 'Not saved',
        description: `Your change didn't save, so your previous settings are back.${detail ? ` (${detail})` : ''}`,
        variant: 'destructive',
        duration: 10000,
        action: (
          <ToastAction altText="Try saving again" onClick={() => { updateProfileRef.current?.(updates, options); }}>
            Retry
          </ToastAction>
        ),
      });
    };

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
          water_loading: newProfile.waterLoading !== false,
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
          // Only show toast for real settings changes, not date navigation or silent updates
          if (!isOnlySimulatedDateChange && !options?.silent) {
            toast({ title: 'Settings saved', description: 'Your changes have been saved.', duration: 2000 });
          }
        }

        // If error, show it but DON'T fall back to saving without v2 fields
        // (that would overwrite user's v2 settings!)
        if (upsertError) {
          console.error('Profile save failed:', upsertError.message, upsertError.code, upsertError.details);
          revertAfterFailedSave(upsertError.message);
          // DON'T fall back - just report the error
          return;
        }

        // OLD FALLBACK CODE - DISABLED to prevent overwriting v2 settings
        // This code block is intentionally disabled and kept for reference only
      } catch (error) {
        console.error('Error saving profile:', error);
        revertAfterFailedSave();
      }
    }
  };

  updateProfileRef.current = updateProfile;

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
  /** Resolves to the saved log's id, or null when it was rejected or did not save. */
  const addLog = async (log: Omit<WeightLog, 'id'>): Promise<string | null> => {
    // Weight validation: ensure weight is within reasonable bounds
    const weightError = getWeightValidationError(log.weight);
    if (weightError) {
      toast({
        title: "Invalid weight",
        description: weightError,
        variant: "destructive",
      });
      return null;
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
        return null;
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

    let savedId: string = tempId;
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

          // The DB unique index (user_id, DATE(date) in UTC, type) covers only the
          // one-per-day types. Clear a same-UTC-day record of those types to avoid a
          // constraint violation; extra-workout logs allow multiples and must be kept.
          if (UNIQUE_PER_DAY_TYPES.includes(log.type as any)) {
            const utcDate = insertData.date.split('T')[0]; // "2025-02-18"
            await supabase
              .from('weight_logs')
              .delete()
              .eq('user_id', user.id)
              .eq('type', log.type)
              .gte('date', `${utcDate}T00:00:00.000Z`)
              .lte('date', `${utcDate}T23:59:59.999Z`);
          }

          const { data, error } = await supabase
            .from('weight_logs')
            .insert(insertData)
            .select()
            .single();

          if (error) {
            // Rollback on error
            setLogs(previousLogs);
            setProfile(previousProfile);
            console.error('Error adding log:', error, 'Code:', error.code, 'Details:', error.details, 'Message:', error.message);
            const errorDetail = error.message || error.code || 'Unknown error';
            toast({ title: "Sync failed", description: `Could not save weight log: ${errorDetail}`, variant: "destructive" });
            return null;
          }

          if (data) {
            // Update with real ID
            setLogs(prev => prev.map(l => l.id === tempId ? { ...l, id: data.id } : l));
            savedId = data.id;
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
        return null;
      }
    }
    return savedId;
  };

  /** Resolves to true once the change is saved (or kept locally when signed out). */
  const updateLog = async (id: string, updates: Partial<WeightLog>): Promise<boolean> => {
    // Weight validation: ensure weight is within reasonable bounds
    if (updates.weight !== undefined) {
      const weightError = getWeightValidationError(updates.weight);
      if (weightError) {
        toast({
          title: "Invalid weight",
          description: weightError,
          variant: "destructive",
        });
        return false;
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
          return false;
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
        return false;
      }
    }
    return true;
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

  const updateDailyTracking = (date: string, updates: Partial<Omit<DailyTracking, 'date'>>) => {
    // Ignore keys explicitly set to undefined so they never wipe existing values.
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    ) as Partial<Omit<DailyTracking, 'date'>>;

    // Read from the ref, not render-time state, so back-to-back calls build on each other.
    const current = trackingRef.current;
    const found = current.find(d => d.date === date);
    const base: DailyTracking = found ?? {
      date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0, noPractice: false,
      proteinSlices: 0, carbSlices: 0, vegSlices: 0, fruitSlices: 0, fatSlices: 0, foodLog: [],
    };
    const row: DailyTracking = { ...base, ...cleanUpdates, date };
    const next = found ? current.map(d => (d.date === date ? row : d)) : [...current, row];

    trackingRef.current = next;
    setDailyTracking(next);
    try { localStorage.setItem(STORAGE_KEYS.DAILY_TRACKING_CACHE, JSON.stringify(next)); } catch {}

    const userId = userIdRef.current;
    if (userId) {
      unsyncedRef.current = { ...unsyncedRef.current, [date]: row };
      saveUnsyncedRows(userId, unsyncedRef.current);
      refreshSyncStatus();
      void pushTrackingDateRef.current(date);
    }
  };

  const resetData = async () => {
    unsyncedRef.current = {};
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (user) saveUnsyncedRows(user.id, {});
    refreshSyncStatus();
    setProfile(defaultProfile);
    setFuelTanks(defaultTanks);
    setLogs([]);
    trackingRef.current = [];
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
    const targetCalc = calculateTargetWeight(w, daysUntil, protocol, profile.waterLoading !== false);
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
          currentDayContext = `CRITICAL: Must be ${criticalLow}-${criticalHigh} lbs before practice — practice and overnight drift do the rest`;
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

  // While getTargetsForDate runs, the target getters treat this date as "today".
  const referenceDateRef = useRef<Date | null>(null);
  const getReferenceDate = (): Date => referenceDateRef.current ?? (profile.simulatedDate || new Date());

  const getDaysUntilWeighIn = useCallback((): number => {
    const ref = referenceDateRef.current;
    if (!ref) return daysUntilWeighInMemo;
    if (profile.weighInCleared) return 999;
    return differenceInDays(startOfDay(profile.weighInDate), startOfDay(ref));
  }, [daysUntilWeighInMemo, profile.weighInCleared, profile.weighInDate]);

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
    return checkWaterLoadingDay(daysUntil, protocol, profile.waterLoading !== false);
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
    if (profile.protocol === PROTOCOLS.GAIN && daysUntilWeighIn > 0) note = "Gain phase — drink normally, no water cut";
    else if (!(profile.waterLoading !== false) && daysUntilWeighIn > 0) note = "Water loading off — drink normally";
    else if (daysUntilWeighIn < 0) note = "Rehydrate fully";
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

    // Gain phase never cuts water, whatever the switch says.
    const loading = profile.waterLoading !== false && profile.protocol !== PROTOCOLS.GAIN;
    const targetOz = getWaterTargetOz(daysUntil, athleteWeight, loading);
    const amount = getWaterTargetGallons(daysUntil, athleteWeight, loading);

    // Determine type label based on phase
    let type = "Regular";
    if (daysUntil === 0) type = "Rehydrate";
    else if (!loading) type = daysUntil < 0 ? "Recovery" : "Regular";
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
    const cacheKey = `${protocol}|${profile.currentWeight}|${profile.targetWeightClass}|${profile.gender}|${profile.age}|${profile.heightInches}|${profile.trainingSessions}|${profile.workdayActivity}|${profile.sparGoal}|${profile.goalIntensity}|${profile.maintainPriority}|${profile.goalWeightLbs}|${profile.bodyFatPercent}|${profile.customProteinPerLb}|${profile.customFatPercent}|${profile.customCarbPercent}|${profile.sparV2}|${getDaysUntilWeighIn()}`;
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
      // Gain athletes are trying to add weight: never cut their food for being heavy.
      if (protocol === PROTOCOLS.GAIN) return result;
      // Only apply weight adjustments on days 1-3 (cut & prep days)
      if (daysUntilWeighIn < 1 || daysUntilWeighIn > 3) return result;

      // Get latest weight from that day's logs
      const today = startOfDay(getReferenceDate());
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

    // Base targets come from the protocol tables (shared with the weekly plan), then the weight adjustment
    const getBaseTargets = () => baseMacroTargets(protocol, w, daysUntilWeighIn);

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
          a.name.includes("5-3 days out") || a.name.includes("Protein")
        );
        carbsLabel = "Fructose Heavy (60:40)";
        proteinLabel = "NO PROTEIN";
      } else if (daysUntil === 3) {
        // 3 days out: High fructose, 25g collagen + leucine at dinner
        carbs = foods.highFructose;
        protein = foods.protein.filter(p => p.name.toLowerCase().includes("collagen"));
        avoid = foods.avoid.filter(a =>
          a.name.includes("5-3 days out") || (!a.name.includes("Collagen") && a.name.includes("Protein"))
        );
        carbsLabel = "Fructose Heavy (60:40)";
        proteinLabel = "25g Collagen (Dinner)";
      } else if (daysUntil === 1 || daysUntil === 2) {
        // 2-1 days out: Glucose/starch, 60g protein (collagen + seafood)
        carbs = daysUntil === 1 ? foods.zeroFiber : foods.highGlucose;
        protein = foods.protein.filter(p =>
          p.timing?.includes("2-1 days out") || p.timing?.includes("3-1 days out") || p.timing?.includes("5-1 days out")
        );
        avoid = foods.avoid.filter(a =>
          a.name.includes("2-1 days out") || a.name.includes("Fiber")
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
          p.timing?.includes("2-1 days out") || p.timing?.includes("3-1 days out") || p.timing?.includes("5-1 days out") ||
          p.name.toLowerCase().includes("collagen") || p.name.toLowerCase().includes("egg")
        );
        avoid = [{ name: "High fat proteins", reason: "Stick to lean sources" }];
        carbsLabel = "Mixed Fructose/Glucose";
        proteinLabel = "75g Protein";
      } else if (daysUntil === 1 || daysUntil === 2) {
        // 2-1 days out: Glucose/performance, 100g protein
        carbs = foods.highGlucose;
        protein = foods.protein.filter(p =>
          p.timing?.includes("2-1 days out") || p.timing?.includes("3-1 days out") || p.timing?.includes("5-1 days out")
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

    // Gain athletes are trying to add weight: never cut their food for being heavy.
    if (profile.protocol === PROTOCOLS.GAIN) return plan;
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
    // Same body weight the daily targets use for g/lb protein.
    const bodyW = profile.currentWeight || profile.targetWeightClass;
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
      if (daysUntil <= 5) return profile.waterLoading !== false ? 'Load' : 'Train';
      return 'Train';
    };

    // Use centralized water loading check from constants
    const isWaterLoadingForDays = (daysUntil: number): boolean => {
      return checkWaterLoadingDay(daysUntil, protocol, profile.waterLoading !== false);
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
        const targetCalc = calculateTargetWeight(w, daysUntil, protocol, profile.waterLoading !== false);
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

        // Macros from the shared protocol table; Gain never cuts water (getHydrationForDaysUntil).
        let phase = 'Train';
        const { carbs, protein } = baseMacroTargets(protocol, bodyW, daysUntil);
        const hydration = getHydrationForDaysUntil(daysUntil);
        const water = { amount: hydration.amount, targetOz: hydration.targetOz, type: hydration.type };

        if (daysUntil < 0) phase = 'Recover';
        else if (daysUntil === 0) phase = 'Compete';
        else if (daysUntil === 1) phase = 'Light';

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
        const targetCalc = calculateTargetWeight(w, daysUntil, protocol, profile.waterLoading !== false);
        const baseWeight = Math.round(w * getWeightMultiplier(daysUntil));

        // Use centralized hydration target (water loading on days 5-4-3, restriction on 2, sips on 1)
        const hydration = getHydrationForDaysUntil(daysUntil);

        // Use centralized weight: if water loading day, use range max; otherwise base
        const weightTarget = targetCalc.range ? targetCalc.range.max
          : daysUntil === 0 ? w // Competition day: must hit weight class
          : baseWeight;

        // Default values — P3 maintenance-level macros
        let phase = getPhaseForDays(daysUntil);
        let carbs = baseMacroTargets(protocol, bodyW, daysUntil).carbs; // shared protocol table
        let protein = baseMacroTargets(protocol, bodyW, daysUntil).protein;
        let water = { amount: hydration.amount, targetOz: hydration.targetOz, type: hydration.type };
        let waterLoadingNote: string | undefined;
        let isCriticalCheckpoint = false;

        if (daysUntil < 0) {
          // Recovery day
          waterLoadingNote = 'Recovery day - return to walk-around weight with protein refeed';
        } else if (daysUntil === 0) {
          // Competition day
        } else if (daysUntil === 1) {
          // Day before competition - sips only
          isCriticalCheckpoint = true;
          waterLoadingNote = `CRITICAL: Must be ${Math.round(w * 1.02)}-${baseWeight} lbs before practice`;
        } else if (daysUntil === 2) {
          // 2 days out - water restriction day
          waterLoadingNote = (profile.waterLoading !== false ? `Water restriction day — ADH still suppressed, body keeps flushing. ZERO fiber. Sips only tomorrow.` : undefined);
        } else if (daysUntil === 3) {
          // Last load day
          waterLoadingNote = (profile.waterLoading !== false ? `Last load day — still +${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs. Water restriction starts tomorrow.` : undefined);
        } else if (daysUntil === 4) {
          // Peak water loading day
          waterLoadingNote = (profile.waterLoading !== false ? `Peak loading day - heaviest day is normal (+${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs)` : undefined);
        } else if (daysUntil === 5) {
          // First water loading day
          waterLoadingNote = (profile.waterLoading !== false ? `Water loading day - expect +${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs water weight` : undefined);
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
      const targetCalc = calculateTargetWeight(w, daysUntil, protocol, profile.waterLoading !== false);
      const baseWeight = Math.round(w * getWeightMultiplier(daysUntil));

      // Use centralized hydration target for consistency
      const hydration = getHydrationForDaysUntil(daysUntil);

      // Use centralized weight: if water loading day, use range max; otherwise base
      const weightTarget = targetCalc.range ? targetCalc.range.max
        : daysUntil === 0 ? w // Competition day: must hit weight class
        : baseWeight;

      // Default values
      let phase = getPhaseForDays(daysUntil);
      let carbs = baseMacroTargets(protocol, bodyW, daysUntil).carbs; // shared protocol table
      let protein = baseMacroTargets(protocol, bodyW, daysUntil).protein;
      let water = { amount: hydration.amount, targetOz: hydration.targetOz, type: hydration.type };
      let waterLoadingNote: string | undefined;
      let isCriticalCheckpoint = false;

      if (daysUntil < 0) {
        // Recovery day (day after competition)
        waterLoadingNote = 'Recovery day - return to walk-around weight with protein refeed';
      } else if (daysUntil === 0) {
        // Competition day
      } else if (daysUntil === 1) {
        // Critical checkpoint - day before competition (sip only)
        isCriticalCheckpoint = true;
        waterLoadingNote = `CRITICAL: Must be ${Math.round(w * 1.02)}-${baseWeight} lbs before practice`;
      } else if (daysUntil === 2) {
        // 2 days out - water RESTRICTION day. ADH still suppressed from loading → high urine output continues.
        waterLoadingNote = (profile.waterLoading !== false ? `Water restriction day — ADH still suppressed, body keeps flushing. ZERO fiber. Sips only tomorrow.` : undefined);
      } else if (daysUntil === 3) {
        // Last load day (day 3 of loading)
        waterLoadingNote = (profile.waterLoading !== false ? `Last load day — still +${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs. Water restriction starts tomorrow.` : undefined);
      } else if (daysUntil === 4) {
        // Peak water loading day
        waterLoadingNote = (profile.waterLoading !== false ? `Peak loading day - heaviest day is normal (+${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs)` : undefined);
      } else if (daysUntil === 5) {
        // First water loading day
        waterLoadingNote = (profile.waterLoading !== false ? `Water loading day - expect +${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs water weight` : undefined);
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
    const tomorrowCalc = calculateTargetWeight(profile.targetWeightClass, tomorrowDaysUntil, profile.protocol, profile.waterLoading !== false);
    // Use the water-loaded value if applicable, otherwise base
    const tomorrowTarget = tomorrowCalc.withWaterLoad || tomorrowCalc.base;

    // Always show tomorrow's morning target as the next goal
    // Morning weigh-in is the primary data point for tracking progress
    return { label: "Tomorrow AM", weight: tomorrowTarget, description: "Morning Target" };
  };

  const getDriftMetrics = () => computeDriftMetrics(logs);

  // Calculate extra workout statistics from logged extra-before/extra-after pairs
  const getExtraWorkoutStats = () => computeExtraWorkoutStats(profile, logs);

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
    const wdCacheKey = `${profile.weighInDate?.getTime?.() || ''}|${profile.targetWeightClass}|${profile.currentWeight}|${profile.protocol}|${profile.simulatedDate?.getTime?.() || ''}|${profile.trackPracticeWeighIns}|${profile.waterLoading}|${logs.length}|${latestLog}|${daysUntilWeighInMemo}|${dailyTracking.length}`;
    if (weekDescentCacheRef.current.key === wdCacheKey && weekDescentCacheRef.current.value) {
      return weekDescentCacheRef.current.value;
    }
    const result = computeWeekDescentData({
      profile,
      logs,
      daysUntilWeighIn: daysUntilWeighInMemo,
      calculateTarget,
      getDailyTracking,
    });
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
  const getHistoryInsights = () => computeHistoryInsights({ profile, logs, daysUntilWeighIn: daysUntilWeighInMemo });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MACRO ADJUSTMENT — detects plateaus and suggests calorie changes
  // ═══════════════════════════════════════════════════════════════════════════════
  const getAdaptiveAdjustment = () => computeAdaptiveAdjustment({ profile, logs, getSliceTargets });
  // ═══════════════════════════════════════════════════════════════════════════════
  // WEEKLY COMPLIANCE REPORT — tracks how well user hits macro targets
  // ═══════════════════════════════════════════════════════════════════════════════
  const getWeeklyCompliance = () => computeWeeklyCompliance({ profile, getSliceTargets, getDailyTracking });

  // ═══ CUT SCORE ═══
  // Maps store data → CutScoreInput → computeCutScore()
  // Optional healthData parameter adds Premium tier wearable metrics
  const getCutScore = (healthData?: {
    hrv?: number | null;
    restingHeartRate?: number | null;
    sleepScore?: number | null;
    recoveryScore?: number | null;
    strainScore?: number | null;
  }) => {
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
      projectionReliable: descentData.confidence.reliable,

      // Recovery pillar — basic tier
      recentSleepHours: descentData.recentSleepHours,
      avgOvernightDrift: descentData.avgOvernightDrift,
      // Premium tier — wearable/HealthKit data (when available)
      hrv: healthData?.hrv ?? undefined,
      restingHeartRate: healthData?.restingHeartRate ?? undefined,
      sleepScore: healthData?.sleepScore ?? undefined,
      recoveryScore: healthData?.recoveryScore ?? undefined,
      strainScore: healthData?.strainScore ?? undefined,

      // Protocol pillar — basic tier
      foodServingsLogged,
      foodServingsTarget,
      waterConsumedOz: todayFood.waterConsumed || 0,
      waterTargetOz: hydration.targetOz || 0,
    };

    return computeCutScore(input);
  };

  /**
   * Nutrition and hydration targets as they applied on a given day (yyyy-MM-dd),
   * using that day's distance from weigh-in and that day's weigh-ins. Profile
   * settings (protocol, weight class, current weight) are today's — the app does
   * not keep a history of those.
   */
  const getTargetsForDate = (dateKey: string) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const previous = referenceDateRef.current;
    referenceDateRef.current = new Date(y, m - 1, d, 12, 0, 0);
    try {
      return {
        daysUntilWeighIn: getDaysUntilWeighIn(),
        macros: getMacroTargets(),
        slices: getSliceTargets(),
        hydration: getHydrationTarget(),
      };
    } finally {
      referenceDateRef.current = previous;
    }
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
    trackingSyncStatus,
    retryTrackingSync,
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
    getTargetsForDate,
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
       updateDailyTracking, getDailyTracking, trackingSyncStatus, retryTrackingSync, resetData, clearLogs,
       migrateLocalStorageToSupabase, hasLocalStorageData,
       calculateTarget, getWaterLoadBonus, isWaterLoadingDay,
       getDaysUntilWeighIn, getDaysUntilForDay, getTimeUntilWeighIn,
       getPhase, getTodaysFocus, getHydrationTarget, getMacroTargets,
       getFuelingGuide, getNutritionMode, getSliceTargets, getTargetsForDate,
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
