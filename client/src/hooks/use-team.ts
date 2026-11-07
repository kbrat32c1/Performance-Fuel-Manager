import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { validateEvent, type TeamEvent } from '@/lib/team-schedule';

type Status = 'loading' | 'ready' | 'unavailable';

export interface Team {
  id: string;
  name: string;
  coachId: string;
  joinCode?: string; // only the coach can read it
}

export interface TeamState {
  /** The team this user coaches, with its schedule. */
  coached: { team: Team; events: TeamEvent[] } | null;
  /** The team this user is on as an athlete, with the events they skip. */
  membership: { team: Team; events: TeamEvent[]; skipped: string[] } | null;
}

const EMPTY: TeamState = { coached: null, membership: null };
const cacheKey = (userId: string) => `pwm-team-${userId}`;

const toEvent = (r: any): TeamEvent => ({ id: r.id, name: r.name, eventDate: r.event_date, days: r.days === 2 ? 2 : 1, allowance: Number(r.allowance_lb ?? 0) || 0 });
const toTeam = (r: any): Team => ({ id: r.id, name: r.name, coachId: r.coach_id, joinCode: r.join_code ?? undefined });
const missingTable = (e: { code?: string; message?: string }) =>
  e.code === '42P01' || e.code === 'PGRST205' || /team_(members|events)|teams/.test(e.message ?? '');

async function loadEvents(teamId: string): Promise<TeamEvent[]> {
  const { data, error } = await supabase
    .from('team_events').select('*')
    .eq('team_id', teamId).order('event_date');
  if (error) throw error;
  return (data ?? []).map(toEvent);
}

/**
 * The signed-in user's team: the one they coach and/or the one they're on. Mutations
 * resolve to an error message, or null once Supabase confirms them. `unavailable` means
 * the team tables haven't been created yet (supabase-team-schedule-migration.sql).
 */
export function useTeam() {
  const { user } = useAuth();
  const [state, setState] = useState<TeamState>(() => {
    if (!user) return EMPTY;
    try { const c = localStorage.getItem(cacheKey(user.id)); return c ? JSON.parse(c) : EMPTY; } catch { return EMPTY; }
  });
  const [status, setStatus] = useState<Status>('loading');

  const reload = useCallback(async () => {
    if (!user) { setState(EMPTY); setStatus('ready'); return; }
    try {
      const [coachRes, memberRes] = await Promise.all([
        supabase.from('teams').select('id, name, coach_id, join_code').eq('coach_id', user.id).limit(1).maybeSingle(),
        supabase.from('team_members').select('team_id, skipped_event_ids').eq('user_id', user.id).maybeSingle(),
      ]);
      if (coachRes.error) throw coachRes.error;
      if (memberRes.error) throw memberRes.error;

      const next: TeamState = { coached: null, membership: null };
      if (coachRes.data) {
        next.coached = { team: toTeam(coachRes.data), events: await loadEvents(coachRes.data.id) };
      }
      if (memberRes.data) {
        const teamId = memberRes.data.team_id as string;
        const teamRow = coachRes.data?.id === teamId
          ? coachRes.data
          : (await supabase.from('teams').select('id, name, coach_id').eq('id', teamId).maybeSingle()).data;
        if (teamRow) {
          next.membership = {
            team: toTeam(teamRow),
            events: next.coached?.team.id === teamId ? next.coached.events : await loadEvents(teamId),
            skipped: (memberRes.data.skipped_event_ids as string[] | null) ?? [],
          };
        }
      }
      setState(next);
      try { localStorage.setItem(cacheKey(user.id), JSON.stringify(next)); } catch {}
      setStatus('ready');
    } catch (e: any) {
      setStatus(missingTable(e ?? {}) ? 'unavailable' : 'ready');
    }
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (fn: () => PromiseLike<{ error: any }>, failMessage: string) => {
    const { error } = await fn();
    if (error) return error.message && !/JWT|fetch|network/i.test(error.message) ? error.message : failMessage;
    await reload();
    return null;
  }, [reload]);

  const createTeam = useCallback(async (name: string) => {
    if (!user) return 'Sign in first.';
    const trimmed = name.trim();
    if (!trimmed) return 'Give your team a name.';
    return run(() => supabase.from('teams').insert({ name: trimmed.slice(0, 80), coach_id: user.id }), 'Team not created. Try again.');
  }, [user, run]);

  const saveEvent = useCallback(async (teamId: string, input: { id?: string; name: string; eventDate: string; days: 1 | 2; allowance: number }) => {
    const invalid = validateEvent(input);
    if (invalid) return invalid;
    const row = { team_id: teamId, name: input.name.trim(), event_date: input.eventDate, days: input.days, allowance_lb: input.allowance };
    return run(
      () => input.id ? supabase.from('team_events').update(row).eq('id', input.id) : supabase.from('team_events').insert(row),
      'Not saved. Check your connection and try again.',
    );
  }, [run]);

  const deleteEvent = useCallback((id: string) =>
    run(() => supabase.from('team_events').delete().eq('id', id), 'Not removed. Try again.'), [run]);

  const joinTeam = useCallback(async (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(clean)) return 'Team codes are 6 letters and numbers.';
    const { error } = await supabase.rpc('join_team', { code: clean });
    if (error) return /No team/.test(error.message ?? '') ? 'No team with that code. Check it with your coach.' : 'Could not join. Try again.';
    await reload();
    return null;
  }, [reload]);

  const leaveTeam = useCallback(async () => {
    if (!user) return 'Sign in first.';
    return run(() => supabase.from('team_members').delete().eq('user_id', user.id), 'Could not leave the team. Try again.');
  }, [user, run]);

  const setSkipped = useCallback(async (eventId: string, skip: boolean) => {
    if (!user || !state.membership) return 'Join a team first.';
    const current = new Set(state.membership.skipped);
    if (skip) current.add(eventId); else current.delete(eventId);
    return run(
      () => supabase.from('team_members').update({ skipped_event_ids: Array.from(current) }).eq('user_id', user.id),
      'Not saved. Try again.',
    );
  }, [user, state.membership, run]);

  return { ...state, status, reload, createTeam, saveEvent, deleteEvent, joinTeam, leaveTeam, setSkipped };
}

export interface RosterEntry {
  userId: string;
  name: string;
  weightClass: number | null;
  joinedAt: string | null;
  skipped: string[];
}

/** The coach's roster: who joined, their class, and events they marked "Not wrestling". */
export function useTeamRoster(teamId: string | null) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setStatus('loading');
    (async () => {
      const { data, error } = await supabase.rpc('team_roster', { t: teamId });
      if (cancelled) return;
      if (error) { setStatus(/team_roster|PGRST202|42883/.test(`${error.code} ${error.message}`) ? 'unavailable' : 'error'); return; }
      setRoster((data ?? []).map((r: any) => ({
        userId: r.user_id,
        name: [r.name, r.last_name].filter(Boolean).join(' ') || 'Unnamed athlete',
        weightClass: r.weight_class == null ? null : Number(r.weight_class),
        joinedAt: r.joined_at ?? null,
        skipped: r.skipped_event_ids ?? [],
      })));
      setStatus('ready');
    })();
    return () => { cancelled = true; };
  }, [teamId, attempt]);

  return { roster, status, retry };
}
