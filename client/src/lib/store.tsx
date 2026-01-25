import React, { createContext, useContext, useState, useEffect } from 'react';
import { addDays, subDays, format } from 'date-fns';

// Types
export type Track = 'A' | 'B'; // A: Fat Loss (Early), B: Performance (Late/Close)
export type Status = 'on-track' | 'borderline' | 'risk';

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
    // If weight is dropping fast, status = on-track
    // If weight is stuck, adjust Tanks
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

  // Mock calculation for 1% descent model
  const calculateTarget = () => {
    // Simply example: Target is gradually approaching class limit
    const daysOut = Math.max(0, (profile.weighInDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    // Linear interpolation for mockup
    return profile.targetWeightClass + (daysOut * 0.5); 
  };

  return (
    <StoreContext.Provider value={{ profile, fuelTanks, logs, updateProfile, addLog, resetData, calculateTarget }}>
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
