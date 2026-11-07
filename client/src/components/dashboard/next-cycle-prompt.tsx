import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Scale } from "lucide-react";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useDescentPlan } from "@/hooks/use-descent-plan";
import type { OfficialWeighIn } from "@/lib/descent-plan";
import { describeWeighIn, type ScheduledWeighIn } from "@/lib/team-schedule";

interface NextCyclePromptProps {
  profile: {
    weighInDate: Date;
    targetWeightClass: number;
    protocol: string;
    currentWeight: number;
    weighInCleared?: boolean;
    /** The weigh-in date (yyyy-MM-dd) this prompt was last finished for. Older builds stored `true`. */
    nextCyclePromptDismissed?: boolean | string;
  };
  updateProfile: (updates: any) => void;
  daysUntilWeighIn: number;
  /** On a team: the next weigh-in from the coach's schedule (null when none are left). */
  team?: { name: string; next: ScheduledWeighIn | null; passedAllowance?: number };
}

const dateKey = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Shown the day after each weigh-in: record the official weight, then point the app at
 * the next weigh-in (day 2 of the same tournament, a new date, or nothing for now).
 */
export function NextCyclePrompt({ profile, updateProfile, daysUntilWeighIn, team }: NextCyclePromptProps) {
  if (daysUntilWeighIn >= 0) return null;
  if (profile.weighInCleared) return null;
  const passedKey = dateKey(profile.weighInDate);
  if (profile.nextCyclePromptDismissed === passedKey) return null;
  return <AfterWeighIn key={passedKey} profile={profile} updateProfile={updateProfile} team={team} />;
}

const noonOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

function AfterWeighIn({ profile, updateProfile, team }: Omit<NextCyclePromptProps, "daysUntilWeighIn">) {
  const { plan, status, save } = useDescentPlan();
  const weighInDay = profile.weighInDate;
  const passedKey = dateKey(weighInDay);
  const hasPlan = status === "ready" && !!plan;
  const alreadyRecorded = !!plan?.weighIns.some(w => w.date === passedKey);
  const dayBeforeKey = dateKey(addDays(weighInDay, -1));
  const dayBeforeHasWeighIn = !!plan?.weighIns.some(w => w.date === dayBeforeKey);
  const day2IsToday = isSameDay(addDays(weighInDay, 1), new Date());

  const [step, setStep] = useState<"weight" | "confirm" | "next" | "pick">("weight");
  const [weight, setWeight] = useState("");
  const [allowance, setAllowance] = useState(team?.passedAllowance ?? 0);
  const [secondDay, setSecondDay] = useState(true);
  const [nextDate, setNextDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const askForWeight = hasPlan && !alreadyRecorded && (step === "weight" || step === "confirm");
  const label = format(weighInDay, "EEE, MMM d");

  const finish = (updates: Record<string, unknown>) =>
    updateProfile({ ...updates, nextCyclePromptDismissed: passedKey });

  const checkWeight = () => {
    if (!/^\d{2,3}(\.\d{1,2})?$/.test(weight.trim())) { setError("Enter a weight like 124.8"); return; }
    setError(null);
    setStep("confirm");
  };

  const saveOfficial = async () => {
    if (!plan) return;
    const entry: OfficialWeighIn = {
      date: passedKey,
      weight: Number(weight),
      allowance,
      secondDay: dayBeforeHasWeighIn && secondDay,
    };
    setBusy(true);
    const err = await save({ ...plan, weighIns: [...plan.weighIns.filter(w => w.date !== passedKey), entry] });
    setBusy(false);
    if (err) { setError(err); setStep("weight"); return; }
    toast({ title: "Official weigh-in saved", description: `${entry.weight.toFixed(2)} lb on ${label}. Your descent plan restarts from it.` });
    setStep("next");
  };

  const setDate = () => {
    const [y, m, d] = nextDate.split("-").map(Number);
    const picked = new Date(y, m - 1, d, 12, 0, 0);
    if (!nextDate || startOfDay(picked) <= startOfDay(new Date())) {
      setError("Pick a date after today.");
      return;
    }
    finish({ weighInDate: picked, weighInCleared: false });
    toast({ title: "Next weigh-in set", description: format(picked, "EEE, MMM d") });
  };

  const day2Today = () => {
    const today = new Date();
    updateProfile({ weighInDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0), weighInCleared: false });
    toast({ title: "Day 2 is today", description: "Enter today's official weight tomorrow morning." });
  };

  return (
    <Card className="mb-3 border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        {askForWeight ? (
          <>
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">What did you weigh in at on {label}?</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Use your official weight from the weigh-in sheet or TrackWrestling. It's saved to your descent plan for good.
            </p>

            {step === "weight" ? (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                  <label className="block min-w-0 space-y-1">
                    <span className="text-xs font-bold">Official weight (lb)</span>
                    <Input inputMode="decimal" enterKeyHint="done" value={weight} placeholder="124.8"
                      onChange={e => setWeight(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") checkWeight(); }}
                      className="h-11 text-right font-mono" />
                  </label>
                  <label className="block min-w-0 space-y-1">
                    <span className="text-xs font-bold">Allowance</span>
                    <select value={allowance} onChange={e => setAllowance(Number(e.target.value))}
                      className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm">
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
                {error && <p role="alert" className="text-xs font-bold text-destructive">{error}</p>}
                <div className="flex gap-2">
                  <Button onClick={checkWeight} className="h-11 flex-1 font-bold">Save official weigh-in</Button>
                  <Button variant="outline" onClick={() => { setError(null); setStep("next"); }} className="h-11">
                    Didn't weigh in
                  </Button>
                </div>
              </>
            ) : (
              <div role="alertdialog" aria-label="Confirm official weigh-in" className="space-y-2 rounded-lg border border-primary/50 bg-background p-3 text-sm">
                <p>
                  Save <strong className="font-mono">{Number(weight).toFixed(2)} lb</strong>
                  {allowance ? ` (+${allowance})` : ""} on {label} as your official weigh-in? It becomes a permanent part of your plan.
                </p>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => void saveOfficial()} className="h-11 flex-1 font-bold">
                    {busy ? "Saving…" : "Save official"}
                  </Button>
                  <Button variant="outline" onClick={() => setStep("weight")} className="h-11">Back</Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">When's your next weigh-in?</h3>
            </div>
            {team ? (
              <>
                <p className="text-sm">
                  {team.next
                    ? <>Next on {team.name}'s schedule: <strong>{describeWeighIn(team.next)}</strong></>
                    : <>There are no more weigh-ins on {team.name}'s schedule.</>}
                </p>
                <Button
                  onClick={() => team.next
                    ? finish({ weighInDate: noonOf(team.next.date), weighInCleared: false })
                    : finish({ weighInCleared: true })}
                  className="h-11 w-full font-bold"
                >
                  Got it
                </Button>
              </>
            ) : step === "pick" ? (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-bold">Next weigh-in date</span>
                  <Input type="date" value={nextDate} onChange={e => { setNextDate(e.target.value); setError(null); }} className="h-11" />
                </label>
                {error && <p role="alert" className="text-xs font-bold text-destructive">{error}</p>}
                <div className="flex gap-2">
                  <Button onClick={setDate} disabled={!nextDate} className="h-11 flex-1 font-bold">Set date</Button>
                  <Button variant="outline" onClick={() => setStep("next")} className="h-11">Back</Button>
                </div>
              </>
            ) : (
              <div className="grid gap-2">
                {day2IsToday && (
                  <Button onClick={day2Today} className="h-11 font-bold">Day 2 of the tournament is today</Button>
                )}
                <Button variant={day2IsToday ? "outline" : "default"} onClick={() => setStep("pick")} className="h-11 font-bold">
                  Pick the next date
                </Button>
                <Button variant="ghost" onClick={() => finish({ weighInCleared: true })} className="h-11 text-muted-foreground">
                  Not right now
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
