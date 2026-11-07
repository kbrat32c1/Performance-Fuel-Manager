import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { validateDescentInput, type DescentInput, type OfficialWeighIn } from '@/lib/descent-plan';

type Status = 'loading' | 'ready' | 'unavailable';

interface Row {
  assessment_date: string;
  initial_weight: number | string;
  minimum_weight: number | string;
  weigh_ins: OfficialWeighIn[] | null;
}

const cacheKey = (userId: string) => `pwm-descent-plan-${userId}`;

function fromRow(r: Row): DescentInput {
  return {
    assessmentDate: r.assessment_date,
    initialWeight: Number(r.initial_weight),
    minimumWeight: Number(r.minimum_weight),
    weighIns: (r.weigh_ins ?? []).map(w => ({
      date: w.date, weight: Number(w.weight), allowance: Number(w.allowance ?? 0), secondDay: !!w.secondDay,
    })),
  };
}

/**
 * The signed-in athlete's descent plan. `save` resolves to an error message, or null once
 * Supabase confirms it. `unavailable` means the descent_plans table has not been created yet.
 */
export function useDescentPlan() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<DescentInput | null>(() => {
    if (!user) return null;
    try { const c = localStorage.getItem(cacheKey(user.id)); return c ? JSON.parse(c) : null; } catch { return null; }
  });
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (!user) { setPlan(null); setStatus('ready'); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('descent_plans')
        .select('assessment_date, initial_weight, minimum_weight, weigh_ins')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setStatus(error.code === '42P01' || /descent_plans/.test(error.message ?? '') ? 'unavailable' : 'ready');
        return;
      }
      const loaded = data ? fromRow(data as Row) : null;
      setPlan(loaded);
      try {
        if (loaded) localStorage.setItem(cacheKey(user.id), JSON.stringify(loaded));
        else localStorage.removeItem(cacheKey(user.id));
      } catch {}
      setStatus('ready');
    })();
    return () => { cancelled = true; };
  }, [user]);

  const save = useCallback(async (next: DescentInput): Promise<string | null> => {
    const invalid = validateDescentInput(next);
    if (invalid) return invalid;
    if (!user) return 'Sign in to save your descent plan.';
    const weighIns = [...next.weighIns].sort((a, b) => (a.date < b.date ? -1 : 1));
    const { error } = await supabase.from('descent_plans').upsert({
      user_id: user.id,
      assessment_date: next.assessmentDate,
      initial_weight: next.initialWeight,
      minimum_weight: next.minimumWeight,
      weigh_ins: weighIns,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) return 'Not saved. Check your connection and try again.';
    const saved = { ...next, weighIns };
    setPlan(saved);
    try { localStorage.setItem(cacheKey(user.id), JSON.stringify(saved)); } catch {}
    return null;
  }, [user]);

  return { plan, status, save };
}
