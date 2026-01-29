import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { addDays, subDays, differenceInDays, getDay, parseISO, format, startOfDay } from 'date-fns';
import { supabase } from './supabase';
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
} from './constants';

// Types
export type Protocol = '1' | '2' | '3' | '4';
// 1: Sugar Fast / Body Comp Phase (Extreme fat loss)
// 2: Fat Loss Focus / Make Weight Phase (In-Season weekly cut)
// 3: Maintain / Hold Weight Phase (At walk-around weight)
// 4: Hypertrophy / Build Phase (Off-season muscle gain)

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
  currentWeight: number;
  targetWeightClass: number;
  weighInDate: Date;
  weighInTime: string; // "HH:MM" format, e.g. "07:00"
  matchDate: Date;
  dashboardMode: 'pro';
  protocol: Protocol;
  status: Status;
  simulatedDate: Date | null;
  hasCompletedOnboarding?: boolean;
}

export interface WeightLog {
  id: string;
  date: Date;
  weight: number;
  type: 'morning' | 'pre-practice' | 'post-practice' | 'before-bed' | 'extra-before' | 'extra-after' | 'check-in';
  urineColor?: number; // 1-8
  notes?: string;
}

export interface WaterLog {
  id: string;
  date: Date;
  amount: number; // in oz
}

export interface DailyTracking {
  date: string; // YYYY-MM-DD format
  waterConsumed: number; // oz
  carbsConsumed: number; // grams
  proteinConsumed: number; // grams
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
}

interface StoreContextType {
  profile: AthleteProfile;
  fuelTanks: FuelTanks;
  logs: WeightLog[];
  dailyTracking: DailyTracking[];
  isLoading: boolean;
  updateProfile: (updates: Partial<AthleteProfile>) => void;
  addLog: (log: Omit<WeightLog, 'id'>) => void;
  updateLog: (id: string, updates: Partial<WeightLog>) => void;
  deleteLog: (id: string) => void;
  updateDailyTracking: (date: string, updates: Partial<Omit<DailyTracking, 'date'>>) => void;
  getDailyTracking: (date: string) => DailyTracking;
  resetData: () => void;
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
  getMacroTargets: () => { carbs: { min: number; max: number }; protein: { min: number; max: number }; ratio: string };
  getFuelingGuide: () => { allowed: string[]; avoid: string[]; ratio: string; protein?: string; carbs?: string };
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
  getExtraWorkoutStats: () => { avgLoss: number | null; totalWorkouts: number; todayWorkouts: number; todayLoss: number };
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
    avgPracticeLoss: number | null;
    projectedSaturday: number | null; // Based on gross loss capacity
    pace: 'ahead' | 'on-track' | 'behind' | null;
    morningWeights: Array<{ day: string; weight: number; date: Date }>;
  };
  getFoodLists: () => {
    highFructose: Array<{ name: string; ratio: string; serving: string; carbs: number; note: string }>;
    balanced: Array<{ name: string; ratio: string; serving: string; carbs: number; note: string }>;
    highGlucose: Array<{ name: string; ratio: string; serving: string; carbs: number; note: string }>;
    zeroFiber: Array<{ name: string; ratio: string; serving: string; carbs: number; note: string }>;
    recovery: Array<{ name: string; ratio: string; serving: string; carbs: number; note: string }>;
    protein: Array<{ name: string; serving: string; protein: number; note: string; timing?: string }>;
    avoid: Array<{ name: string; reason: string }>;
    tournament: Array<{ name: string; ratio: string; serving: string; carbs: number; timing: string }>;
    supplements: Array<{ name: string; serving: string; note: string }>;
    fuelTanks: Array<{ name: string; loseRate: string; replenishRate: string; performanceCost: string; declinePoint: string }>;
  };
  getTodaysFoods: () => {
    carbs: Array<{ name: string; ratio: string; serving: string; carbs: number; note: string }>;
    protein: Array<{ name: string; serving: string; protein: number; note: string }>;
    avoid: Array<{ name: string; reason: string }>;
    carbsLabel: string;
    proteinLabel: string;
  };
  getHistoryInsights: () => {
    avgOvernightDrift: number | null;
    avgPracticeLoss: number | null;
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
}

const defaultProfile: AthleteProfile = {
  name: 'Athlete',
  currentWeight: 0,
  targetWeightClass: 157,
  weighInDate: addDays(new Date(), 5), // 5 days out
  weighInTime: '07:00', // Default 7 AM weigh-in
  matchDate: addDays(new Date(), 5),
  dashboardMode: 'pro',
  protocol: '2', // Default to Make Weight Phase
  status: 'on-track',
  simulatedDate: null,
  hasCompletedOnboarding: false,
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
  const [dailyTracking, setDailyTracking] = useState<DailyTracking[]>([]);

  // Check if there's localStorage data that could be migrated
  const hasLocalStorageData = useCallback(() => {
    const savedProfile = localStorage.getItem('pwm-profile');
    const savedLogs = localStorage.getItem('pwm-logs');
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        // Check if they completed onboarding (has real data)
        return parsed.currentWeight > 0 || parsed.targetWeightClass !== 157;
      } catch {
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

        setProfile({
          name: profileData.name || 'Athlete',
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
        });
      } else {
        // No profile found - user needs to complete onboarding
        setProfile(defaultProfile);
        setLogs([]);
        setDailyTracking([]);
      }

      // Load weight logs
      const { data: logsData, error: logsError } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (logsData && !logsError) {
        setLogs(logsData.map(log => ({
          id: log.id,
          weight: log.weight,
          date: new Date(log.date),
          type: log.type as WeightLog['type'],
        })));
      }

      // Load daily tracking
      const { data: trackingData, error: trackingError } = await supabase
        .from('daily_tracking')
        .select('*')
        .eq('user_id', user.id);

      if (trackingData && !trackingError) {
        setDailyTracking(trackingData.map(t => ({
          date: t.date,
          waterConsumed: t.water_consumed || 0,
          carbsConsumed: t.carbs_consumed || 0,
          proteinConsumed: t.protein_consumed || 0,
        })));
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

    try {
      // Get localStorage data
      const savedProfile = localStorage.getItem('pwm-profile');
      const savedLogs = localStorage.getItem('pwm-logs');
      const savedTracking = localStorage.getItem('pwm-daily-tracking');

      // Migrate profile
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        await supabase.from('profiles').upsert({
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
      }

      // Migrate logs
      if (savedLogs) {
        const parsedLogs = JSON.parse(savedLogs);
        const validTypes = Object.values(LOG_TYPES);
        const logsToInsert = parsedLogs
          .filter((log: any) => validTypes.includes(log.type))
          .map((log: any) => ({
            user_id: user.id,
            weight: log.weight,
            date: new Date(log.date).toISOString(),
            type: log.type,
          }));

        if (logsToInsert.length > 0) {
          await supabase.from('weight_logs').insert(logsToInsert);
        }
      }

      // Migrate daily tracking
      if (savedTracking) {
        const parsedTracking = JSON.parse(savedTracking);
        const trackingToInsert = parsedTracking.map((t: any) => ({
          user_id: user.id,
          date: t.date,
          carbs_consumed: t.carbsConsumed || 0,
          protein_consumed: t.proteinConsumed || 0,
          water_consumed: t.waterConsumed || 0,
        }));

        if (trackingToInsert.length > 0) {
          for (const tracking of trackingToInsert) {
            await supabase.from('daily_tracking').upsert(tracking, {
              onConflict: 'user_id,date'
            });
          }
        }
      }

      // Clear localStorage after successful migration
      localStorage.removeItem('pwm-profile');
      localStorage.removeItem('pwm-logs');
      localStorage.removeItem('pwm-daily-tracking');
      localStorage.removeItem('pwm-tanks');

      // Reload from Supabase
      await loadFromSupabase();
    } catch (error) {
      console.error('Migration error:', error);
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
      setIsLoading(false);
    }
  }, [user, loadFromSupabase]);

  // Save profile to Supabase
  const updateProfile = async (updates: Partial<AthleteProfile>) => {
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

        await supabase.from('profiles').upsert({
          user_id: user.id,
          name: newProfile.name,
          current_weight: newProfile.currentWeight,
          target_weight_class: newProfile.targetWeightClass,
          weigh_in_date: weighInDateStr,
          weigh_in_time: newProfile.weighInTime || '07:00',
          protocol: parseInt(newProfile.protocol),
          has_completed_onboarding: newProfile.hasCompletedOnboarding || false,
          simulated_date: simulatedDateStr,
        }, { onConflict: 'user_id' });
      } catch (error) {
        console.error('Error saving profile:', error);
      }
    }
  };

  // Add log to Supabase
  const addLog = async (log: Omit<WeightLog, 'id'>) => {
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

    // Auto-update current weight
    const target = calculateTarget();
    setProfile(prev => ({
      ...prev,
      currentWeight: log.weight,
      status: log.weight <= target + 1 ? 'on-track' : 'borderline'
    }));

    if (user) {
      try {
        // Only insert valid log types (all weight log types)
        const validTypes = Object.values(LOG_TYPES);
        if (validTypes.includes(log.type)) {
          const { data, error } = await supabase.from('weight_logs').insert({
            user_id: user.id,
            weight: log.weight,
            date: log.date.toISOString(),
            type: log.type,
          }).select().single();

          if (error) {
            // Rollback on error
            setLogs(previousLogs);
            setProfile(previousProfile);
            console.error('Error adding log:', error);
            toast({ title: "Sync failed", description: "Could not save weight log. Please try again.", variant: "destructive" });
            return;
          }

          if (data) {
            // Update with real ID
            setLogs(prev => prev.map(l => l.id === tempId ? { ...l, id: data.id } : l));
          }
        }

        // Update profile weight in Supabase
        const { error: profileError } = await supabase.from('profiles').update({
          current_weight: log.weight,
        }).eq('user_id', user.id);

        if (profileError) {
          console.error('Error updating profile weight:', profileError);
        }
      } catch (error) {
        // Rollback on exception
        setLogs(previousLogs);
        setProfile(previousProfile);
        console.error('Error adding log:', error);
        toast({ title: "Sync failed", description: "Could not save weight log. Please try again.", variant: "destructive" });
      }
    }
  };

  const updateLog = async (id: string, updates: Partial<WeightLog>) => {
    // Capture previous state for rollback
    const previousLogs = logs;
    const previousProfile = profile;

    setLogs(prev => prev.map(log =>
      log.id === id ? { ...log, ...updates } : log
    ));

    if (updates.weight !== undefined) {
      const target = calculateTarget();
      setProfile(prev => ({
        ...prev,
        currentWeight: updates.weight!,
        status: updates.weight! <= target + 1 ? 'on-track' : 'borderline'
      }));
    }

    if (user) {
      try {
        const updateData: any = {};
        if (updates.weight !== undefined) updateData.weight = updates.weight;
        if (updates.date !== undefined) updateData.date = updates.date.toISOString();
        if (updates.type !== undefined) updateData.type = updates.type;

        const { error } = await supabase.from('weight_logs').update(updateData).eq('id', id);

        if (error) {
          // Rollback on error
          setLogs(previousLogs);
          setProfile(previousProfile);
          console.error('Error updating log:', error);
          toast({ title: "Sync failed", description: "Could not update weight log. Please try again.", variant: "destructive" });
          return;
        }

        if (updates.weight !== undefined) {
          const { error: profileError } = await supabase.from('profiles').update({
            current_weight: updates.weight,
          }).eq('user_id', user.id);

          if (profileError) {
            console.error('Error updating profile weight:', profileError);
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
        proteinConsumed: existing.proteinConsumed ?? 0
      };
    }
    return { date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0 };
  };

  const updateDailyTracking = async (date: string, updates: Partial<Omit<DailyTracking, 'date'>>) => {
    // Capture previous state for rollback
    const previousTracking = dailyTracking;

    setDailyTracking(prev => {
      const existing = prev.find(d => d.date === date);
      if (existing) {
        return prev.map(d => d.date === date ? { ...d, ...updates } : d);
      }
      return [...prev, { date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0, ...updates }];
    });

    if (user) {
      try {
        const current = getDailyTracking(date);
        const { error } = await supabase.from('daily_tracking').upsert({
          user_id: user.id,
          date: date,
          carbs_consumed: updates.carbsConsumed ?? current.carbsConsumed,
          protein_consumed: updates.proteinConsumed ?? current.proteinConsumed,
          water_consumed: updates.waterConsumed ?? current.waterConsumed,
        }, { onConflict: 'user_id,date' });

        if (error) {
          // Rollback on error
          setDailyTracking(previousTracking);
          console.error('Error updating daily tracking:', error);
          toast({ title: "Sync failed", description: "Could not save tracking data. Please try again.", variant: "destructive" });
        }
      } catch (error) {
        // Rollback on exception
        setDailyTracking(previousTracking);
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
        }).eq('user_id', user.id);
      } catch (error) {
        console.error('Error resetting data:', error);
      }
    }

    localStorage.clear();
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

    // Protocol 4 (Build Phase) - no cutting, stay at weight class
    if (protocol === '4') {
      return w;
    }

    // Protocol 3 (Hold Weight) - maintain near walk-around, minimal cut
    // Uses slightly different multipliers than full cutting protocols
    if (protocol === '3') {
      if (daysUntil < 0) return Math.round(w * 1.05); // Recovery
      if (daysUntil === 0) return w; // Competition
      if (daysUntil === 1) return Math.round(w * 1.03); // Day before
      if (daysUntil === 2) return Math.round(w * 1.04); // 2 days out
      return Math.round(w * 1.05); // 3+ days out - maintain walk-around
    }

    // Protocols 1 & 2 (Body Comp & Make Weight) - use centralized calculation
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
    const fluidMin = Math.round(lostWeight * 24);
    const fluidMax = Math.round(lostWeight * 28);
    const sodiumMin = Math.round(lostWeight * 1);
    const sodiumMax = Math.round(lostWeight * 2);

    return {
      fluidRange: `${fluidMin}-${fluidMax} oz`,
      sodiumRange: `${sodiumMin}-${sodiumMax}g`,
      glycogen: "40-50g Dextrose/Rice Cakes"
    };
  };

  // Helper: Get days until weigh-in (used throughout for protocol timing)
  // Uses startOfDay to avoid timezone/time-of-day issues with differenceInDays
  const getDaysUntilWeighIn = (): number => {
    const today = startOfDay(profile.simulatedDate || new Date());
    const weighIn = startOfDay(profile.weighInDate);
    return differenceInDays(weighIn, today);
  };

  // Helper: Get formatted time until weigh-in at 30-min granularity
  const getTimeUntilWeighIn = (): string => {
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

    // All protocols use the centralized oz/lb hydration system
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
    // Use the athlete's current weight (or walk-around estimate) for oz/lb scaling
    const athleteWeight = logs.length > 0
      ? logs[logs.length - 1].weight
      : Math.round(profile.targetWeightClass * 1.07);

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

  const getMacroTargets = () => {
    const w = profile.currentWeight || profile.targetWeightClass;
    const protocol = profile.protocol;
    const daysUntilWeighIn = getDaysUntilWeighIn();

    // Protocol 1: Body Comp / Emergency Cut (AGGRESSIVE)
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

    // Protocol 2: Make Weight / Fat Loss Focus (STANDARD weekly cut)
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

    // Protocol 3: Maintain / Hold Weight Phase
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

    // Protocol 4: Hypertrophy / Build Phase (Off-season)
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
        ratio: "Build Phase"
      };
    }

    return {
      carbs: { min: 300, max: 400 },
      protein: { min: 75, max: 100 },
      ratio: "Balanced"
    };
  };

  const getFoodLists = () => {
    return {
      highFructose: [
        { name: "Agave syrup", ratio: "90:10", serving: "1 Tbsp", carbs: 16, note: "Highest fructose" },
        { name: "Apple juice", ratio: "70:30", serving: "8 oz", carbs: 28, oz: 8, note: "Fast absorption, no pulp" },
        { name: "Pear juice", ratio: "65:35", serving: "8 oz", carbs: 26, oz: 8, note: "High fructose" },
        { name: "Grape juice", ratio: "55:45", serving: "8 oz", carbs: 36, oz: 8, note: "Balanced" },
        { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, oz: 8, note: "Vitamin C" },
        { name: "Apples", ratio: "65:35", serving: "1 medium", carbs: 25, note: "Portable" },
        { name: "Pears", ratio: "65:35", serving: "1 medium", carbs: 27, note: "High fructose" },
        { name: "Grapes", ratio: "48:52", serving: "1 cup", carbs: 27, note: "Convenient" },
        { name: "Mango", ratio: "50:50", serving: "1 cup", carbs: 25, note: "Tropical" },
        { name: "Watermelon", ratio: "48:52", serving: "2 cups", carbs: 22, note: "Hydrating" },
        { name: "Bananas", ratio: "50:50", serving: "1 medium", carbs: 27, note: "Energy dense" },
        { name: "Blueberries", ratio: "45:55", serving: "1 cup", carbs: 21, note: "Antioxidants" },
        { name: "Dried fruit", ratio: "55:45", serving: "1/4 cup", carbs: 30, note: "Concentrated fructose" },
        { name: "Maple syrup", ratio: "50:50", serving: "1 Tbsp", carbs: 13, note: "Natural sweetener" },
        { name: "Honey", ratio: "50:50", serving: "1 Tbsp", carbs: 17, note: "All phases" },
        { name: "Sugar", ratio: "50:50", serving: "1 Tbsp", carbs: 12, note: "Simple" },
        { name: "Gummy bears", ratio: "55:45", serving: "17 bears", carbs: 22, note: "Zero fiber" },
        { name: "Coconut water", ratio: "40:60", serving: "8 oz", carbs: 9, oz: 8, note: "Potassium + electrolytes" },
      ],
      highGlucose: [
        { name: "White rice", ratio: "0:100", serving: "1 cup cooked", carbs: 45, note: "Primary Thu-Fri" },
        { name: "Instant rice", ratio: "0:100", serving: "1 cup cooked", carbs: 45, note: "Very fast" },
        { name: "Potatoes (peeled)", ratio: "0:100", serving: "1 medium", carbs: 37, note: "Remove skin" },
        { name: "Sweet potatoes (peeled)", ratio: "0:100", serving: "1 medium", carbs: 27, note: "Remove skin" },
        { name: "Rice cakes", ratio: "0:100", serving: "2 cakes", carbs: 14, note: "Zero fiber" },
        { name: "Cream of rice", ratio: "0:100", serving: "1 cup cooked", carbs: 28, note: "Hot cereal" },
        { name: "Rice Krispies", ratio: "0:100", serving: "1 cup", carbs: 26, note: "With honey/juice" },
        { name: "White bread (<1g fiber)", ratio: "0:100", serving: "2 slices", carbs: 26, note: "Check label" },
        { name: "Sourdough", ratio: "0:100", serving: "2 slices", carbs: 30, note: "Easy digestion" },
        { name: "Apple juice", ratio: "70:30", serving: "8 oz", carbs: 28, oz: 8, note: "Zero fiber" },
        { name: "Grape juice", ratio: "55:45", serving: "8 oz", carbs: 36, oz: 8, note: "Zero fiber" },
        { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, oz: 8, note: "Zero fiber" },
        { name: "Gummy bears", ratio: "55:45", serving: "17 bears", carbs: 22, note: "Portable" },
      ],
      balanced: [
        { name: "White rice", ratio: "0:100", serving: "1 cup cooked", carbs: 45, note: "Staple" },
        { name: "Honey", ratio: "50:50", serving: "2 Tbsp", carbs: 34, note: "Natural balance" },
        { name: "Ripe banana", ratio: "50:50", serving: "1 medium", carbs: 27, note: "Pre-practice" },
        { name: "Rice cakes", ratio: "0:100", serving: "2 cakes", carbs: 14, note: "Easy digestion" },
        { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, note: "Vitamin C" },
        { name: "Mango", ratio: "50:50", serving: "1 cup", carbs: 25, note: "Tropical" },
        { name: "Grapes", ratio: "48:52", serving: "1 cup", carbs: 27, note: "Convenient" },
        { name: "Watermelon", ratio: "48:52", serving: "2 cups", carbs: 22, note: "Hydrating" },
        { name: "Gummy bears", ratio: "55:45", serving: "17 bears", carbs: 22, note: "Quick energy" },
        { name: "Sugar", ratio: "50:50", serving: "1 Tbsp", carbs: 12, note: "Simple" },
        { name: "Blueberries", ratio: "45:55", serving: "1 cup", carbs: 21, note: "Antioxidants" },
        { name: "Coconut water", ratio: "40:60", serving: "8 oz", carbs: 9, note: "Potassium" },
      ],
      zeroFiber: [
        { name: "White rice", ratio: "0:100", serving: "1 cup", carbs: 45, note: "Primary carb" },
        { name: "Instant rice", ratio: "0:100", serving: "1 cup", carbs: 45, note: "Very fast" },
        { name: "Potatoes (peeled)", ratio: "0:100", serving: "1 medium", carbs: 37, note: "Remove skin" },
        { name: "Sweet potatoes (peeled)", ratio: "0:100", serving: "1 medium", carbs: 27, note: "Remove skin" },
        { name: "Rice cakes", ratio: "0:100", serving: "2 cakes", carbs: 14, note: "Zero fiber" },
        { name: "Cream of rice", ratio: "0:100", serving: "1 cup", carbs: 28, note: "Hot cereal" },
        { name: "Rice Krispies", ratio: "0:100", serving: "1 cup", carbs: 26, note: "With honey/juice" },
        { name: "White bread (<1g fiber)", ratio: "0:100", serving: "2 slices", carbs: 26, note: "Check label" },
        { name: "Sourdough", ratio: "0:100", serving: "2 slices", carbs: 30, note: "Easy digestion" },
        { name: "Apple juice", ratio: "70:30", serving: "8 oz", carbs: 28, oz: 8, note: "Zero fiber" },
        { name: "Grape juice", ratio: "55:45", serving: "8 oz", carbs: 36, oz: 8, note: "Zero fiber" },
        { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, oz: 8, note: "Zero fiber" },
        { name: "Gummy bears", ratio: "55:45", serving: "17 bears", carbs: 22, note: "Portable" },
        { name: "Honey", ratio: "50:50", serving: "2 Tbsp", carbs: 34, note: "Pure sugar" },
        { name: "Dextrose powder", ratio: "0:100", serving: "40g", carbs: 40, note: "No fiber" },
      ],
      protein: [
        { name: "Collagen + 5g leucine", serving: "25-30g", protein: 25, note: "Mon-Fri: Primary, preserves muscle", timing: "Mon-Fri" },
        { name: "Egg whites", serving: "4 whites", protein: 14, note: "Wed-Fri: Low fat, easy digestion", timing: "Wed-Fri" },
        { name: "White fish", serving: "4 oz", protein: 24, note: "Thu-Fri: Ultra lean", timing: "Thu-Fri" },
        { name: "Shrimp", serving: "4 oz", protein: 24, note: "Thu-Fri: Zero fat", timing: "Thu-Fri" },
        { name: "Scallops", serving: "4 oz", protein: 20, note: "Thu-Fri: Zero fat", timing: "Thu-Fri" },
        { name: "Lean seafood", serving: "4 oz", protein: 22, note: "Thu-Fri: Performance phase", timing: "Thu-Fri" },
        { name: "NO protein", serving: "—", protein: 0, note: "Competition day: Until wrestling is over", timing: "Competition" },
        { name: "Whey isolate", serving: "1 scoop", protein: 25, note: "Post-competition: Fast recovery", timing: "Post-comp" },
        { name: "Chicken breast", serving: "4 oz", protein: 26, note: "Post-competition: Lean protein", timing: "Post-comp" },
        { name: "Beef/Bison", serving: "4 oz", protein: 26, note: "Post-competition: Iron + creatine", timing: "Post-comp" },
        { name: "Whole eggs", serving: "3 large", protein: 18, note: "Post-comp & Sunday: Full recovery", timing: "Post-comp/Sun" },
        { name: "Greek yogurt", serving: "1 cup", protein: 17, note: "Sunday: Recovery", timing: "Sunday" },
        { name: "Casein", serving: "1 scoop", protein: 24, note: "Sunday PM: Overnight recovery", timing: "Sunday PM" },
        { name: "Dairy", serving: "varies", protein: 8, note: "Sunday: All allowed", timing: "Sunday" },
        { name: "Plant proteins", serving: "varies", protein: 15, note: "Sunday: Higher fat", timing: "Sunday" },
      ],
      avoid: [
        { name: "Whey protein (Mon-Wed)", reason: "Blocks fat burning" },
        { name: "Casein protein (Mon-Wed)", reason: "Blocks fat burning" },
        { name: "Chicken/Poultry (Mon-Wed)", reason: "Blocks fat burning" },
        { name: "Turkey (Mon-Wed)", reason: "Blocks fat burning" },
        { name: "Beef (Mon-Wed)", reason: "Blocks fat burning" },
        { name: "Pork (Mon-Wed)", reason: "Blocks fat burning" },
        { name: "Eggs (Mon-Wed)", reason: "Blocks fat burning" },
        { name: "Dairy (Mon-Wed)", reason: "Blocks fat burning" },
        { name: "Vegetables (Thu-Fri)", reason: "Fiber adds gut weight" },
        { name: "Fruits (Thu-Fri)", reason: "Fiber adds gut weight" },
        { name: "Whole grains (Thu-Fri)", reason: "Fiber adds gut weight" },
        { name: "Brown rice (Thu-Fri)", reason: "Fiber adds gut weight" },
        { name: "Oatmeal (Thu-Fri)", reason: "Fiber adds gut weight" },
        { name: "Beans/legumes (Thu-Fri)", reason: "High fiber + gas" },
        { name: "Nuts (Thu-Fri)", reason: "Fiber + fat" },
        { name: "Seeds (Thu-Fri)", reason: "Fiber + fat" },
        { name: "Fatty meats", reason: "Slow digestion" },
        { name: "Fried foods", reason: "Slow digestion, bloating" },
        { name: "Dairy (during cut)", reason: "Can cause bloating" },
        { name: "Carbonated drinks", reason: "Gas and bloating" },
        { name: "High-fat foods", reason: "Slow glycogen restoration" },
        { name: "Alcohol", reason: "Dehydrates, empty calories" },
        { name: "Spicy foods (Thu-Fri)", reason: "Can cause GI issues" },
        { name: "Large meals (Thu-Fri)", reason: "Gut weight" },
      ],
      recovery: [
        { name: "Whole eggs", ratio: "N/A", serving: "3-4 eggs", carbs: 2, note: "Full recovery protein + fats" },
        { name: "Chicken breast", ratio: "N/A", serving: "6-8 oz", carbs: 0, note: "Lean protein rebuild" },
        { name: "Beef/Steak", ratio: "N/A", serving: "6-8 oz", carbs: 0, note: "Iron + creatine repletion" },
        { name: "Greek yogurt", ratio: "N/A", serving: "1-2 cups", carbs: 8, note: "Protein + probiotics" },
        { name: "Whey protein", ratio: "N/A", serving: "1-2 scoops", carbs: 3, note: "Fast absorbing protein" },
        { name: "White rice", ratio: "0:100", serving: "2-3 cups", carbs: 90, note: "Glycogen refill" },
        { name: "Potatoes", ratio: "0:100", serving: "2 medium", carbs: 74, note: "Potassium + carbs" },
        { name: "Pasta", ratio: "0:100", serving: "2 cups cooked", carbs: 86, note: "Glycogen loading" },
        { name: "Bread", ratio: "0:100", serving: "4 slices", carbs: 52, note: "Easy carbs" },
        { name: "Fruit (all types)", ratio: "varies", serving: "2-3 servings", carbs: 45, note: "Vitamins + fiber OK today" },
        { name: "Vegetables", ratio: "N/A", serving: "unlimited", carbs: 10, note: "Fiber OK - gut reset" },
        { name: "Oatmeal", ratio: "0:100", serving: "1 cup dry", carbs: 54, note: "Slow carbs for recovery" },
        { name: "Casein shake", ratio: "N/A", serving: "1 scoop", carbs: 3, note: "Before bed - overnight recovery" },
      ],
      tournament: [
        { name: "Electrolyte drink", ratio: "45:55", serving: "16-20 oz", carbs: 21, timing: "0-5 min post" },
        { name: "Dextrose drink", ratio: "0:100", serving: "20-30g", carbs: 25, timing: "0-5 min post" },
        { name: "Rice cakes + honey", ratio: "25:75", serving: "2-3 cakes", carbs: 30, timing: "10-15 min" },
        { name: "Energy gel", ratio: "30:70", serving: "1 packet", carbs: 22, timing: "10-15 min" },
        { name: "Gummy bears", ratio: "55:45", serving: "handful", carbs: 22, timing: "10-15 min" },
        { name: "Apple juice", ratio: "70:30", serving: "8-12 oz", carbs: 28, timing: "20-30 min" },
        { name: "Grape juice", ratio: "55:45", serving: "8-12 oz", carbs: 36, timing: "20-30 min" },
        { name: "Sports drink", ratio: "45:55", serving: "16 oz", carbs: 21, timing: "20-30 min" },
        { name: "Small white rice", ratio: "0:100", serving: "1/2 cup", carbs: 22, timing: "40-50 min" },
        { name: "Ripe banana", ratio: "50:50", serving: "1 medium", carbs: 27, timing: "40-50 min" },
        { name: "White bread + honey", ratio: "25:75", serving: "1 slice", carbs: 20, timing: "40-50 min" },
        { name: "Electrolyte sipping", ratio: "45:55", serving: "16-24 oz/hr", carbs: 21, timing: "Continuous" },
      ],
      supplements: [
        { name: "Leucine", serving: "5g with collagen", note: "Add to collagen for muscle preservation" },
        { name: "TUDCA", serving: "250mg AM/PM", note: "Liver support during high fructose" },
        { name: "Choline", serving: "500mg AM/PM", note: "Fat metabolism support" },
        { name: "Electrolyte powder", serving: "1-2 scoops", note: "Add to all water" },
        { name: "Sodium (salt)", serving: "1-2g per liter", note: "Critical for hydration" },
        { name: "Magnesium", serving: "400mg", note: "Prevents cramping" },
        { name: "Potassium", serving: "from food", note: "Bananas, potatoes" },
      ],
      fuelTanks: [
        {
          name: "Water",
          loseRate: "Hours (2-8 lbs in practice)",
          replenishRate: "1-3 hours with fluids + sodium + carbs",
          performanceCost: "High",
          declinePoint: ">3% dehydration = early decline; 5%+ = clear drop; 6%+ = major decline"
        },
        {
          name: "Glycogen",
          loseRate: "1-2 days (30-60% after hard practice, 2-3 lbs)",
          replenishRate: "4-6 hours to 70-80%; 20-24 hours for full",
          performanceCost: "High",
          declinePoint: "20-30% depletion = flatness; 40-50% = speed/pop drop; 60-70% = severe fatigue"
        },
        {
          name: "Gut Content",
          loseRate: "12-24 hours (low-fiber/liquid meals drop 1-3 lbs)",
          replenishRate: "12-24 hours",
          performanceCost: "None",
          declinePoint: "No performance decline unless paired with dehydration or low carbs"
        },
        {
          name: "Fat",
          loseRate: "Weeks (0.5-2 lbs/week)",
          replenishRate: "Weeks",
          performanceCost: "None",
          declinePoint: "No performance decline — fat loss improves power-to-weight ratio"
        },
        {
          name: "Muscle",
          loseRate: "Weeks (only with chronic restriction/dehydration)",
          replenishRate: "Weeks-months",
          performanceCost: "Critical",
          declinePoint: "Any muscle loss = immediate strength/power decline"
        },
      ],
    };
  };

  // Get protocol-specific and day-specific food recommendations
  // Uses daysUntilWeighIn for all timing to support any weigh-in day
  const getTodaysFoods = () => {
    const protocol = profile.protocol;
    const daysUntil = getDaysUntilWeighIn();
    const foods = getFoodLists();

    // Default lists
    let carbs = foods.balanced;
    let protein = foods.protein;
    let avoid = foods.avoid;
    let carbsLabel = "Balanced Carbs";
    let proteinLabel = "Standard Protein";

    // Protocol 1: Body Comp / Emergency Cut (AGGRESSIVE - extended no protein)
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
    // Protocol 2: Make Weight / Fat Loss Focus (STANDARD weekly cut)
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
    // Protocol 3: Hold Weight
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
    // Protocol 4: Build Phase
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

    // Protocol 1: Body Comp / Emergency Cut (AGGRESSIVE)
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

    // Protocol 2: Make Weight / Fat Loss Focus (STANDARD)
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
       title = "Today's Mission: Body Comp";
       actions.push(`Hit Protein Target: ${fuel.protein || '0g'}`);
       actions.push(`Hit Carb Target: ${fuel.carbs || 'High'}`);
       if (phase === 'metabolic') actions.push("Maximize Fat Burning (Strict No Protein)");
       if (phase === 'performance-prep') actions.push("Reintroduce Protein Evening (0.2g/lb)");
    } else if (protocol === '2') {
       title = "Today's Mission: Make Weight";
       actions.push(`Hit Protein Target: ${fuel.protein}`);
       actions.push(`Hit Carb Target: ${fuel.carbs}`);
       if (phase === 'metabolic') actions.push("Maximize Fat Burning (Keep Protein Low)");
       if (phase === 'transition') actions.push("Switch to Glucose/Starch + Seafood");
    } else if (protocol === '3') {
       title = "Today's Mission: Hold Weight";
       actions.push("Focus on Performance & Recovery");
       actions.push(`Hit Protein Target: ${fuel.protein}`);
    } else if (protocol === '4') {
       title = "Today's Mission: Build";
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

  // Helper to get days until weigh-in for a specific calendar day in the current comp week
  // The week runs Mon-Sun, so we calculate relative to the Monday of the weigh-in week
  const getDaysUntilForDay = (dayNum: number): number => {
    // dayNum: 0=Sun, 1=Mon, 2=Tue, etc.
    const weighIn = startOfDay(profile.weighInDate);
    const weighInDow = getDay(weighIn); // 0=Sun, 6=Sat
    // Find Monday of the weigh-in week
    const daysBackToMonday = weighInDow === 0 ? 6 : weighInDow - 1;
    const weekMonday = startOfDay(addDays(weighIn, -daysBackToMonday));
    // Target day relative to Monday of weigh-in week
    // dayNum 1=Mon -> offset 0, 2=Tue -> 1, ... 0=Sun -> 6
    const dayOffset = dayNum === 0 ? 6 : dayNum - 1;
    const targetDate = startOfDay(addDays(weekMonday, dayOffset));
    return differenceInDays(weighIn, targetDate);
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

    // Helper to get the actual calendar date for a given day-of-week in the comp week
    const getDateForDay = (dayNum: number): Date => {
      const weighIn = startOfDay(profile.weighInDate);
      const weighInDow = getDay(weighIn);
      const daysBackToMonday = weighInDow === 0 ? 6 : weighInDow - 1;
      const weekMonday = startOfDay(addDays(weighIn, -daysBackToMonday));
      const dayOffset = dayNum === 0 ? 6 : dayNum - 1;
      return startOfDay(addDays(weekMonday, dayOffset));
    };

    // Helper to get phase name based on days until weigh-in
    const getPhaseForDays = (daysUntil: number): string => {
      if (daysUntil < 0) return 'Recover';
      if (daysUntil === 0) return 'Compete';
      if (daysUntil === 1) return 'Cut';
      if (daysUntil === 2) return 'Prep';
      if (daysUntil >= 3 && daysUntil <= 5) return 'Load';
      return 'Train';
    };

    // Use centralized water loading check from constants
    const isWaterLoadingForDays = (daysUntil: number): boolean => {
      return checkWaterLoadingDay(daysUntil, protocol);
    };

    // Protocol 4 (Build Phase) - No weight cutting, maintain/gain weight
    // Uses days-until-weigh-in for competition/recovery timing
    if (protocol === '4') {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun order

      const buildDays: DayPlan[] = dayOrder.map(dayNum => {
        const daysUntil = getDaysUntilForDay(dayNum);
        const prevDayNum = dayNum === 0 ? 6 : dayNum - 1;

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
          date: getDateForDay(dayNum),
          phase,
          weightTarget: w, // Morning target (primary data point)
          water,
          carbs,
          protein,
          isToday: currentDayOfWeek === dayNum,
          isTomorrow: currentDayOfWeek === prevDayNum
        };
      });
      return buildDays;
    }

    // Protocol 3 (Hold Weight) - Minimal cutting, maintain walk-around weight
    // Uses days-until-weigh-in for competition timing
    if (protocol === '3') {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun order

      const holdDays: DayPlan[] = dayOrder.map(dayNum => {
        const daysUntil = getDaysUntilForDay(dayNum);
        const prevDayNum = dayNum === 0 ? 6 : dayNum - 1;

        // Protocol 3 uses slightly different multipliers - less aggressive cut
        // 3+ days out: 1.05 (5% over), 2 days: 1.04, 1 day: 1.03, competition: weight class
        const holdMultiplier = daysUntil <= 0 ? 1.0
          : daysUntil === 1 ? 1.03
          : daysUntil === 2 ? 1.04
          : 1.05;
        const holdTarget = daysUntil === 0 ? w : Math.round(w * holdMultiplier);

        // Default maintenance values
        let phase = 'Maintain';
        let weightTarget = holdTarget; // Morning target (primary data point)
        let carbs = { min: 300, max: 450 };
        let protein = { min: 75, max: 75 };
        let water = {
          amount: isHeavy ? '1.25 gal' : isMedium ? '1.0 gal' : '0.75 gal',
          targetOz: galToOz(isHeavy ? 1.25 : isMedium ? 1.0 : 0.75),
          type: 'Regular'
        };

        if (daysUntil < 0) {
          // Recovery day
          phase = 'Recover';
          protein = { min: Math.round(w * 1.4), max: Math.round(w * 1.4) };
        } else if (daysUntil === 0) {
          // Competition day
          phase = 'Compete';
          carbs = { min: 200, max: 400 };
          protein = { min: Math.round(w * 0.5), max: Math.round(w * 0.5) };
          water = {
            amount: 'Rehydrate',
            targetOz: galToOz(1.0),
            type: 'Rehydrate'
          };
        } else if (daysUntil === 1) {
          // Day before - prep with lower water
          phase = 'Prep';
          protein = { min: 100, max: 100 };
          water = {
            amount: isHeavy ? '1.0 gal' : isMedium ? '0.75 gal' : '0.5 gal',
            targetOz: galToOz(isHeavy ? 1.0 : isMedium ? 0.75 : 0.5),
            type: 'Regular'
          };
        } else if (daysUntil === 2) {
          // 2 days out - prep
          phase = 'Prep';
          protein = { min: 100, max: 100 };
        } else if (daysUntil >= 5) {
          // 5+ days out - lower protein maintenance
          protein = { min: 25, max: 25 };
        }

        return {
          day: dayNames[dayNum],
          dayNum,
          date: getDateForDay(dayNum),
          phase,
          weightTarget,
          water,
          carbs,
          protein,
          isToday: currentDayOfWeek === dayNum,
          isTomorrow: currentDayOfWeek === prevDayNum
        };
      });
      return holdDays;
    }

    // Protocols 1 & 2 (Body Comp & Make Weight) - Full cutting protocol
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
    const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun order

    const days: DayPlan[] = dayOrder.map(dayNum => {
      const daysUntil = getDaysUntilForDay(dayNum);
      const prevDayNum = dayNum === 0 ? 6 : dayNum - 1;
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
        date: getDateForDay(dayNum),
        phase,
        weightTarget,
        water,
        carbs,
        protein,
        isToday: currentDayOfWeek === dayNum,
        isTomorrow: currentDayOfWeek === prevDayNum,
        waterLoadingNote,
        isCriticalCheckpoint
      };
    });

    return days;
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
    // Logs are sorted newest first, so logs[i] is more recent than logs[i+1]
    // Overnight drift = previous post-practice - this morning (weight LOST overnight)
    // Session loss = pre-practice - post-practice (weight LOST during practice)
    let overnightSum = 0;
    let overnightCount = 0;
    let sessionSum = 0;
    let sessionCount = 0;

    for (let i = 0; i < logs.length - 1; i++) {
        const current = logs[i];    // More recent
        const next = logs[i+1];     // Older

        // Overnight drift: morning (current) vs previous day's post-practice (next)
        // Drift = post-practice - morning = next.weight - current.weight (positive = weight lost)
        if (current.type === 'morning' && next.type === 'post-practice') {
            const diffHours = (current.date.getTime() - next.date.getTime()) / (1000 * 60 * 60);
            if (diffHours > 6 && diffHours < 16) {
                overnightSum += (next.weight - current.weight);
                overnightCount++;
            }
        }

        // Session loss: post-practice (current) vs pre-practice (next)
        // Loss = pre-practice - post-practice = next.weight - current.weight (positive = weight lost)
        if (current.type === 'post-practice' && next.type === 'pre-practice') {
             const diffHours = (current.date.getTime() - next.date.getTime()) / (1000 * 60 * 60);
             if (diffHours < 4) {
                 sessionSum += (next.weight - current.weight);
                 sessionCount++;
             }
        }
    }

    return {
        overnight: overnightCount > 0 ? (overnightSum / overnightCount) : null,
        session: sessionCount > 0 ? (sessionSum / sessionCount) : null
    };
  };

  // Calculate extra workout statistics from logged extra-before/extra-after pairs
  const getExtraWorkoutStats = (): { avgLoss: number | null; totalWorkouts: number; todayWorkouts: number; todayLoss: number } => {
    const today = startOfDay(profile.simulatedDate || new Date());
    const todayStr = format(today, 'yyyy-MM-dd');

    // Find all extra-before logs and pair them with their extra-after
    const extraBeforeLogs = logs.filter(l => l.type === 'extra-before')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const extraAfterLogs = logs.filter(l => l.type === 'extra-after')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const workoutLosses: number[] = [];
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

          // Check if this workout is from today
          if (beforeDay === todayStr) {
            todayWorkouts++;
            todayLoss += loss;
          }
        }
      }
    }

    return {
      avgLoss: workoutLosses.length > 0
        ? workoutLosses.reduce((a, b) => a + b, 0) / workoutLosses.length
        : null,
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
      format(startOfDay(new Date(l.date)), 'yyyy-MM-dd') === todayStr && l.type === 'morning'
    );
    const morningWeight = todayMorningLog?.weight || 0;

    // Most recent weigh-in of any type (mirrors getWeekDescentData logic)
    const allTodayStatusLogs = logs.filter(l =>
      format(startOfDay(new Date(l.date)), 'yyyy-MM-dd') === todayStr
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const currentWeight = allTodayStatusLogs.length > 0 ? allTodayStatusLogs[0].weight : morningWeight;

    if (morningWeight === 0 && currentWeight === 0) {
      return { status: 'on-track', label: 'LOG WEIGHT', color: 'text-muted-foreground', bgColor: 'bg-muted/30', contextMessage: 'Log morning weight' };
    }

    // calculateTarget() already includes water loading for protocols 1 & 2
    // So we DON'T add water bonus again - just compare directly to the target
    const target = calculateTarget();
    // Use current weight (most recent weigh-in) for diff so status updates throughout the day
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
        projectionWarning = `Projected ${projectedOver.toFixed(1)} lbs over by weigh-in`;

        // Calculate recommendation based on how much over and days remaining
        const extraStats = getExtraWorkoutStats();
        const daysRemaining = descentData.daysRemaining;

        // Default workout loss estimate if no data (conservative 1.5 lbs per 30-45 min session)
        const avgWorkoutLoss = extraStats.avgLoss ?? 1.5;

        // Calculate how many extra workouts needed
        const workoutsNeeded = Math.ceil(projectedOver / avgWorkoutLoss);

        // Base recommendation object with common fields
        const baseRec = {
          totalWorkoutsNeeded: workoutsNeeded,
          todayWorkoutsDone: extraStats.todayWorkouts,
          todayLoss: extraStats.todayLoss,
          avgExtraWorkoutLoss: extraStats.avgLoss
        };

        // Build estimate disclaimer
        const usingEstimate = extraStats.avgLoss === null;
        const estimateNote = usingEstimate
          ? ' (est. 1.5 lb/workout - log one to personalize)'
          : '';

        // Determine urgency and message based on how much over and days remaining
        if (projectedOver > 4) {
          // 4+ lbs over - critical
          if (daysRemaining < 3) {
            // Less than 3 days with 4+ lbs to lose - DANGER
            recommendation = {
              ...baseRec,
              extraWorkoutsNeeded: workoutsNeeded,
              message: `DANGER: ${projectedOver.toFixed(1)} lbs over with ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left. Consider moving up a weight class.`,
              urgency: 'critical',
              switchProtocol: true
            };
          } else {
            // 3+ days with 4+ lbs - switch protocol + extra workouts
            recommendation = {
              ...baseRec,
              extraWorkoutsNeeded: workoutsNeeded,
              message: `${workoutsNeeded}+ extra workouts needed before weigh-in${estimateNote}. Switch to Body Comp protocol.`,
              urgency: 'critical',
              switchProtocol: true
            };
          }
        } else if (projectedOver > 2) {
          // 2-4 lbs over - high urgency
          if (daysRemaining < 3) {
            recommendation = {
              ...baseRec,
              extraWorkoutsNeeded: workoutsNeeded,
              message: `${workoutsNeeded} extra workouts needed before weigh-in${estimateNote}. Consider switching protocols.`,
              urgency: 'high',
              switchProtocol: true
            };
          } else {
            recommendation = {
              ...baseRec,
              extraWorkoutsNeeded: workoutsNeeded,
              message: `${workoutsNeeded} extra workouts needed before weigh-in${estimateNote} OR switch protocol.`,
              urgency: 'high',
              switchProtocol: false
            };
          }
        } else {
          // 1-2 lbs over - moderate
          recommendation = {
            ...baseRec,
            extraWorkoutsNeeded: workoutsNeeded,
            message: `${workoutsNeeded} extra workout${workoutsNeeded > 1 ? 's' : ''} needed before weigh-in${estimateNote}.`,
            urgency: 'moderate',
            switchProtocol: false
          };
        }

        // Adjust message if they have logged extra workouts today
        if (extraStats.todayWorkouts > 0) {
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
    const projStr = descentData.projectedSaturday !== null && descentData.daysRemaining > 0
      ? ` → proj ${descentData.projectedSaturday.toFixed(1)}`
      : '';
    const buildContextMessage = (): string => {
      if (waterLoading) {
        if (diff <= 0) return `${currentWeight.toFixed(1)} lbs — on target${projStr}`;
        return `${currentWeight.toFixed(1)} lbs — +${diff.toFixed(1)} above${projStr}`;
      }
      if (diff <= 0) return `${currentWeight.toFixed(1)} lbs — on target${projStr}`;
      return `${currentWeight.toFixed(1)} lbs — ${diff.toFixed(1)} above${projStr}`;
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
        return { status: 'borderline', label: 'BORDERLINE', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', contextMessage, waterLoadingNote: `+${diff.toFixed(1)} lbs above target`, projectionWarning, recommendation };
      }
      // Significantly over - upgrade to borderline if projection shows making weight
      if (projectedToMakeWeight && !projectionWarning) {
        return { status: 'borderline', label: 'PROJECTED OK', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', contextMessage, waterLoadingNote: `+${diff.toFixed(1)} lbs above target (loading)` };
      }
      return { status: 'risk', label: 'AT RISK', color: 'text-destructive', bgColor: 'bg-destructive/20', contextMessage, waterLoadingNote: `+${diff.toFixed(1)} lbs above target`, projectionWarning, recommendation };
    }

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
      return { status: 'borderline', label: 'BORDERLINE', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', contextMessage, projectionWarning, recommendation };
    }
    // Significantly over — upgrade to BORDERLINE if projection shows making weight
    if (projectedToMakeWeight && !projectionWarning) {
      return { status: 'borderline', label: 'PROJECTED OK', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', contextMessage };
    }
    return { status: 'risk', label: 'AT RISK', color: 'text-destructive', bgColor: 'bg-destructive/20', contextMessage, projectionWarning, recommendation };
  };

  const getDailyPriority = (): { priority: string; subtext?: string; urgency: 'normal' | 'high' | 'critical'; icon: string; actionType?: 'log-weight' | 'log-workout' | 'check-food' } => {
    const protocol = profile.protocol;
    const daysUntilWeighIn = getDaysUntilWeighIn();
    const statusData = getStatus();

    // Build projection/recommendation subtext — keep it short
    const buildSubtext = (): string | undefined => {
      if (statusData.projectionWarning && statusData.recommendation) {
        const rec = statusData.recommendation;
        if (rec.extraWorkoutsNeeded > 0) {
          return `${statusData.projectionWarning}. ${rec.extraWorkoutsNeeded} extra workout${rec.extraWorkoutsNeeded > 1 ? 's' : ''} needed.`;
        }
        return statusData.projectionWarning;
      }
      if (statusData.projectionWarning) {
        return statusData.projectionWarning;
      }
      if (statusData.waterLoadingNote) {
        return `${statusData.waterLoadingNote} — normal during water loading.`;
      }
      return undefined;
    };

    // Protocol 4 (Build Phase) - different priorities
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
      return { priority: "Peak water day - hit your full gallon target", subtext: buildSubtext(), urgency: 'normal', icon: 'droplets' };
    }
    if (daysUntilWeighIn === 4) {
      return { priority: "Continue loading - fructose heavy, peak water intake tomorrow", subtext: buildSubtext(), urgency: 'normal', icon: 'droplets' };
    }
    if (daysUntilWeighIn === 5) {
      return { priority: "Fill the tank - high fructose carbs, max hydration starts", subtext: buildSubtext(), urgency: 'normal', icon: 'droplets' };
    }
    // 6+ days out - pre-loading phase
    return { priority: `${daysUntilWeighIn} days out — train hard, eat normally`, subtext: buildSubtext(), urgency: 'normal', icon: 'check' };
  };

  const getWeekDescentData = () => {
    const today = startOfDay(profile.simulatedDate || new Date());
    const targetWeight = profile.targetWeightClass;
    const daysRemaining = Math.max(0, differenceInDays(startOfDay(profile.weighInDate), today));

    const morningWeights: Array<{ day: string; weight: number; date: Date }> = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Get the Monday of the current competition week (week containing weigh-in)
    // Competition week runs Mon-Sat with weigh-in on Saturday
    const weighInDate = new Date(profile.weighInDate);
    const weekStartMonday = new Date(weighInDate);
    // Go back to Monday of weigh-in week
    const weighInDayOfWeek = weighInDate.getDay(); // 0=Sun, 6=Sat
    const daysBackToMonday = weighInDayOfWeek === 0 ? 6 : weighInDayOfWeek - 1;
    weekStartMonday.setDate(weighInDate.getDate() - daysBackToMonday);
    weekStartMonday.setHours(0, 0, 0, 0);

    // Collect morning weights from Monday through today (or through Saturday of comp week)
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(weekStartMonday);
      checkDate.setDate(weekStartMonday.getDate() + i);

      // Don't look for future dates
      if (checkDate > today) break;

      const morningLog = logs.find(log => {
        const logDate = new Date(log.date);
        return log.type === 'morning' &&
          logDate.getFullYear() === checkDate.getFullYear() &&
          logDate.getMonth() === checkDate.getMonth() &&
          logDate.getDate() === checkDate.getDate();
      });

      if (morningLog) {
        morningWeights.push({
          day: dayNames[checkDate.getDay()],
          weight: morningLog.weight,
          date: new Date(checkDate)
        });
      }
    }

    const startWeight = morningWeights.length > 0 ? morningWeights[0].weight : null;
    // For morning-to-morning tracking, use latest morning weight
    const latestMorningWeight = morningWeights.length > 0 ? morningWeights[morningWeights.length - 1].weight : null;
    const totalLost = startWeight && latestMorningWeight ? startWeight - latestMorningWeight : null;

    // For projections, use the most recent weigh-in of ANY type (morning, check-in, post-practice, etc.)
    // This gives real-time projection updates whenever they step on the scale
    const todayStr = format(today, 'yyyy-MM-dd');
    const allTodayLogs = logs.filter(l => {
      const logDate = new Date(l.date);
      return format(startOfDay(logDate), 'yyyy-MM-dd') === todayStr;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Get the most recent weigh-in today, or fall back to latest morning weight
    const mostRecentWeighIn = allTodayLogs.length > 0 ? allTodayLogs[0].weight : latestMorningWeight;
    const currentWeight = mostRecentWeighIn;

    // Net daily average (morning-to-morning, includes food/water intake)
    let dailyAvgLoss: number | null = null;
    if (morningWeights.length >= 2 && startWeight && latestMorningWeight) {
      const firstDate = morningWeights[0].date;
      const lastDate = morningWeights[morningWeights.length - 1].date;
      const actualDaysBetween = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
      dailyAvgLoss = (startWeight - latestMorningWeight) / actualDaysBetween;
    }

    // Calculate gross loss capacity from drift and practice metrics
    // This shows how much weight you CAN lose when you stop eating/drinking
    const sortedLogs = [...logs].sort((a, b) => b.date.getTime() - a.date.getTime());

    // Overnight drift (weight lost while sleeping)
    const overnightDrifts: number[] = [];
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const current = sortedLogs[i];
      const prev = sortedLogs[i + 1];
      if (current.type === 'morning' && (prev.type === 'post-practice' || prev.type === 'before-bed')) {
        const hoursDiff = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 4 && hoursDiff < 16) {
          overnightDrifts.push(prev.weight - current.weight);
        }
      }
    }

    // Practice losses (sweat rate)
    const practiceLosses: number[] = [];
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const post = sortedLogs[i];
      const pre = sortedLogs[i + 1];
      if (post.type === 'post-practice' && pre.type === 'pre-practice') {
        const hoursDiff = (post.date.getTime() - pre.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff < 6) {
          practiceLosses.push(pre.weight - post.weight);
        }
      }
    }

    const avgOvernightDrift = overnightDrifts.length > 0
      ? overnightDrifts.reduce((a, b) => a + b, 0) / overnightDrifts.length
      : null;
    const avgPracticeLoss = practiceLosses.length > 0
      ? practiceLosses.reduce((a, b) => a + b, 0) / practiceLosses.length
      : null;

    // Gross daily loss capacity = overnight drift + practice loss
    // This is how much you CAN lose in a day when you minimize intake
    // Use absolute values since these represent weight LOST (always positive capacity)
    let grossDailyLoss: number | null = null;
    if (avgOvernightDrift !== null) {
      grossDailyLoss = Math.abs(avgOvernightDrift) + Math.abs(avgPracticeLoss || 0);
    }

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

    if (daysRemaining > 0) {
      const hasDriftData = avgOvernightDrift !== null && Math.abs(avgOvernightDrift!) > 0;
      const hasPracticeData = avgPracticeLoss !== null && Math.abs(avgPracticeLoss!) > 0;
      const hasNetData = dailyAvgLoss !== null && dailyAvgLoss > 0;
      const hasGrossData = grossDailyLoss !== null && grossDailyLoss > 0;
      const drift = hasDriftData ? Math.abs(avgOvernightDrift!) : 0;
      const practice = hasPracticeData ? Math.abs(avgPracticeLoss!) : 0;
      const isLoadingToday = daysRemaining >= 3;

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
          projected = currentWeight;
          const lastLogType = allTodayLogs.length > 0 ? allTodayLogs[0].type : null;
          let todayRemainingLoss = 0;

          if (lastLogType) {
            if (lastLogType === 'morning' || lastLogType === 'pre-practice') {
              todayRemainingLoss = practice + drift;
            } else if (lastLogType === 'post-practice' || lastLogType === 'before-bed') {
              todayRemainingLoss = drift;
            } else if (lastLogType === 'extra-after') {
              // Extra workouts are ADDITIONAL to normal practice+drift.
              // Practice hasn't happened yet, so still count practice + drift as remaining.
              todayRemainingLoss = practice + drift;
            } else if (lastLogType === 'check-in' || lastLogType === 'extra-before') {
              // Check if practice has actually happened by looking for a post-practice log
              const hasPracticeLog = allTodayLogs.some(l => l.type === 'post-practice');
              todayRemainingLoss = hasPracticeLog ? drift : (practice + drift);
            }
          } else {
            // No logs today on a cut day — full gross capacity
            todayRemainingLoss = practice + drift;
          }
          projected -= todayRemainingLoss;
        } else {
          // No weight data at all
          projected = latestMorningWeight || 0;
        }

        // Step 2: Future full days (tomorrow through weigh-in day)
        for (let d = daysRemaining - 1; d > 0; d--) {
          if (d >= 3) {
            // Future loading day: net morning-to-morning loss
            const loadingLoss = hasNetData ? dailyAvgLoss! : (hasGrossData ? grossDailyLoss! * 0.2 : 0);
            projected -= loadingLoss;
          } else {
            // Future cut day: gross capacity (drift + practice, no eating back)
            if (hasGrossData) {
              projected -= grossDailyLoss!;
            } else if (hasNetData) {
              projected -= dailyAvgLoss! * 2.5;
            }
          }
        }

        projectedSaturday = projected;
      } else if (latestMorningWeight) {
        // No trend data yet - show latest morning weight
        projectedSaturday = latestMorningWeight;
      } else if (currentWeight) {
        projectedSaturday = currentWeight;
      }
    }

    let pace: 'ahead' | 'on-track' | 'behind' | null = null;
    if (currentWeight && targetWeight) {
      // calculateTarget() already includes water loading for protocols 1 & 2
      // So we don't need to add it again here
      const effectiveTarget = calculateTarget();
      const diff = currentWeight - effectiveTarget;

      // Small tolerance for measurement variance (1.5 lbs)
      const tolerance = 1.5;

      if (diff <= -1) pace = 'ahead';
      else if (diff <= tolerance) pace = 'on-track';
      else pace = 'behind';
    }

    return {
      startWeight,
      currentWeight,
      targetWeight,
      daysRemaining,
      totalLost,
      dailyAvgLoss, // Net (morning-to-morning)
      grossDailyLoss, // Gross capacity (drift + practice)
      avgOvernightDrift,
      avgPracticeLoss,
      projectedSaturday, // Based on gross capacity
      pace,
      morningWeights
    };
  };

  // Uses daysUntilWeighIn for all timing to support any weigh-in day
  const getHistoryInsights = () => {
    const now = profile.simulatedDate || new Date();
    const daysUntilWeighIn = getDaysUntilWeighIn();
    const weighInDate = startOfDay(profile.weighInDate);

    // Get all logs sorted by date (newest first)
    const sortedLogs = [...logs].sort((a, b) => b.date.getTime() - a.date.getTime());

    // Separate morning weights by week
    const morningLogs = sortedLogs.filter(l => l.type === 'morning');

    // Calculate overnight drift (morning weight - previous night's weight)
    const overnightDrifts: number[] = [];
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const current = sortedLogs[i];
      const prev = sortedLogs[i + 1];

      if (current.type === 'morning' && (prev.type === 'post-practice' || prev.type === 'before-bed')) {
        const hoursDiff = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 4 && hoursDiff < 16) {
          overnightDrifts.push(prev.weight - current.weight);
        }
      }
    }

    // Calculate practice weight loss (pre - post)
    const practiceLosses: number[] = [];
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const post = sortedLogs[i];
      const pre = sortedLogs[i + 1];

      if (post.type === 'post-practice' && pre.type === 'pre-practice') {
        const hoursDiff = (post.date.getTime() - pre.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff < 6) {
          practiceLosses.push(pre.weight - post.weight);
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

    // Calculate gross capacity components
    const avgOvernightLoss = overnightDrifts.length > 0
      ? overnightDrifts.reduce((a, b) => a + b, 0) / overnightDrifts.length
      : null;
    const avgPracticeLossVal = practiceLosses.length > 0
      ? practiceLosses.reduce((a, b) => a + b, 0) / practiceLosses.length
      : null;
    const grossCapacity = avgOvernightLoss !== null
      ? Math.abs(avgOvernightLoss) + Math.abs(avgPracticeLossVal || 0)
      : null;
    const hasDriftData = avgOvernightLoss !== null && Math.abs(avgOvernightLoss) > 0;
    const hasPracticeData = avgPracticeLossVal !== null && Math.abs(avgPracticeLossVal) > 0;
    const hasGrossData = grossCapacity !== null && grossCapacity > 0;
    const hasNetData = netDailyLoss !== null;

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
        // Cut day: start from most recent weigh-in, apply remaining losses
        projected = mostRecentWeight;
        const lastLogType = allTodayLogs.length > 0 ? allTodayLogs[0].type : null;
        let todayRemainingLoss = 0;

        if (lastLogType) {
          if (lastLogType === 'morning' || lastLogType === 'pre-practice') {
            todayRemainingLoss = practice + drift;
          } else if (lastLogType === 'post-practice' || lastLogType === 'before-bed') {
            todayRemainingLoss = drift;
          } else if (lastLogType === 'extra-after') {
            // Extra workouts are ADDITIONAL to normal practice+drift.
            // Practice hasn't happened yet, so still count practice + drift as remaining.
            todayRemainingLoss = practice + drift;
          } else if (lastLogType === 'check-in' || lastLogType === 'extra-before') {
            // Check if practice has actually happened by looking for a post-practice log
            const hasPracticeLog = allTodayLogs.some(l => l.type === 'post-practice');
            todayRemainingLoss = hasPracticeLog ? drift : (practice + drift);
          }
        } else {
          todayRemainingLoss = practice + drift;
        }
        projected -= todayRemainingLoss;
      } else {
        projected = latestMorningWeight || 0;
      }

      // Step 2: Future full days
      for (let d = daysUntilWeighIn - 1; d > 0; d--) {
        if (d >= 3) {
          const loadingLoss = hasNetData ? netDailyLoss! : (hasGrossData ? grossCapacity! * 0.2 : 0);
          projected -= loadingLoss;
        } else {
          if (hasGrossData) {
            projected -= grossCapacity!;
          } else if (hasNetData) {
            projected -= netDailyLoss! * 2.5;
          }
        }
      }

      projectedSaturday = projected;
    }

    return {
      avgOvernightDrift: overnightDrifts.length > 0
        ? overnightDrifts.reduce((a, b) => a + b, 0) / overnightDrifts.length
        : null,
      avgPracticeLoss: practiceLosses.length > 0
        ? practiceLosses.reduce((a, b) => a + b, 0) / practiceLosses.length
        : null,
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

  return (
    <StoreContext.Provider value={{
      profile,
      fuelTanks,
      logs,
      dailyTracking,
      isLoading,
      updateProfile,
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
      getFoodLists,
      getTodaysFoods,
      getHistoryInsights
    }}>
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
