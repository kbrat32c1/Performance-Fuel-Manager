import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Clock, Droplets, Utensils, Zap, Calculator } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Recovery() {
  const [elapsed, setElapsed] = useState(0);
  const [active, setActive] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  // Rehydration Calc
  const [weighInWeight, setWeighInWeight] = useState("");
  const { profile, getRehydrationPlan, getFoodLists } = useStore();
  const lostWeight = weighInWeight ? profile.currentWeight - parseFloat(weighInWeight) : 0;
  const plan = getRehydrationPlan(Math.max(0, lostWeight));
  const tournamentFoods = getFoodLists().tournament;

  useEffect(() => {
    let interval: any;
    if (active) {
      interval = setInterval(() => {
        setElapsed(e => e + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [active]);

  const toggleItem = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
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
        <Card className="bg-muted/10 border-primary/20 overflow-hidden relative">
          <div className="absolute inset-0 bg-primary/5 animate-pulse" />
          <CardContent className="p-8 text-center relative z-10">
            <div className="text-6xl font-mono font-bold tracking-tighter mb-4">
              {formatTime(elapsed)}
            </div>
            {!active ? (
              <Button onClick={() => setActive(true)} className="bg-primary text-black font-bold uppercase w-full h-14 text-lg">
                Start Recovery Timer
              </Button>
            ) : (
              <Button onClick={() => { setActive(false); setElapsed(0); }} variant="outline" className="uppercase w-full border-destructive text-destructive hover:bg-destructive/10">
                Stop / Reset
              </Button>
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
              <span className="text-xs text-muted-foreground uppercase font-bold">Match Prep Checklist</span>
              {[
                "Rehydrate (Small sips only)",
                "Simple sugar (Gel/Honey) 20m before match",
                "Keep body warm / Sweat lightly",
                "Mental reset"
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Checkbox id={`bm-${i}`} />
                  <label htmlFor={`bm-${i}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 pt-1">
                    {item}
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
  const isComplete = items.every((i: any) => checklist[i.id]);

  return (
    <div className={cn(
      "border rounded-lg p-4 transition-all duration-300",
      isActive ? "bg-primary/5 border-primary shadow-[0_0_15px_rgba(132,204,22,0.1)] scale-102" : "bg-card border-muted opacity-60",
      isComplete && "opacity-40 bg-muted/20"
    )}>
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="font-heading font-bold text-lg">{title}</h3>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{subtitle}</p>
        </div>
        {isComplete && <Check className="text-primary w-5 h-5" />}
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
