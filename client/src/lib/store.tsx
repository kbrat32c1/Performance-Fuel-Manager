import React, { createContext, useContext, useState, useEffect } from 'react';
import { addDays, subDays, differenceInDays, getDay, parseISO } from 'date-fns';

// Types
export type Protocol = '1' | '2' | '3' | '4';
// 1: Sugar Fast / Body Comp Phase (Extreme fat loss)
// 2: Fat Loss Focus / Make Weight Phase (In-Season weekly cut)
// 3: Maintain / Hold Weight Phase (At walk-around weight)
// 4: Hypertrophy / Build Phase (Off-season muscle gain)

export type Status = 'on-track' | 'borderline' | 'risk';

export type Phase = 'metabolic' | 'transition' | 'performance-prep' | 'last-24h';

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
  updateProfile: (updates: Partial<AthleteProfile>) => void;
  addLog: (log: Omit<WeightLog, 'id'>) => void;
  updateLog: (id: string, updates: Partial<WeightLog>) => void;
  deleteLog: (id: string) => void;
  updateDailyTracking: (date: string, updates: Partial<Omit<DailyTracking, 'date'>>) => void;
  getDailyTracking: (date: string) => DailyTracking;
  resetData: () => void;
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
  getFoodLists: () => {
    highFructose: Array<{ name: string; ratio: string; serving: string; carbs: number; note: string }>;
    balanced: Array<{ name: string; ratio: string; serving: string; carbs: number; note: string }>;
    highGlucose: Array<{ name: string; ratio: string; serving: string; carbs: number; note: string }>;
    zeroFiber: Array<{ name: string; ratio: string; serving: string; carbs: number; note: string }>;
    protein: Array<{ name: string; serving: string; protein: number; note: string }>;
    avoid: Array<{ name: string; reason: string }>;
    tournament: Array<{ name: string; ratio: string; serving: string; carbs: number; timing: string }>;
    supplements: Array<{ name: string; serving: string; note: string }>;
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
  // Initialize from LocalStorage
  const [profile, setProfile] = useState<AthleteProfile>(() => {
    const saved = localStorage.getItem('pwm-profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          weighInDate: new Date(parsed.weighInDate),
          matchDate: new Date(parsed.matchDate),
          // Migration: Ensure protocol is string '1' or '2' etc
        };
      } catch (e) {
        console.error("Failed to parse profile", e);
      }
    }
    return defaultProfile;
  });

  const [fuelTanks, setFuelTanks] = useState<FuelTanks>(() => {
    const saved = localStorage.getItem('pwm-tanks');
    return saved ? JSON.parse(saved) : defaultTanks;
  });

  const [logs, setLogs] = useState<WeightLog[]>(() => {
    const saved = localStorage.getItem('pwm-logs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((log: any) => ({
          ...log,
          date: new Date(log.date)
        }));
      } catch (e) {
         console.error("Failed to parse logs", e);
      }
    }
    return [];
  });

  const [dailyTracking, setDailyTracking] = useState<DailyTracking[]>(() => {
    const saved = localStorage.getItem('pwm-daily-tracking');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse daily tracking", e);
      }
    }
    return [];
  });

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('pwm-profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('pwm-tanks', JSON.stringify(fuelTanks));
  }, [fuelTanks]);

  useEffect(() => {
    localStorage.setItem('pwm-logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('pwm-daily-tracking', JSON.stringify(dailyTracking));
  }, [dailyTracking]);

  const updateProfile = (updates: Partial<AthleteProfile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
  };

  const addLog = (log: Omit<WeightLog, 'id'>) => {
    const newLog = { ...log, id: Math.random().toString(36).substr(2, 9) };
    setLogs(prev => [newLog, ...prev]);

    // Auto-adjustment logic
    const target = calculateTarget();
    setProfile(prev => ({
      ...prev,
      currentWeight: log.weight,
      status: log.weight <= target + 1 ? 'on-track' : 'borderline'
    }));
  };

  const updateLog = (id: string, updates: Partial<WeightLog>) => {
    setLogs(prev => prev.map(log =>
      log.id === id ? { ...log, ...updates } : log
    ));

    // If weight was updated, also update current weight in profile
    if (updates.weight !== undefined) {
      const target = calculateTarget();
      setProfile(prev => ({
        ...prev,
        currentWeight: updates.weight!,
        status: updates.weight! <= target + 1 ? 'on-track' : 'borderline'
      }));
    }
  };

  const deleteLog = (id: string) => {
    setLogs(prev => prev.filter(log => log.id !== id));
  };

  const getDailyTracking = (date: string): DailyTracking => {
    const existing = dailyTracking.find(d => d.date === date);
    if (existing) return existing;
    return { date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0 };
  };

  const updateDailyTracking = (date: string, updates: Partial<Omit<DailyTracking, 'date'>>) => {
    setDailyTracking(prev => {
      const existing = prev.find(d => d.date === date);
      if (existing) {
        return prev.map(d => d.date === date ? { ...d, ...updates } : d);
      }
      return [...prev, { date, waterConsumed: 0, carbsConsumed: 0, proteinConsumed: 0, ...updates }];
    });
  };

  const resetData = () => {
    setProfile(defaultProfile);
    setFuelTanks(defaultTanks);
    setLogs([]);
    localStorage.clear();
  };

  const calculateTarget = () => {
    // 1% Per Day Descent Model (from PDF)
    const daysOut = Math.max(0, differenceInDays(profile.weighInDate, new Date()));
    // Standard descent for weight loss
    if (profile.protocol !== '4') {
        return profile.targetWeightClass * (1 + (0.01 * daysOut)); 
    }
    // Hypertrophy target (gaining)
    return profile.targetWeightClass;
  };

  const getCheckpoints = () => {
      const w = profile.targetWeightClass;
      // Based on table: 
      // Walk Around = Class * 1.06-1.07
      // Wed PM = Class * 1.04-1.05
      // Fri PM = Class * 1.02-1.03
      
      return {
          walkAround: `${(w * 1.06).toFixed(1)} - ${(w * 1.07).toFixed(1)} lbs`,
          wedTarget: `${(w * 1.04).toFixed(1)} - ${(w * 1.05).toFixed(1)} lbs`,
          friTarget: `${(w * 1.02).toFixed(1)} - ${(w * 1.03).toFixed(1)} lbs`
      };
  };

  const getRehydrationPlan = (lostWeight: number) => {
    // PDF: 24-28 oz fluid + 1-2g sodium per pound lost
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

  // Rules Engine Logic
  const getPhase = (): Phase => {
    const today = profile.simulatedDate || new Date();
    const daysUntilWeighIn = differenceInDays(profile.weighInDate, today);

    if (daysUntilWeighIn <= 1) return 'last-24h';
    
    // Simplification for prototype: Assuming Mon-Fri week roughly matches days out
    if (daysUntilWeighIn >= 3) return 'metabolic'; // Mon-Wed
    if (daysUntilWeighIn === 2) return 'transition'; // Thu
    if (daysUntilWeighIn === 1) return 'performance-prep'; // Fri

    return 'metabolic'; // Default
  };

  const getHydrationTarget = () => {
    const w = profile.targetWeightClass;
    const phase = getPhase();
    // Advanced hydration logic applies if Pro mode is on OR strict protocol
    const useAdvancedLogic = profile.dashboardMode === 'pro' || profile.protocol === '1';
    const today = profile.simulatedDate || new Date();
    const dayOfWeek = getDay(today); // Using actual day for reverse load schedule (Mon=1, etc)

    // Helper to convert gallons to oz
    const galToOz = (gal: number) => gal * 128;

    // Reverse Water Load Logic (Pro Mode / Protocol 1)
    if (useAdvancedLogic) {
       const isHeavy = w >= 174;
       const isMedium = w >= 149 && w < 174;

       // Mon(1), Tue(2), Wed(3), Thu(4), Fri(5)
       if (dayOfWeek === 1) return { amount: isHeavy ? "1.5 gal" : isMedium ? "1.25 gal" : "1.0 gal", type: "Regular", note: "Baseline Hydration", targetOz: galToOz(isHeavy ? 1.5 : isMedium ? 1.25 : 1.0) };
       if (dayOfWeek === 2) return { amount: isHeavy ? "1.75 gal" : isMedium ? "1.5 gal" : "1.25 gal", type: "Regular", note: "Increase Diuresis", targetOz: galToOz(isHeavy ? 1.75 : isMedium ? 1.5 : 1.25) };
       if (dayOfWeek === 3) return { amount: isHeavy ? "2.0 gal" : isMedium ? "1.75 gal" : "1.5 gal", type: "Regular", note: "Peak Hydration", targetOz: galToOz(isHeavy ? 2.0 : isMedium ? 1.75 : 1.5) };
       if (dayOfWeek === 4) return { amount: isHeavy ? "1.75 gal" : isMedium ? "1.5 gal" : "1.25 gal", type: "Distilled", note: "Switch to Distilled", targetOz: galToOz(isHeavy ? 1.75 : isMedium ? 1.5 : 1.25) };
       if (dayOfWeek === 5) return { amount: isHeavy ? "12-16 oz" : isMedium ? "8-12 oz" : "8-10 oz", type: "Distilled", note: "Flush Phase - Cut Sodium", targetOz: isHeavy ? 14 : isMedium ? 10 : 9 };
    }

    // Standard Hydration Logic (Mon-Wed/Thu)
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

    // Fri Standard
    if (phase === 'performance-prep') {
      return { amount: "Sip to thirst", type: "Water", note: "Do not gulp. Monitor drift.", targetOz: 16 };
    }

    return { amount: "To thirst", type: "Water", note: "Maintain baseline", targetOz: 100 };
  };

  // Macro targets based on protocol and day (from PDF tables)
  const getMacroTargets = () => {
    const w = profile.currentWeight || profile.targetWeightClass;
    const wKg = w / 2.2;
    const protocol = profile.protocol;
    const today = profile.simulatedDate || new Date();
    const dayOfWeek = getDay(today);

    // Protocol 1 & 2: Body Comp / Make Weight (Mon-Wed: high carbs, low protein)
    if (protocol === '1' || protocol === '2') {
      if (dayOfWeek >= 1 && dayOfWeek <= 3) { // Mon-Wed
        return {
          carbs: { min: Math.round(wKg * 8), max: Math.round(wKg * 10) },
          protein: { min: 50, max: 75 },
          ratio: protocol === '1' ? "60:40 Fructose:Glucose" : "60:40 Fructose:Glucose"
        };
      }
      if (dayOfWeek === 4) { // Thu - Transition
        return {
          carbs: { min: Math.round(wKg * 6), max: Math.round(wKg * 8) },
          protein: { min: 25, max: 50 },
          ratio: "50:50 Balanced"
        };
      }
      if (dayOfWeek === 5) { // Fri - Performance Prep
        return {
          carbs: { min: Math.round(wKg * 5), max: Math.round(wKg * 7) },
          protein: { min: 25, max: 60 },
          ratio: "40:60 Glucose:Fructose"
        };
      }
    }

    // Protocol 3: Hold Weight
    if (protocol === '3') {
      if (dayOfWeek === 1) { // Mon
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: 25, max: 50 },
          ratio: "Fructose Heavy"
        };
      }
      if (dayOfWeek >= 2 && dayOfWeek <= 3) { // Tue-Wed
        return {
          carbs: { min: 300, max: 450 },
          protein: { min: 75, max: 100 },
          ratio: "Mixed Fructose/Glucose"
        };
      }
      // Thu-Fri
      return {
        carbs: { min: 300, max: 450 },
        protein: { min: 100, max: 125 },
        ratio: "Performance (Glucose)"
      };
    }

    // Protocol 4: Build Phase
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

  // Comprehensive food lists from PDF with fructose:glucose ratios
  const getFoodLists = () => {
    return {
      // HIGH FRUCTOSE (60:40+) - Track A Mon-Wed - Activates FGF21, burns fat
      highFructose: [
        // Juices
        { name: "Apple juice", ratio: "65:35", serving: "16 oz", carbs: 56, note: "Best for FGF21" },
        { name: "Grape juice", ratio: "60:40", serving: "16 oz", carbs: 60, note: "High in fructose" },
        { name: "Pear juice", ratio: "70:30", serving: "16 oz", carbs: 52, note: "Highest fructose" },
        { name: "Cranberry juice", ratio: "60:40", serving: "12 oz", carbs: 42, note: "Tart option" },
        { name: "Pomegranate juice", ratio: "55:45", serving: "8 oz", carbs: 32, note: "Antioxidant rich" },
        // Whole Fruits
        { name: "Apples", ratio: "65:35", serving: "1 medium", carbs: 25, note: "Portable option" },
        { name: "Pears", ratio: "70:30", serving: "1 medium", carbs: 27, note: "Very high fructose" },
        { name: "Grapes", ratio: "55:45", serving: "1 cup", carbs: 27, note: "Good training snack" },
        { name: "Watermelon", ratio: "60:40", serving: "2 cups", carbs: 22, note: "Hydrating" },
        { name: "Mango", ratio: "55:45", serving: "1 cup", carbs: 28, note: "Dense carbs" },
        { name: "Cantaloupe", ratio: "55:45", serving: "1 cup", carbs: 14, note: "Light option" },
        { name: "Honeydew melon", ratio: "55:45", serving: "1 cup", carbs: 16, note: "Mild flavor" },
        { name: "Cherries", ratio: "55:45", serving: "1 cup", carbs: 22, note: "Antioxidants" },
        { name: "Blueberries", ratio: "55:45", serving: "1 cup", carbs: 21, note: "Antioxidant rich" },
        { name: "Strawberries", ratio: "55:45", serving: "1 cup", carbs: 12, note: "Low calorie" },
        { name: "Raspberries", ratio: "55:45", serving: "1 cup", carbs: 15, note: "Fiber warning" },
        { name: "Blackberries", ratio: "55:45", serving: "1 cup", carbs: 14, note: "Fiber warning" },
        { name: "Peaches", ratio: "55:45", serving: "1 medium", carbs: 15, note: "Summer fruit" },
        { name: "Nectarines", ratio: "55:45", serving: "1 medium", carbs: 15, note: "Similar to peach" },
        { name: "Plums", ratio: "55:45", serving: "2 small", carbs: 15, note: "Portable" },
        { name: "Apricots", ratio: "55:45", serving: "3 medium", carbs: 12, note: "Dried = concentrated" },
        { name: "Kiwi", ratio: "55:45", serving: "2 medium", carbs: 20, note: "Vitamin C" },
        { name: "Papaya", ratio: "55:45", serving: "1 cup", carbs: 16, note: "Digestive enzymes" },
        { name: "Pineapple", ratio: "50:50", serving: "1 cup", carbs: 22, note: "Bromelain" },
        { name: "Figs (fresh)", ratio: "55:45", serving: "3 medium", carbs: 24, note: "Dense carbs" },
        { name: "Dates", ratio: "50:50", serving: "3 dates", carbs: 54, note: "Very dense" },
        // Sweeteners
        { name: "Agave nectar", ratio: "90:10", serving: "1 Tbsp", carbs: 16, note: "Pure fructose source" },
        { name: "Honey", ratio: "50:50", serving: "1 Tbsp", carbs: 17, note: "Versatile sweetener" },
        // Cooked Fruit
        { name: "Applesauce (unsweetened)", ratio: "65:35", serving: "1 cup", carbs: 28, note: "Easy to eat" },
        { name: "Cooked apples", ratio: "65:35", serving: "1 cup", carbs: 30, note: "Soft texture" },
        { name: "Fruit smoothie", ratio: "60:40", serving: "16 oz", carbs: 50, note: "Mix fruits" },
      ],
      // BALANCED (50:50) - Thursday Transition - Both tracks converge
      balanced: [
        { name: "White rice", ratio: "0:100", serving: "1 cup cooked", carbs: 45, note: "Pure glucose" },
        { name: "Honey", ratio: "50:50", serving: "2 Tbsp", carbs: 34, note: "Natural balance" },
        { name: "Ripe banana", ratio: "50:50", serving: "1 medium", carbs: 27, note: "Good pre-practice" },
        { name: "Rice cakes", ratio: "0:100", serving: "2 cakes", carbs: 14, note: "Easy digestion" },
        { name: "Orange juice", ratio: "50:50", serving: "12 oz", carbs: 39, note: "Vitamin C boost" },
        { name: "Maple syrup", ratio: "45:55", serving: "2 Tbsp", carbs: 26, note: "Natural option" },
        { name: "Pineapple", ratio: "50:50", serving: "1 cup", carbs: 22, note: "Balanced sugar" },
        { name: "Dates", ratio: "50:50", serving: "3 dates", carbs: 54, note: "Energy dense" },
        { name: "Raisins", ratio: "50:50", serving: "1/4 cup", carbs: 32, note: "Portable" },
        { name: "Dried cranberries", ratio: "50:50", serving: "1/4 cup", carbs: 33, note: "Added sugar usually" },
        { name: "Gummy bears", ratio: "50:50", serving: "17 bears", carbs: 22, note: "Quick energy" },
        { name: "Fruit snacks", ratio: "50:50", serving: "1 pouch", carbs: 20, note: "Convenient" },
      ],
      // HIGH GLUCOSE (40:60+) - Track B Mon-Wed & All Athletes Thu-Fri - Restores glycogen
      highGlucose: [
        // Pure Glucose Sources
        { name: "Dextrose powder", ratio: "0:100", serving: "40g", carbs: 40, note: "Fastest absorption" },
        { name: "Maltodextrin", ratio: "0:100", serving: "30g", carbs: 30, note: "Training fuel" },
        { name: "Glucose tablets", ratio: "0:100", serving: "4 tablets", carbs: 16, note: "Precise dosing" },
        // Starches
        { name: "White rice", ratio: "0:100", serving: "1 cup cooked", carbs: 45, note: "Staple carb" },
        { name: "Jasmine rice", ratio: "0:100", serving: "1 cup cooked", carbs: 45, note: "Aromatic" },
        { name: "Sushi rice", ratio: "0:100", serving: "1 cup cooked", carbs: 45, note: "Sticky texture" },
        { name: "Rice cakes", ratio: "0:100", serving: "3 cakes", carbs: 21, note: "Light & fast" },
        { name: "Cream of rice", ratio: "0:100", serving: "1 cup cooked", carbs: 28, note: "Easy digestion" },
        { name: "Rice cereal", ratio: "0:100", serving: "1 cup", carbs: 26, note: "Quick breakfast" },
        { name: "Rice noodles", ratio: "0:100", serving: "1 cup cooked", carbs: 44, note: "Alternative to rice" },
        // Potatoes
        { name: "White potato", ratio: "0:100", serving: "1 medium", carbs: 37, note: "Dense glycogen" },
        { name: "Russet potato", ratio: "0:100", serving: "1 medium", carbs: 37, note: "Baking potato" },
        { name: "Red potato", ratio: "0:100", serving: "1 medium", carbs: 34, note: "Waxy texture" },
        { name: "Mashed potatoes", ratio: "0:100", serving: "1 cup", carbs: 35, note: "Easy to eat" },
        { name: "Baked potato", ratio: "0:100", serving: "1 medium", carbs: 37, note: "No skin Thu-Fri" },
        { name: "Instant potatoes", ratio: "0:100", serving: "1 cup", carbs: 30, note: "Convenient" },
        // Bread/Baked
        { name: "White bread", ratio: "0:100", serving: "2 slices", carbs: 26, note: "Quick option" },
        { name: "Bagel (white)", ratio: "0:100", serving: "1 medium", carbs: 48, note: "Dense carbs" },
        { name: "English muffin", ratio: "0:100", serving: "1 muffin", carbs: 26, note: "Breakfast option" },
        { name: "Saltine crackers", ratio: "0:100", serving: "10 crackers", carbs: 22, note: "Light snack" },
        { name: "Pretzels", ratio: "0:100", serving: "1 oz", carbs: 23, note: "Salty option" },
        { name: "White pasta", ratio: "0:100", serving: "1 cup cooked", carbs: 43, note: "Alternative starch" },
        // Sports Products
        { name: "Gatorade", ratio: "45:55", serving: "20 oz", carbs: 36, note: "Electrolytes + carbs" },
        { name: "Powerade", ratio: "45:55", serving: "20 oz", carbs: 34, note: "Sports drink" },
        { name: "Energy gels", ratio: "30:70", serving: "1 packet", carbs: 22, note: "Race fuel" },
        { name: "Sports beans", ratio: "40:60", serving: "1 oz", carbs: 25, note: "Portable" },
        { name: "Gummy energy chews", ratio: "40:60", serving: "4 chews", carbs: 24, note: "Easy to eat" },
      ],
      // ZERO FIBER - Thu-Fri Only - Clears gut for weigh-in
      zeroFiber: [
        // Primary Starches
        { name: "White rice", ratio: "0:100", serving: "1 cup", carbs: 45, note: "Primary carb" },
        { name: "Jasmine rice", ratio: "0:100", serving: "1 cup", carbs: 45, note: "Aromatic option" },
        { name: "Sushi rice", ratio: "0:100", serving: "1 cup", carbs: 45, note: "Sticky, easy to eat" },
        { name: "Cream of rice", ratio: "0:100", serving: "1 cup", carbs: 28, note: "Smooth texture" },
        { name: "Rice cakes", ratio: "0:100", serving: "3 cakes", carbs: 21, note: "Zero fiber" },
        { name: "Rice noodles", ratio: "0:100", serving: "1 cup", carbs: 44, note: "No fiber" },
        // Potatoes (no skin)
        { name: "Potato (no skin)", ratio: "0:100", serving: "1 medium", carbs: 33, note: "Peel removes fiber" },
        { name: "Mashed potatoes", ratio: "0:100", serving: "1 cup", carbs: 35, note: "Smooth" },
        { name: "Instant potatoes", ratio: "0:100", serving: "1 cup", carbs: 30, note: "Quick option" },
        // Sugars
        { name: "Honey", ratio: "50:50", serving: "2 Tbsp", carbs: 34, note: "Pure sugar" },
        { name: "Dextrose powder", ratio: "0:100", serving: "40g", carbs: 40, note: "No fiber" },
        { name: "Maltodextrin", ratio: "0:100", serving: "30g", carbs: 30, note: "Pure glucose" },
        { name: "Maple syrup", ratio: "45:55", serving: "2 Tbsp", carbs: 26, note: "Liquid sugar" },
        { name: "Agave", ratio: "90:10", serving: "1 Tbsp", carbs: 16, note: "Liquid sweetener" },
        // Bread (white only)
        { name: "White bread", ratio: "0:100", serving: "2 slices", carbs: 26, note: "Low fiber" },
        { name: "White bagel", ratio: "0:100", serving: "1 medium", carbs: 48, note: "Dense, low fiber" },
        { name: "Saltine crackers", ratio: "0:100", serving: "10 crackers", carbs: 22, note: "Minimal fiber" },
        { name: "Pretzels", ratio: "0:100", serving: "1 oz", carbs: 23, note: "Zero fiber" },
        // Sports Products
        { name: "Gatorade", ratio: "45:55", serving: "20 oz", carbs: 36, note: "Zero fiber" },
        { name: "Energy gels", ratio: "30:70", serving: "1 packet", carbs: 22, note: "Pure carbs" },
      ],
      // PROTEIN SOURCES - Strategic timing (collagen Thu-Fri, full protein Sat refeed)
      protein: [
        // Thu-Fri Protein (no isoleucine)
        { name: "Collagen powder", serving: "25-30g", protein: 22, note: "Thu-Fri evenings - no isoleucine" },
        { name: "Collagen peptides", serving: "20g", protein: 18, note: "Easy mixing" },
        { name: "Leucine powder", serving: "3-4g", protein: 4, note: "Add to collagen for mTOR" },
        { name: "Gelatin", serving: "1 Tbsp", protein: 6, note: "Collagen source" },
        // Seafood (low isoleucine, ok Thu-Fri)
        { name: "White fish (cod)", serving: "4 oz", protein: 24, note: "Thu-Fri option" },
        { name: "White fish (tilapia)", serving: "4 oz", protein: 23, note: "Mild flavor" },
        { name: "White fish (halibut)", serving: "4 oz", protein: 26, note: "Firm texture" },
        { name: "Shrimp", serving: "4 oz", protein: 24, note: "Low fat protein" },
        { name: "Scallops", serving: "4 oz", protein: 20, note: "Quick cooking" },
        { name: "Crab meat", serving: "4 oz", protein: 20, note: "Low fat" },
        { name: "Lobster", serving: "4 oz", protein: 22, note: "Special occasion" },
        // Post Weigh-in / Sat-Sun Refeed
        { name: "Whey isolate", serving: "1 scoop", protein: 25, note: "Post weigh-in only" },
        { name: "Whey protein", serving: "1 scoop", protein: 24, note: "Recovery shake" },
        { name: "Chicken breast", serving: "4 oz", protein: 26, note: "Sat-Sun refeed" },
        { name: "Turkey breast", serving: "4 oz", protein: 26, note: "Lean option" },
        { name: "Lean beef", serving: "4 oz", protein: 26, note: "Iron rich" },
        { name: "Egg whites", serving: "4 whites", protein: 14, note: "Easy digestion" },
        { name: "Whole eggs", serving: "2 large", protein: 12, note: "Complete protein" },
        { name: "Greek yogurt", serving: "1 cup", protein: 17, note: "Casein + whey" },
        { name: "Cottage cheese", serving: "1 cup", protein: 28, note: "Slow digesting" },
        { name: "Salmon", serving: "4 oz", protein: 25, note: "Omega-3s" },
        { name: "Tuna", serving: "4 oz", protein: 26, note: "Lean fish" },
      ],
      // AVOID LIST - Foods that block FGF21 or add unwanted weight
      avoid: [
        // Mon-Wed Avoid (blocks FGF21)
        { name: "Whey protein (Mon-Wed)", reason: "Isoleucine blocks FGF21" },
        { name: "Casein protein (Mon-Wed)", reason: "Isoleucine blocks FGF21" },
        { name: "Chicken/Poultry (Mon-Wed)", reason: "High isoleucine" },
        { name: "Turkey (Mon-Wed)", reason: "High isoleucine" },
        { name: "Beef (Mon-Wed)", reason: "High isoleucine" },
        { name: "Pork (Mon-Wed)", reason: "High isoleucine" },
        { name: "Eggs (Mon-Wed)", reason: "High isoleucine" },
        { name: "Dairy (Mon-Wed)", reason: "High isoleucine" },
        // Thu-Fri Avoid (adds gut weight)
        { name: "Vegetables (Thu-Fri)", reason: "Fiber adds gut weight" },
        { name: "Fruits (Thu-Fri)", reason: "Fiber adds gut weight" },
        { name: "Whole grains (Thu-Fri)", reason: "Fiber adds gut weight" },
        { name: "Brown rice (Thu-Fri)", reason: "Fiber adds gut weight" },
        { name: "Oatmeal (Thu-Fri)", reason: "Fiber adds gut weight" },
        { name: "Beans/legumes (Thu-Fri)", reason: "High fiber + gas" },
        { name: "Nuts (Thu-Fri)", reason: "Fiber + fat" },
        { name: "Seeds (Thu-Fri)", reason: "Fiber + fat" },
        // Always Avoid During Cut
        { name: "Fatty meats", reason: "Slow digestion" },
        { name: "Fried foods", reason: "Slow digestion, bloating" },
        { name: "Dairy (during cut)", reason: "Can cause bloating" },
        { name: "Carbonated drinks", reason: "Gas and bloating" },
        { name: "High-fat foods", reason: "Slow glycogen restoration" },
        { name: "Alcohol", reason: "Dehydrates, empty calories" },
        { name: "Spicy foods (Thu-Fri)", reason: "Can cause GI issues" },
        { name: "Large meals (Thu-Fri)", reason: "Gut weight" },
      ],
      // TOURNAMENT DAY - Between matches (fast absorbing only)
      tournament: [
        // Immediate (0-5 min)
        { name: "Electrolyte drink", ratio: "45:55", serving: "16-20 oz", carbs: 21, timing: "0-5 min post" },
        { name: "Dextrose drink", ratio: "0:100", serving: "20-30g", carbs: 25, timing: "0-5 min post" },
        // Early (10-15 min)
        { name: "Rice cakes + honey", ratio: "25:75", serving: "2-3 cakes", carbs: 30, timing: "10-15 min" },
        { name: "Energy gel", ratio: "30:70", serving: "1 packet", carbs: 22, timing: "10-15 min" },
        { name: "Gummy bears", ratio: "50:50", serving: "handful", carbs: 22, timing: "10-15 min" },
        // Mid (20-30 min)
        { name: "Apple juice", ratio: "65:35", serving: "8-12 oz", carbs: 28, timing: "20-30 min" },
        { name: "Grape juice", ratio: "60:40", serving: "8-12 oz", carbs: 30, timing: "20-30 min" },
        { name: "Sports drink", ratio: "45:55", serving: "16 oz", carbs: 21, timing: "20-30 min" },
        // Later (40-50 min)
        { name: "Small white rice", ratio: "0:100", serving: "1/2 cup", carbs: 22, timing: "40-50 min" },
        { name: "Ripe banana", ratio: "50:50", serving: "1 medium", carbs: 27, timing: "40-50 min" },
        { name: "White bread + honey", ratio: "25:75", serving: "1 slice", carbs: 20, timing: "40-50 min" },
        // Continuous
        { name: "Electrolyte sipping", ratio: "45:55", serving: "16-24 oz/hr", carbs: 21, timing: "Continuous" },
        { name: "Small sips water", ratio: "0:0", serving: "4-8 oz/hr", carbs: 0, timing: "Continuous" },
      ],
      // SUPPLEMENTS - Optional performance support
      supplements: [
        { name: "TUDCA", serving: "250mg AM/PM", note: "Liver support during high fructose" },
        { name: "Choline", serving: "500mg AM/PM", note: "Fat metabolism support" },
        { name: "Electrolyte powder", serving: "1-2 scoops", note: "Add to all water" },
        { name: "Sodium (salt)", serving: "1-2g per liter", note: "Critical for hydration" },
        { name: "Magnesium", serving: "400mg", note: "Prevents cramping" },
        { name: "Potassium", serving: "from food", note: "Bananas, potatoes" },
      ],
    };
  };

  const getFuelingGuide = () => {
    const phase = getPhase();
    const protocol = profile.protocol;
    const today = profile.simulatedDate || new Date();
    const dayOfWeek = getDay(today); // 0=Sun, 1=Mon

    // Protocol 1: Sugar Fast (Extreme)
    if (protocol === '1') {
      if (dayOfWeek >= 1 && dayOfWeek <= 4) { // Mon-Thu
        return {
          ratio: "Fructose Only",
          protein: "0g",
          carbs: "250-400g",
          allowed: ["Apple Juice", "Pears", "Grapes", "Honey", "Agave"],
          avoid: ["ALL Protein", "Starchy Carbs", "Fat"]
        };
      }
      if (dayOfWeek === 5) { // Fri
        return {
           ratio: "Fructose + MCT",
           protein: "0.2g/lb (Evening)",
           carbs: "<1500 cal total",
           allowed: ["Fruit", "Honey", "MCT Oil", "Small Whey/Collagen (Evening)"],
           avoid: ["Starch", "Fiber"]
        };
      }
      if (dayOfWeek === 6) { // Sat (Refeed)
         return {
             ratio: "Protein Refeed",
             protein: "1.0g/lb",
             carbs: "Low",
             allowed: ["Lean Meat", "Eggs", "Healthy Fats"],
             avoid: ["Sugar"]
         };
      }
    }

    // Protocol 2: Fat Loss Focus (Standard In-Season)
    if (protocol === '2') {
      if (dayOfWeek >= 1 && dayOfWeek <= 2) { // Mon-Tue
         return {
          ratio: "Fructose Heavy",
          protein: "0g",
          carbs: "325-450g",
          allowed: ["Fruit", "Juice", "Honey"],
          avoid: ["Protein", "Starch", "Fat"]
         };
      }
      if (dayOfWeek === 3) { // Wed
        return {
          ratio: "Fructose + Collagen",
          protein: "25g (Dinner)",
          carbs: "325-450g",
          allowed: ["Fruit", "Juice", "Honey", "Collagen + Leucine (Dinner)"],
          avoid: ["Starch", "Meat", "Fat"]
        };
      }
      if (phase === 'transition' || phase === 'performance-prep') { // Thu-Fri
        return {
          ratio: "Glucose Heavy",
          protein: "60g/day",
          carbs: "325-450g",
          allowed: ["White Rice", "Potato", "Dextrose", "Collagen", "Seafood"],
          avoid: ["Fiber (Fruits/Veg)", "Fatty Meat"]
        };
      }
    }

    // Protocol 3: Maintain
    if (protocol === '3') {
       if (dayOfWeek === 1) { // Mon
         return {
           ratio: "Fructose Heavy",
           protein: "25g",
           carbs: "300-450g",
           allowed: ["Fruit", "Juice", "Collagen"],
           avoid: ["Starch", "Fat"]
         };
       }
       if (dayOfWeek >= 2 && dayOfWeek <= 3) { // Tue-Wed
         return {
           ratio: "Mixed Fructose/Glucose",
           protein: "75g/day",
           carbs: "300-450g",
           allowed: ["Fruit", "Rice", "Lean Protein", "Egg Whites"],
           avoid: ["High Fat"]
         };
       }
       // Thu-Fri same as standard performance prep
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

    // Protocol 4: Hypertrophy
    if (protocol === '4') {
        if (dayOfWeek === 1) { // Mon
            return {
                ratio: "Balanced Carbs",
                protein: "100g",
                carbs: "350-600g",
                allowed: ["Balanced Carbs", "Whole Protein", "Collagen"],
                avoid: ["Junk Food"]
            };
        }
        if (dayOfWeek >= 2 && dayOfWeek <= 3) { // Tue-Wed
            return {
                ratio: "Glucose Emphasis",
                protein: "125g/day",
                carbs: "350-600g",
                allowed: ["Rice", "Potatoes", "Lean Protein", "Collagen"],
                avoid: ["Excessive Fiber pre-workout"]
            };
        }
        if (dayOfWeek >= 4 && dayOfWeek <= 5) { // Thu-Fri
            return {
                ratio: "Glucose Heavy",
                protein: "125g/day",
                carbs: "350-600g",
                allowed: ["Rice", "Potatoes", "Chicken", "Seafood"],
                avoid: ["Fiber"]
            };
        }
        if (dayOfWeek === 0 || dayOfWeek === 6) { // Sat-Sun
            return {
                ratio: "High Intake",
                protein: "1.6g/lb",
                carbs: "High",
                allowed: ["Whole Foods", "High Quality Fats"],
                avoid: []
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

    // Protocol Specific Focus Actions
    if (protocol === '1') { // Body Comp Phase
       title = "Today's Mission: Body Comp";
       actions.push("⚠️ EXECUTE BODY COMP PHASE");
       actions.push(`Hit Protein Target: ${fuel.protein || '0g'}`);
       actions.push(`Hit Carb Target: ${fuel.carbs || 'High'}`);
       if (phase === 'metabolic') actions.push("Maximize FGF21 (Strict No Protein)");
       if (phase === 'performance-prep') actions.push("Reintroduce Protein Evening (0.2g/lb)");
    } else if (protocol === '2') { // Make Weight Phase
       title = "Today's Mission: Make Weight";
       actions.push(`Hit Protein Target: ${fuel.protein}`);
       actions.push(`Hit Carb Target: ${fuel.carbs}`);
       if (phase === 'metabolic') actions.push("Maximize Fat Oxidation (Keep Protein Low)");
       if (phase === 'transition') actions.push("Switch to Glucose/Starch + Seafood");
    } else if (protocol === '3') { // Hold Weight Phase
       title = "Today's Mission: Hold Weight";
       actions.push("Focus on Performance & Recovery");
       actions.push(`Hit Protein Target: ${fuel.protein}`);
    } else if (protocol === '4') { // Build Phase
       title = "Today's Mission: Build";
       actions.push("Focus on Muscle Growth & Weight Gain");
       actions.push(`Hit Protein Target: ${fuel.protein}`);
       actions.push(`Hit Carb Target: ${fuel.carbs}`);
    }

    // General Phase Rules
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

  // Data-driven weekly plan with specific numbers
  const getWeeklyPlan = (): DayPlan[] => {
    const w = profile.targetWeightClass;
    const wKg = w / 2.2;
    const today = profile.simulatedDate || new Date();
    const currentDayOfWeek = getDay(today);
    const protocol = profile.protocol;

    // Weight category for water amounts
    const isHeavy = w >= 174;
    const isMedium = w >= 149 && w < 174;

    // Helper to convert gallons to oz
    const galToOz = (gal: number) => Math.round(gal * 128);

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
        weightTarget: { morning: Math.round(w * 1.03), postPractice: Math.round(w * 1.01) },
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
    
    // Simple logic for next target based on last action
    if (!lastLog || lastLog.type === 'morning') {
        return { label: "Pre-Practice", weight: todayTarget + 1.5, description: "Hydrated Limit" };
    }
    if (lastLog.type === 'pre-practice') {
        return { label: "Post-Practice", weight: todayTarget, description: "End of Day Target" };
    }
    // Post practice -> Morning target
    return { label: "Tomorrow Morning", weight: todayTarget - 0.8, description: "Overnight Drift Goal" };
  };

  const getDriftMetrics = () => {
    // 1. Overnight Drift: Post-Practice (Night before) -> Morning (Today/Next Day)
    // Find pairs where type goes Post -> Morning
    let overnightSum = 0;
    let overnightCount = 0;
    
    // 2. Session Delta: Pre -> Post
    let sessionSum = 0;
    let sessionCount = 0;

    // Simple scan through logs (sorted desc)
    for (let i = 0; i < logs.length - 1; i++) {
        const current = logs[i];
        const next = logs[i+1]; // Older log

        // Overnight: Current is Morning, Next is Post-Practice
        if (current.type === 'morning' && next.type === 'post-practice') {
            // Check if dates are close (next day)
            const diffHours = (current.date.getTime() - next.date.getTime()) / (1000 * 60 * 60);
            if (diffHours > 6 && diffHours < 16) {
                overnightSum += (current.weight - next.weight);
                overnightCount++;
            }
        }

        // Session: Current is Post-Practice, Next is Pre-Practice
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

  return (
    <StoreContext.Provider value={{
      profile,
      fuelTanks,
      logs,
      dailyTracking,
      updateProfile,
      addLog,
      updateLog,
      deleteLog,
      updateDailyTracking,
      getDailyTracking,
      resetData,
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
