import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Droplets, Zap, Trophy, Scale, Clock, AlertTriangle,
  Play, Pause, RotateCcw, ChevronRight, CheckCircle2
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export function CompetitionDayTakeover() {
  const { profile, getRehydrationPlan, getFoodLists, addLog, updateProfile } = useStore();
  const [weighInComplete, setWeighInComplete] = useState(false);
  const [weighInWeight, setWeighInWeight] = useState('');
  const [matchCount, setMatchCount] = useState(1);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Calculate rehydration needs based on cut
  const estimatedCut = profile.targetWeightClass * 0.05;
  const plan = getRehydrationPlan(estimatedCut);
  const tournamentFoods = getFoodLists().tournament;

  // Get phase based on time since last match
  const getPhase = () => {
    const mins = Math.floor(elapsed / 60);
    if (mins < 5) return {
      name: 'Immediate Recovery',
      desc: 'Sip electrolytes, catch breath',
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/20',
      priority: 'FLUIDS FIRST'
    };
    if (mins < 15) return {
      name: 'Refuel Window',
      desc: '30-50g fast carbs NOW',
      color: 'text-primary',
      bgColor: 'bg-primary/20',
      priority: 'EAT NOW'
    };
    if (mins < 30) return {
      name: 'Rest & Digest',
      desc: 'Stay warm, stay off feet',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/20',
      priority: 'REST'
    };
    if (mins < 60) return {
      name: 'Ready Zone',
      desc: 'Can compete anytime - stay loose',
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/20',
      priority: 'STAY WARM'
    };
    return {
      name: 'Extended Wait',
      desc: 'Keep sipping, may need another snack',
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/20',
      priority: 'TOP OFF FUEL'
    };
  };

  const phase = getPhase();
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleWeighIn = () => {
    if (weighInWeight) {
      const weight = parseFloat(weighInWeight);
      addLog({
        weight,
        date: new Date(),
        type: 'morning'
      });
      setWeighInComplete(true);
    }
  };

  const startNextMatch = () => {
    setMatchCount(prev => prev + 1);
    setElapsed(0);
    setIsTimerRunning(true);
    setCompletedSteps([]);
  };

  const toggleStep = (step: string) => {
    setCompletedSteps(prev =>
      prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step]
    );
  };

  const exitCompetitionMode = () => {
    updateProfile({ simulatedDate: null });
    window.location.reload();
  };

  // Pre weigh-in view
  if (!weighInComplete) {
    return (
      <div className="min-h-screen bg-background p-4 flex flex-col">
        <header className="mb-6 text-center pt-8">
          <div className="inline-block px-3 py-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-500 text-xs font-bold tracking-widest uppercase mb-4 animate-pulse">
            Competition Day
          </div>
          <h1 className="text-4xl font-heading font-black italic uppercase mb-2">
            WEIGH-IN
          </h1>
          <p className="text-muted-foreground text-sm">
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
        </header>

        <div className="flex-1 space-y-6 max-w-md mx-auto w-full">
          <Card className="border-primary">
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <Scale className="w-12 h-12 text-primary mx-auto mb-3" />
                <h2 className="font-bold text-lg mb-1">Log Your Weigh-In</h2>
                <p className="text-sm text-muted-foreground">
                  Target: {profile.targetWeightClass} lbs
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Your weight"
                  value={weighInWeight}
                  onChange={(e) => setWeighInWeight(e.target.value)}
                  className="text-lg font-mono h-12"
                />
                <span className="text-muted-foreground">lbs</span>
              </div>

              <Button
                onClick={handleWeighIn}
                disabled={!weighInWeight}
                className="w-full h-12 text-lg font-bold"
              >
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Confirm Weight
              </Button>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-yellow-500 mb-1">Pre Weigh-In Reminder</h4>
                  <p className="text-xs text-muted-foreground">
                    Empty bladder before stepping on scale. Remove all jewelry and heavy clothing.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Post weigh-in competition view
  return (
    <div className="min-h-screen bg-background p-4 flex flex-col">
      <header className="mb-4 text-center pt-4">
        <div className="inline-block px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-2">
          Competition Day
        </div>
        <h1 className="text-3xl font-heading font-black italic uppercase">
          <Trophy className="inline w-7 h-7 mr-2 text-yellow-500" />
          MATCH {matchCount}
        </h1>
      </header>

      <div className="flex-1 space-y-4 max-w-md mx-auto w-full">
        {/* Timer Section */}
        <Card className={cn("border-2 transition-colors", phase.bgColor, `border-${phase.color.replace('text-', '')}`)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className={cn("text-[10px] font-bold uppercase", phase.color)}>{phase.name}</span>
                <p className="text-xs text-muted-foreground">{phase.desc}</p>
              </div>
              <span className={cn("px-2 py-1 rounded text-xs font-bold uppercase", phase.bgColor, phase.color)}>
                {phase.priority}
              </span>
            </div>

            <div className="text-center py-4">
              <span className="text-5xl font-mono font-black">{formatTime(elapsed)}</span>
              <p className="text-xs text-muted-foreground mt-1">since last match ended</p>
            </div>

            <div className="flex gap-2 justify-center">
              <Button
                size="sm"
                variant={isTimerRunning ? "outline" : "default"}
                onClick={() => setIsTimerRunning(!isTimerRunning)}
              >
                {isTimerRunning ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                {isTimerRunning ? 'Pause' : 'Start'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setElapsed(0)}
              >
                <RotateCcw className="w-4 h-4 mr-1" /> Reset
              </Button>
              <Button
                size="sm"
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={startNextMatch}
              >
                Next Match <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recovery Checklist */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3">Post-Match Checklist</h3>
            <div className="space-y-2">
              {[
                { id: 'fluids', label: 'Sip electrolyte drink', timing: '0-5 min' },
                { id: 'carbs', label: '30-50g fast carbs', timing: '5-15 min' },
                { id: 'rest', label: 'Stay warm, off feet', timing: '15-30 min' },
                { id: 'warmup', label: 'Light movement if 45+ min wait', timing: '45+ min' }
              ].map((step) => (
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
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                    completedSteps.includes(step.id)
                      ? "bg-green-500 border-green-500"
                      : "border-muted-foreground"
                  )}>
                    {completedSteps.includes(step.id) && <CheckCircle2 className="w-3 h-3 text-black" />}
                  </div>
                  <div className="flex-1">
                    <span className={cn(
                      "text-sm font-medium",
                      completedSteps.includes(step.id) && "line-through text-muted-foreground"
                    )}>{step.label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{step.timing}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Foods Reference */}
        <Card className="border-muted">
          <CardContent className="p-4">
            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary" /> Quick Fuel Options
            </h3>
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {tournamentFoods.slice(0, 8).map((food, i) => (
                <div key={i} className="flex items-center justify-between bg-primary/5 rounded px-2 py-1.5">
                  <span className="text-xs font-medium">{food.name}</span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-muted-foreground">{food.serving}</span>
                    <span className="font-mono text-primary font-bold">{food.carbs}g</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Hydration Reminder */}
        <Card className="border-cyan-500/30 bg-cyan-500/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Droplets className="w-5 h-5 text-cyan-500" />
              <div className="flex-1">
                <span className="text-xs font-bold text-cyan-500">HYDRATION TARGET</span>
                <p className="text-xs text-muted-foreground">
                  {plan.fluidRange} total • Add {plan.sodiumRange} sodium
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Warning */}
        <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              <strong className="text-yellow-500">No plain water.</strong> Always add electrolytes to prevent cramping and hyponatremia.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={exitCompetitionMode}
        >
          Exit Competition Mode
        </Button>
      </div>

      {/* Bottom spacing */}
      <div className="h-4" />
    </div>
  );
}
