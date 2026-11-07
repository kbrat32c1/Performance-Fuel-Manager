-- ============================================================================
-- PERFORMANCE FUEL MANAGER - WATER LOADING SWITCH
-- Run this in Supabase SQL Editor BEFORE deploying the water-loading switch.
--
-- Water loading (the app's existing plan) is ON for everyone by default.
-- An athlete turns it OFF to drink normally all week instead.
-- Safe to run more than once.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS water_loading BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE profiles ALTER COLUMN water_loading SET DEFAULT TRUE;

-- One-time: the column was first added with default FALSE; nobody has chosen yet.
UPDATE profiles SET water_loading = TRUE WHERE water_loading = FALSE;
