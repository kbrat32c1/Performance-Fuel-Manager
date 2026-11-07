-- ============================================================================
-- PERFORMANCE FUEL MANAGER - DESCENT PLAN TABLE MIGRATION
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
--
-- One NCAA/NWCA descent plan per athlete: the numbers from their TrackWrestling
-- weight certification plus the official weigh-ins they enter after each event.
-- The app rebuilds TrackWrestling's daily table from these. TrackWrestling stays
-- the official record.
-- ============================================================================

CREATE TABLE IF NOT EXISTS descent_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  assessment_date DATE NOT NULL,
  initial_weight NUMERIC(5,2) NOT NULL CHECK (initial_weight BETWEEN 50 AND 400),
  minimum_weight NUMERIC(5,2) NOT NULL CHECK (minimum_weight BETWEEN 50 AND 400),

  -- [{ "date": "2026-11-14", "weight": 124.8, "allowance": 0, "secondDay": false }]
  weigh_ins JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(weigh_ins) = 'array'),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT descent_plans_minimum_not_above_initial CHECK (minimum_weight <= initial_weight)
);

ALTER TABLE descent_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own descent plan" ON descent_plans;
DROP POLICY IF EXISTS "Users can insert own descent plan" ON descent_plans;
DROP POLICY IF EXISTS "Users can update own descent plan" ON descent_plans;
DROP POLICY IF EXISTS "Users can delete own descent plan" ON descent_plans;

CREATE POLICY "Users can view own descent plan"
  ON descent_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own descent plan"
  ON descent_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own descent plan"
  ON descent_plans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own descent plan"
  ON descent_plans FOR DELETE
  USING (auth.uid() = user_id);
