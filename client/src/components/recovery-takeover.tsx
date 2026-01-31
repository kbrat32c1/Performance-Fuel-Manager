import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Droplets, Scale, Clock, AlertTriangle, CheckCircle2, TrendingDown } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { format, differenceInHours } from "date-fns";

export function RecoveryTakeover({ onDismiss }: { onDismiss?: () => void }) {
  const { profile, calculateTarget, updateProfile, addLog, logs } = useStore();
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [currentWeight, setCurrentWeight] = useState('');
  const [lastLoggedWeight, setLastLoggedWeight] = useState<number | null>(null);

  // Get the most recent weight log from today
  useEffect(() => {
    const today = profile.simulatedDate || new Date();
    const todayLogs = logs.filter(log => {
      const logDate = new Date(log.date);
      return logDate.getFullYear() === today.getFullYear() &&
             logDate.getMonth() === today.getMonth() &&
             logDate.getDate() === today.getDate();
    });
    if (todayLogs.length > 0) {
      const sorted = todayLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setLastLoggedWeight(sorted[0].weight);
    }
  }, [logs, profile.simulatedDate]);

  const targetWeight = calculateTarget();
  const weighInDate = new Date(profile.weighInDate);
  const now = profile.simulatedDate || new Date();
  const hoursUntilWeighIn = Math.max(0, differenceInHours(weighInDate, now));

  // Calculate how much still needs to be lost
  const displayWeight = lastLoggedWeight || profile.currentWeight;
  const stillToLose = displayWeight > 0 ? Math.max(0, displayWeight - profile.targetWeightClass) : 0;

  const handleLogWeight = () => {
    if (currentWeight) {
      const weight = parseFloat(currentWeight);
      addLog({
        weight,
        date: new Date(),
        type: 'check-in'
      });
      setLastLoggedWeight(weight);
      setCurrentWeight('');
    }
  };

  const toggleStep = (step: string) => {
    setCompletedSteps(prev =>
      prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step]
    );
  };

  const exitMode = () => {
    if (onDismiss) {
      onDismiss();
    } else {
      window.location.reload();
    }
  };

  // Friday pre-weigh-in checklist
  const preWeighInSteps = [
    { id: 'sip', label: 'Sip only - no gulping water', desc: '8-16oz max' },
    { id: 'bladder', label: 'Empty bladder before every weigh', desc: 'Check weight after bathroom' },
    { id: 'fiber', label: 'ZERO fiber consumed', desc: 'No vegetables, fruits, whole grains' },
    { id: 'sweat', label: 'Light sweat session if needed', desc: 'Only if >1lb over target' },
    { id: 'sleep', label: 'Sleep warm - extra blankets', desc: 'Passive sweating overnight' },
  ];

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col">
      <header className="mb-4 text-center pt-4">
        <div className="inline-block px-3 py-1 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-500 text-xs font-bold tracking-widest uppercase mb-2 animate-pulse">
          Final Push
        </div>
        <h1 className="text-3xl font-heading font-black italic uppercase">
          WEIGH-IN EVE
        </h1>
        <p className="text-muted-foreground text-sm">
          {format(now, 'EEEE, MMMM d')}
        </p>
      </header>

      {onDismiss && (
        <div className="max-w-md mx-auto w-full mb-2">
          <button
            onClick={onDismiss}
            className="w-full px-3 py-2 rounded-lg border border-muted text-muted-foreground text-xs font-medium hover:bg-muted/30 transition-colors"
          >
            View Dashboard Instead
          </button>
        </div>
      )}

      <div className="flex-1 space-y-4 max-w-md mx-auto w-full">
        {/* Countdown & Weight Status */}
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <Clock className="w-5 h-5 text-orange-500 mx-auto mb-1" />
                <span className="text-2xl font-mono font-black text-orange-500">{hoursUntilWeighIn}h</span>
                <p className="text-[10px] text-muted-foreground uppercase">Until Weigh-In</p>
              </div>
              <div>
                <TrendingDown className="w-5 h-5 text-primary mx-auto mb-1" />
                <span className={cn(
                  "text-2xl font-mono font-black",
                  stillToLose <= 0 ? "text-green-500" : stillToLose <= 1 ? "text-yellow-500" : "text-orange-500"
                )}>
                  {stillToLose > 0 ? stillToLose.toFixed(1) : '0'}
                </span>
                <p className="text-[10px] text-muted-foreground uppercase">Lbs to Go</p>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-orange-500/20">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current:</span>
                <span className="font-mono font-bold">{displayWeight > 0 ? `${displayWeight.toFixed(1)} lbs` : '--'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Target:</span>
                <span className="font-mono font-bold text-green-500">{profile.targetWeightClass} lbs</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Weight Check */}
        <Card className="border-muted">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Scale className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold uppercase">Quick Weight Check</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.1"
                placeholder="Current weight"
                value={currentWeight}
                onChange={(e) => setCurrentWeight(e.target.value)}
                className="font-mono"
              />
              <Button onClick={handleLogWeight} disabled={!currentWeight}>
                Log
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Weigh yourself frequently - track your progress toward target
            </p>
          </CardContent>
        </Card>

        {/* Pre-Weigh-In Checklist */}
        <Card className="border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-orange-500" /> Pre-Weigh-In Checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {preWeighInSteps.map(step => (
              <button
                key={step.id}
                onClick={() => toggleStep(step.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left",
                  completedSteps.includes(step.id)
                    ? "bg-green-500/10 border-green-500/50"
                    : "bg-muted/30 border-muted hover:border-primary/50"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                  completedSteps.includes(step.id)
                    ? "bg-green-500 border-green-500"
                    : "border-muted-foreground"
                )}>
                  {completedSteps.includes(step.id) && <CheckCircle2 className="w-3 h-3 text-black" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "text-sm font-medium block",
                    completedSteps.includes(step.id) && "line-through text-muted-foreground"
                  )}>{step.label}</span>
                  <span className="text-[10px] text-muted-foreground">{step.desc}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Hydration Warning */}
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Droplets className="w-5 h-5 text-yellow-500 shrink-0" />
              <div>
                <h4 className="font-bold text-sm text-yellow-500 mb-1">SIP ONLY</h4>
                <p className="text-xs text-muted-foreground">
                  Your body is still flushing water from this week's loading. Sipping maintains this effect.
                  Gulping will stop the flush and add scale weight back.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Critical Warning */}
        <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/30">
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-500 mb-1">DO NOT</p>
              <ul className="text-[11px] text-muted-foreground space-y-0.5">
                <li>Eat any fiber (vegetables, fruit, whole grains)</li>
                <li>Drink large amounts of water at once</li>
                <li>Take laxatives or diuretics without coach guidance</li>
                <li>Skip sleep - you lose weight overnight</li>
              </ul>
            </div>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={exitMode}>
          Exit Final Push Mode
        </Button>
      </div>

      <div className="h-4" />
    </div>
  );
}
