/**
 * Descent plan — the athlete's NCAA/NWCA weight descent, rebuilt from their TrackWrestling
 * certification and the official weigh-ins they enter. Eligibility facts only, no advice.
 */
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "wouter";
import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { useDescentPlan } from "@/hooks/use-descent-plan";
import { cn } from "@/lib/utils";
import {
  buildDescentPlan, rowOn, firstOpenDate, addDaysKey, validateDescentInput, collapseFlat,
  type DescentInput, type DescentPlan, type DescentRow, type OfficialWeighIn,
} from "@/lib/descent-plan";
import { logForDay } from "@/lib/weigh-in-model";

const lb = (n: number) => n.toFixed(2);
const shortDate = (key: string) => { const [y, m, d] = key.split('-').map(Number); return format(new Date(y, m - 1, d), 'EEE, MMM d'); };
const inputClass = "h-11 w-full rounded-lg border border-muted bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary";

export default function Descent() {
  const { profile, logs } = useStore();
  const { plan, status, save } = useDescentPlan();
  const todayKey = format(profile.simulatedDate || new Date(), 'yyyy-MM-dd');
  const [editing, setEditing] = useState(false);

  return (
    <MobileLayout className="lg:max-w-xl">
      <div className="space-y-4 pb-8">
        <header className="px-1 pt-1">
          <h1 className="text-lg font-bold">Descent plan</h1>
          <p className="text-xs text-muted-foreground">NCAA/NWCA weight certification. TrackWrestling is the official record.</p>
        </header>

        {status === 'unavailable' ? (
          <Notice>Descent plans need a one-time database update before they can be saved. Ask your coach.</Notice>
        ) : !plan || editing ? (
          <SetupForm
            initial={plan}
            onCancel={plan ? () => setEditing(false) : undefined}
            onSave={async next => {
              const err = await save(next);
              if (!err) setEditing(false);
              return err;
            }}
          />
        ) : (
          <PlanView
            plan={plan}
            todayKey={todayKey}
            morning={logForDay(logs, 'morning', todayKey)?.weight}
            onSave={save}
            onEdit={() => setEditing(true)}
          />
        )}
      </div>
    </MobileLayout>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">{children}</p>;
}

function SetupForm({ initial, onSave, onCancel }: {
  initial: DescentInput | null;
  onSave: (p: DescentInput) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [assessmentDate, setAssessmentDate] = useState(initial?.assessmentDate ?? '');
  const [initialWeight, setInitialWeight] = useState(initial ? String(initial.initialWeight) : '');
  const [minimumWeight, setMinimumWeight] = useState(initial ? String(initial.minimumWeight) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const next: DescentInput = {
      assessmentDate,
      initialWeight: Number(initialWeight),
      minimumWeight: Number(minimumWeight),
      weighIns: initial?.weighIns ?? [],
    };
    const invalid = validateDescentInput(next);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError(await onSave(next));
    setSaving(false);
  };

  return (
    <section className="space-y-3 rounded-xl border border-muted bg-card px-3 py-4">
      <div>
        <h2 className="text-sm font-bold">From your certification</h2>
        <p className="text-xs text-muted-foreground">
          Copy these from the top of your TrackWrestling Weight Loss Plan. Your coach can print it for you.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-bold">Assessment date</span>
        <input type="date" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} className={inputClass} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-bold">Initial weight (lb)</span>
          <input inputMode="decimal" value={initialWeight} onChange={e => setInitialWeight(e.target.value)} placeholder="128.00" className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold">Minimum weight (lb)</span>
          <input inputMode="decimal" value={minimumWeight} onChange={e => setMinimumWeight(e.target.value)} placeholder="114.41" className={inputClass} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-amber-500">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={saving} className="h-11 flex-1 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-60">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-11 rounded-lg border border-muted px-4 font-bold">Cancel</button>
        )}
      </div>
    </section>
  );
}

export function PlanView({ plan, todayKey, morning, onSave, onEdit }: {
  plan: DescentInput;
  todayKey: string;
  morning?: number;
  onSave: (p: DescentInput) => Promise<string | null>;
  onEdit: () => void;
}) {
  // Test weigh-ins, like TrackWrestling's: shown in the table, never saved
  const [previews, setPreviews] = useState<Record<string, OfficialWeighIn>>({});
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  const latest = [todayKey, plan.assessmentDate, ...plan.weighIns.map(w => w.date), ...Object.keys(previews)].sort().pop()!;
  const through = addDaysKey(latest, 60);
  const saved = useMemo(() => buildDescentPlan(plan, through), [plan, through]);
  const shown = useMemo(() => {
    const weighIns = [...plan.weighIns.filter(w => !previews[w.date]), ...Object.values(previews)]
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return buildDescentPlan({ ...plan, weighIns }, through);
  }, [plan, previews, through]);

  const today = rowOn(saved, todayKey);
  const diff = today && morning != null ? Math.round((morning - today.allowed) * 100) / 100 : null;
  const previewDates = Object.keys(previews).sort();
  const savedDates = plan.weighIns.map(w => w.date).sort();

  const visible = showAll
    ? shown.rows
    : shown.rows.filter(r => r.date >= addDaysKey(todayKey, -7) && r.date <= addDaysKey(todayKey, 35));
  // Every day around today stays tappable; only the whole-season view folds flat stretches.
  const items = showAll
    ? collapseFlat(visible, r => r.date === todayKey || r.date === openDate || expandedRuns.has(r.date))
    : visible.map(row => ({ kind: 'row' as const, row }));

  useEffect(() => {
    if (!scrollTo) return;
    requestAnimationFrame(() => document.getElementById(`d-${scrollTo}`)?.scrollIntoView({ block: 'center' }));
    setScrollTo(null);
  }, [scrollTo, items.length]);

  const jumpTo = (date: string) => {
    if (date < addDaysKey(todayKey, -7) || date > addDaysKey(todayKey, 35)) setShowAll(true);
    setOpenDate(date);
    setScrollTo(date);
  };

  return (
    <>
      {today ? (
        <section className="rounded-xl border border-muted bg-card px-3 py-3" aria-label="Today">
          <div className="grid grid-cols-2 gap-3">
            <Fact label="Eligible weight today" value={`${lb(today.allowed)} lb`} />
            <Fact label="Lowest eligible class" value={String(today.eligibleClass)} />
          </div>
          {diff !== null && (
            <p className="mt-2 text-xs text-muted-foreground">
              This morning {morning!.toFixed(1)} lb · {Math.abs(diff) < 0.005 ? 'at eligible weight' : `${Math.abs(diff).toFixed(2)} ${diff > 0 ? 'above' : 'below'} eligible weight`}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Minimum weight {lb(plan.minimumWeight)} · minimum weight class {saved.minimumClass} · initial weight {plan.initialWeight.toFixed(2)} · weight loss per week {saved.weeklyLoss.toFixed(2)} ·{' '}
            <button type="button" onClick={onEdit} className="underline">Edit</button>
          </p>
        </section>
      ) : (
        <Notice>Your plan starts on {shortDate(plan.assessmentDate)}.</Notice>
      )}

      {previewDates.length > 0 && (
        <section aria-label="Preview" aria-live="polite" className="space-y-1 rounded-xl border border-dashed border-primary/60 bg-primary/5 px-3 py-3 text-sm">
          <div className="flex items-center justify-between">
            <strong>Preview — not saved</strong>
            <button type="button" onClick={() => setPreviews({})} className="h-9 px-2 text-xs font-bold text-primary">Clear</button>
          </div>
          {previewDates.map(d => <PreviewImpact key={d} date={d} weighIn={previews[d]} saved={saved} shown={shown} />)}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold">Day by day</h2>
          <button type="button" onClick={() => setShowAll(s => !s)} className="h-9 text-xs font-bold text-primary">
            {showAll ? 'Around today' : 'Whole plan'}
          </button>
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          Tap a date to preview a weigh-in, or to save your official weigh-in from the sheet or TrackWrestling.
        </p>
        {(savedDates.length > 0 || previewDates.length > 0) && (
          <div className="flex flex-wrap gap-1.5 px-1" aria-label="Jump to a weigh-in">
            {Array.from(new Set([...savedDates, ...previewDates])).sort().map(d => (
              <button key={d} type="button" onClick={() => jumpTo(d)} aria-label={`Jump to ${shortDate(d)}`}
                className={cn("h-8 rounded-full border px-3 text-xs", previews[d] ? "border-dashed border-primary text-primary" : "border-muted")}>
                {shortDate(d)}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-muted">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-bold">Date</th>
                <th className="px-2 py-2 text-right font-bold">Eligible wt</th>
                <th className="px-2 py-2 text-right font-bold">Class</th>
                <th className="px-3 py-2 text-right font-bold">Weigh-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-muted">
              {items.map(item => item.kind === 'run' ? (
                <tr key={`run-${item.from}`}>
                  <td colSpan={4} className="px-3 py-1">
                    <button type="button"
                      onClick={() => setExpandedRuns(prev => { const next = new Set(prev); for (let d = item.from; d <= item.to; d = addDaysKey(d, 1)) next.add(d); return next; })}
                      className="flex min-h-10 w-full items-center justify-between text-left text-xs text-muted-foreground">
                      <span>{shortDate(item.from)} – {shortDate(item.to)} · {item.count} days at minimum weight</span>
                      <span className="font-mono">{lb(item.allowed)} · {item.eligibleClass}</span>
                    </button>
                  </td>
                </tr>
              ) : (
                <DayRow
                  key={item.row.date}
                  row={item.row}
                  todayKey={todayKey}
                  isOpen={openDate === item.row.date}
                  onToggle={() => setOpenDate(o => (o === item.row.date ? null : item.row.date))}
                  official={plan.weighIns.find(w => w.date === item.row.date)}
                  preview={previews[item.row.date]}
                  dayBeforeHasWeighIn={!!rowOn(shown, addDaysKey(item.row.date, -1))?.weighIn}
                  isAssessment={item.row.date === plan.assessmentDate}
                  onPreview={w => setPreviews(p => ({ ...p, [w.date]: w }))}
                  onClearPreview={d => setPreviews(p => { const { [d]: _gone, ...rest } = p; return rest; })}
                  onSaveOfficial={async w => {
                    const err = await onSave({ ...plan, weighIns: [...plan.weighIns.filter(x => x.date !== w.date), w] });
                    if (!err) { setPreviews(p => { const { [w.date]: _gone, ...rest } = p; return rest; }); setOpenDate(null); }
                    return err;
                  }}
                  onRemoveOfficial={async d => {
                    const err = await onSave({ ...plan, weighIns: plan.weighIns.filter(x => x.date !== d) });
                    if (!err) setOpenDate(null);
                    return err;
                  }}
                />
              ))}
            </tbody>
          </table>
          {(previewDates.length > 0 || shown.rows.some(r => r.weighIn && !r.weighIn.counted)) && (
            <p className="border-t border-muted px-3 py-2 text-[11px] text-muted-foreground">
              {previewDates.length > 0 && <span className="italic text-primary">Orange italic = preview, not saved. </span>}
              {shown.rows.some(r => r.weighIn && !r.weighIn.counted) && '* Not counted (below eligible weight or day 2 of a tournament).'}
            </p>
          )}
        </div>
      </section>

      <p className="px-1 text-[11px] text-muted-foreground">
        Rebuilt from your certification and the weigh-ins you save, using TrackWrestling's rules. If anything differs, TrackWrestling is right.
        <br />
        <Link href="/weigh-in" className="underline">Daily weigh-ins</Link>
      </p>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-bold">{value}</p>
    </div>
  );
}

/** What a previewed weigh-in would do, compared with the saved plan. */
function PreviewImpact({ date, weighIn, saved, shown }: { date: string; weighIn: OfficialWeighIn; saved: DescentPlan; shown: DescentPlan }) {
  const row = rowOn(shown, date);
  const next = rowOn(shown, addDaysKey(date, 1));
  const before = rowOn(saved, addDaysKey(date, 1));
  const head = `${shortDate(date)} at ${weighIn.weight.toFixed(2)}${weighIn.allowance ? ` (+${weighIn.allowance})` : ''}:`;
  if (!row?.weighIn?.counted) {
    const why = row?.weighIn?.reason === 'second-day' ? 'day 2 of the same tournament' : `below eligible weight of ${row ? lb(row.allowed) : ''}`;
    return <p>{head} would not count ({why}). The plan would not change.</p>;
  }
  const closes = before && next && next.eligibleClass > before.eligibleClass;
  const reopens = closes ? firstOpenDate(shown, before!.eligibleClass, addDaysKey(date, 1)) : null;
  return (
    <p>
      {head} next day's eligible weight <strong className="font-mono">{next ? lb(next.allowed) : '—'}</strong>, eligible class {next?.eligibleClass}.{' '}
      {closes
        ? <>Not eligible for <strong>{before!.eligibleClass}</strong> until <strong>{reopens ? shortDate(reopens) : 'after this plan ends'}</strong>.</>
        : before ? <>Still eligible for {before.eligibleClass}.</> : null}
    </p>
  );
}

function DayRow({
  row, todayKey, isOpen, onToggle, official, preview, dayBeforeHasWeighIn, isAssessment,
  onPreview, onClearPreview, onSaveOfficial, onRemoveOfficial,
}: {
  row: DescentRow;
  todayKey: string;
  isOpen: boolean;
  onToggle: () => void;
  official?: OfficialWeighIn;
  preview?: OfficialWeighIn;
  dayBeforeHasWeighIn: boolean;
  isAssessment: boolean;
  onPreview: (w: OfficialWeighIn) => void;
  onClearPreview: (date: string) => void;
  onSaveOfficial: (w: OfficialWeighIn) => Promise<string | null>;
  onRemoveOfficial: (date: string) => Promise<string | null>;
}) {
  const isToday = row.date === todayKey;
  const shownWeighIn = row.weighIn;
  return (
    <>
      <tr id={`d-${row.date}`} className={cn(isToday && "bg-primary/10 font-bold", isOpen && "bg-muted/30")}>
        <td className="px-3">
          <button type="button" onClick={onToggle} disabled={isAssessment} aria-expanded={isOpen}
            className="min-h-10 w-full whitespace-nowrap text-left disabled:cursor-default">
            {isToday ? 'Today' : shortDate(row.date)}
          </button>
        </td>
        <td className="px-2 text-right font-mono">{lb(row.allowed)}</td>
        <td className="px-2 text-right font-mono">{row.eligibleClass}</td>
        <td className={cn("px-3 text-right font-mono", preview && "italic text-primary")}>
          {isAssessment ? 'Assessment' : shownWeighIn
            ? <>{shownWeighIn.weight.toFixed(2)}{shownWeighIn.counted ? '' : '*'}</>
            : ''}
        </td>
      </tr>
      {isOpen && !isAssessment && (
        <tr>
          <td colSpan={4} className="bg-muted/20 px-3 py-3">
            <RowEditor
              date={row.date}
              isFuture={row.date > todayKey}
              allowed={row.allowed}
              official={official}
              preview={preview}
              dayBeforeHasWeighIn={dayBeforeHasWeighIn}
              onPreview={onPreview}
              onClearPreview={onClearPreview}
              onSaveOfficial={onSaveOfficial}
              onRemoveOfficial={onRemoveOfficial}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function RowEditor({ date, isFuture, allowed, official, preview, dayBeforeHasWeighIn, onPreview, onClearPreview, onSaveOfficial, onRemoveOfficial }: {
  date: string;
  isFuture: boolean;
  allowed: number;
  official?: OfficialWeighIn;
  preview?: OfficialWeighIn;
  dayBeforeHasWeighIn: boolean;
  onPreview: (w: OfficialWeighIn) => void;
  onClearPreview: (date: string) => void;
  onSaveOfficial: (w: OfficialWeighIn) => Promise<string | null>;
  onRemoveOfficial: (date: string) => Promise<string | null>;
}) {
  const start = preview ?? official;
  const [weight, setWeight] = useState(start ? start.weight.toFixed(2) : '');
  const [allowance, setAllowance] = useState(start?.allowance ?? 0);
  const [secondDay, setSecondDay] = useState(!!start?.secondDay);
  const [confirm, setConfirm] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = (): OfficialWeighIn | null => {
    if (!/^\d{2,3}(\.\d{1,2})?$/.test(weight.trim())) { setError('Enter a weight like 124.8'); return null; }
    setError(null);
    return { date, weight: Number(weight), allowance, secondDay: dayBeforeHasWeighIn && secondDay };
  };
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    const err = await fn();
    setBusy(false);
    setConfirm(null);
    setError(err);
  };

  return (
    <div className="space-y-2" aria-label={`Weigh-in for ${shortDate(date)}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
        <label className="block min-w-0 space-y-1">
          <span className="text-xs font-bold">Weight (lb)</span>
          <input inputMode="decimal" enterKeyHint="done" autoFocus value={weight} placeholder={allowed.toFixed(1)}
            onChange={e => { setWeight(e.target.value); setConfirm(null); }}
            onKeyDown={e => { if (e.key === 'Enter') { const w = read(); if (w) onPreview(w); } }}
            className={cn(inputClass, "text-right font-mono")} />
        </label>
        <label className="block min-w-0 space-y-1">
          <span className="text-xs font-bold">Allowance</span>
          <select value={allowance} onChange={e => setAllowance(Number(e.target.value))}
            className="h-11 w-full rounded-lg border border-muted bg-background px-2">
            {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>+{n} lb</option>)}
          </select>
        </label>
      </div>
      {dayBeforeHasWeighIn && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={secondDay} onChange={e => setSecondDay(e.target.checked)} className="h-5 w-5" />
          Day 2 of the same tournament as the day before
        </label>
      )}

      {confirm === 'save' ? (
        <div role="alertdialog" aria-label="Confirm official weigh-in" className="space-y-2 rounded-lg border border-primary/50 bg-background p-3 text-sm">
          <p>Save <strong className="font-mono">{Number(weight).toFixed(2)} lb</strong>{allowance ? ` (+${allowance})` : ''} on {shortDate(date)} as your official weigh-in? It becomes part of your plan.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => { const w = read(); if (w) void run(() => onSaveOfficial(w)); }}
              className="h-11 flex-1 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-60">{busy ? 'Saving…' : 'Save official'}</button>
            <button type="button" onClick={() => setConfirm(null)} className="h-11 rounded-lg border border-muted px-4 font-bold">Cancel</button>
          </div>
        </div>
      ) : confirm === 'remove' ? (
        <div role="alertdialog" aria-label="Confirm removal" className="space-y-2 rounded-lg border border-red-500/50 bg-background p-3 text-sm">
          <p>Remove the official {official!.weight.toFixed(2)} lb weigh-in on {shortDate(date)}?</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void run(() => onRemoveOfficial(date))}
              className="h-11 flex-1 rounded-lg bg-red-600 font-bold text-white disabled:opacity-60">{busy ? 'Removing…' : 'Remove'}</button>
            <button type="button" onClick={() => setConfirm(null)} className="h-11 rounded-lg border border-muted px-4 font-bold">Keep</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { const w = read(); if (w) onPreview(w); }}
            className="h-11 flex-1 rounded-lg border border-primary font-bold text-primary">Preview</button>
          {!isFuture && (
            <button type="button" onClick={() => { if (read()) setConfirm('save'); }}
              className="h-11 flex-1 rounded-lg bg-primary font-bold text-primary-foreground">{official ? 'Update official' : 'Save as official'}</button>
          )}
          {preview && (
            <button type="button" onClick={() => onClearPreview(date)} className="h-11 rounded-lg border border-muted px-3 text-sm font-bold">Clear preview</button>
          )}
          {official && (
            <button type="button" onClick={() => setConfirm('remove')} className="h-11 rounded-lg px-3 text-sm text-muted-foreground underline">Remove</button>
          )}
        </div>
      )}
      {isFuture && <p className="text-[11px] text-muted-foreground">Future dates are previews only. Save the official weight after you weigh in.</p>}
      {error && <p role="alert" className="text-sm text-amber-500">{error}</p>}
    </div>
  );
}
