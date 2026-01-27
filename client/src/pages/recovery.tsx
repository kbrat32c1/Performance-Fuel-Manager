import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Clock, Droplets, Utensils, Zap, Calculator, RotateCcw, Play, Pause, FastForward } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Recovery() {
  // Load persisted state from localStorage
  const [elapsed, setElapsed] = useState(() => {
    const saved = localStorage.getItem('pwm-recovery-elapsed');
    const startTime = localStorage.getItem('pwm-recovery-start');
    const isActive = localStorage.getItem('pwm-recovery-active') === 'true';

    if (isActive && startTime) {
      // Calculate elapsed time since start
      const elapsedSinceStart = Math.floor((Date.now() - parseInt(startTime)) / 1000);
      return elapsedSinceStart;
    }
    return saved ? parseInt(saved) : 0;
  });

  const [active, setActive] = useState(() => {
    return localStorage.getItem('pwm-recovery-active') === 'true';
  });

  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('pwm-recovery-checklist');
    return saved ? JSON.parse(saved) : {};
  });

  const [matchPrepChecklist, setMatchPrepChecklist] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('pwm-match-prep-checklist');
    return saved ? JSON.parse(saved) : {};
  });

  // Rehydration Calc
  const [weighInWeight, setWeighInWeight] = useState(() => {
    return localStorage.getItem('pwm-recovery-weighin') || "";
  });
  const { profile, getRehydrationPlan, getFoodLists } = useStore();
  const lostWeight = weighInWeight ? profile.currentWeight - parseFloat(weighInWeight) : 0;
  const plan = getRehydrationPlan(Math.max(0, lostWeight));
  const tournamentFoods = getFoodLists().tournament;

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem('pwm-recovery-checklist', JSON.stringify(checklist));
  }, [checklist]);

  useEffect(() => {
    localStorage.setItem('pwm-match-prep-checklist', JSON.stringify(matchPrepChecklist));
  }, [matchPrepChecklist]);

  useEffect(() => {
    localStorage.setItem('pwm-recovery-weighin', weighInWeight);
  }, [weighInWeight]);

  useEffect(() => {
    localStorage.setItem('pwm-recovery-active', active.toString());
    if (active) {
      // Store the start time when timer becomes active
      const existingStart = localStorage.getItem('pwm-recovery-start');
      if (!existingStart) {
        localStorage.setItem('pwm-recovery-start', (Date.now() - elapsed * 1000).toString());
      }
    } else {
      // Clear start time when paused so it can be recalculated on resume
      localStorage.removeItem('pwm-recovery-start');
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let interval: any;
    if (active) {
      interval = setInterval(() => {
        setElapsed(e => {
          const newVal = e + 1;
          localStorage.setItem('pwm-recovery-elapsed', newVal.toString());
          return newVal;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [active]);

  const toggleItem = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleMatchPrepItem = (id: string) => {
    setMatchPrepChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <MobileLayout>
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-heading font-black italic uppercase text-primary">Recovery Mode</h1>
          <p className="text-muted-foreground">Post Weigh-In Protocol</p>
        </div>

        {/* Timer Card */}
        <Card className="bg-muted/10 border-primary/20 overflow-hidden relative" role="timer" aria-label="Recovery timer">
          {active && <div className="absolute inset-0 bg-primary/5 animate-pulse" aria-hidden="true" />}
          <CardContent className="p-8 text-center relative z-10">
            <div
              className="text-6xl font-mono font-bold tracking-tighter mb-4"
              aria-live="polite"
              aria-atomic="true"
            >
              {formatTime(elapsed)}
            </div>
            {elapsed === 0 && !active ? (
              <Button
                onClick={() => setActive(true)}
                className="bg-primary text-black font-bold uppercase w-full h-14 text-lg"
                aria-label="Start recovery timer"
              >
                <Play className="w-5 h-5 mr-2" aria-hidden="true" /> Start Recovery Timer
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={() => setActive(!active)}
                  className={cn(
                    "flex-1 h-14 text-lg font-bold uppercase",
                    active
                      ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                      : "bg-primary hover:bg-primary/90 text-black"
                  )}
                  aria-label={active ? "Pause recovery timer" : "Resume recovery timer"}
                >
                  {active ? <><Pause className="w-5 h-5 mr-2" aria-hidden="true" /> Pause</> : <><Play className="w-5 h-5 mr-2" aria-hidden="true" /> Resume</>}
                </Button>
                <Button
                  onClick={() => {
                    setActive(false);
                    setElapsed(0);
                    setChecklist({});
                    localStorage.removeItem('pwm-recovery-start');
                    localStorage.removeItem('pwm-recovery-elapsed');
                    localStorage.removeItem('pwm-recovery-checklist');
                  }}
                  variant="outline"
                  className="h-14 px-4 border-destructive text-destructive hover:bg-destructive/10"
                  aria-label="Reset recovery timer and checklist"
                >
                  <RotateCcw className="w-5 h-5" aria-hidden="true" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rehydration Calculator */}
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-cyan-500 uppercase tracking-wider">
              <Calculator className="w-4 h-4" /> Rehydration Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex items-end gap-4">
               <div className="space-y-1.5 flex-1">
                 <Label className="text-xs">Weigh-In Weight</Label>
                 <Input 
                   type="number" 
                   placeholder="157.0" 
                   value={weighInWeight} 
                   onChange={(e) => setWeighInWeight(e.target.value)}
                   className="font-mono text-lg bg-background"
                 />
               </div>
               <div className="space-y-1.5 flex-1 text-right">
                  <Label className="text-xs text-muted-foreground">Est. Loss</Label>
                  <div className="font-mono text-lg font-bold">{lostWeight > 0 ? `${lostWeight.toFixed(1)} lbs` : "--"}</div>
               </div>
             </div>

             {lostWeight > 0 && (
               <div className="grid grid-cols-2 gap-3 pt-2 border-t border-cyan-500/20">
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block">Fluids (1st 2-4hrs)</span>
                    <span className="text-xl font-mono font-bold text-cyan-500">{plan.fluidRange}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block">Sodium</span>
                    <span className="text-xl font-mono font-bold text-white">{plan.sodiumRange}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] uppercase text-muted-foreground block">Immediate Glycogen</span>
                    <span className="text-sm font-medium text-primary">{plan.glycogen}</span>
                  </div>
               </div>
             )}
          </CardContent>
        </Card>

        {/* Checklists */}
        <div className="space-y-4">
          <RecoveryPhase 
            id="p1"
            title="0–15 Minutes"
            subtitle="Immediate Hydration"
            isActive={elapsed < 900}
            items={[
              { id: 'c1', text: "Sip 16-24oz Water + Electrolytes" },
              { id: 'c2', text: "No gulping (avoids bloating)" },
              { id: 'c3', text: "Check weight drift baseline" }
            ]}
            checklist={checklist}
            onToggle={toggleItem}
          />

          <RecoveryPhase 
            id="p2"
            title="15–30 Minutes"
            subtitle="Gut Activation"
            isActive={elapsed >= 900 && elapsed < 1800}
            items={[
              { id: 'c4', text: "Simple Carbs (Fruit, Honey, Gel)" },
              { id: 'c5', text: "Easy to digest foods only" },
              { id: 'c6', text: "Avoid fat/fiber right now" }
            ]}
            checklist={checklist}
            onToggle={toggleItem}
          />

          <RecoveryPhase 
            id="p3"
            title="30–60 Minutes"
            subtitle="Refuel & Stabilize"
            isActive={elapsed >= 1800 && elapsed < 3600}
            items={[
              { id: 'c7', text: "Complex Meal (Carbs + Protein)" },
              { id: 'c8', text: "Continue sipping fluids" },
              { id: 'c9', text: "Sodium intake (Salty foods ok)" }
            ]}
            checklist={checklist}
            onToggle={toggleItem}
          />
          
          <RecoveryPhase 
            id="p4"
            title="60–120 Minutes"
            subtitle="Performance Prep"
            isActive={elapsed >= 3600}
            items={[
              { id: 'c10', text: "Rest / Nap if possible" },
              { id: 'c11', text: "Visualisation / Mental Prep" }
            ]}
            checklist={checklist}
            onToggle={toggleItem}
          />
        </div>

        {/* Between Match Fueling */}
        <div className="mt-8 pt-6 border-t border-muted">
           <h3 className="font-heading font-bold text-xl uppercase mb-4 flex items-center gap-2">
             <Zap className="w-5 h-5 text-primary" /> Between Matches
           </h3>

           {/* Between Matches Timer */}
           <div className="mb-4">
             <BetweenMatchesTimer />
           </div>

           {/* Tournament Foods List */}
           <Card className="border-primary/20 bg-primary/5 mb-4">
             <CardHeader className="pb-2">
               <CardTitle className="text-sm text-primary uppercase tracking-wider flex items-center gap-2">
                 <Utensils className="w-4 h-4" /> Quick Fueling Options
               </CardTitle>
             </CardHeader>
             <CardContent className="space-y-2">
               {tournamentFoods.map((food, i) => (
                 <div key={i} className="flex items-center justify-between bg-background/50 rounded px-3 py-2">
                   <div className="flex-1">
                     <span className="text-sm font-medium">{food.name}</span>
                     <span className="text-[10px] text-muted-foreground ml-2">({food.serving})</span>
                   </div>
                   <div className="flex items-center gap-3 text-xs">
                     <span className="font-mono text-primary font-bold">{food.carbs}g</span>
                     <span className="text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{food.timing}</span>
                   </div>
                 </div>
               ))}
               <p className="text-[10px] text-muted-foreground pt-2 border-t border-muted">
                 Target: 30-50g carbs/hour • 16-24oz electrolyte drink/hour • No chugging
               </p>
             </CardContent>
           </Card>

           {/* Checklist */}
           <div className="bg-card border border-muted rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase font-bold">Match Prep Checklist</span>
                {Object.values(matchPrepChecklist).some(v => v) && (
                  <button
                    onClick={() => setMatchPrepChecklist({})}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    aria-label="Reset match prep checklist"
                  >
                    Reset
                  </button>
                )}
              </div>
              {[
                { id: 'mp-rehydrate', text: "Rehydrate (Small sips only)" },
                { id: 'mp-sugar', text: "Simple sugar (Gel/Honey) 20m before match" },
                { id: 'mp-warm', text: "Keep body warm / Sweat lightly" },
                { id: 'mp-mental', text: "Mental reset" }
              ].map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <Checkbox
                    id={item.id}
                    checked={matchPrepChecklist[item.id] || false}
                    onCheckedChange={() => toggleMatchPrepItem(item.id)}
                    className="mt-0.5 data-[state=checked]:bg-primary data-[state=checked]:text-black border-primary/50"
                  />
                  <label
                    htmlFor={item.id}
                    className={cn(
                      "text-sm font-medium leading-tight cursor-pointer transition-colors pt-0.5",
                      matchPrepChecklist[item.id] ? "text-muted-foreground line-through" : "text-foreground"
                    )}
                  >
                    {item.text}
                  </label>
                </div>
              ))}
           </div>
        </div>
      </div>
    </MobileLayout>
  );
}

function RecoveryPhase({ id, title, subtitle, isActive, items, checklist, onToggle }: any) {
  const completedCount = items.filter((i: any) => checklist[i.id]).length;
  const totalCount = items.length;
  const isComplete = completedCount === totalCount;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div
      className={cn(
        "border rounded-lg p-4 transition-all duration-300",
        isActive ? "bg-primary/5 border-primary shadow-[0_0_15px_rgba(132,204,22,0.1)] scale-102" : "bg-card border-muted opacity-60",
        isComplete && "opacity-40 bg-muted/20"
      )}
      role="region"
      aria-label={`${title} recovery phase`}
    >
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="font-heading font-bold text-lg">{title}</h3>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-mono font-bold",
              isComplete ? "text-primary" : "text-muted-foreground"
            )}
            aria-label={`${completedCount} of ${totalCount} tasks completed`}
          >
            {completedCount}/{totalCount}
          </span>
          {isComplete && <Check className="text-primary w-5 h-5" aria-label="Phase complete" />}
        </div>
      </div>

      {/* Progress Bar */}
      <div
        className="h-1.5 bg-muted rounded-full mb-3 overflow-hidden"
        role="progressbar"
        aria-valuenow={completedCount}
        aria-valuemin={0}
        aria-valuemax={totalCount}
        aria-label={`${title} progress: ${completedCount} of ${totalCount} tasks`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            isComplete ? "bg-primary" : isActive ? "bg-primary/70" : "bg-muted-foreground/30"
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id} className="flex items-start gap-3">
            <Checkbox
              id={item.id}
              checked={checklist[item.id] || false}
              onCheckedChange={() => onToggle(item.id)}
              className="mt-0.5 data-[state=checked]:bg-primary data-[state=checked]:text-black border-primary/50"
            />
            <label
              htmlFor={item.id}
              className={cn(
                "text-sm font-medium leading-tight cursor-pointer transition-colors",
                checklist[item.id] ? "text-muted-foreground line-through" : "text-foreground"
              )}
            >
              {item.text}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// Between matches timer - flexible timing (30min minimum, but could be hours)
function BetweenMatchesTimer() {
  const [elapsed, setElapsed] = useState(() => {
    const saved = localStorage.getItem('pwm-match-timer-elapsed');
    const startTime = localStorage.getItem('pwm-match-timer-start');
    const isActive = localStorage.getItem('pwm-match-timer-active') === 'true';

    if (isActive && startTime) {
      const elapsedSinceStart = Math.floor((Date.now() - parseInt(startTime)) / 1000);
      return elapsedSinceStart;
    }
    return saved ? parseInt(saved) : 0;
  });

  const [active, setActive] = useState(() => {
    return localStorage.getItem('pwm-match-timer-active') === 'true';
  });

  const [matchCount, setMatchCount] = useState(() => {
    const saved = localStorage.getItem('pwm-match-count');
    return saved ? parseInt(saved) : 1;
  });

  // Persist state
  useEffect(() => {
    localStorage.setItem('pwm-match-timer-active', active.toString());
    if (active) {
      const existingStart = localStorage.getItem('pwm-match-timer-start');
      if (!existingStart) {
        localStorage.setItem('pwm-match-timer-start', (Date.now() - elapsed * 1000).toString());
      }
    } else {
      // Clear start time when paused so it can be recalculated on resume
      localStorage.removeItem('pwm-match-timer-start');
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('pwm-match-count', matchCount.toString());
  }, [matchCount]);

  useEffect(() => {
    let interval: any;
    if (active) {
      interval = setInterval(() => {
        setElapsed(e => {
          const newVal = e + 1;
          localStorage.setItem('pwm-match-timer-elapsed', newVal.toString());
          return newVal;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [active]);

  // Get current phase based on elapsed time - phases adjust based on time since last match
  const getPhase = () => {
    const mins = Math.floor(elapsed / 60);
    if (mins < 5) return { name: 'Immediate Recovery', desc: 'Sip fluids, cool down, catch breath', color: 'text-cyan-500', bgColor: 'bg-cyan-500/20', priority: 'Fluids first' };
    if (mins < 15) return { name: 'Refuel Window', desc: '30-50g fast carbs + electrolytes', color: 'text-primary', bgColor: 'bg-primary/20', priority: 'Eat NOW' };
    if (mins < 30) return { name: 'Rest & Digest', desc: 'Stay warm, stay off feet', color: 'text-purple-500', bgColor: 'bg-purple-500/20', priority: 'Rest' };
    if (mins < 60) return { name: 'Ready Zone', desc: 'Can compete anytime - stay loose', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', priority: 'Stay warm' };
    return { name: 'Extended Wait', desc: 'Keep sipping, may need another snack', color: 'text-orange-500', bgColor: 'bg-orange-500/20', priority: 'Top off fuel' };
  };

  const phase = getPhase();

  const formatTime = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetTimer = () => {
    setActive(false);
    setElapsed(0);
    localStorage.removeItem('pwm-match-timer-start');
    localStorage.removeItem('pwm-match-timer-elapsed');
  };

  const nextMatch = () => {
    setMatchCount(c => c + 1);
    setElapsed(0);
    setActive(true);
    localStorage.setItem('pwm-match-timer-start', Date.now().toString());
    localStorage.setItem('pwm-match-timer-elapsed', '0');
  };

  const resetAll = () => {
    resetTimer();
    setMatchCount(1);
    localStorage.removeItem('pwm-match-count');
  };

  return (
    <Card className="border-orange-500/20 bg-orange-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-orange-500 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4" /> Time Since Match
          </CardTitle>
          <span className="text-xs bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded font-bold">
            Match #{matchCount}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Phase */}
        <div className={cn("rounded-lg p-3", phase.bgColor)}>
          <div className="flex items-center justify-between">
            <div className={cn("font-bold text-lg", phase.color)}>{phase.name}</div>
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded", phase.bgColor, phase.color)}>
              {phase.priority}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">{phase.desc}</div>
        </div>

        {/* Timer Display */}
        <div className="text-center">
          <div className="text-4xl font-mono font-bold tracking-tight">
            {formatTime(elapsed)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            since last match ended
          </div>
        </div>

        {/* Phase Timeline - Visual Guide */}
        <div className="space-y-1">
          <div className="flex gap-1">
            <div className={cn("flex-[5] h-2 rounded-l", elapsed >= 0 ? "bg-cyan-500" : "bg-muted")} />
            <div className={cn("flex-[10] h-2", elapsed >= 300 ? "bg-primary" : "bg-muted")} />
            <div className={cn("flex-[15] h-2", elapsed >= 900 ? "bg-purple-500" : "bg-muted")} />
            <div className={cn("flex-[30] h-2", elapsed >= 1800 ? "bg-yellow-500" : "bg-muted")} />
            <div className={cn("flex-[40] h-2 rounded-r", elapsed >= 3600 ? "bg-orange-500" : "bg-muted")} />
          </div>
          <div className="flex justify-between text-[8px] text-muted-foreground px-1">
            <span>0</span>
            <span>5m</span>
            <span>15m</span>
            <span>30m</span>
            <span>60m+</span>
          </div>
        </div>

        {/* Quick Tips Based on Time */}
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
          {elapsed < 300 && "Minimum 30 min between matches. Focus on recovery first."}
          {elapsed >= 300 && elapsed < 900 && "Get carbs in NOW. This is your best absorption window."}
          {elapsed >= 900 && elapsed < 1800 && "Food is digesting. Stay warm, stay calm."}
          {elapsed >= 1800 && elapsed < 3600 && "You're ready. Light movement to stay loose."}
          {elapsed >= 3600 && "Long wait - consider another 20-30g carbs if hungry."}
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          {!active ? (
            <Button
              onClick={() => setActive(true)}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold"
            >
              <Play className="w-4 h-4 mr-2" /> Start Timer
            </Button>
          ) : (
            <Button
              onClick={() => setActive(false)}
              variant="outline"
              className="flex-1 border-orange-500 text-orange-500"
            >
              <Pause className="w-4 h-4 mr-2" /> Pause
            </Button>
          )}
          <Button
            onClick={nextMatch}
            variant="outline"
            className="border-primary text-primary"
          >
            <FastForward className="w-4 h-4 mr-1" /> Next Match
          </Button>
          <Button
            onClick={resetAll}
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        {/* Minimum Rest Warning */}
        {active && elapsed < 1800 && (
          <div className="text-[10px] text-yellow-500 text-center font-medium">
            Minimum 30 minutes rest required between matches
          </div>
        )}
      </CardContent>
    </Card>
  );
}
