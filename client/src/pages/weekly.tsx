import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { format, getDay, addDays, startOfWeek } from "date-fns";
import { Droplets, Scale, CheckCircle2, Circle, AlertTriangle } from "lucide-react";

export default function Weekly() {
  const { profile, logs, getCheckpoints } = useStore();
  const checkpoints = getCheckpoints();

  const today = profile.simulatedDate || new Date();
  const currentDayOfWeek = getDay(today);

  // Get weight class category for water load table
  const getWeightCategory = (weightClass: number): 'light' | 'medium' | 'heavy' => {
    if (weightClass <= 141) return 'light';
    if (weightClass <= 165) return 'medium';
    return 'heavy';
  };

  const weightCategory = getWeightCategory(profile.targetWeightClass);

  // Water load schedule from your document (page 10)
  const waterLoadSchedule = {
    light: { mon: '1.0 gal', tue: '1.25 gal', wed: '1.5 gal', thu: '1.25 gal', fri: '0.25-0.5 gal', sat: 'Rehydrate', sun: '1.0 gal' },
    medium: { mon: '1.25 gal', tue: '1.5 gal', wed: '1.75 gal', thu: '1.5 gal', fri: '0.25-0.5 gal', sat: 'Rehydrate', sun: '1.25 gal' },
    heavy: { mon: '1.5 gal', tue: '1.75 gal', wed: '2.0 gal', thu: '1.75 gal', fri: '0.25-0.5 gal', sat: 'Rehydrate', sun: '1.5 gal' },
  };

  const waterTypes = {
    mon: { type: 'Regular', sodium: 'Normal' },
    tue: { type: 'Regular', sodium: 'Normal' },
    wed: { type: 'Regular', sodium: 'Moderate' },
    thu: { type: 'Distilled', sodium: 'Low' },
    fri: { type: 'Distilled', sodium: 'Very Low' },
    sat: { type: 'Regular', sodium: 'Reintroduce' },
    sun: { type: 'Regular', sodium: 'Normal' },
  };

  // Weight targets by day (from your document - page 2)
  const getWeightTargets = () => {
    const w = profile.targetWeightClass;
    const walkAround = w * 1.07;
    const wedTarget = w * 1.045; // midpoint of 1.04-1.05
    const friTarget = w * 1.025; // midpoint of 1.02-1.03

    return {
      mon: { label: 'Walk-Around', target: walkAround, range: `${(w * 1.06).toFixed(0)}-${(w * 1.07).toFixed(0)}` },
      tue: { label: 'Loading', target: walkAround + 1, range: 'May increase' },
      wed: { label: 'Wed PM Target', target: wedTarget, range: `${(w * 1.04).toFixed(0)}-${(w * 1.05).toFixed(0)}` },
      thu: { label: 'Transition', target: (wedTarget + friTarget) / 2, range: 'Dropping' },
      fri: { label: 'Fri PM Target', target: friTarget, range: `${(w * 1.02).toFixed(0)}-${(w * 1.03).toFixed(0)}` },
      sat: { label: 'Competition', target: w, range: `${w}` },
      sun: { label: 'Recovery', target: walkAround, range: 'Rebuilding' },
    };
  };

  const weightTargets = getWeightTargets();

  // Days of the week
  const days = [
    { key: 'mon', label: 'Mon', dayNum: 1, phase: 'Load' },
    { key: 'tue', label: 'Tue', dayNum: 2, phase: 'Load' },
    { key: 'wed', label: 'Wed', dayNum: 3, phase: 'Load' },
    { key: 'thu', label: 'Thu', dayNum: 4, phase: 'Cut' },
    { key: 'fri', label: 'Fri', dayNum: 5, phase: 'Cut' },
    { key: 'sat', label: 'Sat', dayNum: 6, phase: 'Compete' },
    { key: 'sun', label: 'Sun', dayNum: 0, phase: 'Rebuild' },
  ];

  // Get logged weight for a specific day
  const getLoggedWeight = (dayNum: number, type: string) => {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const targetDate = addDays(weekStart, dayNum === 0 ? 6 : dayNum - 1);

    return logs.find(log => {
      const logDate = new Date(log.date);
      return log.type === type &&
        logDate.getDate() === targetDate.getDate() &&
        logDate.getMonth() === targetDate.getMonth();
    });
  };

  return (
    <MobileLayout showNav={true}>
      {/* Header */}
      <header className="mb-6">
        <h2 className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-1">
          Week of {format(startOfWeek(today, { weekStartsOn: 1 }), 'MMM d')}
        </h2>
        <h1 className="text-2xl font-heading font-bold uppercase italic">
          Weekly Plan
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {profile.targetWeightClass} lb class • {weightCategory === 'light' ? '125-141' : weightCategory === 'medium' ? '149-165' : '174-197'} lb category
        </p>
      </header>

      {/* Weight Targets Table */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
          <Scale className="w-4 h-4" /> Weight Targets
        </h3>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-2 text-left font-bold">Day</th>
                  <th className="p-2 text-center font-bold">Target</th>
                  <th className="p-2 text-center font-bold">Logged</th>
                  <th className="p-2 text-center font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const target = weightTargets[day.key as keyof typeof weightTargets];
                  const morningLog = getLoggedWeight(day.dayNum, 'morning');
                  const postLog = getLoggedWeight(day.dayNum, 'post-practice');
                  const relevantLog = day.key === 'wed' || day.key === 'fri' ? postLog : morningLog;
                  const isToday = currentDayOfWeek === day.dayNum;
                  const isPast = (day.dayNum < currentDayOfWeek && currentDayOfWeek !== 0) || (day.dayNum !== 0 && currentDayOfWeek === 0);

                  let status: 'on-track' | 'behind' | 'ahead' | 'none' = 'none';
                  if (relevantLog) {
                    const diff = relevantLog.weight - target.target;
                    if (Math.abs(diff) <= 1) status = 'on-track';
                    else if (diff > 1) status = 'behind';
                    else status = 'ahead';
                  }

                  return (
                    <tr
                      key={day.key}
                      className={cn(
                        "border-t border-muted",
                        isToday && "bg-primary/10"
                      )}
                    >
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span className={cn("font-bold", isToday && "text-primary")}>{day.label}</span>
                          {isToday && <span className="text-[10px] bg-primary text-black px-1 rounded">TODAY</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{target.label}</span>
                      </td>
                      <td className="p-2 text-center">
                        <span className="font-mono font-bold">{target.range}</span>
                      </td>
                      <td className="p-2 text-center">
                        {relevantLog ? (
                          <span className="font-mono font-bold">{relevantLog.weight}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {status === 'on-track' && <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />}
                        {status === 'behind' && <AlertTriangle className="w-4 h-4 text-destructive mx-auto" />}
                        {status === 'ahead' && <CheckCircle2 className="w-4 h-4 text-primary mx-auto" />}
                        {status === 'none' && <Circle className="w-4 h-4 text-muted-foreground/30 mx-auto" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Water Load Schedule */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
          <Droplets className="w-4 h-4" /> Water Load Schedule
        </h3>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-2 text-left font-bold">Day</th>
                  <th className="p-2 text-center font-bold">Amount</th>
                  <th className="p-2 text-center font-bold">Type</th>
                  <th className="p-2 text-center font-bold">Sodium</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const waterAmount = waterLoadSchedule[weightCategory][day.key as keyof typeof waterLoadSchedule.light];
                  const waterInfo = waterTypes[day.key as keyof typeof waterTypes];
                  const isToday = currentDayOfWeek === day.dayNum;

                  return (
                    <tr
                      key={day.key}
                      className={cn(
                        "border-t border-muted",
                        isToday && "bg-primary/10"
                      )}
                    >
                      <td className="p-2">
                        <span className={cn("font-bold", isToday && "text-primary")}>{day.label}</span>
                        {isToday && <span className="text-[10px] bg-primary text-black px-1 rounded ml-1">TODAY</span>}
                      </td>
                      <td className="p-2 text-center">
                        <span className={cn(
                          "font-mono font-bold",
                          day.key === 'wed' && "text-cyan-500",
                          day.key === 'fri' && "text-orange-500"
                        )}>
                          {waterAmount}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded",
                          waterInfo.type === 'Distilled' ? "bg-yellow-500/20 text-yellow-500" : "bg-cyan-500/20 text-cyan-500"
                        )}>
                          {waterInfo.type}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <span className={cn(
                          "text-[10px]",
                          waterInfo.sodium === 'Very Low' && "text-orange-500 font-bold",
                          waterInfo.sodium === 'Low' && "text-yellow-500"
                        )}>
                          {waterInfo.sodium}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-[10px] text-muted-foreground mt-2">
          Peak hydration Wed • Switch to distilled Thu • Sharp cut Fri
        </p>
      </section>

      {/* Weight Class Reference Table */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3">
          Weight Management Targets (All Classes)
        </h3>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-2 text-left font-bold">Class</th>
                  <th className="p-2 text-center font-bold">Walk-Around</th>
                  <th className="p-2 text-center font-bold">Wed PM</th>
                  <th className="p-2 text-center font-bold">Fri PM</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { class: 125, walk: '133-134', wed: '130-131', fri: '127-128' },
                  { class: 133, walk: '141-143', wed: '138-139', fri: '135-136' },
                  { class: 141, walk: '150-151', wed: '147-148', fri: '144-145' },
                  { class: 149, walk: '158-160', wed: '155-156', fri: '152-153' },
                  { class: 157, walk: '167-168', wed: '164-165', fri: '161-162' },
                  { class: 165, walk: '175-177', wed: '172-173', fri: '169-170' },
                  { class: 174, walk: '185-187', wed: '182-183', fri: '178-180' },
                  { class: 184, walk: '196-198', wed: '193-194', fri: '189-191' },
                  { class: 197, walk: '209-211', wed: '206-207', fri: '202-203' },
                ].map((row) => {
                  const isUserClass = row.class === profile.targetWeightClass;
                  return (
                    <tr
                      key={row.class}
                      className={cn(
                        "border-t border-muted",
                        isUserClass && "bg-primary/10"
                      )}
                    >
                      <td className="p-2">
                        <span className={cn("font-bold", isUserClass && "text-primary")}>{row.class}</span>
                        {isUserClass && <span className="text-[10px] bg-primary text-black px-1 rounded ml-1">YOU</span>}
                      </td>
                      <td className="p-2 text-center font-mono">{row.walk}</td>
                      <td className="p-2 text-center font-mono">{row.wed}</td>
                      <td className="p-2 text-center font-mono">{row.fri}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-[10px] text-muted-foreground mt-2">
          Walk-Around = Competition × 1.06-1.07 • Wed PM = Post-Practice • Fri PM = Pre-Practice
        </p>
      </section>

      {/* Checkpoint Rules Summary */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3">
          Checkpoint Rules
        </h3>
        <div className="space-y-3">
          <Card className="p-3 border-muted">
            <h4 className="font-bold text-sm text-primary mb-1">Monday AM (Walk-Around)</h4>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>• Taken hydrated, sets baseline</li>
              <li>• Weight may increase Mon-Wed from water loading</li>
            </ul>
          </Card>

          <Card className="p-3 border-muted">
            <h4 className="font-bold text-sm text-yellow-500 mb-1">Wednesday PM (Post-Practice)</h4>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>• Hit target ±1 lb</li>
              <li>• Still at walk-around? → Behind pace, increase intensity</li>
              <li>• Below target? → Ahead, can eat more Thu-Fri</li>
            </ul>
          </Card>

          <Card className="p-3 border-muted">
            <h4 className="font-bold text-sm text-orange-500 mb-1">Friday PM (Pre-Practice)</h4>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>• Should be Competition + ~3%</li>
              <li>• Final 3% drops from Fri practice + overnight drift</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* Bottom Spacing */}
      <div className="h-20" />
    </MobileLayout>
  );
}
