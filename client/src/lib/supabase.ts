import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xcqsnrqjghcxuotoaryv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcXNucnFqZ2hjeHVvdG9hcnl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTY3NDIsImV4cCI6MjA4NDk5Mjc0Mn0.ZuBigsjqFDET1irku7JSRaOBTLtSlOHPFmzEuhVEha8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for database tables
export interface DbProfile {
  id: string;
  user_id: string;
  name: string;
  current_weight: number;
  target_weight_class: number;
  weigh_in_date: string;
  weigh_in_time: string;
  protocol: number;
  has_completed_onboarding: boolean;
  simulated_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbWeightLog {
  id: string;
  user_id: string;
  weight: number;
  date: string;
  type: 'morning' | 'pre-practice' | 'post-practice' | 'before-bed';
  created_at: string;
}

export interface DbDailyTracking {
  id: string;
  user_id: string;
  date: string;
  carbs_consumed: number;
  protein_consumed: number;
  water_consumed: number;
  created_at: string;
  updated_at: string;
}
