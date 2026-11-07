-- ============================================================================
-- PERFORMANCE FUEL MANAGER - TEAM SCHEDULE MIGRATION
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
--
-- A coach creates a team and enters the season's weigh-ins once. Athletes join
-- with the team's code, skip events they aren't going to, and the app moves each
-- athlete's next weigh-in forward by itself after every event.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  join_code TEXT NOT NULL UNIQUE
    DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 6))
    CHECK (join_code ~ '^[A-Z0-9]{6}$'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  event_date DATE NOT NULL,                      -- first weigh-in day
  days SMALLINT NOT NULL DEFAULT 1 CHECK (days IN (1, 2)),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS team_events_team_date ON team_events (team_id, event_date);

-- One team per athlete. skipped_event_ids = events this athlete isn't going to.
CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  skipped_event_ids UUID[] NOT NULL DEFAULT '{}',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- Helpers run as the table owner so the policies below don't recurse into each other.
CREATE OR REPLACE FUNCTION is_team_coach(t UUID) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM teams WHERE id = t AND coach_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION is_team_member(t UUID) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = t AND user_id = auth.uid());
$$;

-- Joining needs the code; athletes can't list or read other teams.
CREATE OR REPLACE FUNCTION join_team(code TEXT) RETURNS UUID
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to join a team';
  END IF;
  SELECT id INTO t FROM teams WHERE join_code = upper(trim(code));
  IF t IS NULL THEN
    RAISE EXCEPTION 'No team with that code';
  END IF;
  INSERT INTO team_members (team_id, user_id) VALUES (t, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET team_id = EXCLUDED.team_id,
        skipped_event_ids = CASE WHEN team_members.team_id = EXCLUDED.team_id
                                 THEN team_members.skipped_event_ids ELSE '{}' END,
        joined_at = CASE WHEN team_members.team_id = EXCLUDED.team_id
                         THEN team_members.joined_at ELSE NOW() END;
  RETURN t;
END;
$$;

REVOKE ALL ON FUNCTION join_team(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION join_team(TEXT) TO authenticated;

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- teams
DROP POLICY IF EXISTS "Coach or member can view team" ON teams;
DROP POLICY IF EXISTS "Coach can create team" ON teams;
DROP POLICY IF EXISTS "Coach can update team" ON teams;
DROP POLICY IF EXISTS "Coach can delete team" ON teams;
CREATE POLICY "Coach or member can view team" ON teams FOR SELECT
  USING (coach_id = auth.uid() OR is_team_member(id));
CREATE POLICY "Coach can create team" ON teams FOR INSERT
  WITH CHECK (coach_id = auth.uid());
CREATE POLICY "Coach can update team" ON teams FOR UPDATE
  USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "Coach can delete team" ON teams FOR DELETE
  USING (coach_id = auth.uid());

-- team_events
DROP POLICY IF EXISTS "Coach or member can view events" ON team_events;
DROP POLICY IF EXISTS "Coach can add events" ON team_events;
DROP POLICY IF EXISTS "Coach can update events" ON team_events;
DROP POLICY IF EXISTS "Coach can delete events" ON team_events;
CREATE POLICY "Coach or member can view events" ON team_events FOR SELECT
  USING (is_team_coach(team_id) OR is_team_member(team_id));
CREATE POLICY "Coach can add events" ON team_events FOR INSERT
  WITH CHECK (is_team_coach(team_id));
CREATE POLICY "Coach can update events" ON team_events FOR UPDATE
  USING (is_team_coach(team_id)) WITH CHECK (is_team_coach(team_id));
CREATE POLICY "Coach can delete events" ON team_events FOR DELETE
  USING (is_team_coach(team_id));

-- team_members (inserts only through join_team)
DROP POLICY IF EXISTS "Athlete or coach can view membership" ON team_members;
DROP POLICY IF EXISTS "Athlete can update own skips" ON team_members;
DROP POLICY IF EXISTS "Athlete can leave or coach can remove" ON team_members;
CREATE POLICY "Athlete or coach can view membership" ON team_members FOR SELECT
  USING (user_id = auth.uid() OR is_team_coach(team_id));
CREATE POLICY "Athlete can update own skips" ON team_members FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Athlete can leave or coach can remove" ON team_members FOR DELETE
  USING (user_id = auth.uid() OR is_team_coach(team_id));
