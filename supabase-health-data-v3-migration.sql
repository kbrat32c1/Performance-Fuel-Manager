-- ═══════════════════════════════════════════════════════════════════════════════
-- Health Data v3 Migration: HR Zone Tracking & TRIMP Strain
--
-- Adds columns for WHOOP-style continuous HR monitoring and TRIMP strain
-- computation. These fields are populated during the daily V5 band sync
-- from accumulated HR zone data tracked throughout the day.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Peak and average HR for the day (from continuous HR monitoring)
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS peak_hr REAL;
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS avg_hr REAL;

-- HR zone minutes (time spent in each of 5 HR zones based on % of max HR)
-- Zone 1: 50-60% (warm-up/light), Zone 2: 60-70% (fat burn),
-- Zone 3: 70-80% (aerobic), Zone 4: 80-90% (threshold), Zone 5: 90-100% (max)
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS hr_zone1_minutes REAL;
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS hr_zone2_minutes REAL;
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS hr_zone3_minutes REAL;
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS hr_zone4_minutes REAL;
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS hr_zone5_minutes REAL;

-- Raw TRIMP (Training Impulse) score before mapping to 0-21 strain scale
-- TRIMP = sum of (zone_minutes × zone_weight) where weights are exponential
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS trimp_score REAL;

-- Add comments for documentation
COMMENT ON COLUMN health_data.peak_hr IS 'Highest HR observed during the day (bpm)';
COMMENT ON COLUMN health_data.avg_hr IS 'Average HR across all readings during the day (bpm)';
COMMENT ON COLUMN health_data.hr_zone1_minutes IS 'Minutes in HR zone 1 (50-60% max HR - warm up)';
COMMENT ON COLUMN health_data.hr_zone2_minutes IS 'Minutes in HR zone 2 (60-70% max HR - fat burn)';
COMMENT ON COLUMN health_data.hr_zone3_minutes IS 'Minutes in HR zone 3 (70-80% max HR - aerobic)';
COMMENT ON COLUMN health_data.hr_zone4_minutes IS 'Minutes in HR zone 4 (80-90% max HR - threshold)';
COMMENT ON COLUMN health_data.hr_zone5_minutes IS 'Minutes in HR zone 5 (90-100% max HR - max effort)';
COMMENT ON COLUMN health_data.trimp_score IS 'Raw TRIMP value before 0-21 mapping. strain_score = 21 × (1 - e^(-trimp/150))';
