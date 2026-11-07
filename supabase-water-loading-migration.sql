-- ============================================================================
-- PERFORMANCE FUEL MANAGER - WATER LOADING SWITCH
-- Run this in Supabase SQL Editor BEFORE deploying the water-plan change.
--
-- Each athlete chooses whether to follow the water loading plan. Off (the
-- default) means steady hydration all week.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS water_loading BOOLEAN NOT NULL DEFAULT FALSE;
