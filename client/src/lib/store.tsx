import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { addDays, subDays, differenceInDays, getDay, parseISO, format } from 'date-fns';
import { supabase } from './supabase';
import { useAuth } from './auth';

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
  type: 'morning' | 'pre-practice' | 'post-practice' | 'before-bed' | 'extra-before' | 'extra-after';
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
  phase: string;
  weightTarget: { morning: number; postPractice: number };
  water: { amount: string; targetOz: number; type: string };
  carbs: { min: number; max: number };
  protein: { min: number; max: number };
  isToday: boolean;
  isTomorrow: boolean;
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
  migrateLocalStorageToSupabase: () => Promise<void>;
  hasLocalStorageData: () => boolean;
  calculateTarget: () => number;
  getPhase: () => Phase;
  getTodaysFocus: () => { title: string; actions: string[], warning?: string };
  getHydrationTarget: () => { amount: string; type: string; note: string; targetOz: number };
  getMacroTargets: () => { carbs: { min: number; max: number }; protein: { min: number; max: number }; ratio: string };
  getFuelingGuide: () => { allowed: string[]; avoid: string[]; ratio: string; protein?: string; carbs?: string };
  getCheckpoints: () => { walkAround: string; wedTarget: string; friTarget: string };
  getRehydrationPlan: (lostWeight: number) => { fluidRange: string; sodiumRange: string; glycogen: string };
  getWeeklyPlan: () => DayPlan[];
  getTomorrowPlan: () => DayPlan | null;
  getNextTarget: () => { label: string; weight: number; description: string } | null;
  getDriftMetrics: () => { overnight: number | null; session: number | null };
  getStatus: () => { status: Status; label: string; color: string; bgColor: string };
  getDailyPriority: () => { priority: string; urgency: 'normal' | 'high' | 'critical'; icon: string };
  getWeekDescentData: () => {
    startWeight: number | null;
    currentWeight: number | null;
    targetWeight: number;
    daysRemaining: number;
    totalLost: number | null;
    dailyAvgLoss: number | null;
    projectedSaturday: number | null;
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
}

const defaultProfile: AthleteProfile = {
  name: 'Athlete',
  currentWeight: 0,
  targetWeightClass: 157,
  weighInDate: addDays(new Date(), 5), // 5 days out
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
        setProfile({
          name: profileData.name || 'Athlete',
          currentWeight: profileData.current_weight || 0,
          targetWeightClass: profileData.target_weight_class || 157,
          weighInDate: new Date(profileData.weigh_in_date),
          matchDate: new Date(profileData.weigh_in_date),
          dashboardMode: 'pro',
          protocol: String(profileData.protocol) as Protocol,
          status: 'on-track',
          simulatedDate: profileData.simulated_date ? new Date(profileData.simulated_date) : null,
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
          weigh_in_time: '08:00',
          protocol: parseInt(parsed.protocol) || 2,
          has_completed_onboarding: true,
          simulated_date: null,
        }, { onConflict: 'user_id' });
      }

      // Migrate logs
      if (savedLogs) {
        const parsedLogs = JSON.parse(savedLogs);
        const validTypes = ['morning', 'pre-practice', 'post-practice', 'before-bed'];
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
    const newProfile = { ...profile, ...updates };
    setProfile(newProfile);

    if (user) {
      try {
        await supabase.from('profiles').upsert({
          user_id: user.id,
          name: newProfile.name,
          current_weight: newProfile.currentWeight,
          target_weight_class: newProfile.targetWeightClass,
          weigh_in_date: newProfile.weighInDate.toISOString().split('T')[0],
          weigh_in_time: '08:00',
          protocol: parseInt(newProfile.protocol),
          has_completed_onboarding: newProfile.hasCompletedOnboarding || false,
          simulated_date: newProfile.simulatedDate ? newProfile.simulatedDate.toISOString().split('T')[0] : null,
        }, { onConflict: 'user_id' });
      } catch (error) {
        console.error('Error saving profile:', error);
      }
    }
  };

  // Add log to Supabase
  const addLog = async (log: Omit<WeightLog, 'id'>) => {
    const tempId = Math.random().toString(36).substr(2, 9);
    const newLog = { ...log, id: tempId };

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
        // Only insert valid log types
        const validTypes = ['morning', 'pre-practice', 'post-practice', 'before-bed'];
        if (validTypes.includes(log.type)) {
          const { data, error } = await supabase.from('weight_logs').insert({
            user_id: user.id,
            weight: log.weight,
            date: log.date.toISOString(),
            type: log.type,
          }).select().single();

          if (data && !error) {
            // Update with real ID
            setLogs(prev => prev.map(l => l.id === tempId ? { ...l, id: data.id } : l));
          }
        }

        // Update profile weight in Supabase
        await supabase.from('profiles').update({
          current_weight: log.weight,
        }).eq('user_id', user.id);
      } catch (error) {
        console.error('Error adding log:', error);
      }
    }
  };

  const updateLog = async (id: string, updates: Partial<WeightLog>) => {
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

        await supabase.from('weight_logs').update(updateData).eq('id', id);

        if (updates.weight !== undefined) {
          await supabase.from('profiles').update({
            current_weight: updates.weight,
          }).eq('user_id', user.id);
        }
      } catch (error) {
        console.error('Error updating log:', error);
      }
    }
  };

  const deleteLog = async (id: string) => {
    setLogs(prev => prev.filter(log => log.id !== id));

    if (user) {
      try {
        await supabase.from('weight_logs').delete().eq('id', id);
      } catch (error) {
        console.error('Error deleting log:', error);
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
        await supabase.from('daily_tracking').upsert({
          user_id: user.id,
          date: date,
          carbs_consumed: updates.carbsConsumed ?? current.carbsConsumed,
          protein_consumed: updates.proteinConsumed ?? current.proteinConsumed,
          water_consumed: updates.waterConsumed ?? current.waterConsumed,
        }, { onConflict: 'user_id,date' });
      } catch (error) {
        console.error('Error updating daily tracking:', error);
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

  const calculateTarget = () => {
    const today = profile.simulatedDate || new Date();
    const daysOut = Math.max(0, differenceInDays(profile.weighInDate, today));
    if (profile.protocol !== '4') {
        return profile.targetWeightClass * (1 + (0.01 * daysOut));
    }
    return profile.targetWeightClass;
  };

  const getCheckpoints = () => {
      const w = profile.targetWeightClass;
      return {
          walkAround: `${(w * 1.06).toFixed(1)} - ${(w * 1.07).toFixed(1)} lbs`,
          wedTarget: `${(w * 1.04).toFixed(1)} - ${(w * 1.05).toFixed(1)} lbs`,
          friTarget: `${(w * 1.02).toFixed(1)} - ${(w * 1.03).toFixed(1)} lbs`
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

  const getPhase = (): Phase => {
    const today = profile.simulatedDate || new Date();
    const dayOfWeek = getDay(today);
    const daysUntilWeighIn = differenceInDays(profile.weighInDate, today);

    if (dayOfWeek === 0) return 'recovery';
    if (daysUntilWeighIn <= 1) return 'last-24h';
    if (dayOfWeek >= 1 && dayOfWeek <= 3) return 'metabolic';
    if (dayOfWeek === 4) return 'transition';
    if (dayOfWeek === 5) return 'performance-prep';
    if (dayOfWeek === 6) return 'last-24h';

    return 'metabolic';
  };

  const getHydrationTarget = () => {
    const w = profile.targetWeightClass;
    const phase = getPhase();
    const useAdvancedLogic = profile.dashboardMode === 'pro' || profile.protocol === '1';
    const today = profile.simulatedDate || new Date();
    const dayOfWeek = getDay(today);

    const galToOz = (gal: number) => gal * 128;

    if (useAdvancedLogic) {
       const isHeavy = w >= 174;
       const isMedium = w >= 149 && w < 174;

       if (dayOfWeek === 1) return { amount: isHeavy ? "1.5 gal" : isMedium ? "1.25 gal" : "1.0 gal", type: "Regular", note: "Baseline Hydration", targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0) };
       if (dayOfWeek === 2) return { amount: isHeavy ? "1.75 gal" : isMedium ? "1.5 gal" : "1.25 gal", type: "Regular", note: "Increase Diuresis", targetOz: galToOz(isHeavy ? 1.75 : isMedium ? 1.5 : 1.25) };
       if (dayOfWeek === 3) return { amount: isHeavy ? "2.0 gal" : isMedium ? "1.75 gal" : "1.5 gal", type: "Regular", note: "Peak Hydration", targetOz: galToOz(isHeavy ? 2.0 : isMedium ? 1.75 : 1.5) };
       if (dayOfWeek === 4) return { amount: isHeavy ? "1.75 gal" : isMedium ? "1.5 gal" : "1.25 gal", type: "Distilled", note: "Switch to Distilled", targetOz: galToOz(isHeavy ? 1.75 : isMedium ? 1.5 : 1.25) };
       if (dayOfWeek === 5) return { amount: isHeavy ? "12-16 oz" : isMedium ? "8-12 oz" : "8-10 oz", type: "Distilled", note: "Flush Phase - Cut Sodium", targetOz: isHeavy ? 14 : isMedium ? 10 : 9 };
    }

    if (phase === 'metabolic' || phase === 'transition') {
      let amount = "90-105 oz";
      let targetOz = 98;
      if (w >= 141) { amount = "100-115 oz"; targetOz = 108; }
      if (w >= 157) { amount = "110-120 oz"; targetOz = 115; }
      if (w >= 165) { amount = "115-130 oz"; targetOz = 123; }
      if (w >= 184) { amount = "125-140 oz"; targetOz = 133; }
      if (w >= 285) { amount = "150-170 oz"; targetOz = 160; }

      return {
        amount,
        type: "Electrolyte Mix",
        note: "Add 1-2g sodium/L",
        targetOz
      };
    }

    if (phase === 'performance-prep') {
      return { amount: "Sip to thirst", type: "Water", note: "Do not gulp. Monitor drift.", targetOz: 16 };
    }

    return { amount: "To thirst", type: "Water", note: "Maintain baseline", targetOz: 100 };
  };

  const getMacroTargets = () => {
    const w = profile.currentWeight || profile.targetWeightClass;
    const wKg = w / 2.2;
    const protocol = profile.protocol;
    const today = profile.simulatedDate || new Date();
    const dayOfWeek = getDay(today);

    if (protocol === '1' || protocol === '2') {
      if (dayOfWeek >= 1 && dayOfWeek <= 3) {
        return {
          carbs: { min: Math.round(wKg * 8), max: Math.round(wKg * 10) },
          protein: { min: 50, max: 75 },
          ratio: protocol === '1' ? "60:40 Fructose:Glucose" : "60:40 Fructose:Glucose"
        };
      }
      if (dayOfWeek === 4) {
        return {
          carbs: { min: Math.round(wKg * 6), max: Math.round(wKg * 8) },
          protein: { min: 25, max: 50 },
          ratio: "50:50 Balanced"
        };
      }
      if (dayOfWeek === 5) {
        return {
          carbs: { min: Math.round(wKg * 5), max: Math.round(wKg * 7) },
          protein: { min: 25, max: 60 },
          ratio: "40:60 Glucose:Fructose"
        };
      }
    }

    if (protocol === '3') {
      if (dayOfWeek === 1) {
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: 25, max: 50 },
          ratio: "Fructose Heavy"
        };
      }
      if (dayOfWeek >= 2 && dayOfWeek <= 3) {
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: 75, max: 100 },
          ratio: "Mixed Fructose/Glucose"
        };
      }
      return {
        carbs: { min: 300, max: 450 },
        protein: { min: 100, max: 125 },
        ratio: "Performance (Glucose)"
      };
    }

    if (protocol === '4') {
      return {
        carbs: { min: 350, max: 600 },
        protein: { min: 100, max: Math.round(w * 1.6 / 2.2) },
        ratio: "Balanced/Glucose Heavy"
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
        { name: "Apple juice", ratio: "70:30", serving: "8 oz", carbs: 28, note: "Fast absorption, no pulp" },
        { name: "Pear juice", ratio: "65:35", serving: "8 oz", carbs: 26, note: "High fructose" },
        { name: "Grape juice", ratio: "55:45", serving: "8 oz", carbs: 36, note: "Balanced" },
        { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, note: "Vitamin C" },
        { name: "Apples", ratio: "65:35", serving: "1 medium", carbs: 25, note: "Portable" },
        { name: "Pears", ratio: "65:35", serving: "1 medium", carbs: 27, note: "High fructose" },
        { name: "Grapes", ratio: "48:52", serving: "1 cup", carbs: 27, note: "Convenient" },
        { name: "Mango", ratio: "50:50", serving: "1 cup", carbs: 25, note: "Tropical" },
        { name: "Watermelon", ratio: "48:52", serving: "2 cups", carbs: 22, note: "Hydrating" },
        { name: "Bananas", ratio: "50:50", serving: "1 medium", carbs: 27, note: "Energy dense" },
        { name: "Blueberries", ratio: "45:55", serving: "1 cup", carbs: 21, note: "Antioxidants" },
        { name: "Honey", ratio: "50:50", serving: "1 Tbsp", carbs: 17, note: "All phases" },
        { name: "Sugar", ratio: "50:50", serving: "1 Tbsp", carbs: 12, note: "Simple" },
        { name: "Gummy bears", ratio: "55:45", serving: "17 bears", carbs: 22, note: "Zero fiber" },
        { name: "Coconut water", ratio: "40:60", serving: "8 oz", carbs: 9, note: "Potassium" },
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
        { name: "Apple juice", ratio: "70:30", serving: "8 oz", carbs: 28, note: "Zero fiber" },
        { name: "Grape juice", ratio: "55:45", serving: "8 oz", carbs: 36, note: "Zero fiber" },
        { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, note: "Zero fiber" },
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
        { name: "Apple juice", ratio: "70:30", serving: "8 oz", carbs: 28, note: "Zero fiber" },
        { name: "Grape juice", ratio: "55:45", serving: "8 oz", carbs: 36, note: "Zero fiber" },
        { name: "Orange juice", ratio: "50:50", serving: "8 oz", carbs: 26, note: "Zero fiber" },
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

  const getFuelingGuide = () => {
    const phase = getPhase();
    const protocol = profile.protocol;
    const today = profile.simulatedDate || new Date();
    const dayOfWeek = getDay(today);

    if (protocol === '1') {
      if (dayOfWeek >= 1 && dayOfWeek <= 4) {
        return {
          ratio: "Fructose Only",
          protein: "0g",
          carbs: "250-400g",
          allowed: ["Apple Juice", "Pears", "Grapes", "Honey", "Agave"],
          avoid: ["ALL Protein", "Starchy Carbs", "Fat"]
        };
      }
      if (dayOfWeek === 5) {
        return {
           ratio: "Fructose + MCT",
           protein: "0.2g/lb (Evening)",
           carbs: "<1500 cal total",
           allowed: ["Fruit", "Honey", "MCT Oil", "Small Whey/Collagen (Evening)"],
           avoid: ["Starch", "Fiber"]
        };
      }
      if (dayOfWeek === 6) {
         return {
             ratio: "Protein Refeed",
             protein: "1.0g/lb",
             carbs: "Low",
             allowed: ["Lean Meat", "Eggs", "Healthy Fats"],
             avoid: ["Sugar"]
         };
      }
    }

    if (protocol === '2') {
      if (dayOfWeek >= 1 && dayOfWeek <= 2) {
         return {
          ratio: "Fructose Heavy",
          protein: "0g",
          carbs: "325-450g",
          allowed: ["Fruit", "Juice", "Honey"],
          avoid: ["Protein", "Starch", "Fat"]
         };
      }
      if (dayOfWeek === 3) {
        return {
          ratio: "Fructose + Collagen",
          protein: "25g (Dinner)",
          carbs: "325-450g",
          allowed: ["Fruit", "Juice", "Honey", "Collagen + Leucine (Dinner)"],
          avoid: ["Starch", "Meat", "Fat"]
        };
      }
      if (phase === 'transition' || phase === 'performance-prep') {
        return {
          ratio: "Glucose Heavy",
          protein: "60g/day",
          carbs: "325-450g",
          allowed: ["White Rice", "Potato", "Dextrose", "Collagen", "Seafood"],
          avoid: ["Fiber (Fruits/Veg)", "Fatty Meat"]
        };
      }
    }

    if (protocol === '3') {
       if (dayOfWeek === 1) {
         return {
           ratio: "Fructose Heavy",
           protein: "25g",
           carbs: "300-450g",
           allowed: ["Fruit", "Juice", "Collagen"],
           avoid: ["Starch", "Fat"]
         };
       }
       if (dayOfWeek >= 2 && dayOfWeek <= 3) {
         return {
           ratio: "Mixed Fructose/Glucose",
           protein: "75g/day",
           carbs: "300-450g",
           allowed: ["Fruit", "Rice", "Lean Protein", "Egg Whites"],
           avoid: ["High Fat"]
         };
       }
       if (phase === 'transition' || phase === 'performance-prep') {
         return {
           ratio: "Performance (Glucose)",
           protein: "100g/day",
           carbs: "300-450g",
           allowed: ["Rice", "Potato", "Lean Protein", "Dextrose"],
           avoid: ["Fiber"]
         };
       }
    }

    if (protocol === '4') {
        if (dayOfWeek === 1) {
            return {
                ratio: "Balanced Carbs",
                protein: "100g",
                carbs: "350-600g",
                allowed: ["Balanced Carbs", "Whole Protein", "Collagen"],
                avoid: ["Junk Food"]
            };
        }
        if (dayOfWeek >= 2 && dayOfWeek <= 3) {
            return {
                ratio: "Glucose Emphasis",
                protein: "125g/day",
                carbs: "350-600g",
                allowed: ["Rice", "Potatoes", "Lean Protein", "Collagen"],
                avoid: ["Excessive Fiber pre-workout"]
            };
        }
        if (dayOfWeek >= 4 && dayOfWeek <= 5) {
            return {
                ratio: "Glucose Heavy",
                protein: "125g/day",
                carbs: "350-600g",
                allowed: ["Rice", "Potatoes", "Chicken", "Seafood"],
                avoid: ["Fiber"]
            };
        }
        if (dayOfWeek === 6) {
            return {
                ratio: "Competition Day",
                protein: "Minimal until done",
                carbs: "Fast carbs between matches",
                allowed: ["Rice Cakes", "Gummy Bears", "Juice", "Electrolytes"],
                avoid: ["Fiber", "Fat", "Heavy protein"]
            };
        }
        if (dayOfWeek === 0) {
            return {
                ratio: "Full Recovery",
                protein: "1.6g/lb (Max protein day)",
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

  const getWeeklyPlan = (): DayPlan[] => {
    const w = profile.targetWeightClass;
    const wKg = w / 2.2;
    const today = profile.simulatedDate || new Date();
    const currentDayOfWeek = getDay(today);
    const protocol = profile.protocol;

    const isHeavy = w >= 174;
    const isMedium = w >= 149 && w < 174;

    const galToOz = (gal: number) => Math.round(gal * 128);

    // Protocol 4 (Build Phase) - No weight cutting, maintain/gain weight
    if (protocol === '4') {
      const buildDays: DayPlan[] = [
        {
          day: 'Monday',
          dayNum: 1,
          phase: 'Train',
          weightTarget: { morning: w, postPractice: w },
          water: {
            amount: isHeavy ? '1.5 gal' : isMedium ? '1.25 gal' : '1.0 gal',
            targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0),
            type: 'Regular'
          },
          carbs: { min: Math.round(wKg * 6), max: Math.round(wKg * 8) },
          protein: { min: 100, max: 125 },
          isToday: currentDayOfWeek === 1,
          isTomorrow: currentDayOfWeek === 0
        },
        {
          day: 'Tuesday',
          dayNum: 2,
          phase: 'Train',
          weightTarget: { morning: w, postPractice: w },
          water: {
            amount: isHeavy ? '1.5 gal' : isMedium ? '1.25 gal' : '1.0 gal',
            targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0),
            type: 'Regular'
          },
          carbs: { min: Math.round(wKg * 6), max: Math.round(wKg * 8) },
          protein: { min: 100, max: 125 },
          isToday: currentDayOfWeek === 2,
          isTomorrow: currentDayOfWeek === 1
        },
        {
          day: 'Wednesday',
          dayNum: 3,
          phase: 'Train',
          weightTarget: { morning: w, postPractice: w },
          water: {
            amount: isHeavy ? '1.5 gal' : isMedium ? '1.25 gal' : '1.0 gal',
            targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0),
            type: 'Regular'
          },
          carbs: { min: Math.round(wKg * 6), max: Math.round(wKg * 8) },
          protein: { min: 100, max: 125 },
          isToday: currentDayOfWeek === 3,
          isTomorrow: currentDayOfWeek === 2
        },
        {
          day: 'Thursday',
          dayNum: 4,
          phase: 'Train',
          weightTarget: { morning: w, postPractice: w },
          water: {
            amount: isHeavy ? '1.5 gal' : isMedium ? '1.25 gal' : '1.0 gal',
            targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0),
            type: 'Regular'
          },
          carbs: { min: Math.round(wKg * 6), max: Math.round(wKg * 8) },
          protein: { min: 100, max: 125 },
          isToday: currentDayOfWeek === 4,
          isTomorrow: currentDayOfWeek === 3
        },
        {
          day: 'Friday',
          dayNum: 5,
          phase: 'Light',
          weightTarget: { morning: w, postPractice: w },
          water: {
            amount: isHeavy ? '1.25 gal' : isMedium ? '1.0 gal' : '0.75 gal',
            targetOz: galToOz(isHeavy ? 1.25 : isMedium ? 1.0 : 0.75),
            type: 'Regular'
          },
          carbs: { min: Math.round(wKg * 5), max: Math.round(wKg * 7) },
          protein: { min: 100, max: 125 },
          isToday: currentDayOfWeek === 5,
          isTomorrow: currentDayOfWeek === 4
        },
        {
          day: 'Saturday',
          dayNum: 6,
          phase: 'Compete',
          weightTarget: { morning: w, postPractice: w },
          water: {
            amount: isHeavy ? '1.5 gal' : isMedium ? '1.25 gal' : '1.0 gal',
            targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0),
            type: 'Regular'
          },
          carbs: { min: 200, max: 400 },
          protein: { min: 100, max: 150 },
          isToday: currentDayOfWeek === 6,
          isTomorrow: currentDayOfWeek === 5
        },
        {
          day: 'Sunday',
          dayNum: 0,
          phase: 'Recover',
          weightTarget: { morning: w, postPractice: w },
          water: {
            amount: isHeavy ? '1.5 gal' : isMedium ? '1.25 gal' : '1.0 gal',
            targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0),
            type: 'Regular'
          },
          carbs: { min: 300, max: 450 },
          protein: { min: Math.round(w * 1.6), max: Math.round(w * 1.6) },
          isToday: currentDayOfWeek === 0,
          isTomorrow: currentDayOfWeek === 6
        }
      ];
      return buildDays;
    }

    // Protocol 3 (Hold Weight) - Minimal cutting, maintain walk-around weight
    if (protocol === '3') {
      const holdDays: DayPlan[] = [
        {
          day: 'Monday',
          dayNum: 1,
          phase: 'Maintain',
          weightTarget: { morning: Math.round(w * 1.03), postPractice: Math.round(w * 1.02) },
          water: {
            amount: isHeavy ? '1.25 gal' : isMedium ? '1.0 gal' : '0.75 gal',
            targetOz: galToOz(isHeavy ? 1.25 : isMedium ? 1.0 : 0.75),
            type: 'Regular'
          },
          carbs: { min: Math.round(wKg * 5), max: Math.round(wKg * 7) },
          protein: { min: 75, max: 100 },
          isToday: currentDayOfWeek === 1,
          isTomorrow: currentDayOfWeek === 0
        },
        {
          day: 'Tuesday',
          dayNum: 2,
          phase: 'Maintain',
          weightTarget: { morning: Math.round(w * 1.03), postPractice: Math.round(w * 1.02) },
          water: {
            amount: isHeavy ? '1.25 gal' : isMedium ? '1.0 gal' : '0.75 gal',
            targetOz: galToOz(isHeavy ? 1.25 : isMedium ? 1.0 : 0.75),
            type: 'Regular'
          },
          carbs: { min: Math.round(wKg * 5), max: Math.round(wKg * 7) },
          protein: { min: 75, max: 100 },
          isToday: currentDayOfWeek === 2,
          isTomorrow: currentDayOfWeek === 1
        },
        {
          day: 'Wednesday',
          dayNum: 3,
          phase: 'Maintain',
          weightTarget: { morning: Math.round(w * 1.02), postPractice: Math.round(w * 1.01) },
          water: {
            amount: isHeavy ? '1.25 gal' : isMedium ? '1.0 gal' : '0.75 gal',
            targetOz: galToOz(isHeavy ? 1.25 : isMedium ? 1.0 : 0.75),
            type: 'Regular'
          },
          carbs: { min: Math.round(wKg * 5), max: Math.round(wKg * 7) },
          protein: { min: 75, max: 100 },
          isToday: currentDayOfWeek === 3,
          isTomorrow: currentDayOfWeek === 2
        },
        {
          day: 'Thursday',
          dayNum: 4,
          phase: 'Prep',
          weightTarget: { morning: Math.round(w * 1.02), postPractice: Math.round(w * 1.01) },
          water: {
            amount: isHeavy ? '1.25 gal' : isMedium ? '1.0 gal' : '0.75 gal',
            targetOz: galToOz(isHeavy ? 1.25 : isMedium ? 1.0 : 0.75),
            type: 'Regular'
          },
          carbs: { min: Math.round(wKg * 5), max: Math.round(wKg * 7) },
          protein: { min: 75, max: 100 },
          isToday: currentDayOfWeek === 4,
          isTomorrow: currentDayOfWeek === 3
        },
        {
          day: 'Friday',
          dayNum: 5,
          phase: 'Prep',
          weightTarget: { morning: Math.round(w * 1.01), postPractice: w },
          water: {
            amount: isHeavy ? '1.0 gal' : isMedium ? '0.75 gal' : '0.5 gal',
            targetOz: galToOz(isHeavy ? 1.0 : isMedium ? 0.75 : 0.5),
            type: 'Regular'
          },
          carbs: { min: Math.round(wKg * 4), max: Math.round(wKg * 6) },
          protein: { min: 75, max: 100 },
          isToday: currentDayOfWeek === 5,
          isTomorrow: currentDayOfWeek === 4
        },
        {
          day: 'Saturday',
          dayNum: 6,
          phase: 'Compete',
          weightTarget: { morning: w, postPractice: w },
          water: {
            amount: 'Rehydrate',
            targetOz: galToOz(1.0),
            type: 'Rehydrate'
          },
          carbs: { min: 200, max: 400 },
          protein: { min: 100, max: 150 },
          isToday: currentDayOfWeek === 6,
          isTomorrow: currentDayOfWeek === 5
        },
        {
          day: 'Sunday',
          dayNum: 0,
          phase: 'Recover',
          weightTarget: { morning: Math.round(w * 1.03), postPractice: Math.round(w * 1.03) },
          water: {
            amount: isHeavy ? '1.25 gal' : isMedium ? '1.0 gal' : '0.75 gal',
            targetOz: galToOz(isHeavy ? 1.25 : isMedium ? 1.0 : 0.75),
            type: 'Regular'
          },
          carbs: { min: 250, max: 400 },
          protein: { min: Math.round(w * 1.2), max: Math.round(w * 1.5) },
          isToday: currentDayOfWeek === 0,
          isTomorrow: currentDayOfWeek === 6
        }
      ];
      return holdDays;
    }

    // Protocols 1 & 2 (Body Comp & Make Weight) - Full cutting protocol
    const days: DayPlan[] = [
      {
        day: 'Monday',
        dayNum: 1,
        phase: 'Load',
        weightTarget: { morning: Math.round(w * 1.07), postPractice: Math.round(w * 1.06) },
        water: {
          amount: isHeavy ? '1.5 gal' : isMedium ? '1.25 gal' : '1.0 gal',
          targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0),
          type: 'Regular'
        },
        carbs: { min: Math.round(wKg * 8), max: Math.round(wKg * 10) },
        protein: { min: 0, max: 25 },
        isToday: currentDayOfWeek === 1,
        isTomorrow: currentDayOfWeek === 0
      },
      {
        day: 'Tuesday',
        dayNum: 2,
        phase: 'Load',
        weightTarget: { morning: Math.round(w * 1.06), postPractice: Math.round(w * 1.055) },
        water: {
          amount: isHeavy ? '1.75 gal' : isMedium ? '1.5 gal' : '1.25 gal',
          targetOz: galToOz(isHeavy ? 1.75 : isMedium ? 1.5 : 1.25),
          type: 'Regular'
        },
        carbs: { min: Math.round(wKg * 8), max: Math.round(wKg * 10) },
        protein: { min: 0, max: 25 },
        isToday: currentDayOfWeek === 2,
        isTomorrow: currentDayOfWeek === 1
      },
      {
        day: 'Wednesday',
        dayNum: 3,
        phase: 'Load',
        weightTarget: { morning: Math.round(w * 1.05), postPractice: Math.round(w * 1.045) },
        water: {
          amount: isHeavy ? '2.0 gal' : isMedium ? '1.75 gal' : '1.5 gal',
          targetOz: galToOz(isHeavy ? 2.0 : isMedium ? 1.75 : 1.5),
          type: 'Regular'
        },
        carbs: { min: Math.round(wKg * 8), max: Math.round(wKg * 10) },
        protein: { min: 25, max: 50 },
        isToday: currentDayOfWeek === 3,
        isTomorrow: currentDayOfWeek === 2
      },
      {
        day: 'Thursday',
        dayNum: 4,
        phase: 'Cut',
        weightTarget: { morning: Math.round(w * 1.04), postPractice: Math.round(w * 1.035) },
        water: {
          amount: isHeavy ? '1.75 gal' : isMedium ? '1.5 gal' : '1.25 gal',
          targetOz: galToOz(isHeavy ? 1.75 : isMedium ? 1.5 : 1.25),
          type: 'Distilled'
        },
        carbs: { min: Math.round(wKg * 6), max: Math.round(wKg * 8) },
        protein: { min: 25, max: 50 },
        isToday: currentDayOfWeek === 4,
        isTomorrow: currentDayOfWeek === 3
      },
      {
        day: 'Friday',
        dayNum: 5,
        phase: 'Cut',
        weightTarget: { morning: Math.round(w * 1.03), postPractice: Math.round(w * 1.03) },
        water: {
          amount: isHeavy ? '12-16 oz' : isMedium ? '8-12 oz' : '8-10 oz',
          targetOz: isHeavy ? 14 : isMedium ? 10 : 9,
          type: 'Sip Only'
        },
        carbs: { min: Math.round(wKg * 5), max: Math.round(wKg * 7) },
        protein: { min: 25, max: 60 },
        isToday: currentDayOfWeek === 5,
        isTomorrow: currentDayOfWeek === 4
      },
      {
        day: 'Saturday',
        dayNum: 6,
        phase: 'Compete',
        weightTarget: { morning: w, postPractice: w },
        water: {
          amount: 'Rehydrate',
          targetOz: galToOz(1.0),
          type: 'Rehydrate'
        },
        carbs: { min: 200, max: 400 },
        protein: { min: 100, max: 150 },
        isToday: currentDayOfWeek === 6,
        isTomorrow: currentDayOfWeek === 5
      },
      {
        day: 'Sunday',
        dayNum: 0,
        phase: 'Recover',
        weightTarget: { morning: Math.round(w * 1.05), postPractice: Math.round(w * 1.06) },
        water: {
          amount: isHeavy ? '1.5 gal' : isMedium ? '1.25 gal' : '1.0 gal',
          targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0),
          type: 'Regular'
        },
        carbs: { min: 300, max: 450 },
        protein: { min: 100, max: 150 },
        isToday: currentDayOfWeek === 0,
        isTomorrow: currentDayOfWeek === 6
      }
    ];

    return days;
  };

  const getTomorrowPlan = (): DayPlan | null => {
    const plan = getWeeklyPlan();
    return plan.find(d => d.isTomorrow) || null;
  };

  const getNextTarget = () => {
    const todayTarget = calculateTarget();
    const lastLog = logs[0];

    if (!lastLog || lastLog.type === 'morning') {
        return { label: "Pre-Practice", weight: todayTarget + 1.5, description: "Hydrated Limit" };
    }
    if (lastLog.type === 'pre-practice') {
        return { label: "Post-Practice", weight: todayTarget, description: "End of Day Target" };
    }
    return { label: "Tomorrow Morning", weight: todayTarget - 0.8, description: "Overnight Drift Goal" };
  };

  const getDriftMetrics = () => {
    let overnightSum = 0;
    let overnightCount = 0;
    let sessionSum = 0;
    let sessionCount = 0;

    for (let i = 0; i < logs.length - 1; i++) {
        const current = logs[i];
        const next = logs[i+1];

        if (current.type === 'morning' && next.type === 'post-practice') {
            const diffHours = (current.date.getTime() - next.date.getTime()) / (1000 * 60 * 60);
            if (diffHours > 6 && diffHours < 16) {
                overnightSum += (current.weight - next.weight);
                overnightCount++;
            }
        }

        if (current.type === 'post-practice' && next.type === 'pre-practice') {
             const diffHours = (current.date.getTime() - next.date.getTime()) / (1000 * 60 * 60);
             if (diffHours < 4) {
                 sessionSum += (current.weight - next.weight);
                 sessionCount++;
             }
        }
    }

    return {
        overnight: overnightCount > 0 ? (overnightSum / overnightCount) : null,
        session: sessionCount > 0 ? (sessionSum / sessionCount) : null
    };
  };

  const getStatus = (): { status: Status; label: string; color: string; bgColor: string } => {
    const target = calculateTarget();
    const currentWeight = profile.currentWeight;

    if (currentWeight === 0) {
      return { status: 'on-track', label: 'LOG WEIGHT', color: 'text-muted-foreground', bgColor: 'bg-muted/30' };
    }

    const diff = currentWeight - target;

    if (diff <= 1) {
      return { status: 'on-track', label: 'ON TRACK', color: 'text-green-500', bgColor: 'bg-green-500/20' };
    }
    if (diff <= 3) {
      return { status: 'borderline', label: 'BORDERLINE', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20' };
    }
    return { status: 'risk', label: 'AT RISK', color: 'text-destructive', bgColor: 'bg-destructive/20' };
  };

  const getDailyPriority = (): { priority: string; urgency: 'normal' | 'high' | 'critical'; icon: string } => {
    const today = profile.simulatedDate || new Date();
    const dayOfWeek = getDay(today);
    const protocol = profile.protocol;

    if (protocol === '4') {
      switch (dayOfWeek) {
        case 0: return { priority: "FULL RECOVERY - 1.6g/lb protein, high carbs, repair muscle tissue", urgency: 'high', icon: 'bed' };
        case 1: return { priority: "Train hard - fuel for muscle growth", urgency: 'normal', icon: 'dumbbell' };
        case 2: return { priority: "Train hard - peak carb intake today", urgency: 'normal', icon: 'dumbbell' };
        case 3: return { priority: "Train hard - maintain high protein", urgency: 'normal', icon: 'dumbbell' };
        case 4: return { priority: "Train hard - focus on recovery nutrition", urgency: 'normal', icon: 'dumbbell' };
        case 5: return { priority: "Light session - competition prep if needed", urgency: 'normal', icon: 'target' };
        case 6: return { priority: "COMPETE - fast carbs between matches, minimal protein until done", urgency: 'high', icon: 'trophy' };
        default: return { priority: "Stay on protocol", urgency: 'normal', icon: 'check' };
      }
    }

    switch (dayOfWeek) {
      case 0:
        return { priority: "RECOVERY DAY - protein refeed, rebuild glycogen stores", urgency: 'normal', icon: 'heart' };
      case 1:
        return { priority: "Fill the tank - high fructose carbs, max hydration starts", urgency: 'normal', icon: 'droplets' };
      case 2:
        return { priority: "Continue loading - fructose heavy, peak water intake tomorrow", urgency: 'normal', icon: 'droplets' };
      case 3:
        return { priority: "Peak water day - hit your full gallon target", urgency: 'normal', icon: 'droplets' };
      case 4:
        return { priority: "ZERO FIBER - check every bite. Switch to distilled water.", urgency: 'high', icon: 'alert' };
      case 5:
        return { priority: "SIP ONLY - monitor weight hourly. Final push to make weight.", urgency: 'critical', icon: 'scale' };
      case 6:
        return { priority: "COMPETE - rehydrate smart, fuel between matches", urgency: 'high', icon: 'trophy' };
      default:
        return { priority: "Stay on protocol", urgency: 'normal', icon: 'check' };
    }
  };

  const getWeekDescentData = () => {
    const today = profile.simulatedDate || new Date();
    const targetWeight = profile.targetWeightClass;
    const daysRemaining = Math.max(0, differenceInDays(profile.weighInDate, today));

    const morningWeights: Array<{ day: string; weight: number; date: Date }> = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);

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
          date: checkDate
        });
      }
    }

    const startWeight = morningWeights.length > 0 ? morningWeights[0].weight : null;
    const currentWeight = morningWeights.length > 0 ? morningWeights[morningWeights.length - 1].weight : null;
    const totalLost = startWeight && currentWeight ? startWeight - currentWeight : null;

    let dailyAvgLoss: number | null = null;
    if (morningWeights.length >= 2 && startWeight && currentWeight) {
      const firstDate = morningWeights[0].date;
      const lastDate = morningWeights[morningWeights.length - 1].date;
      const actualDaysBetween = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
      dailyAvgLoss = (startWeight - currentWeight) / actualDaysBetween;
    }

    let projectedSaturday: number | null = null;
    if (currentWeight && dailyAvgLoss !== null && dailyAvgLoss > 0 && daysRemaining > 0) {
      projectedSaturday = currentWeight - (dailyAvgLoss * daysRemaining);
    } else if (currentWeight && daysRemaining > 0) {
      const neededLoss = currentWeight - targetWeight;
      if (neededLoss > 0) {
        projectedSaturday = currentWeight;
      }
    }

    let pace: 'ahead' | 'on-track' | 'behind' | null = null;
    if (currentWeight && targetWeight) {
      const todayTarget = calculateTarget();
      const diff = currentWeight - todayTarget;
      if (diff <= -1) pace = 'ahead';
      else if (diff <= 1) pace = 'on-track';
      else pace = 'behind';
    }

    return {
      startWeight,
      currentWeight,
      targetWeight,
      daysRemaining,
      totalLost,
      dailyAvgLoss,
      projectedSaturday,
      pace,
      morningWeights
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
      migrateLocalStorageToSupabase,
      hasLocalStorageData,
      calculateTarget,
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
      getStatus,
      getDailyPriority,
      getWeekDescentData,
      getFoodLists
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
