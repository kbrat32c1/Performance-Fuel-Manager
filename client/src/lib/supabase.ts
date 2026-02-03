import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xcqsnrqjghcxuotoaryv.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_ANON_KEY environment variable');
}

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
  share_token: string | null;
  // SPAR Nutrition fields
  height_inches: number | null;
  age: number | null;
  gender: string | null;
  activity_level: string | null;
  weekly_goal: string | null;
  nutrition_preference: string | null;
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
  no_practice: boolean;
  // SPAR slice tracking
  protein_slices: number;
  carb_slices: number;
  veg_slices: number;
  nutrition_mode: string | null; // 'spar' | 'sugar'
  food_log: any; // JSON array of FoodLogEntry
  created_at: string;
  updated_at: string;
}
