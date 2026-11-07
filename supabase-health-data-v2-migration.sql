-- ============================================================================
-- PERFORMANCE FUEL MANAGER - HEALTH DATA V2 MIGRATION
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
--
-- Adds granular sleep stage columns, RMSSD HRV, and respiratory rate
-- to support the improved Recovery Score algorithm.
-- ============================================================================

-- ============================================================================
-- PART 1: ADD NEW COLUMNS
-- ============================================================================

-- Granular sleep stages (from V5 band direct sync)
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS sleep_deep_minutes REAL;
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS sleep_light_minutes REAL;
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS sleep_awake_minutes REAL;

-- Advanced HRV metric (RMSSD is more sensitive to parasympathetic recovery than SDNN)
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS hrv_rmssd REAL;

-- Respiratory rate (breaths per minute — very stable metric, any elevation is significant)
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS respiratory_rate REAL;

-- ============================================================================
-- PART 2: ADD VALIDATION CONSTRAINTS
-- ============================================================================

-- Sleep stage minutes: 0-1440 (max 24 hours in minutes)
ALTER TABLE health_data
  ADD CONSTRAINT health_data_sleep_deep_check
  CHECK (sleep_deep_minutes IS NULL OR (sleep_deep_minutes >= 0 AND sleep_deep_minutes <= 1440));

ALTER TABLE health_data
  ADD CONSTRAINT health_data_sleep_light_check
  CHECK (sleep_light_minutes IS NULL OR (sleep_light_minutes >= 0 AND sleep_light_minutes <= 1440));

ALTER TABLE health_data
  ADD CONSTRAINT health_data_sleep_awake_check
  CHECK (sleep_awake_minutes IS NULL OR (sleep_awake_minutes >= 0 AND sleep_awake_minutes <= 1440));

-- RMSSD HRV: 0-300 ms (same range as SDNN)
ALTER TABLE health_data
  ADD CONSTRAINT health_data_hrv_rmssd_check
  CHECK (hrv_rmssd IS NULL OR (hrv_rmssd >= 0 AND hrv_rmssd <= 300));

-- Respiratory rate: 4-60 breaths per minute
ALTER TABLE health_data
  ADD CONSTRAINT health_data_respiratory_rate_check
  CHECK (respiratory_rate IS NULL OR (respiratory_rate >= 4 AND respiratory_rate <= 60));

-- ============================================================================
-- PART 3: VERIFY NEW COLUMNS
-- ============================================================================

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'health_data'
  AND table_schema = 'public'
  AND column_name IN (
    'sleep_deep_minutes',
    'sleep_light_minutes',
    'sleep_awake_minutes',
    'hrv_rmssd',
    'respiratory_rate'
  )
ORDER BY column_name;

-- Expected: 5 rows, all REAL, all nullable

-- ============================================================================
-- DONE!
-- After running this migration:
-- 1. Verify columns in Supabase Table Editor
-- 2. V5 band sync will start populating sleep stage data
-- 3. RMSSD and respiratory rate will be populated when RR intervals are available
-- ============================================================================
