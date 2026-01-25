import { WeeklyTimeline } from "@/components/weekly-timeline";
import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplets, Zap, User, Dumbbell, AlertTriangle, CheckCircle, Flame, Ban, Utensils, Settings, Megaphone, Calendar, ArrowRight, ChevronDown, ChevronUp, Scale, Clock, Info, Target, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeightChart } from "@/components/weight-chart";
import { RecoveryTakeover } from "@/components/recovery-takeover";

export default function Dashboard() {
  const { profile, calculateTarget, fuelTanks, getPhase, getTodaysFocus, isAdvancedAllowed, getHydrationTarget, getFuelingGuide, updateProfile, getCheckpoints, getCoachMessage, getNextSteps, logs, getNextTarget, getDriftMetrics } = useStore();
  const targetWeight = calculateTarget();
  const diff = profile.currentWeight - targetWeight;
  const isOver = diff > 0;
  
  // Hydration Tracking State
  const hydration = getHydrationTarget();
  // Parse target from string (e.g. "1.5 gal" or "100-115 oz") - very rough logic for prototype
  // Assuming simpler display for tracking
  const [loggedWater, setLoggedWater] = useState(0); 
  // Reset logged water daily (mock)
  useEffect(() => { setLoggedWater(0); }, [profile.simulatedDate]);
  
  const targetWaterOz = 128; // Default to 1 gal for visualization if not parsed
  const hydrationPercent = Math.min(100, (loggedWater / targetWaterOz) * 100);

  const phase = getPhase();
  const displayDate = profile.simulatedDate || new Date();
  
  // Weigh-in Day Takeover
  if (phase === 'last-24h') {
     return <RecoveryTakeover />;
  }

  const focus = getTodaysFocus();
  const fuel = getFuelingGuide();
  const checkpoints = getCheckpoints();
  const coach = getCoachMessage();
  const nextSteps = getNextSteps();
  const nextTarget = getNextTarget();
  const drift = getDriftMetrics();
  
  const showFiberWarning = phase === 'transition' || phase === 'performance-prep';
  
  // Guidance Level Logic
  const showFuelTanks = profile.guidanceLevel !== 'beginner';
  const showAdvancedDetails = profile.guidanceLevel === 'advanced';

  return (
    <MobileLayout>
      {/* 1. COMPACT PHASE RIBBON */}
      <CompactPhaseRibbon phase={phase} />
      
      {/* Demo Warning Banner */}
      {profile.simulatedDate && (
          <div className="bg-yellow-500/20 text-yellow-500 text-[10px] font-bold uppercase text-center py-1 -mx-4 mb-4 animate-pulse">
              ⚠️ Demo Mode Active: {format(displayDate, 'EEEE')}
          </div>
      )}

      <header className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-1">
            {format(displayDate, 'EEEE, MMM d')}
          </h2>
          <h1 className="text-2xl font-heading font-bold uppercase italic flex flex-col">
            <span>Hi, {profile.name}</span>
            <span className="text-xs text-primary not-italic font-sans font-medium opacity-80 mt-0.5">
               {profile.protocol === '1' ? 'Track A' : profile.protocol === '2' ? 'Track B' : profile.protocol === '3' ? 'Track C' : 'Track D'} • {phase.replace('-', ' ')}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
           <SettingsDialog profile={profile} updateProfile={updateProfile} />
           <SystemPhilosophyDialog guidanceLevel={profile.guidanceLevel} />
           <div className={cn("w-2 h-2 rounded-full mt-1", profile.status === 'on-track' ? 'bg-primary' : 'bg-destructive')} />
        </div>
      </header>

      {/* 2. NEXT TARGET LINE */}
      {nextTarget && (
        <div className="bg-muted/20 border-y border-muted -mx-4 px-4 py-2 mb-4 flex items-center justify-between">
           <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              <Target className="w-3.5 h-3.5 text-primary" />
              <span>{nextTarget.label} Target: <span className="text-primary text-sm">{nextTarget.weight.toFixed(1)}</span></span>
           </div>
           <span className="text-[10px] text-muted-foreground hidden sm:inline-block">{nextTarget.description}</span>
        </div>
      )}

      <div className="space-y-6">
        
        {/* Weekly Timeline */}
        <WeeklyTimeline currentDay={displayDate.getDay()} />

        {/* 3. STATUS SECTION (Now Top Priority) */}
        <div className="grid grid-cols-2 gap-4">
           {/* Current Weight Card */}
           <Card className="bg-card border-muted relative overflow-hidden flex flex-col justify-between">
             <CardContent className="p-4 pt-5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block mb-1">Current Weight</span>
                <div className="flex items-baseline gap-1">
                   <span className="text-3xl font-heading font-black italic tracking-tighter">{profile.currentWeight.toFixed(1)}</span>
                   <span className="text-xs font-mono text-muted-foreground">lbs</span>
                </div>
                <div className={cn("text-xs font-bold mt-1 flex items-center gap-1", isOver ? "text-destructive" : "text-primary")}>
                   {isOver ? '+' : ''}{diff.toFixed(1)} <span className="opacity-70 font-normal">from target</span>
                </div>
             </CardContent>
           </Card>

           {/* Hydration Tracker Card */}
           <Card className="bg-cyan-500/5 border-cyan-500/20 flex flex-col justify-between relative overflow-hidden">
              <CardContent className="p-4 pt-4 pb-3">
                 <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] text-cyan-500 uppercase font-bold tracking-wider">Hydration</span>
                    <div className="text-[10px] font-mono font-bold text-foreground">{hydration.amount}</div>
                 </div>
                 
                 {/* Progress Bar */}
                 <div className="h-2 w-full bg-cyan-950/30 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${hydrationPercent}%` }} />
                 </div>

                 <div className="flex justify-between gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 border-cyan-500/30 hover:bg-cyan-500/20 hover:text-cyan-400" onClick={() => setLoggedWater(Math.max(0, loggedWater - 8))}>
                       <Minus className="w-3 h-3" />
                    </Button>
                    <div className="text-xs font-mono font-bold pt-1">{loggedWater} oz</div>
                    <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 border-cyan-500/30 hover:bg-cyan-500/20 hover:text-cyan-400" onClick={() => setLoggedWater(loggedWater + 8)}>
                       <Plus className="w-3 h-3 mr-1" /> 8oz
                    </Button>
                 </div>
              </CardContent>
           </Card>
        </div>

        {/* 4. TODAY'S MISSION (Above the fold on mobile) */}
        <Card className="border-l-4 border-l-primary bg-muted/5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
             <Flame className="w-24 h-24" />
          </div>
          <CardHeader className="pb-2 pt-5">
             <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
               <Zap className="w-4 h-4 text-primary" /> Today's Mission
             </CardTitle>
          </CardHeader>
          <CardContent className="pb-5 relative z-10">
            <h3 className="font-heading font-black italic text-2xl uppercase leading-none mb-4">{focus.title}</h3>
            
            {/* Expandable Why */}
            <div className="mb-4 text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
               "This phase protects power by controlling gut content and glycogen timing."
            </div>

            <ul className="space-y-3">
              {focus.actions.map((action, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {i + 1}
                  </div>
                  <span className="font-medium text-sm leading-snug">{action}</span>
                </li>
              ))}
            </ul>

            {focus.warning && (
               <div className="mt-4 flex items-center gap-2 text-destructive text-xs font-bold uppercase bg-destructive/10 p-2 rounded">
                  <AlertTriangle className="w-4 h-4" /> {focus.warning}
               </div>
            )}
          </CardContent>
        </Card>

        {/* LOGS & METRICS SECTION (Pushed down) */}
        
        {/* Fuel Guide */}
        {showFiberWarning ? (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
             <div className="flex items-center gap-2 mb-3 text-orange-500 font-bold text-sm uppercase tracking-wider">
               <Ban className="w-4 h-4" /> Fiber Elimination Active
             </div>
             <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <span className="text-muted-foreground block font-bold text-[10px] uppercase">AVOID (Blockers)</span>
                  <div className="flex flex-wrap gap-1.5">
                     {fuel.avoid.map((f, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-500 text-[10px] uppercase font-bold border border-orange-500/20">
                           {f}
                        </span>
                     ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-muted-foreground block font-bold text-[10px] uppercase">ALLOWED (Fuel)</span>
                   <div className="flex flex-wrap gap-1.5">
                     {fuel.allowed.map((f, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] uppercase font-bold border border-primary/20">
                           {f}
                        </span>
                     ))}
                  </div>
                </div>
             </div>
          </div>
        ) : (
          <Card className="border-muted">
             <CardHeader className="py-3 border-b border-muted/50">
                <CardTitle className="flex items-center justify-between">
                   <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                     <Utensils className="w-3.5 h-3.5" /> Fueling: {fuel.ratio}
                   </div>
                </CardTitle>
             </CardHeader>
             <CardContent className="pt-4">
               {/* Chips for Allowed Foods */}
               <div className="flex flex-wrap gap-2 mb-4">
                  {fuel.allowed.map((f, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-muted text-[10px] uppercase font-bold text-foreground border border-border">
                       {f}
                    </span>
                  ))}
               </div>

               <div className="grid grid-cols-2 gap-2 text-xs border-t border-muted pt-3">
                  <div className="text-center border-r border-muted">
                     <span className="block text-[10px] uppercase text-muted-foreground font-bold mb-0.5">Protein</span>
                     <span className="font-mono font-bold text-foreground">{fuel.protein || "N/A"}</span>
                  </div>
                  <div className="text-center">
                     <span className="block text-[10px] uppercase text-muted-foreground font-bold mb-0.5">Carbs</span>
                     <span className="font-mono font-bold text-foreground">{fuel.carbs || "N/A"}</span>
                  </div>
               </div>
             </CardContent>
          </Card>
        )}

        {/* Fuel Tanks - Progressive Disclosure */}
        {showFuelTanks && (
           <section className="space-y-3 pt-2">
             <div className="flex items-center justify-between">
                <h3 className="font-heading font-bold text-lg uppercase">Fuel Tanks</h3>
                <span className="text-[10px] uppercase bg-muted px-2 py-0.5 rounded text-muted-foreground font-bold">
                   Intermediate
                </span>
             </div>
             
             {/* Simple Explanation for Intermediate */}
             <p className="text-xs text-muted-foreground">
                Scale movement today is likely from <span className="text-chart-3 font-bold">Gut Content</span> + <span className="text-chart-1 font-bold">Glycogen</span>.
             </p>

             <div className="space-y-4">
               <FuelBar label="Water" icon={Droplets} value={fuelTanks.water} max={8} color="bg-chart-2" desc="Hydration" />
               <FuelBar label="Glycogen" icon={Zap} value={fuelTanks.glycogen} max={1.5} color="bg-chart-1" desc="Energy" />
               {showAdvancedDetails && (
                 <>
                   <FuelBar label="Gut Content" icon={User} value={fuelTanks.gut} max={2.5} color="bg-chart-3" desc="Digesting" />
                   <FuelBar label="Body Fat" icon={Flame} value={fuelTanks.fat} max={15} color="bg-chart-4" desc="Expendable" />
                   <FuelBar label="Muscle" icon={Dumbbell} value={fuelTanks.muscle} max={160} color="bg-chart-5" desc="Protected" isStatic />
                 </>
               )}
             </div>
           </section>
        )}
        
        {/* Weight Chart with Real Data */}
        <WeightChart />

        {/* Coach Message (Secondary) */}
        <div className={cn(
            "rounded-lg p-3 border flex items-start gap-3 text-sm",
            coach.status === 'danger' ? "bg-destructive/10 border-destructive text-destructive" :
            coach.status === 'warning' ? "bg-orange-500/10 border-orange-500 text-orange-500" :
            coach.status === 'success' ? "bg-green-500/10 border-green-500 text-green-500" :
            "bg-blue-500/10 border-blue-500 text-blue-500"
        )}>
            <Megaphone className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
                <h3 className="font-bold uppercase text-xs mb-0.5">{coach.title}</h3>
                <p className="opacity-90 leading-snug text-xs">{coach.message}</p>
            </div>
        </div>

        {/* Quick Log Action */}
        <QuickLogModal lastLog={logs[0]} />

      </div>
    </MobileLayout>
  );
}

function CompactPhaseRibbon({ phase }: { phase: string }) {
    // 5-step compact ribbon
    const steps = [
        { id: 'metabolic', label: 'Load', days: 'M-W' },
        { id: 'transition', label: 'Cut', days: 'Thu' },
        { id: 'performance-prep', label: 'Prep', days: 'Fri' },
        { id: 'last-24h', label: 'Race', days: 'Sat' },
    ];

    return (
        <div className="flex items-stretch justify-between bg-muted/20 border-b border-muted py-2 px-2 -mx-4 -mt-4 mb-4 gap-1">
            {steps.map(step => {
                const isActive = phase === step.id;
                return (
                    <Dialog key={step.id}>
                        <DialogTrigger asChild>
                            <div className={cn(
                                "flex-1 text-center py-1.5 rounded cursor-pointer transition-all",
                                isActive ? "bg-primary text-black shadow-sm" : "text-muted-foreground hover:bg-muted/40"
                            )}>
                                <div className="text-[9px] font-bold uppercase tracking-wider leading-none mb-0.5">{step.days}</div>
                                <div className="text-[10px] font-bold uppercase leading-none">{step.label}</div>
                            </div>
                        </DialogTrigger>
                        <DialogContent className="w-[90%] rounded-xl">
                            <DialogHeader>
                                <DialogTitle className="uppercase font-heading italic">Phase Rules: {step.label}</DialogTitle>
                            </DialogHeader>
                            <div className="py-2 text-sm">
                                <p className="text-muted-foreground mb-4">Specific nutritional and training guidelines for the {step.label} phase.</p>
                                {/* Placeholder for specific phase rules content */}
                                <div className="p-3 bg-muted/30 rounded text-xs font-mono">
                                    Tap-to-reveal rules would go here for {step.label} phase.
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                );
            })}
        </div>
    );
}

function FuelBar({ label, icon: Icon, value, max, color, desc, isStatic }: any) {
  const percent = Math.min(100, (value / max) * 100);
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-end text-xs">
        <div className="flex items-center gap-1.5 text-foreground font-bold uppercase">
          <Icon className="w-3.5 h-3.5" /> {label}
        </div>
        <div className="font-mono text-muted-foreground">{value} lbs <span className="opacity-50">/ {desc}</span></div>
      </div>
      <div className="h-2.5 w-full bg-muted/30 rounded-full overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all duration-1000", color)} 
          style={{ width: `${isStatic ? 100 : percent}%` }} 
        />
      </div>
    </div>
  );
}

function QuickLogModal({ lastLog }: { lastLog?: any }) {
  const [weight, setWeight] = useState('');
  const [type, setType] = useState('morning');
  const [urine, setUrine] = useState(1);
  const { addLog } = useStore();
  const [open, setOpen] = useState(false);

  // Smart Prompt Logic
  const getMicroPrompt = () => {
    if (!lastLog) return "Log your first weigh-in";
    const lastDate = new Date(lastLog.date);
    const now = new Date();
    const isToday = lastDate.getDate() === now.getDate();
    
    if (lastLog.type === 'morning' && isToday) return "Next: Log Pre-Practice Weight";
    if (lastLog.type === 'pre-practice' && isToday) return "Next: Log Post-Practice Weight";
    if (lastLog.type === 'post-practice') return "Next: Log Morning Weight to see overnight drift";
    
    return "Log Morning Weight to unlock trends";
  };

  const handleSubmit = () => {
    if (weight) {
      addLog({
        weight: parseFloat(weight),
        date: new Date(),
        type: type as any,
        urineColor: urine
      });
      setOpen(false);
      setWeight('');
      setType('morning');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="fixed bottom-20 right-6 left-6 z-40">
           <Button className="w-full h-11 text-sm font-bold uppercase tracking-wider bg-primary text-black shadow-lg shadow-primary/20 hover:bg-primary/90 animate-in slide-in-from-bottom-4 flex flex-col items-center justify-center gap-0 leading-tight py-0.5">
             <span>+ Quick Log</span>
             <span className="text-[9px] font-normal opacity-70 normal-case tracking-normal">{getMicroPrompt()}</span>
           </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="bg-card border-muted w-[90%] rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase italic text-2xl">Log Weight</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          
          <div className="space-y-2">
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Weight (lbs)</Label>
            <Input 
              type="number" 
              className="text-4xl font-heading font-black italic h-20 text-center bg-muted/20 border-muted focus:border-primary" 
              placeholder="0.0" 
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
             <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Log Type</Label>
             <div className="grid grid-cols-3 gap-2">
                {['morning', 'pre-practice', 'post-practice'].map(t => (
                   <button
                     key={t}
                     onClick={() => setType(t)}
                     className={cn(
                        "p-2 rounded border text-xs font-bold uppercase transition-all",
                        type === t ? "bg-primary text-black border-primary" : "bg-muted/10 border-muted text-muted-foreground hover:bg-muted/30"
                     )}
                   >
                     {t.replace('-', ' ')}
                   </button>
                ))}
             </div>
          </div>

          <div className="space-y-2">
             <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Urine Color (1-5)</Label>
             <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(c => (
                   <button
                     key={c}
                     onClick={() => setUrine(c)}
                     className={cn(
                        "flex-1 h-10 rounded border transition-all relative",
                        urine === c ? "ring-2 ring-white scale-110 z-10" : "opacity-50"
                     )}
                     style={{ 
                        backgroundColor: c === 1 ? '#fcfebb' : c === 2 ? '#f8f48b' : c === 3 ? '#e8d957' : c === 4 ? '#cbb32e' : '#887413',
                        borderColor: urine === c ? 'white' : 'transparent'
                     }}
                   />
                ))}
             </div>
             <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-bold">
                <span>Clear</span>
                <span>Dark</span>
             </div>
          </div>

          <Button onClick={handleSubmit} className="w-full h-14 bg-primary text-black font-bold uppercase text-lg mt-4">
            Save Entry
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ profile, updateProfile }: any) {
  return (
    <Dialog>
      <DialogTrigger asChild>
         <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
           <Settings className="w-5 h-5" />
         </Button>
      </DialogTrigger>
      <DialogContent className="w-[90%] rounded-xl bg-card border-muted max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading uppercase italic text-xl">Settings</DialogTitle></DialogHeader>
        
        <Tabs defaultValue="profile" className="w-full mt-2">
           <TabsList className="grid w-full grid-cols-2">
             <TabsTrigger value="profile">Profile</TabsTrigger>
             <TabsTrigger value="dates">Dates</TabsTrigger>
           </TabsList>
           
           <TabsContent value="profile" className="space-y-4 py-4">
               <div className="space-y-2">
                  <Label>Guidance Level</Label>
                  <Select 
                    value={profile.guidanceLevel || 'intermediate'} 
                    onValueChange={(v) => updateProfile({ guidanceLevel: v })}
                  >
                    <SelectTrigger className="w-full bg-muted/30 border-muted">
                      <SelectValue placeholder="Select Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner (Essentials)</SelectItem>
                      <SelectItem value="intermediate">Intermediate (Standard)</SelectItem>
                      <SelectItem value="advanced">Advanced (Coach Mode)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Controls how much detail you see on the dashboard.</p>
               </div>

               <div className="flex items-center justify-between py-2 border-t border-muted">
                 <div className="space-y-0.5">
                    <Label className="text-base">Coach Mode</Label>
                    <p className="text-[10px] text-muted-foreground">Unlock manual overrides</p>
                 </div>
                 <Switch checked={profile.coachMode} onCheckedChange={(v) => updateProfile({ coachMode: v })} />
               </div>
           </TabsContent>

           <TabsContent value="dates" className="space-y-4 py-4">
               <div className="space-y-2">
                  <Label>Target Weigh-in Date</Label>
                  <Input 
                     type="date" 
                     className="bg-muted/30 border-muted"
                     value={format(new Date(profile.weighInDate), 'yyyy-MM-dd')}
                     onChange={(e) => updateProfile({ weighInDate: new Date(e.target.value) })}
                  />
                  <p className="text-[10px] text-muted-foreground">All targets will be recalculated based on this date.</p>
               </div>

               <div className="space-y-2">
                  <Label>Next Match Date</Label>
                  <Input 
                     type="date" 
                     className="bg-muted/30 border-muted"
                     value={format(new Date(profile.matchDate), 'yyyy-MM-dd')}
                     onChange={(e) => updateProfile({ matchDate: new Date(e.target.value) })}
                  />
               </div>
           </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SystemPhilosophyDialog({ guidanceLevel }: { guidanceLevel: string }) {
   const [open, setOpen] = useState(false);

   return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
         <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
           <span className="font-heading font-bold italic text-lg">?</span>
         </Button>
      </DialogTrigger>
      <DialogContent className="w-[90%] rounded-xl bg-card border-muted max-h-[80vh] overflow-y-auto p-0">
        <div className="p-6 pb-2">
           <DialogHeader>
             <DialogTitle className="font-heading uppercase italic text-2xl text-primary mb-1">System Philosophy</DialogTitle>
             <p className="text-sm text-muted-foreground">The science behind the cut.</p>
           </DialogHeader>
        </div>

        <div className="px-6 space-y-6 pb-8">
           {/* Core Concept */}
           <section className="space-y-2">
              <h4 className="font-bold text-foreground text-sm uppercase tracking-wide border-b border-muted pb-1">Core Concept</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We manage weight by manipulating water, gut content, and glycogen—not muscle.
                Most athletes cut weight wrong by starving muscle. We fuel muscle and dump waste.
              </p>
           </section>
           
           {/* The Tanks */}
           <section className="space-y-2">
              <h4 className="font-bold text-foreground text-sm uppercase tracking-wide border-b border-muted pb-1">The Fuel Tanks</h4>
              <ul className="space-y-2">
                <li className="flex gap-2">
                   <Droplets className="w-4 h-4 text-chart-2 shrink-0" />
                   <div>
                      <span className="block text-xs font-bold text-foreground">Water (Variable)</span>
                      <span className="text-[10px] text-muted-foreground">We hyper-hydrate early in the week to flush sodium, then taper.</span>
                   </div>
                </li>
                <li className="flex gap-2">
                   <Zap className="w-4 h-4 text-chart-1 shrink-0" />
                   <div>
                      <span className="block text-xs font-bold text-foreground">Glycogen (Energy)</span>
                      <span className="text-[10px] text-muted-foreground">Stored carbs in muscle. We deplete this temporarily for the scale.</span>
                   </div>
                </li>
                <li className="flex gap-2">
                   <User className="w-4 h-4 text-chart-3 shrink-0" />
                   <div>
                      <span className="block text-xs font-bold text-foreground">Gut Content (Waste)</span>
                      <span className="text-[10px] text-muted-foreground">Food waiting to be digested. We eliminate fiber 24-48h out.</span>
                   </div>
                </li>
              </ul>
           </section>

           {/* The Timeline */}
           <section className="space-y-2">
              <h4 className="font-bold text-foreground text-sm uppercase tracking-wide border-b border-muted pb-1">Weekly Flow</h4>
              <div className="space-y-2 text-xs">
                 <div className="flex gap-2">
                    <span className="font-bold min-w-[3rem]">Mon-Wed</span>
                    <span className="text-muted-foreground">Metabolic loading. High water, clean fuel.</span>
                 </div>
                 <div className="flex gap-2">
                    <span className="font-bold min-w-[3rem]">Thu</span>
                    <span className="text-muted-foreground">Transition. Cut fiber, switch to easy-digesting carbs.</span>
                 </div>
                 <div className="flex gap-2">
                    <span className="font-bold min-w-[3rem]">Fri</span>
                    <span className="text-muted-foreground">Prep. Water taper, thermal regulation.</span>
                 </div>
              </div>
           </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}