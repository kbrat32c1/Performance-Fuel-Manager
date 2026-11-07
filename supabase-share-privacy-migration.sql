-- Close public reads of shared athletes' data.
-- These rules let anyone holding the app's public key read every athlete who
-- had a share link turned on, without the link. Nothing in the app uses them:
-- the coach view loads through /api/share/:token, which checks the token on
-- the server. Athletes' own-data rules are untouched.
drop policy if exists "Public shared profiles" on public.profiles;
drop policy if exists "Public shared weight logs" on public.weight_logs;
drop policy if exists "Public shared daily tracking" on public.daily_tracking;
