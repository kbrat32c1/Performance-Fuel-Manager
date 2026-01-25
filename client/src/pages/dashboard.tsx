import { WeeklyTimeline } from "@/components/weekly-timeline";
import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplets, Zap, User, Dumbbell, AlertTriangle, CheckCircle, Flame, Ban, Utensils, Settings, Megaphone, Calendar, ArrowRight, ChevronDown, ChevronUp, Scale, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeightChart } from "@/components/weight-chart";

export default function Dashboard() {
  const { profile, calculateTarget, fuelTanks, getPhase, getTodaysFocus, isAdvancedAllowed, getHydrationTarget, getFuelingGuide, updateProfile, getCheckpoints, getCoachMessage, getNextSteps, logs } = useStore();
  const targetWeight = calculateTarget();
  const diff = profile.currentWeight - targetWeight;
  const isOver = diff > 0;
  
  // Status Logic
  const statusColor = profile.status === 'on-track' ? 'text-primary' : profile.status === 'borderline' ? 'text-chart-3' : 'text-destructive';
  
  const phase = getPhase();
  // Using simulated date if active for display
  const displayDate = profile.simulatedDate || new Date();
  
  const focus = getTodaysFocus();
  const hydration = getHydrationTarget();
  const fuel = getFuelingGuide();
  const checkpoints = getCheckpoints();
  const coach = getCoachMessage();
  const nextSteps = getNextSteps();
  
  const showFiberWarning = phase === 'transition' || phase === 'performance-prep';
  
  // Guidance Level Logic
  const showFuelTanks = profile.guidanceLevel !== 'beginner';
  const showAdvancedDetails = profile.guidanceLevel === 'advanced';

  return (
    <MobileLayout>
      {/* Phase Ribbon */}
      <div className="flex items-center justify-between bg-muted/20 border-b border-muted py-2 px-4 -mx-4 -mt-4 mb-4 text-[10px] uppercase font-bold tracking-widest text-muted-foreground overflow-x-auto whitespace-nowrap">
          <div className={cn("flex items-center gap-1.5", phase === 'metabolic' && "text-primary")}>
             <div className={cn("w-1.5 h-1.5 rounded-full", phase === 'metabolic' ? "bg-primary animate-pulse" : "bg-muted")} />
             Mon-Wed: Load
          </div>
          <div className="text-muted/20 px-2">•</div>
          <div className={cn("flex items-center gap-1.5", phase === 'transition' && "text-primary")}>
             <div className={cn("w-1.5 h-1.5 rounded-full", phase === 'transition' ? "bg-primary animate-pulse" : "bg-muted")} />
             Thu: Cut
          </div>
          <div className="text-muted/20 px-2">•</div>
          <div className={cn("flex items-center gap-1.5", phase === 'performance-prep' && "text-primary")}>
             <div className={cn("w-1.5 h-1.5 rounded-full", phase === 'performance-prep' ? "bg-primary animate-pulse" : "bg-muted")} />
             Fri: Prep
          </div>
      </div>
      
      {/* Demo Warning Banner */}
      {profile.simulatedDate && (
          <div className="bg-yellow-500/20 text-yellow-500 text-[10px] font-bold uppercase text-center py-1 -mx-4 mb-4 animate-pulse">
              ⚠️ Demo Mode Active: {format(displayDate, 'EEEE')}
          </div>
      )}

      <header className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-1">
            {format(displayDate, 'EEEE, MMM d')}
          </h2>
          <h1 className="text-2xl font-heading font-bold uppercase italic flex flex-col">
            <span>Hi, {profile.name}</span>
            <span className="text-xs text-primary not-italic font-sans font-medium opacity-80 mt-0.5">
               {profile.protocol === '1' ? 'Track A' : profile.protocol === '2' ? 'Track B' : profile.protocol === '3' ? 'Maintenance' : 'Growth'} • {phase.replace('-', ' ')}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
           <SettingsDialog profile={profile} updateProfile={updateProfile} />
           <SystemPhilosophyDialog guidanceLevel={profile.guidanceLevel} />
           <div className={cn("w-2 h-2 rounded-full mt-1", profile.status === 'on-track' ? 'bg-primary' : 'bg-destructive')} />
        </div>
      </header>

      <div className="space-y-6">
        
        {/* Weekly Timeline */}
        <WeeklyTimeline currentDay={displayDate.getDay()} />

        {/* HERO CARD: Today's Focus */}
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

        {/* Status Section */}
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

           {/* Hydration Card */}
           <Card className="bg-cyan-500/5 border-cyan-500/20 flex flex-col justify-between relative overflow-hidden">
              <CardContent className="p-4 pt-5">
                 <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] text-cyan-500 uppercase font-bold tracking-wider">Hydration</span>
                    <Droplets className="w-4 h-4 text-cyan-500" />
                 </div>
                 <div className="text-2xl font-mono font-bold text-foreground">{hydration.amount}</div>
                 <div className="text-[10px] text-muted-foreground leading-tight mt-1">{hydration.note}</div>
              </CardContent>
           </Card>
        </div>

        {/* NEW CHART SECTION */}
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

        {/* Next Steps */}
        <Card className="bg-card border-muted">
           <CardHeader className="pb-2 pt-4 py-3 border-b border-muted/50">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                 <Calendar className="w-3.5 h-3.5" /> Look Ahead
              </CardTitle>
           </CardHeader>
           <CardContent className="py-3">
              <h4 className="font-bold text-sm mb-2">{nextSteps.title}</h4>
              <ul className="space-y-2">
                 {nextSteps.steps.map((step, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                       <ArrowRight className="w-3 h-3 text-primary" /> {step}
                    </li>
                 ))}
              </ul>
           </CardContent>
        </Card>

        {/* Fuel Guide */}
        {showFiberWarning ? (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
             <div className="flex items-center gap-2 mb-3 text-orange-500 font-bold text-sm uppercase tracking-wider">
               <Ban className="w-4 h-4" /> Fiber Elimination Active
             </div>
             <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <span className="text-muted-foreground block font-bold text-[10px] uppercase">AVOID (Blockers)</span>
                  <ul className="space-y-1 text-foreground/80">
                     {fuel.avoid.map((f, i) => <li key={i}>• {f}</li>)}
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <span className="text-muted-foreground block font-bold text-[10px] uppercase">ALLOWED (Fuel)</span>
                  <ul className="space-y-1 text-foreground font-medium">
                     {fuel.allowed.map((f, i) => <li key={i}>• {f}</li>)}
                  </ul>
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

        {/* Quick Log Action */}
        <QuickLogModal lastLog={logs[0]} />

      </div>
    </MobileLayout>
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
        <div className="fixed bottom-20 right-4 left-4 z-40">
           <Button className="w-full h-14 text-lg font-bold uppercase tracking-wider bg-primary text-black shadow-lg shadow-primary/20 hover:bg-primary/90 animate-in slide-in-from-bottom-4">
             + Quick Log
           </Button>
           {lastLog && (
             <div className="text-center mt-2 text-[10px] text-muted-foreground font-mono">
                Last Log: {format(new Date(lastLog.date), 'h:mm a')} ({lastLog.weight} lbs)
             </div>
           )}
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
              <ul className="space-y-2 text-sm text-muted-foreground">
                 <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>Weight class is an entry requirement, NOT the goal. Performance is the goal.</span>
                 </li>
                 <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>A hydrated, fueled wrestler always outperforms a depleted one.</span>
                 </li>
              </ul>
           </section>

           {/* 5 Tanks Visual */}
           <section className="space-y-3">
              <h4 className="font-bold text-foreground text-sm uppercase tracking-wide border-b border-muted pb-1">The 5 Fuel Tanks</h4>
              <p className="text-xs text-muted-foreground mb-2">We manage weight by manipulating 5 specific tanks, ranked by performance cost (High to Low).</p>
              
              <div className="space-y-1">
                 <div className="flex items-center gap-2 p-2 rounded bg-muted/20 border border-muted/50">
                    <div className="w-8 h-8 rounded bg-cyan-500/20 flex items-center justify-center text-cyan-500"><Droplets className="w-4 h-4" /></div>
                    <div className="flex-1">
                       <div className="flex justify-between text-xs font-bold uppercase">
                          <span>Water</span>
                          <span className="text-destructive">High Cost</span>
                       </div>
                       <p className="text-[10px] text-muted-foreground">Cut last (24h out). Rehydrate first.</p>
                    </div>
                 </div>

                 <div className="flex items-center gap-2 p-2 rounded bg-muted/20 border border-muted/50">
                    <div className="w-8 h-8 rounded bg-lime-500/20 flex items-center justify-center text-lime-500"><Zap className="w-4 h-4" /></div>
                    <div className="flex-1">
                       <div className="flex justify-between text-xs font-bold uppercase">
                          <span>Glycogen</span>
                          <span className="text-orange-500">Med Cost</span>
                       </div>
                       <p className="text-[10px] text-muted-foreground">Muscle energy. Deplete early, reload late.</p>
                    </div>
                 </div>

                 <div className="flex items-center gap-2 p-2 rounded bg-muted/20 border border-muted/50">
                    <div className="w-8 h-8 rounded bg-amber-500/20 flex items-center justify-center text-amber-500"><User className="w-4 h-4" /></div>
                    <div className="flex-1">
                       <div className="flex justify-between text-xs font-bold uppercase">
                          <span>Gut Content</span>
                          <span className="text-green-500">Low Cost</span>
                       </div>
                       <p className="text-[10px] text-muted-foreground">Food weight. Clears in 24h via fiber cut.</p>
                    </div>
                 </div>

                 <div className="flex items-center gap-2 p-2 rounded bg-muted/20 border border-muted/50">
                    <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center text-purple-500"><Dumbbell className="w-4 h-4" /></div>
                    <div className="flex-1">
                       <div className="flex justify-between text-xs font-bold uppercase">
                          <span>Muscle</span>
                          <span className="text-destructive font-black">CRITICAL</span>
                       </div>
                       <p className="text-[10px] text-muted-foreground">Never sacrifice muscle tissue.</p>
                    </div>
                 </div>
              </div>
           </section>

           {/* Expandable Deep Dive */}
           {guidanceLevel !== 'beginner' && (
              <div className="pt-4 border-t border-muted">
                 <details className="group">
                    <summary className="flex items-center justify-between font-bold text-xs uppercase cursor-pointer list-none text-primary hover:opacity-80 transition-opacity">
                       <span>Advanced: FGF21 & Sugar Types</span>
                       <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="mt-3 space-y-3 text-xs text-muted-foreground animate-in slide-in-from-top-2">
                       <p>
                          We use specific sugar types to manipulate hormones. 
                          <span className="text-foreground font-bold"> Fructose</span> (Fruit) goes to the liver, triggering FGF21 which burns fat.
                          <span className="text-foreground font-bold"> Glucose</span> (Rice/Potato) goes to the muscle, fueling explosive power.
                       </p>
                       <p>
                          <span className="text-foreground font-bold">Track A (Fat Loss):</span> Prioritizes Fructose to maximize fat oxidation early in the week.
                       </p>
                       <p>
                          <span className="text-foreground font-bold">Track B (Performance):</span> Prioritizes Glucose to keep muscle glycogen full for high output.
                       </p>
                    </div>
                 </details>
              </div>
           )}
        </div>
      </DialogContent>
    </Dialog>
   );
}
