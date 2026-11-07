-- ============================================================================
-- PERFORMANCE FUEL MANAGER - WEIGH-IN ALLOWANCE ON TEAM EVENTS
-- Run this in Supabase SQL Editor BEFORE deploying the allowance change.
--
-- allowance_lb = extra pounds allowed on the event's LAST weigh-in day:
-- day 2 of a 2-day tournament, or a meet the day after another meet.
-- Coaches turn it on/off per event on the Team page. Safe to re-run.
-- ============================================================================

ALTER TABLE team_events ADD COLUMN IF NOT EXISTS allowance_lb SMALLINT NOT NULL DEFAULT 0
  CHECK (allowance_lb BETWEEN 0 AND 2);

-- Coast Guard Wrestling: regionals and nationals day 2, and NEWA Duals the day
-- after the Wildcat Open. Change any of these on the Team page.
UPDATE team_events e SET allowance_lb = 1
FROM teams t
WHERE e.team_id = t.id AND t.join_code = '26B987' AND e.allowance_lb = 0
  AND e.name IN ('NCAA DIII Northeast Championships', 'NCAA DIII Championships', 'NEWA Dual Meet Championship');
