-- ============================================================================
-- PERFORMANCE FUEL MANAGER - WHOOP CONNECTIONS
-- Run this in Supabase SQL Editor BEFORE deploying the WHOOP connection.
--
-- One row per athlete who connects WHOOP. Tokens are read and written only by
-- the server (service role); the table has row-level security with NO client
-- policies, so no browser or phone can read a token. Athletes see their own
-- connection status through whoop_status(). Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS whoop_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  whoop_user_id TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT
);

ALTER TABLE whoop_connections ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service role (server) can touch this table.

CREATE OR REPLACE FUNCTION whoop_status()
RETURNS TABLE (connected BOOLEAN, connected_at TIMESTAMPTZ, last_synced_at TIMESTAMPTZ, last_error TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT TRUE, c.connected_at, c.last_synced_at, c.last_error
  FROM whoop_connections c WHERE c.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION whoop_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION whoop_status() TO authenticated;
