-- ============================================================================
-- PERFORMANCE FUEL MANAGER - TEAM ROSTER FOR COACHES
-- Run this in Supabase SQL Editor (after supabase-team-schedule-migration.sql).
--
-- Lets a coach see who has joined their team: name, weight class and which
-- events each athlete marked "Not wrestling". No weights or other profile data.
-- Only the team's coach gets rows; everyone else gets none. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION team_roster(t UUID)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  last_name TEXT,
  weight_class NUMERIC,
  joined_at TIMESTAMPTZ,
  skipped_event_ids UUID[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, p.name, p.last_name, p.target_weight_class, m.joined_at, m.skipped_event_ids
  FROM team_members m
  LEFT JOIN profiles p ON p.user_id = m.user_id
  WHERE m.team_id = t
    AND EXISTS (SELECT 1 FROM teams WHERE id = t AND coach_id = auth.uid())
  ORDER BY p.target_weight_class NULLS LAST, p.last_name, p.name;
$$;

REVOKE ALL ON FUNCTION team_roster(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION team_roster(UUID) TO authenticated;
