import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplets, Zap, CheckCircle, Scale, Clock, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function RecoveryTakeover() {
  const { profile, getRehydrationPlan } = useStore();
  const [weighInWeight, setWeighInWeight] = useState<number | null>(null);
  const [inputWeight, setInputWeight] = useState("");
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  // Calculate lost weight if weigh-in recorded
  const lostWeight = weighInWeight ? Math.max(0, profile.targetWeightClass - weighInWeight + (profile.currentWeight - profile.targetWeightClass)) : 0; 
  // Simplified: Assume they made weight (target class) and current profile weight is the "start" of cut or similar. 
  // Actually, better to just ask for "Weigh In Weight" and assume they cut from `profile.currentWeight`? 
  // Or simpler: Just ask how much they cut?
  // Let's rely on the store's `getRehydrationPlan` which takes `lostWeight`.
  // We'll estimate `lostWeight` as `profile.targetWeightClass * 0.05` (5% cut) if not specified, 
  // but better to ask user.
  
  // For now, let's just use a calculated estimate based on a standard 5% cut if we don't have exact data, 
  // or use the difference between their max recent weight and target.
  const estimatedCut = profile.targetWeightClass * 0.05; 
  const plan = getRehydrationPlan(estimatedCut);

  const steps = [
    { id: 1, title: "Immediate Fluids", desc: `Sip ${plan.fluidRange} of electrolyte solution`, icon: Droplets },
    { id: 2, title: "Fast Carbs", desc: `Consume ${plan.glycogen} immediately`, icon: Zap },
    { id: 3, title: "Wait 20 Mins", desc: "Allow stomach to settle before solid food", icon: Clock },
    { id: 4, title: "Solid Meal", desc: "Lean protein + complex carbs. Low fat.", icon: Scale },
  ];

  const toggleStep = (id: number) => {
    setCompletedSteps(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col">
      <header className="mb-6 text-center pt-8">
        <h1 className="text-3xl font-heading font-black italic uppercase text-primary mb-2 animate-pulse">
          Competition Mode
        </h1>
        <p className="text-muted-foreground text-sm uppercase tracking-widest">
          Recovery Protocol Active
        </p>
      </header>

      <div className="flex-1 space-y-6 max-w-md mx-auto w-full">
        {/* Status Card */}
        <Card className="border-primary bg-primary/5">
           <CardHeader className="pb-2">
             <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wider text-primary">
                <Scale className="w-4 h-4" /> Post Weigh-In Status
             </CardTitle>
           </CardHeader>
           <CardContent>
              <div className="grid grid-cols-2 gap-4 text-center">
                 <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Target Fluids</span>
                    <div className="text-xl font-mono font-bold">{plan.fluidRange}</div>
                 </div>
                 <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Target Sodium</span>
                    <div className="text-xl font-mono font-bold">{plan.sodiumRange}</div>
                 </div>
              </div>
           </CardContent>
        </Card>

        {/* Checklist */}
        <div className="space-y-3">
           <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-widest ml-1">Recovery Checklist</h3>
           {steps.map(step => (
             <div 
               key={step.id}
               onClick={() => toggleStep(step.id)}
               className={cn(
                 "flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                 completedSteps.includes(step.id) 
                    ? "bg-green-500/10 border-green-500/50" 
                    : "bg-card border-muted hover:border-primary/50"
               )}
             >
               <div className={cn(
                 "mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                 completedSteps.includes(step.id)
                    ? "bg-green-500 border-green-500 text-black"
                    : "border-muted-foreground text-transparent"
               )}>
                 <CheckCircle className="w-4 h-4" />
               </div>
               
               <div className="flex-1">
                  <h4 className={cn(
                    "font-bold text-sm uppercase mb-1",
                    completedSteps.includes(step.id) ? "text-green-500 line-through decoration-2" : "text-foreground"
                  )}>
                    {step.title}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {step.desc}
                  </p>
               </div>
               
               <step.icon className={cn(
                  "w-5 h-5",
                  completedSteps.includes(step.id) ? "text-green-500" : "text-muted-foreground"
               )} />
             </div>
           ))}
        </div>

        <div className="mt-8 p-4 bg-muted/20 rounded-lg border border-muted">
           <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
              <div className="space-y-1">
                 <h4 className="text-sm font-bold text-yellow-500 uppercase">Warning</h4>
                 <p className="text-xs text-muted-foreground">
                    Do not consume large amounts of plain water without sodium. This can lead to hyponatremia and cramping.
                 </p>
              </div>
           </div>
        </div>

        <Button className="w-full" variant="outline" onClick={() => window.location.reload()}>
           Exit Recovery Mode (Demo)
        </Button>

      </div>
    </div>
  );
}