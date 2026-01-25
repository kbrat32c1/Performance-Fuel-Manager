import React, { createContext, useContext, useState, useEffect } from 'react';
import { addDays, subDays, format, differenceInDays, getDay } from 'date-fns';

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
  getTodaysFocus: () => { title: string; actions: string[] };
  isAdvancedAllowed: () => boolean;
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
    const daysOut = Math.max(0, (profile.weighInDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return profile.targetWeightClass + (daysOut * 0.5); 
  };

  // Rules Engine Logic
  const getPhase = (): Phase => {
    const today = new Date();
    const daysUntilWeighIn = differenceInDays(profile.weighInDate, today);

    if (daysUntilWeighIn <= 1) return 'last-24h';
    
    const dayOfWeek = getDay(today); // 0 = Sun, 1 = Mon, ... 4 = Thu, 5 = Fri
    
    if (dayOfWeek >= 1 && dayOfWeek <= 3) return 'metabolic'; // Mon-Wed
    if (dayOfWeek === 4) return 'transition'; // Thu
    if (dayOfWeek === 5) return 'performance-prep'; // Fri

    return 'metabolic'; // Default
  };

  const isAdvancedAllowed = () => {
    return profile.goal === 'advanced' || profile.coachMode;
  };

  const getTodaysFocus = () => {
    const phase = getPhase();
    const track = profile.track;
    const isOver = profile.currentWeight > calculateTarget();
    
    // Defaults
    let title = "Maintain Performance Baseline";
    let actions = [
      "Hydrate to thirst + electrolytes",
      "Clean carbs post-practice",
    ];

    if (phase === 'metabolic') {
      title = "Metabolic Output Phase";
      if (track === 'A') {
        actions = ["High volume training output", "No starchy carbs before practice", "Refill glycogen post-practice only"];
      } else {
        actions = ["Normal training volume", "Balanced macros", "Hydrate aggressively"];
      }
    } else if (phase === 'transition') { // Thu
      title = "Fiber Transition Phase";
      actions = [
        "Eliminate fibrous veggies/whole grains",
        "Switch to white rice/simple carbs",
        "Sodium intake: Normal",
        "Begin tapering water volume slightly"
      ];
    } else if (phase === 'performance-prep') { // Fri
      title = "Performance Prep Phase";
      actions = [
        "ZERO Fiber intake today",
        "Glucose-dense, low-volume foods only",
        "Monitor weight drift closely",
        isAdvancedAllowed() ? "Execute Reverse Water Load if scheduled" : "Sip water, do not gulp"
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
      actions.push("⚠️ Weight is drifting high - tighten fueling window");
    }

    return { title, actions };
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
      isAdvancedAllowed
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
