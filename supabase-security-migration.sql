-- ============================================================================
-- PERFORMANCE FUEL MANAGER - SUPABASE SECURITY MIGRATION
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- ============================================================================
-- PART 1: ENABLE ROW-LEVEL SECURITY (RLS) ON ALL TABLES
-- ============================================================================

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on weight_logs table
ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

-- Enable RLS on daily_tracking table
ALTER TABLE daily_tracking ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 2: DROP EXISTING POLICIES (if any) TO START FRESH
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;

DROP POLICY IF EXISTS "Users can view own weight logs" ON weight_logs;
DROP POLICY IF EXISTS "Users can insert own weight logs" ON weight_logs;
DROP POLICY IF EXISTS "Users can update own weight logs" ON weight_logs;
DROP POLICY IF EXISTS "Users can delete own weight logs" ON weight_logs;

DROP POLICY IF EXISTS "Users can view own daily tracking" ON daily_tracking;
DROP POLICY IF EXISTS "Users can insert own daily tracking" ON daily_tracking;
DROP POLICY IF EXISTS "Users can update own daily tracking" ON daily_tracking;
DROP POLICY IF EXISTS "Users can delete own daily tracking" ON daily_tracking;

-- ============================================================================
-- PART 3: CREATE RLS POLICIES FOR PROFILES TABLE
-- ============================================================================

-- Users can only view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own profile
CREATE POLICY "Users can delete own profile"
  ON profiles
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- PART 4: CREATE RLS POLICIES FOR WEIGHT_LOGS TABLE
-- ============================================================================

-- Users can only view their own weight logs
CREATE POLICY "Users can view own weight logs"
  ON weight_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own weight logs
CREATE POLICY "Users can insert own weight logs"
  ON weight_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own weight logs
CREATE POLICY "Users can update own weight logs"
  ON weight_logs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own weight logs
CREATE POLICY "Users can delete own weight logs"
  ON weight_logs
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- PART 5: CREATE RLS POLICIES FOR DAILY_TRACKING TABLE
-- ============================================================================

-- Users can only view their own daily tracking
CREATE POLICY "Users can view own daily tracking"
  ON daily_tracking
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own daily tracking
CREATE POLICY "Users can insert own daily tracking"
  ON daily_tracking
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own daily tracking
CREATE POLICY "Users can update own daily tracking"
  ON daily_tracking
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own daily tracking
CREATE POLICY "Users can delete own daily tracking"
  ON daily_tracking
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- PART 6: SPECIAL POLICY FOR PUBLIC SHARE TOKEN ACCESS
-- This allows the share endpoint to read profiles by share_token
-- without requiring the requesting user to own the profile
-- ============================================================================

-- Allow reading profile by share_token (for coach share feature)
-- This is a SELECT-only policy that checks share_token is not null
CREATE POLICY "Allow public read by share_token"
  ON profiles
  FOR SELECT
  USING (
    share_token IS NOT NULL
    AND share_token = current_setting('request.headers', true)::json->>'x-share-token'
  );

-- NOTE: The share endpoint should use the service role key which bypasses RLS,
-- OR you can use a Supabase Edge Function with proper token validation.
-- For now, the server-side route uses service role key appropriately.

-- ============================================================================
-- PART 7: DATA INTEGRITY CONSTRAINTS
-- ============================================================================

-- Add weight validation constraint (50-500 lbs is reasonable for wrestlers)
ALTER TABLE weight_logs
  DROP CONSTRAINT IF EXISTS weight_logs_weight_check;

ALTER TABLE weight_logs
  ADD CONSTRAINT weight_logs_weight_check
  CHECK (weight > 0 AND weight < 1000);

-- Add weight validation on profiles
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_current_weight_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_current_weight_check
  CHECK (current_weight >= 0 AND current_weight < 1000);

-- Add target weight class validation (standard wrestling classes + some buffer)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_target_weight_class_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_target_weight_class_check
  CHECK (target_weight_class > 0 AND target_weight_class <= 500);

-- Ensure unique profile per user
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_user_id_unique;

-- Note: If user_id already has a unique constraint, this will fail - that's OK
DO $$
BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PART 8: PREVENT DUPLICATE WEIGHT LOGS
-- Only one entry per (user_id, date, type) for core weigh-in types
-- ============================================================================

-- Create a unique index for core weigh-in types (morning, pre-practice, post-practice, before-bed, check-in)
-- This prevents duplicate entries for the same day/type combination
CREATE UNIQUE INDEX IF NOT EXISTS weight_logs_unique_daily_type
  ON weight_logs (user_id, DATE(date), type)
  WHERE type IN ('morning', 'pre-practice', 'post-practice', 'before-bed', 'check-in');

-- Extra workout logs (extra-before, extra-after) can have multiples per day
-- No unique constraint for those

-- ============================================================================
-- PART 9: ADD HELPFUL INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Index for fetching user's recent weight logs (most common query)
CREATE INDEX IF NOT EXISTS weight_logs_user_date_idx
  ON weight_logs (user_id, date DESC);

-- Index for fetching user's daily tracking
CREATE INDEX IF NOT EXISTS daily_tracking_user_date_idx
  ON daily_tracking (user_id, date DESC);

-- Index for share token lookups
CREATE INDEX IF NOT EXISTS profiles_share_token_idx
  ON profiles (share_token)
  WHERE share_token IS NOT NULL;

-- ============================================================================
-- PART 10: VERIFY RLS IS ENABLED
-- ============================================================================

-- Run this query to verify RLS is enabled on all tables:
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('profiles', 'weight_logs', 'daily_tracking')
  AND schemaname = 'public';

-- Expected output: all tables should have rowsecurity = true

-- ============================================================================
-- DONE!
-- After running this migration:
-- 1. Test that authenticated users can only see their own data
-- 2. Test that unauthenticated requests are blocked
-- 3. Test that the share endpoint still works (uses service role)
-- 4. Test that invalid weights are rejected
-- ============================================================================
