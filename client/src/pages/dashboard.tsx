import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplets, Zap, User, Dumbbell, AlertTriangle, CheckCircle, Flame, Droplet, Ban, Utensils, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function Dashboard() {
  const { profile, calculateTarget, fuelTanks, addLog, getPhase, getTodaysFocus, isAdvancedAllowed, getHydrationTarget, getFuelingGuide, updateProfile } = useStore();
  const targetWeight = calculateTarget();
  const diff = profile.currentWeight - targetWeight;
  const isOver = diff > 0;
  
  // Status Logic
  const statusColor = profile.status === 'on-track' ? 'text-primary' : profile.status === 'borderline' ? 'text-chart-3' : 'text-destructive';
  
  const phase = getPhase();
  const focus = getTodaysFocus();
  const hydration = getHydrationTarget();
  const fuel = getFuelingGuide();
  
  const showFiberWarning = phase === 'transition' || phase === 'performance-prep';
  const showReverseWater = isAdvancedAllowed() && (phase === 'metabolic' || phase === 'transition');

  return (
    <MobileLayout>
      <header className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-sm text-muted-foreground font-mono uppercase tracking-widest flex items-center gap-2">
            {format(new Date(), 'EEEE, MMM d')} • <span className="text-primary font-bold">{phase.replace('-', ' ')}</span>
          </h2>
          <h1 className="text-3xl font-heading font-bold uppercase italic flex items-center gap-2">
            Hi, {profile.name} <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground not-italic font-sans font-medium">{profile.track} Track</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
           <Dialog>
            <DialogTrigger asChild>
               <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                 <Settings className="w-5 h-5" />
               </Button>
            </DialogTrigger>
            <DialogContent className="w-[90%] rounded-xl bg-card border-muted">
              <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
              <div className="flex items-center justify-between py-4">
                 <div className="space-y-0.5">
                    <Label>Coach Mode</Label>
                    <p className="text-xs text-muted-foreground">Unlock advanced tools</p>
                 </div>
                 <Switch checked={profile.coachMode} onCheckedChange={(v) => updateProfile({ coachMode: v })} />
              </div>
            </DialogContent>
           </Dialog>
           
           <Dialog>
             <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <span className="font-heading font-bold italic text-lg">?</span>
                </Button>
             </DialogTrigger>
             <DialogContent className="w-[90%] rounded-xl bg-card border-muted max-h-[80vh] overflow-y-auto">
               <DialogHeader>
                 <DialogTitle className="font-heading uppercase italic text-2xl text-primary">System Philosophy</DialogTitle>
               </DialogHeader>
               <div className="space-y-4 py-2">
                  <div className="space-y-1">
                    <h4 className="font-bold text-foreground">Performance First</h4>
                    <p className="text-sm text-muted-foreground">Weight class is an entry requirement. Performance is the goal. A hydrated, fueled wrestler always outperforms a depleted one.</p>
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-foreground">The 5 Fuel Tanks</h4>
                    <p className="text-sm text-muted-foreground">We manage weight by manipulating 5 tanks, ranked by performance cost:</p>
                    <ul className="text-sm list-disc pl-4 text-muted-foreground space-y-1 mt-1">
                       <li><span className="text-cyan-500 font-bold">Water</span>: High cost. Last to cut.</li>
                       <li><span className="text-lime-500 font-bold">Glycogen</span>: High cost. Your power source.</li>
                       <li><span className="text-amber-500 font-bold">Gut Content</span>: Low cost. Clears in 24h.</li>
                       <li><span className="text-orange-500 font-bold">Fat</span>: Zero cost. Burn weekly.</li>
                       <li><span className="text-purple-500 font-bold">Muscle</span>: Critical. Never sacrifice.</li>
                    </ul>
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-foreground">FGF21 Sugar System</h4>
                    <p className="text-sm text-muted-foreground">We use specific sugar types (Fructose vs Glucose) to trigger fat loss (Track A) or maximize performance (Track B) without starving.</p>
                  </div>
               </div>
             </DialogContent>
           </Dialog>

           <div className={cn("w-3 h-3 rounded-full animate-pulse", profile.status === 'on-track' ? 'bg-primary' : 'bg-destructive')} />
        </div>
      </header>

      <div className="space-y-6">
        {/* Main Status Card */}
        <section className="relative">
           {/* Ring Visualization (CSS only for speed) */}
           <div className="flex items-center justify-between gap-4">
             <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
               <svg className="w-full h-full transform -rotate-90">
                 <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted/20" />
                 <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                   strokeDasharray={365} 
                   strokeDashoffset={365 - (365 * 0.75)} 
                   className={cn("transition-all duration-1000 ease-out", statusColor)} 
                 />
               </svg>
               <div className="absolute inset-0 flex flex-col items-center justify-center">
                 <span className="text-xs text-muted-foreground uppercase">Target</span>
                 <span className="text-2xl font-mono font-bold">{targetWeight.toFixed(1)}</span>
               </div>
             </div>

             <div className="flex-1 space-y-4">
               <Card className="bg-muted/10 border-muted relative overflow-hidden">
                 <CardContent className="p-4 flex flex-col items-center justify-center text-center relative z-10">
                    <span className="text-sm text-muted-foreground uppercase mb-1">Current</span>
                    <span className="text-5xl font-heading font-black italic tracking-tighter">{profile.currentWeight}</span>
                    <span className={cn("text-sm font-mono font-bold mt-1", isOver ? "text-destructive" : "text-primary")}>
                      {isOver ? '+' : ''}{diff.toFixed(1)} lbs
                    </span>
                 </CardContent>
                 
                 {/* Performance Cost Indicator */}
                 {profile.status === 'risk' && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-destructive animate-pulse" />
                 )}
               </Card>
             </div>
           </div>
           
           {/* High Performance Cost Warning */}
           {focus.warning && (
             <div className="mt-2 text-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-[10px] uppercase font-bold tracking-wider border border-destructive/20">
                   <AlertTriangle className="w-3 h-3" /> {focus.warning}
                </span>
             </div>
           )}
        </section>

        {/* Today's Focus */}
        <Card className="border-l-4 border-l-primary bg-muted/5">
          <CardHeader className="pb-2 pt-4">
             <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
               <Flame className="w-4 h-4 text-primary" /> Today's Focus
             </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <h3 className="font-bold text-lg leading-tight mb-3">{focus.title}</h3>
            <ul className="space-y-3">
              {focus.actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Hydration Target Card */}
        <Card className="bg-cyan-500/5 border-cyan-500/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="p-2 bg-cyan-500/10 rounded-full">
                  <Droplets className="w-6 h-6 text-cyan-500" />
               </div>
               <div>
                  <h4 className="font-bold text-sm text-cyan-500 uppercase">{hydration.type}</h4>
                  <p className="text-[10px] text-muted-foreground">{hydration.note}</p>
               </div>
            </div>
            <div className="text-right">
               <span className="block text-2xl font-mono font-bold">{hydration.amount}</span>
               <span className="text-[10px] uppercase text-muted-foreground">Daily Goal</span>
            </div>
          </CardContent>
        </Card>

        {/* Fuel Guide / Fiber Banner */}
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
          <div className="bg-muted/10 border border-muted rounded-lg p-4">
             <div className="flex items-center justify-between mb-3">
               <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                 <Utensils className="w-4 h-4" /> Fuel: {fuel.ratio}
               </div>
               {profile.track === 'A' && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold">FAT LOSS</span>}
             </div>
             <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <span className="text-muted-foreground block font-bold text-[10px] uppercase">Primary Foods</span>
                  <ul className="space-y-1 text-foreground font-medium">
                     {fuel.allowed.map((f, i) => <li key={i}>• {f}</li>)}
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <span className="text-muted-foreground block font-bold text-[10px] uppercase">Limit / Avoid</span>
                  <ul className="space-y-1 text-foreground/60">
                     {fuel.avoid.map((f, i) => <li key={i}>• {f}</li>)}
                  </ul>
                </div>
             </div>
          </div>
        )}

        {/* Fuel Tanks */}
        <section className="space-y-3">
          <h3 className="font-heading font-bold text-xl uppercase">Fuel Tanks</h3>
          <div className="space-y-4">
            <FuelBar label="Water" icon={Droplets} value={fuelTanks.water} max={8} color="bg-chart-2" desc="Hydration" />
            <FuelBar label="Glycogen" icon={Zap} value={fuelTanks.glycogen} max={1.5} color="bg-chart-1" desc="Energy" />
            <FuelBar label="Gut Content" icon={User} value={fuelTanks.gut} max={2.5} color="bg-chart-3" desc="Digesting" />
            <FuelBar label="Body Fat" icon={Flame} value={fuelTanks.fat} max={15} color="bg-chart-4" desc="Expendable" />
            <FuelBar label="Muscle" icon={Dumbbell} value={fuelTanks.muscle} max={160} color="bg-chart-5" desc="Protected" isStatic />
          </div>
        </section>

        {/* Quick Log Action */}
        <QuickLogModal />

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

function QuickLogModal() {
  const [weight, setWeight] = useState('');
  const { addLog } = useStore();
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    if (weight) {
      addLog({
        weight: parseFloat(weight),
        date: new Date(),
        type: 'post-practice'
      });
      setOpen(false);
      setWeight('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full h-12 text-lg font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-black">
          + Quick Log
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-muted w-[90%] rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase italic text-2xl">Log Post-Practice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Current Weight (lbs)</Label>
            <Input 
              type="number" 
              className="text-2xl font-mono h-16 text-center" 
              placeholder="0.0" 
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              autoFocus
            />
          </div>
          <Button onClick={handleSubmit} className="w-full h-12 bg-primary text-black font-bold uppercase">
            Save Log
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
