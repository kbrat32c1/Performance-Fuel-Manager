/**
 * Team schedule — the coach enters the season's weigh-ins once; athletes join with the
 * team code and skip events they aren't going to. The dashboard follows the schedule.
 */
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { MobileLayout } from "@/components/mobile-layout";
import { useTeam, useTeamRoster, type Team } from "@/hooks/use-team";
import { cn } from "@/lib/utils";
import { dayKey, describeWeighIn, nextScheduledWeighIn, eventDays, takePendingTeamCode, type TeamEvent } from "@/lib/team-schedule";

const inputClass = "h-11 w-full rounded-lg border border-muted bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary";
const primaryButton = "h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-60";
const outlineButton = "h-11 rounded-lg border border-muted px-4 font-bold disabled:opacity-60";
const eventWhen = (e: TeamEvent) => {
  const days = eventDays(e).map(d => parseISO(d));
  return days.length === 2
    ? `${format(days[0], 'EEE, MMM d')} – ${format(days[1], 'EEE, MMM d')}`
    : format(days[0], 'EEE, MMM d');
};

export default function TeamPage() {
  const team = useTeam();
  const todayKey = dayKey(new Date());
  const joinParam = useMemo(() => { const stashed = takePendingTeamCode(); return new URLSearchParams(window.location.search).get('join') || stashed; }, []);

  return (
    <MobileLayout className="lg:max-w-xl">
      <div className="space-y-4 pb-8">
        <header className="px-1 pt-1">
          <h1 className="text-lg font-bold">Team schedule</h1>
          <p className="text-xs text-muted-foreground">
            Your coach enters the season's weigh-ins once. The app moves to your next one after each event.
          </p>
        </header>

        {team.status === 'unavailable' ? (
          <Notice>Team schedules need a one-time database update before they can be used. Ask your coach.</Notice>
        ) : team.status === 'loading' && !team.coached && !team.membership ? (
          <Notice>Loading…</Notice>
        ) : (
          <>
            {team.coached && (
              <CoachPanel
                team={team.coached.team}
                events={team.coached.events}
                todayKey={todayKey}
                onSave={input => team.saveEvent(team.coached!.team.id, input)}
                onDelete={team.deleteEvent}
              />
            )}

            {team.membership && team.membership.team.id !== team.coached?.team.id ? (
              <AthletePanel
                team={team.membership.team}
                events={team.membership.events}
                skipped={team.membership.skipped}
                todayKey={todayKey}
                onSkip={team.setSkipped}
                onLeave={team.leaveTeam}
              />
            ) : !team.coached ? (
              <JoinForm initialCode={joinParam} onJoin={team.joinTeam} />
            ) : null}

            {!team.coached && !team.membership && <CreateTeam onCreate={team.createTeam} />}
          </>
        )}
      </div>
    </MobileLayout>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-muted bg-card p-4 text-sm text-muted-foreground">{children}</div>;
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-muted bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ─── Coach ───────────────────────────────────────────────────────────────────

function CoachPanel({ team, events, todayKey, onSave, onDelete }: {
  team: Team;
  events: TeamEvent[];
  todayKey: string;
  onSave: (input: { id?: string; name: string; eventDate: string; days: 1 | 2; allowance: number }) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(events.length === 0 ? 'new' : null);
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/team?join=${team.joinCode ?? ''}`;

  const share = async () => {
    const text = `Join ${team.name} on SPAR Nutrition for our weigh-in schedule. Code: ${team.joinCode}`;
    try {
      if (navigator.share) { await navigator.share({ title: team.name, text, url: link }); return; }
      await navigator.clipboard.writeText(`${text}\n${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* share sheet dismissed */ }
  };

  const upcoming = events.filter(e => eventDays(e).some(d => d >= todayKey));
  const past = events.filter(e => !upcoming.includes(e));

  return (
    <>
      <Section title={team.name}>
        <p className="text-sm text-muted-foreground">Send this to your athletes. They tap the link or type the code under Team schedule.</p>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Team code</p>
            <p className="font-mono text-2xl font-bold tracking-[0.2em]">{team.joinCode}</p>
          </div>
          <button type="button" onClick={() => void share()} className={primaryButton}>
            {copied ? 'Copied' : 'Share link'}
          </button>
        </div>
      </Section>

      <Section
        title="Weigh-ins"
        aside={editingId !== 'new' && (
          <button type="button" onClick={() => setEditingId('new')} className="h-11 px-2 text-sm font-bold text-primary">
            Add weigh-in
          </button>
        )}
      >
        {editingId === 'new' && (
          <EventForm onCancel={events.length ? () => setEditingId(null) : undefined}
            onSave={async input => { const err = await onSave(input); if (!err) setEditingId(null); return err; }} />
        )}
        {upcoming.length === 0 && editingId !== 'new' && (
          <p className="text-sm text-muted-foreground">No upcoming weigh-ins. Add the season's duals and tournaments.</p>
        )}
        <ul className="divide-y divide-muted">
          {upcoming.map(e => (
            <li key={e.id} className="py-2">
              {editingId === e.id ? (
                <EventForm event={e} onCancel={() => setEditingId(null)} onDelete={() => onDelete(e.id)}
                  onSave={async input => { const err = await onSave({ ...input, id: e.id }); if (!err) setEditingId(null); return err; }} />
              ) : (
                <button type="button" onClick={() => setEditingId(e.id)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
                  <span className="min-w-0">
                    <span className="block font-bold">{e.name}</span>
                    <span className="block text-sm text-muted-foreground">{eventWhen(e)}{e.days === 2 ? ' · 2 days' : ''}{e.allowance ? ` · +${e.allowance} lb${e.days === 2 ? ' day 2' : ''}` : ''}</span>
                  </span>
                  <span className="text-sm font-bold text-primary">Edit</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        {past.length > 0 && (
          <p className="text-xs text-muted-foreground">{past.length} past weigh-in{past.length === 1 ? '' : 's'} not shown.</p>
        )}
      </Section>

      <RosterSection teamId={team.id} events={upcoming} />
    </>
  );
}

function RosterSection({ teamId, events }: { teamId: string; events: TeamEvent[] }) {
  const { roster, status, retry } = useTeamRoster(teamId);
  const eventName = (id: string) => events.find(e => e.id === id)?.name;

  return (
    <Section title={`Roster${roster ? ` (${roster.length})` : ''}`}>
      {status === 'unavailable' ? (
        <p className="text-sm text-muted-foreground">The roster needs a one-time database update.</p>
      ) : status === 'error' ? (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-sm text-destructive">Couldn't load the roster. Check your connection.</p>
          <button type="button" onClick={retry} className={outlineButton}>Retry</button>
        </div>
      ) : status === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !roster || roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one has joined yet. Share the link or code above.</p>
      ) : (
        <ul className="divide-y divide-muted">
          {roster.map(a => {
            const notWrestling = a.skipped.map(eventName).filter(Boolean) as string[];
            return (
              <li key={a.userId} className="flex min-h-11 items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-bold">{a.name}</span>
                  {notWrestling.length > 0 && (
                    <span className="block text-xs text-muted-foreground">Not wrestling: {notWrestling.join(', ')}</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-sm text-muted-foreground">{a.weightClass ? `${a.weightClass}` : '—'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function EventForm({ event, onSave, onCancel, onDelete }: {
  event?: TeamEvent;
  onSave: (input: { name: string; eventDate: string; days: 1 | 2; allowance: number }) => Promise<string | null>;
  onCancel?: () => void;
  onDelete?: () => Promise<string | null>;
}) {
  const [name, setName] = useState(event?.name ?? '');
  const [eventDate, setEventDate] = useState(event?.eventDate ?? '');
  const [days, setDays] = useState<1 | 2>(event?.days ?? 1);
  const [allowance, setAllowance] = useState(event?.allowance ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    const err = await fn();
    setBusy(false);
    setError(err);
  };

  return (
    <form className="space-y-3 rounded-lg border border-primary/40 p-3"
      onSubmit={e => { e.preventDefault(); void run(() => onSave({ name, eventDate, days, allowance })); }}>
      <label className="block space-y-1">
        <span className="text-xs font-bold">Event</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Roger Williams Open" maxLength={80}
          className={inputClass} autoFocus={!event} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-bold">Weigh-in date{days === 2 ? ' (day 1)' : ''}</span>
        <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputClass} />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs font-bold">Weigh-ins</legend>
        <div className="grid grid-cols-2 gap-2">
          {([1, 2] as const).map(n => (
            <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}
              className={cn("h-11 rounded-lg border-2 text-sm font-bold", days === n ? "border-primary bg-primary/10" : "border-muted")}>
              {n === 1 ? '1 day (dual)' : '2 days (tournament)'}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="text-xs font-bold">Allowance {days === 2 ? 'on day 2' : 'for this weigh-in'}</legend>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map(n => (
            <button key={n} type="button" aria-pressed={allowance === n} onClick={() => setAllowance(n)}
              className={cn("h-11 rounded-lg border-2 text-sm font-bold", allowance === n ? "border-primary bg-primary/10" : "border-muted")}>
              {n === 0 ? 'None' : `+${n} lb`}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {days === 2 ? 'Day 2 of a tournament usually gets +1 lb.' : 'Use +1 lb when this meet is the day after another one.'}
        </p>
      </fieldset>
      {error && <p role="alert" className="text-sm font-bold text-destructive">{error}</p>}
      {confirmDelete ? (
        <div role="alertdialog" aria-label="Confirm removal" className="space-y-2 text-sm">
          <p>Remove {event?.name} from the schedule? Athletes' next weigh-in updates too.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void run(onDelete!)} className="h-11 flex-1 rounded-lg bg-red-600 font-bold text-white disabled:opacity-60">
              {busy ? 'Removing…' : 'Remove'}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className={outlineButton}>Keep</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={cn(primaryButton, "flex-1")}>{busy ? 'Saving…' : 'Save'}</button>
          {onCancel && <button type="button" onClick={onCancel} className={outlineButton}>Cancel</button>}
          {onDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="h-11 px-2 font-bold text-destructive">Remove</button>
          )}
        </div>
      )}
    </form>
  );
}

function CreateTeam({ onCreate }: { onCreate: (name: string) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 w-full text-sm font-bold text-muted-foreground">
        Coach? Create your team
      </button>
    );
  }
  return (
    <Section title="Create your team">
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        setError(await onCreate(name));
        setBusy(false);
      }}>
        <label className="block space-y-1">
          <span className="text-xs font-bold">Team name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Roger Williams Wrestling" maxLength={80} className={inputClass} autoFocus />
        </label>
        {error && <p role="alert" className="text-sm font-bold text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={cn(primaryButton, "flex-1")}>{busy ? 'Creating…' : 'Create team'}</button>
          <button type="button" onClick={() => setOpen(false)} className={outlineButton}>Cancel</button>
        </div>
      </form>
    </Section>
  );
}

// ─── Athlete ─────────────────────────────────────────────────────────────────

function JoinForm({ initialCode, onJoin }: { initialCode: string; onJoin: (code: string) => Promise<string | null> }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Section title="Join your team">
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        setError(await onJoin(code));
        setBusy(false);
      }}>
        <label className="block space-y-1">
          <span className="text-xs font-bold">Team code from your coach</span>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="AB12CD" maxLength={6}
            autoCapitalize="characters" autoComplete="off" className={cn(inputClass, "font-mono tracking-[0.2em]")} />
        </label>
        {error && <p role="alert" className="text-sm font-bold text-destructive">{error}</p>}
        <button type="submit" disabled={busy || code.length !== 6} className={cn(primaryButton, "w-full")}>
          {busy ? 'Joining…' : 'Join team'}
        </button>
      </form>
    </Section>
  );
}

function AthletePanel({ team, events, skipped, todayKey, onSkip, onLeave }: {
  team: Team;
  events: TeamEvent[];
  skipped: string[];
  todayKey: string;
  onSkip: (eventId: string, skip: boolean) => Promise<string | null>;
  onLeave: () => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const next = nextScheduledWeighIn(events, skipped, todayKey);
  const upcoming = events.filter(e => eventDays(e).some(d => d >= todayKey));

  const toggle = async (e: TeamEvent) => {
    setPending(e.id);
    setError(await onSkip(e.id, !skipped.includes(e.id)));
    setPending(null);
  };

  return (
    <Section title={team.name}>
      <div className="rounded-lg bg-primary/10 p-3">
        <p className="text-xs font-bold text-primary">Your next weigh-in</p>
        <p className="font-bold">{next ? describeWeighIn(next) : 'None left on the schedule'}</p>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">Tap to mark whether you're wrestling in each one. The app only counts down to events you're wrestling in.</p>
        <ul className="mt-1 divide-y divide-muted">
          {upcoming.map(e => {
            const isSkipped = skipped.includes(e.id);
            return (
              <li key={e.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <span className={cn("min-w-0", isSkipped && "text-muted-foreground line-through")}>
                  <span className="block font-bold">{e.name}</span>
                  <span className="block text-sm text-muted-foreground">{eventWhen(e)}{e.allowance ? ` · +${e.allowance} lb${e.days === 2 ? ' day 2' : ''}` : ''}</span>
                </span>
                <button type="button" aria-pressed={!isSkipped} aria-label={`${e.name}: ${isSkipped ? 'not wrestling' : 'wrestling'}. Tap to change.`}
                  disabled={pending === e.id} onClick={() => void toggle(e)}
                  className={cn("h-11 w-32 shrink-0 rounded-lg border-2 px-2 text-sm font-bold disabled:opacity-60",
                    isSkipped ? "border-muted text-muted-foreground" : "border-green-500 bg-green-500/10 text-green-600")}>
                  {isSkipped ? 'Not wrestling' : '✓ Wrestling'}
                </button>
              </li>
            );
          })}
        </ul>
        {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Your coach hasn't added upcoming weigh-ins yet.</p>}
      </div>
      {error && <p role="alert" className="text-sm font-bold text-destructive">{error}</p>}

      {confirmLeave ? (
        <div role="alertdialog" aria-label="Confirm leaving team" className="space-y-2 rounded-lg border border-red-500/50 p-3 text-sm">
          <p>Leave {team.name}? You'll set your weigh-in dates yourself again.</p>
          <div className="flex gap-2">
            <button type="button" onClick={async () => { setError(await onLeave()); setConfirmLeave(false); }}
              className="h-11 flex-1 rounded-lg bg-red-600 font-bold text-white">Leave team</button>
            <button type="button" onClick={() => setConfirmLeave(false)} className={outlineButton}>Stay</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmLeave(true)} className="h-11 text-sm font-bold text-muted-foreground">
          Leave team
        </button>
      )}
    </Section>
  );
}
