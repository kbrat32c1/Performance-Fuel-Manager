/**
 * Weigh-in — the fastest way for a wrestler to record the day's four weights on a phone.
 * Type a number into a row; it saves when you leave the field or press return.
 * A weight that fails to save stays on the phone until it is saved.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { Check, ChevronLeft, ChevronRight, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useDescentPlan } from "@/hooks/use-descent-plan";
import { buildDescentPlan, rowOn } from "@/lib/descent-plan";
import {
  DAILY_SLOTS, type DailySlotType, parseWeightInput, formatWeight, logForDay, recentReadings,
  practiceChange, timestampFor, loadDrafts, saveDrafts, draftSlotKey,
} from "@/lib/weigh-in-model";

type RowState = { status: 'idle' | 'saving' | 'saved' | 'error' | 'recovered'; message?: string };

export default function WeighIn() {
  const { profile, logs, addLog, updateLog } = useStore();
  const { user } = useAuth();
  const draftOwner = user?.id ?? 'signed-out';

  const today = profile.simulatedDate || new Date();
  const [dayOffset, setDayOffset] = useState(0);
  const viewDate = addDays(today, dayOffset);
  const dateKey = format(viewDate, 'yyyy-MM-dd');
  const isToday = dayOffset === 0;

  // Typed-but-unsaved text per row, mirrored to localStorage so nothing is lost
  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadDrafts(draftOwner));
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const recovered: Record<string, RowState> = {};
    for (const key of Object.keys(loadDrafts(draftOwner))) recovered[key] = { status: 'recovered' };
    return recovered;
  });
  const busy = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const savedIds = useRef(new Map<string, string>());

  useEffect(() => {
    const loaded = loadDrafts(draftOwner);
    setDrafts(loaded);
    setRows(prev => {
      const next = { ...prev };
      for (const key of Object.keys(loaded)) if (!next[key]) next[key] = { status: 'recovered' };
      return next;
    });
  }, [draftOwner]);

  const setDraft = useCallback((key: string, text: string | null) => {
    setDrafts(prev => {
      const next = { ...prev };
      if (text === null) delete next[key]; else next[key] = text;
      draftsRef.current = next;
      saveDrafts(draftOwner, next);
      return next;
    });
  }, [draftOwner]);

  const setRow = (key: string, state: RowState) => setRows(prev => ({ ...prev, [key]: state }));

  const logsRef = useRef(logs);
  logsRef.current = logs;

  const save = useCallback(async (type: DailySlotType, forDate: string) => {
    const key = draftSlotKey(forDate, type);
    const text = draftsRef.current[key];
    if (text === undefined) return;
    const existing = logForDay(logsRef.current, type, forDate);
    const parsed = parseWeightInput(text);

    if (parsed.kind === 'empty') {
      // Clearing a field never deletes a saved weight; it just puts the saved value back.
      setDraft(key, null);
      setRow(key, { status: 'idle' });
      return;
    }
    if (parsed.kind === 'incomplete' || parsed.kind === 'invalid') {
      setRow(key, { status: 'idle', message: parsed.kind === 'invalid' ? parsed.message : 'Finish the weight, like 157.4' });
      return;
    }
    if (existing && Math.abs(existing.weight - parsed.weight) < 0.05) {
      setDraft(key, null);
      setRow(key, { status: 'saved' });
      return;
    }
    if (busy.current.has(key)) { pending.current.add(key); return; }

    busy.current.add(key);
    setRow(key, { status: 'saving' });
    const id = existing?.id ?? savedIds.current.get(key);
    let ok: boolean;
    if (id) {
      ok = await updateLog(id, { weight: parsed.weight });
    } else {
      const newId = await addLog({ weight: parsed.weight, date: timestampFor(type, forDate), type });
      if (newId) savedIds.current.set(key, newId);
      ok = newId !== null;
    }
    busy.current.delete(key);

    if (ok) {
      // Only clear the draft if nothing new was typed while saving
      if (draftsRef.current[key] === text) setDraft(key, null);
      setRow(key, { status: 'saved' });
    } else {
      setRow(key, { status: 'error' });
    }
    if (pending.current.delete(key)) void save(type, forDate);
  }, [addLog, updateLog, setDraft]);

  const filled = DAILY_SLOTS.filter(s => logForDay(logs, s.type, dateKey)).length;

  return (
    <MobileLayout className="lg:max-w-xl">
      <div className="space-y-3 pb-6">
        <header className="flex items-center justify-between px-1 pt-1">
          <button
            type="button"
            onClick={() => setDayOffset(d => d - 1)}
            className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-muted/20 active:scale-95"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="text-center">
            <h1 className="text-lg font-bold leading-tight">Weigh-ins</h1>
            <button type="button" onClick={() => setDayOffset(0)} className="text-xs text-muted-foreground">
              {isToday ? 'Today' : format(viewDate, 'EEE, MMM d')} · {filled} of 4 recorded
            </button>
          </div>
          <button
            type="button"
            onClick={() => dayOffset < 0 && setDayOffset(d => d + 1)}
            disabled={dayOffset >= 0}
            className={cn("h-11 w-11 flex items-center justify-center rounded-lg hover:bg-muted/20 active:scale-95", dayOffset >= 0 && "opacity-30")}
            aria-label="Next day"
          >
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </header>

        <DescentLine dateKey={dateKey} />

        <ul className="space-y-2">
          {DAILY_SLOTS.map(slot => {
            const key = draftSlotKey(dateKey, slot.type);
            const saved = logForDay(logs, slot.type, dateKey);
            const draft = drafts[key];
            const shown = draft ?? (saved ? formatWeight(saved.weight) : '');
            const row = rows[key] ?? { status: 'idle' as const };
            const parsed = draft !== undefined ? parseWeightInput(draft) : null;
            const recent = recentReadings(logs, slot.type, dateKey);
            const change = slot.type === 'post-practice'
              ? practiceChange(logForDay(logs, 'pre-practice', dateKey)?.weight, saved?.weight)
              : '';
            return (
              <li key={slot.type} className="rounded-xl border border-muted bg-card px-3 py-3">
                <div className="flex items-center gap-3">
                  <label htmlFor={`w-${slot.type}`} className="flex-1 min-w-0">
                    <span className="block text-sm font-bold">{slot.label}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {recent.length > 0 ? `Last: ${recent.map(r => formatWeight(r.weight)).join(' · ')}` : 'No earlier readings'}
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      id={`w-${slot.type}`}
                      inputMode="decimal"
                      enterKeyHint="done"
                      autoComplete="off"
                      placeholder="—"
                      aria-label={`${slot.label} weight in pounds`}
                      aria-describedby={`s-${slot.type}`}
                      value={shown}
                      onChange={e => {
                        setDraft(key, e.target.value);
                        if (row.status !== 'saving') setRow(key, { status: 'idle' });
                      }}
                      onBlur={() => void save(slot.type, dateKey)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className={cn(
                        "h-12 w-28 rounded-lg border bg-background px-3 pr-8 text-right text-xl font-mono font-bold",
                        "focus:outline-none focus:ring-2 focus:ring-primary",
                        row.status === 'error' || row.status === 'recovered' ? "border-amber-500" : "border-muted",
                      )}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">lb</span>
                  </div>
                </div>

                <div id={`s-${slot.type}`} aria-live="polite" className="mt-1.5 flex min-h-5 items-center justify-between gap-2 text-[12px]">
                  <RowStatus
                    row={row}
                    hasSaved={!!saved}
                    dirty={draft !== undefined}
                    invalid={parsed?.kind === 'invalid' ? parsed.message : undefined}
                    onRetry={() => void save(slot.type, dateKey)}
                  />
                  {change && <span className="shrink-0 font-mono text-muted-foreground">Practice change {change}</span>}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="px-1 text-xs text-muted-foreground">
          Blank means not recorded. Saves when you tap away or press return.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type: 'morning' } }))}
          >
            Add sleep, times or extra workouts
          </button>
        </p>
      </div>
    </MobileLayout>
  );
}

/** Today's eligibility from the descent plan, as facts, with a way into the full plan. */
function DescentLine({ dateKey }: { dateKey: string }) {
  const { plan, status } = useDescentPlan();
  const row = useMemo(() => (plan ? rowOn(buildDescentPlan(plan, dateKey), dateKey) : null), [plan, dateKey]);
  if (status === 'unavailable') return null;
  return (
    <Link href="/descent" className="flex min-h-11 items-center justify-between rounded-xl border border-muted px-3 py-2 text-sm">
      {row ? (
        <span>
          Eligible weight <strong className="font-mono">{row.allowed.toFixed(2)}</strong> · eligible for <strong className="font-mono">{row.eligibleClass}</strong>
        </span>
      ) : (
        <span className="text-muted-foreground">{plan ? 'Descent plan starts later' : 'Set up your descent plan'}</span>
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </Link>
  );
}

function RowStatus({ row, hasSaved, dirty, invalid, onRetry }: {
  row: RowState; hasSaved: boolean; dirty: boolean; invalid?: string; onRetry: () => void;
}) {
  if (invalid) return <span className="text-amber-500">{invalid}</span>;
  if (row.status === 'saving') {
    return <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" aria-hidden />Saving…</span>;
  }
  if (row.status === 'error' || row.status === 'recovered') {
    return (
      <span className="flex items-center gap-2 font-medium text-amber-500">
        <CloudOff className="w-3 h-3" aria-hidden />
        {row.status === 'error' ? 'Not saved — kept on this phone' : 'Not saved yet — check it'}
        <button
          type="button"
          onClick={onRetry}
          className="flex h-8 items-center gap-1 rounded-md bg-amber-500/15 px-2 font-bold"
        >
          <RefreshCw className="w-3 h-3" aria-hidden />
          {row.status === 'error' ? 'Retry' : 'Save'}
        </button>
      </span>
    );
  }
  if (row.message && dirty) return <span className="text-muted-foreground">{row.message}</span>;
  if (dirty) return <span className="text-muted-foreground">Tap away or press return to save</span>;
  if (hasSaved || row.status === 'saved') {
    return <span className="flex items-center gap-1 text-muted-foreground"><Check className="w-3 h-3 text-green-500" aria-hidden />Saved</span>;
  }
  return <span className="text-muted-foreground">Not recorded</span>;
}
