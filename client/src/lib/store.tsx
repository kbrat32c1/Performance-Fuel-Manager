import React, { createContext, useContext, useState } from 'react';
import { addDays, subDays, differenceInDays, getDay } from 'date-fns';

// Types
export type Protocol = '1' | '2' | '3' | '4'; 
// 1: Sugar Fast (Extreme/Preseason)
// 2: Fat Loss Focus (In-Season)
// 3: Maintain (Performance)
// 4: Hypertrophy (Weight Gain)

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
  experienceLevel: 'novice' | 'intermediate' | 'advanced';
  hasSaunaAccess: boolean;
  protocol: Protocol;
  status: Status;
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
  getFuelingGuide: () => { allowed: string[]; avoid: string[]; ratio: string; protein?: string; carbs?: string };
  getCheckpoints: () => { walkAround: string; wedTarget: string; friTarget: string };
  getRehydrationPlan: (lostWeight: number) => { fluidRange: string; sodiumRange: string; glycogen: string };
  getCoachMessage: () => { title: string; message: string; status: 'success' | 'warning' | 'danger' | 'info' };
}

const defaultProfile: AthleteProfile = {
  name: 'Athlete',
  currentWeight: 168.4,
  targetWeightClass: 157,
  weighInDate: addDays(new Date(), 5), // 5 days out
  matchDate: addDays(new Date(), 5),
  experienceLevel: 'intermediate',
  hasSaunaAccess: true,
  protocol: '2', // Default to Fat Loss Focus
  status: 'on-track',
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
    const today = new Date();
    const daysUntilWeighIn = differenceInDays(profile.weighInDate, today);

    if (daysUntilWeighIn <= 1) return 'last-24h';
    
    // Simplification for prototype: Assuming Mon-Fri week roughly matches days out
    if (daysUntilWeighIn >= 3) return 'metabolic'; // Mon-Wed
    if (daysUntilWeighIn === 2) return 'transition'; // Thu
    if (daysUntilWeighIn === 1) return 'performance-prep'; // Fri

    return 'metabolic'; // Default
  };

  const isAdvancedAllowed = () => {
    return profile.coachMode;
  };

  const getHydrationTarget = () => {
    const w = profile.targetWeightClass;
    const phase = getPhase();
    const advanced = isAdvancedAllowed();
    const dayOfWeek = getDay(new Date()); // Using actual day for reverse load schedule (Mon=1, etc)
    
    // Reverse Water Load Logic (Advanced / Protocol 1)
    if (advanced || profile.protocol === '1') { 
       const isHeavy = w >= 174;
       const isMedium = w >= 149 && w < 174;

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
    const protocol = profile.protocol;
    const dayOfWeek = getDay(new Date()); // 0=Sun, 1=Mon

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
    if (protocol === '1') { // Sugar Fast
       title = "Protocol 1: Sugar Fast";
       actions.push("⚠️ EXTREME FAT LOSS MODE");
       actions.push(`Protein Target: ${fuel.protein || '0g'}`);
       actions.push(`Carb Target: ${fuel.carbs || 'High'}`);
       if (phase === 'metabolic') actions.push("GOAL: Maximize FGF21 (No Protein)");
       if (phase === 'performance-prep') actions.push("Evening: Reintroduce Protein (0.2g/lb)");
    } else if (protocol === '2') { // Fat Loss
       title = "Protocol 2: Fat Loss Focus";
       actions.push(`Protein Target: ${fuel.protein}`);
       actions.push(`Carb Target: ${fuel.carbs}`);
       if (phase === 'metabolic') actions.push("GOAL: Fat Oxidation (Low Protein)");
       if (phase === 'transition') actions.push("Switch to Glucose/Starch + Seafood");
    } else if (protocol === '3') { // Maintain
       title = "Protocol 3: Maintenance";
       actions.push("Focus: Performance & Recovery");
       actions.push(`Protein Target: ${fuel.protein}`);
    } else if (protocol === '4') { // Hypertrophy
       title = "Protocol 4: Hypertrophy";
       actions.push("Focus: Muscle Growth & Weight Gain");
       actions.push(`Protein Target: ${fuel.protein}`);
       actions.push(`Carb Target: ${fuel.carbs}`);
    }

    // General Phase Rules
    if (phase === 'transition') {
      actions.push("ELIMINATE FIBER (No veggies/fruit)");
      actions.push("Collagen + Leucine (Dinner)");
    } else if (phase === 'performance-prep') {
       actions.push("ZERO Fiber");
       actions.push("Monitor Weight Drift");
    }

    if (isOver && phase !== 'last-24h') {
      warning = "Weight high - check protocol adherence";
    }

    return { title, actions, warning };
  };

  const getCoachMessage = (): { title: string; message: string; status: 'success' | 'warning' | 'danger' | 'info' } => {
    const day = getDay(new Date()); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    const w = profile.targetWeightClass;
    const current = profile.currentWeight;
    
    // WEDNESDAY CHECKPOINT (Post-Practice)
    if (day === 3) { 
        const wedTargetMin = w * 1.04;
        const wedTargetMax = w * 1.05;
        const wedMid = (wedTargetMin + wedTargetMax) / 2;
        
        if (current > wedTargetMax + 1) {
            return {
                title: "Wednesday Checkpoint: Behind Pace",
                message: "You are above the target range. Increase training intensity immediately and verify your protocol adherence. Do not cut water yet.",
                status: 'danger'
            };
        }
        if (current < wedTargetMin - 1) {
             return {
                title: "Wednesday Checkpoint: Ahead of Pace",
                message: "You are lighter than expected. You can increase food intake slightly for Thu-Fri to preserve energy. Do NOT get dehydrated this early.",
                status: 'success'
            };
        }
        return {
            title: "Wednesday Checkpoint: On Track",
            message: "Perfect. You are exactly where you need to be. Maintain the protocol.",
            status: 'info'
        };
    }

    // FRIDAY CHECKPOINT (Pre-Practice)
    if (day === 5) {
        const friTarget = w * 1.03; // Approx 3% over
        
        if (current > friTarget + 2) {
             return {
                title: "Friday Checkpoint: Heavy",
                message: "You have more than 3% to cut. You will need a harder practice today. Focus on sweat output.",
                status: 'warning'
            };
        }
        return {
            title: "Friday Checkpoint: Ready",
            message: "You are within striking distance (3%). This will come off during practice and overnight drift.",
            status: 'success'
        };
    }

    // MONDAY CHECKPOINT (Baseline)
    if (day === 1) {
        const walkAround = w * 1.07;
        if (current > walkAround) {
             return {
                title: "Monday Checkpoint: Baseline High",
                message: `You are starting the week heavy (>7% over). Protocol 1 or 2 is strictly required this week.`,
                status: 'warning'
            };
        }
    }

    return {
        title: "Daily Guidance",
        message: "Follow the fueling guide below. Keep your urine clear until Thursday.",
        status: 'info'
    };
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
      getRehydrationPlan,
      getCheckpoints,
      getCoachMessage
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
