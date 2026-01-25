import React, { createContext, useContext, useState } from 'react';
import { addDays, subDays, differenceInDays, getDay } from 'date-fns';

// Types
export type Track = 'A' | 'B'; // A: Fat Loss (Early), B: Performance (Late/Close)
export type Status = 'on-track' | 'borderline' | 'risk';

export type GoalType = 
  | 'season-fat-loss'
  | 'make-weight-week'
  | 'same-day'
  | 'day-before'
  | 'advanced';

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
  experienceLevel: 'novice' | 'intermediate' | 'advanced';
  hasSaunaAccess: boolean;
  track: Track;
  status: Status;
  goal: GoalType;
  coachMode: boolean;
}

export interface WeightLog {
  id: string;
  date: Date;
  weight: number;
  type: 'morning' | 'post-practice';
  urineColor?: number; // 1-8
  notes?: string;
}

interface StoreContextType {
  profile: AthleteProfile;
  fuelTanks: FuelTanks;
  logs: WeightLog[];
  updateProfile: (updates: Partial<AthleteProfile>) => void;
  addLog: (log: Omit<WeightLog, 'id'>) => void;
  resetData: () => void;
  calculateTarget: () => number;
  getPhase: () => Phase;
  getTodaysFocus: () => { title: string; actions: string[], warning?: string };
  isAdvancedAllowed: () => boolean;
  getHydrationTarget: () => { amount: string; type: string; note: string };
  getFuelingGuide: () => { allowed: string[]; avoid: string[]; ratio: string };
  getRehydrationPlan: (lostWeight: number) => { fluidRange: string; sodiumRange: string; glycogen: string };
}

const defaultProfile: AthleteProfile = {
  name: 'Athlete',
  currentWeight: 168.4,
  targetWeightClass: 157,
  weighInDate: addDays(new Date(), 5), // 5 days out
  matchDate: addDays(new Date(), 5),
  experienceLevel: 'intermediate',
  hasSaunaAccess: true,
  track: 'A', // Default to Fat Loss track initially
  status: 'on-track',
  goal: 'make-weight-week',
  coachMode: false,
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
  const [profile, setProfile] = useState<AthleteProfile>(defaultProfile);
  const [fuelTanks, setFuelTanks] = useState<FuelTanks>(defaultTanks);
  const [logs, setLogs] = useState<WeightLog[]>([
    { id: '1', date: subDays(new Date(), 1), weight: 169.2, type: 'morning', urineColor: 2 },
    { id: '2', date: subDays(new Date(), 2), weight: 170.1, type: 'morning', urineColor: 3 },
  ]);

  const updateProfile = (updates: Partial<AthleteProfile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
  };

  const addLog = (log: Omit<WeightLog, 'id'>) => {
    const newLog = { ...log, id: Math.random().toString(36).substr(2, 9) };
    setLogs(prev => [newLog, ...prev]);
    
    // Mock Auto-adjustment logic
    setProfile(prev => ({
      ...prev,
      currentWeight: log.weight,
      status: log.weight <= calculateTarget() + 1 ? 'on-track' : 'borderline'
    }));
  };

  const resetData = () => {
    setProfile(defaultProfile);
    setFuelTanks(defaultTanks);
    setLogs([]);
  };

  const calculateTarget = () => {
    // 1% Per Day Descent Model (from PDF)
    // Mon (5 days out) -> Sat (0 days out)
    const daysOut = Math.max(0, differenceInDays(profile.weighInDate, new Date()));
    // Target = Class + (Class * 0.015 * daysOut) - slightly steeper early week
    // Mon: ~7.5% over, Fri: ~1.5% over
    // Simplified 1% rule:
    return profile.targetWeightClass * (1 + (0.012 * daysOut)); 
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
    const today = new Date();
    const daysUntilWeighIn = differenceInDays(profile.weighInDate, today);

    if (daysUntilWeighIn <= 1) return 'last-24h';
    
    const dayOfWeek = getDay(today); // 0 = Sun, 1 = Mon, ... 4 = Thu, 5 = Fri
    
    // Simplification for prototype: Assuming Mon-Fri week roughly matches days out
    if (daysUntilWeighIn >= 3) return 'metabolic'; // Mon-Wed
    if (daysUntilWeighIn === 2) return 'transition'; // Thu
    if (daysUntilWeighIn === 1) return 'performance-prep'; // Fri

    return 'metabolic'; // Default
  };

  const isAdvancedAllowed = () => {
    return profile.goal === 'advanced' || profile.coachMode;
  };

  const getHydrationTarget = () => {
    const w = profile.targetWeightClass;
    const phase = getPhase();
    const advanced = isAdvancedAllowed();
    const dayOfWeek = getDay(new Date()); // Using actual day for reverse load schedule (Mon=1, etc)
    
    // Reverse Water Load Logic (Advanced)
    if (advanced && profile.goal === 'advanced') { // Simplified check
       const isHeavy = w >= 174;
       const isMedium = w >= 149 && w < 174;
       // const isLight = w < 149; 

       // Mon(1), Tue(2), Wed(3), Thu(4), Fri(5)
       if (dayOfWeek === 1) return { amount: isHeavy ? "1.5 gal" : isMedium ? "1.25 gal" : "1.0 gal", type: "Regular", note: "Baseline Hydration" };
       if (dayOfWeek === 2) return { amount: isHeavy ? "1.75 gal" : isMedium ? "1.5 gal" : "1.25 gal", type: "Regular", note: "Increase Diuresis" };
       if (dayOfWeek === 3) return { amount: isHeavy ? "2.0 gal" : isMedium ? "1.75 gal" : "1.5 gal", type: "Regular", note: "Peak Hydration" };
       if (dayOfWeek === 4) return { amount: isHeavy ? "1.75 gal" : isMedium ? "1.5 gal" : "1.25 gal", type: "Distilled", note: "Switch to Distilled" };
       if (dayOfWeek === 5) return { amount: isHeavy ? "12-16 oz" : isMedium ? "8-12 oz" : "8-10 oz", type: "Distilled", note: "Flush Phase - Cut Sodium" };
    }

    // Standard Hydration Logic (Mon-Wed/Thu)
    if (phase === 'metabolic' || phase === 'transition') {
      let amount = "90-105 oz";
      if (w >= 141) amount = "100-115 oz";
      if (w >= 157) amount = "110-120 oz";
      if (w >= 165) amount = "115-130 oz";
      if (w >= 184) amount = "125-140 oz";
      if (w >= 285) amount = "150-170 oz";
      
      return { 
        amount, 
        type: "Electrolyte Mix", 
        note: "Add 1-2g sodium/L" 
      };
    }

    // Fri Standard
    if (phase === 'performance-prep') {
      return { amount: "Sip to thirst", type: "Water", note: "Do not gulp. Monitor drift." };
    }

    return { amount: "To thirst", type: "Water", note: "Maintain baseline" };
  };

  const getFuelingGuide = () => {
    const phase = getPhase();
    const track = profile.track;

    if (phase === 'metabolic') {
      if (track === 'A') { // Fructose Early
        return {
          ratio: "60:40 Fructose:Glucose",
          allowed: ["Apple Juice", "Pears", "Grapes", "Mango", "Agave", "Honey"],
          avoid: ["Starchy Carbs (AM)", "Processed Sugar"]
        };
      } else { // Track B Glucose Early
        return {
          ratio: "40:60 Glucose:Fructose",
          allowed: ["White Rice", "Potato", "Dextrose", "Rice Cakes", "Honey"],
          avoid: ["High Fiber Veggies", "Fatty Meat"]
        };
      }
    }

    if (phase === 'transition' || phase === 'performance-prep') {
      return {
        ratio: "Zero Fiber / Balanced",
        allowed: ["White Rice", "Potato", "Honey", "Dextrose", "Rice Cakes"],
        avoid: ["ALL Fruits", "ALL Vegetables", "Oats", "Whole Grains", "Beans"]
      };
    }

    return { ratio: "Balanced", allowed: [], avoid: [] };
  };

  const getTodaysFocus = () => {
    const phase = getPhase();
    const track = profile.track;
    const isOver = profile.currentWeight > calculateTarget();
    const fuel = getFuelingGuide();
    
    // Defaults
    let title = "Maintain Performance Baseline";
    let actions = [
      "Hydrate to thirst + electrolytes",
      "Clean carbs post-practice",
    ];
    let warning = undefined;

    if (phase === 'metabolic') {
      title = "Metabolic Output Phase";
      if (track === 'A') {
        actions = [
          "Focus: Fat Loss (FGF21 Activation)",
          `Eat: ${fuel.allowed.slice(0, 3).join(", ")}`,
          "Supplements: TUDCA 250mg, Choline 500mg (AM/PM)",
          "No starchy carbs before practice", 
          "Refill glycogen post-practice only"
        ];
      } else {
        actions = [
          "Focus: Training Performance",
          `Eat: ${fuel.allowed.slice(0, 3).join(", ")}`,
          "Supplements: TUDCA 250mg, Choline 500mg (AM/PM)",
          "Hydrate aggressively (See target)",
          "Fuel heavy sessions"
        ];
      }
    } else if (phase === 'transition') { // Thu
      title = "Fiber Transition Phase";
      actions = [
        "ELIMINATE ALL FIBER (No fruits/veggies)",
        "Switch to white rice/simple carbs",
        "Begin tapering water volume",
        "Evening: Collagen (25g) + Leucine (3g) if available"
      ];
    } else if (phase === 'performance-prep') { // Fri
      title = "Performance Prep Phase";
      actions = [
        "ZERO Fiber intake today",
        "Glucose-dominant: White rice, Honey, Dextrose",
        "Monitor weight drift closely",
        isAdvancedAllowed() ? "Execute Reverse Water Load (Distilled)" : "Sip water, do not gulp"
      ];
    } else if (phase === 'last-24h') {
      title = "Final Descent";
      actions = [
        "Check weight every 4 hours",
        "Rinse mouth if thirsty, limit swallowing",
        "Visualize weigh-in process"
      ];
    }

    if (isOver && phase !== 'last-24h') {
      warning = "Weight is drifting high - tighten fueling window";
    }

    return { title, actions, warning };
  };

  return (
    <StoreContext.Provider value={{ 
      profile, 
      fuelTanks, 
      logs, 
      updateProfile, 
      addLog, 
      resetData, 
      calculateTarget,
      getPhase,
      getTodaysFocus,
      isAdvancedAllowed,
      getHydrationTarget,
      getFuelingGuide,
      getRehydrationPlan
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
