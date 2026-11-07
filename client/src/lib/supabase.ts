import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Client Configuration
 *
 * SECURITY: No hardcoded URLs or keys. All values must come from environment variables.
 * This prevents accidental connection to wrong database in different environments.
 *
 * Required env vars:
 * - VITE_SUPABASE_URL: Your Supabase project URL
 * - VITE_SUPABASE_ANON_KEY: Your Supabase anon/public key (safe for client)
 *
 * DO NOT use SUPABASE_SERVICE_ROLE_KEY on the client - it bypasses RLS!
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate required environment variables
if (!supabaseUrl) {
  console.error(
    'Missing VITE_SUPABASE_URL environment variable. ' +
    'Please set it in your .env file or deployment configuration.'
  );
}

if (!supabaseAnonKey) {
  console.error(
    'Missing VITE_SUPABASE_ANON_KEY environment variable. ' +
    'Please set it in your .env file or deployment configuration.'
  );
}

// Create client - will fail gracefully if credentials missing
// The app will show appropriate errors when Supabase calls fail
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      // Persist session in localStorage
      persistSession: true,
      // Auto-refresh tokens before expiry
      autoRefreshToken: true,
      // Detect session from URL (for OAuth redirects)
      detectSessionInUrl: true,
    },
  }
);

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
  user_foods: UserFoodsJson | null;
  created_at: string;
  updated_at: string;
}

// Shape of the user_foods JSONB column
export interface UserFoodsJson {
  custom_foods?: MacroCustomFood[];
  custom_meals?: MacroCustomMeal[];
  spar_custom_foods?: SparCustomFood[];
  spar_custom_meals?: SparCustomMealData[];
  favorites?: string[];
}

// MacroTracker custom food shape
export interface MacroCustomFood {
  id: string;
  name: string;
  carbs: number;
  protein: number;
  serving: string;
}

// MacroTracker custom meal shape
export interface MacroCustomMealItem {
  name: string;
  carbs: number;
  protein: number;
  liquidOz?: number;
}
export interface MacroCustomMeal {
  id: string;
  name: string;
  items: MacroCustomMealItem[];
  totalCarbs: number;
  totalProtein: number;
  totalWater: number;
}

// SparTracker custom food shape
export interface SparCustomFood {
  id: string;
  name: string;
  serving: string;
  calories: number;
  category: string; // SliceCategory
  icon: string;
}

// SparTracker custom meal shape
export interface SparCustomMealData {
  id: string;
  name: string;
  items: Array<{ name: string; category: string; slices: number }>;
  totalProtein: number;
  totalCarb: number;
  totalVeg: number;
  totalFruit: number;
  totalFat: number;
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

export interface DbHealthData {
  id: string;
  user_id: string;
  date: string;
  // Heart metrics
  resting_heart_rate: number | null;  // bpm
  hrv: number | null;                 // ms (SDNN)
  // Blood oxygen
  spo2: number | null;                // 0-100 percentage
  // Sleep
  sleep_hours: number | null;         // total hours (actual, minus awake)
  sleep_score: number | null;         // 0-100 computed
  sleep_deep_minutes: number | null;  // deep sleep minutes
  sleep_light_minutes: number | null; // light sleep minutes
  sleep_rem_minutes: number | null;   // REM sleep minutes
  sleep_awake_minutes: number | null; // awake-in-bed minutes
  // Respiratory & advanced HRV
  hrv_rmssd: number | null;           // ms (RMSSD — more sensitive than SDNN)
  respiratory_rate: number | null;    // breaths per minute
  // Temperature
  body_temperature: number | null;    // degrees F
  // Activity
  active_energy: number | null;       // kcal
  step_count: number | null;
  // Heart rate zone tracking (from TRIMP strain computation)
  peak_hr: number | null;             // bpm — highest HR observed today
  avg_hr: number | null;              // bpm — average HR today
  hr_zone1_minutes: number | null;    // minutes in zone 1 (50-60% max HR)
  hr_zone2_minutes: number | null;    // minutes in zone 2 (60-70% max HR)
  hr_zone3_minutes: number | null;    // minutes in zone 3 (70-80% max HR)
  hr_zone4_minutes: number | null;    // minutes in zone 4 (80-90% max HR)
  hr_zone5_minutes: number | null;    // minutes in zone 5 (90-100% max HR)
  trimp_score: number | null;         // raw TRIMP value
  // Computed scores
  recovery_score: number | null;      // 0-100
  strain_score: number | null;        // 0-100
  // Metadata
  source: 'healthkit' | 'manual' | 'v5-direct';
  synced_at: string;
  created_at: string;
  updated_at: string;
}
