-- ============================================================================
-- PERFORMANCE FUEL MANAGER - HEALTH DATA TABLE MIGRATION
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
--
-- Adds the health_data table for storing wearable/HealthKit health metrics
-- that feed into the Cut Score "Premium" tier.
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE HEALTH_DATA TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS health_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL,

  -- Heart metrics
  resting_heart_rate REAL,          -- bpm, from HKQuantityTypeIdentifierRestingHeartRate
  hrv REAL,                         -- ms (SDNN), from HKQuantityTypeIdentifierHeartRateVariabilitySDNN

  -- Blood oxygen
  spo2 REAL,                        -- 0-100 percentage, from HKQuantityTypeIdentifierOxygenSaturation

  -- Sleep
  sleep_hours REAL,                 -- total sleep duration in hours
  sleep_score REAL,                 -- computed 0-100 from sleep stage analysis

  -- Temperature
  body_temperature REAL,            -- degrees F

  -- Activity
  active_energy REAL,               -- kcal burned, from HKQuantityTypeIdentifierActiveEnergyBurned
  step_count INTEGER,               -- from HKQuantityTypeIdentifierStepCount

  -- Computed scores (derived from raw metrics by the app)
  recovery_score REAL,              -- 0-100, computed from HRV + RHR + sleep
  strain_score REAL,                -- 0-100, computed from activity + HR

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'healthkit',  -- 'healthkit' | 'manual'
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One row per user per day (upsert pattern)
  UNIQUE(user_id, date)
);

-- ============================================================================
-- PART 2: ENABLE ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE health_data ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 3: CREATE RLS POLICIES
-- Same pattern as profiles, weight_logs, daily_tracking
-- ============================================================================

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Users can view own health data" ON health_data;
DROP POLICY IF EXISTS "Users can insert own health data" ON health_data;
DROP POLICY IF EXISTS "Users can update own health data" ON health_data;
DROP POLICY IF EXISTS "Users can delete own health data" ON health_data;

-- Users can only view their own health data
CREATE POLICY "Users can view own health data"
  ON health_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own health data
CREATE POLICY "Users can insert own health data"
  ON health_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own health data
CREATE POLICY "Users can update own health data"
  ON health_data
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own health data
CREATE POLICY "Users can delete own health data"
  ON health_data
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- PART 4: ADD INDEXES
-- ============================================================================

-- Primary query pattern: fetch recent health data for a user
CREATE INDEX IF NOT EXISTS health_data_user_date_idx
  ON health_data (user_id, date DESC);

-- ============================================================================
-- PART 5: DATA VALIDATION CONSTRAINTS
-- ============================================================================

-- Heart rate: 20-250 bpm is reasonable
ALTER TABLE health_data
  ADD CONSTRAINT health_data_rhr_check
  CHECK (resting_heart_rate IS NULL OR (resting_heart_rate >= 20 AND resting_heart_rate <= 250));

-- HRV: 0-300 ms is reasonable range
ALTER TABLE health_data
  ADD CONSTRAINT health_data_hrv_check
  CHECK (hrv IS NULL OR (hrv >= 0 AND hrv <= 300));

-- SpO2: 0-100 percentage
ALTER TABLE health_data
  ADD CONSTRAINT health_data_spo2_check
  CHECK (spo2 IS NULL OR (spo2 >= 0 AND spo2 <= 100));

-- Sleep hours: 0-24
ALTER TABLE health_data
  ADD CONSTRAINT health_data_sleep_hours_check
  CHECK (sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24));

-- Scores: 0-100
ALTER TABLE health_data
  ADD CONSTRAINT health_data_sleep_score_check
  CHECK (sleep_score IS NULL OR (sleep_score >= 0 AND sleep_score <= 100));

ALTER TABLE health_data
  ADD CONSTRAINT health_data_recovery_score_check
  CHECK (recovery_score IS NULL OR (recovery_score >= 0 AND recovery_score <= 100));

ALTER TABLE health_data
  ADD CONSTRAINT health_data_strain_score_check
  CHECK (strain_score IS NULL OR (strain_score >= 0 AND strain_score <= 100));

-- ============================================================================
-- PART 6: VERIFY
-- ============================================================================

SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'health_data'
  AND schemaname = 'public';

-- Expected: rowsecurity = true

-- ============================================================================
-- DONE!
-- After running this migration:
-- 1. Verify the table exists in Supabase Table Editor
-- 2. Test that RLS blocks unauthenticated access
-- 3. Test upsert with (user_id, date) conflict resolution
-- ============================================================================
