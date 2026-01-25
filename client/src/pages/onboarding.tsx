import { useState } from "react";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ArrowRight, Weight, Target, ChevronRight, Scale, Activity, Lock, Droplets, Trophy, Flame, Zap, Dumbbell } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const { profile, updateProfile } = useStore();
  const [, setLocation] = useLocation();

  const handleNext = () => {
    if (step < 4) { 
      setStep(step + 1);
    } else {
      setLocation('/dashboard');
    }
  };

  return (
    <MobileLayout showNav={false}>
      <div className="h-full flex flex-col">
        {/* Progress */}
        <div className="w-full bg-muted h-1 mb-8 rounded-full overflow-hidden">
          <div 
            className="bg-primary h-full transition-all duration-500 ease-out" 
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        <div className="flex-1">
          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">The Basics</h1>
                <p className="text-muted-foreground">Let's establish your baseline.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Current Weight (lbs)</Label>
                  <div className="relative">
                    <Weight className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
                    <Input 
                      type="number" 
                      className="pl-10 text-lg h-12 bg-muted/30 border-muted focus:border-primary font-mono"
                      value={profile.currentWeight}
                      onChange={(e) => updateProfile({ currentWeight: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Target Weight Class</Label>
                  <div className="relative">
                    <Target className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
                    <Select 
                      value={profile.targetWeightClass.toString()} 
                      onValueChange={(v) => updateProfile({ targetWeightClass: parseInt(v) })}
                    >
                      <SelectTrigger className="pl-10 text-lg h-12 bg-muted/30 border-muted font-mono">
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {[125, 133, 141, 149, 157, 165, 174, 184, 197, 285].map(w => (
                          <SelectItem key={w} value={w.toString()}>{w} lbs</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
               <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">Select Protocol</h1>
                <p className="text-muted-foreground">Choose your weight management track.</p>
              </div>

              <RadioGroup 
                value={profile.protocol} 
                onValueChange={(v: any) => updateProfile({ protocol: v })}
                className="grid grid-cols-1 gap-3"
              >
                <GoalOption 
                  value="1" 
                  title="Track A: Aggressive" 
                  desc="Sugar Fast • Preseason Only • 0g Protein" 
                  icon={Flame} 
                  isDestructive
                  recommended={profile.currentWeight > profile.targetWeightClass * 1.07}
                />
                <GoalOption 
                  value="2" 
                  title="Track B: Standard" 
                  desc="In-Season Focus • Fructose Early • Glucose Late" 
                  icon={Zap} 
                  recommended={profile.currentWeight <= profile.targetWeightClass * 1.07 && profile.currentWeight > profile.targetWeightClass * 1.03}
                />
                <GoalOption 
                  value="3" 
                  title="Track C: Maintenance" 
                  desc="Performance Mode • Lean Athletes Only" 
                  icon={Trophy} 
                  recommended={profile.currentWeight <= profile.targetWeightClass * 1.03 && profile.currentWeight >= profile.targetWeightClass}
                />
                <GoalOption 
                  value="4" 
                  title="Track D: Growth" 
                  desc="Hypertrophy • Off-Season / Moving Up" 
                  icon={Dumbbell} 
                  recommended={profile.targetWeightClass > profile.currentWeight}
                />
              </RadioGroup>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">Dashboard Mode</h1>
                <p className="text-muted-foreground">Select your preferred level of detail.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Next Weigh-in Date</Label>
                  <Input 
                    type="date" 
                    className="text-lg h-12 bg-muted/30 border-muted font-mono"
                    value={format(profile.weighInDate, 'yyyy-MM-dd')}
                    onChange={(e) => updateProfile({ weighInDate: new Date(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Detail Level</Label>
                  <RadioGroup 
                    value={profile.dashboardMode} 
                    onValueChange={(v: any) => updateProfile({ dashboardMode: v })}
                    className="grid grid-cols-1 gap-3"
                  >
                    <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors [&:has(:checked)]:border-primary [&:has(:checked)]:bg-primary/5">
                      <RadioGroupItem value="essentials" id="essentials" />
                      <Label htmlFor="essentials" className="flex-1 cursor-pointer">
                        <div className="font-bold uppercase flex items-center gap-2">Essentials <span className="text-[10px] bg-muted px-1.5 rounded text-muted-foreground font-normal normal-case">Simple</span></div>
                        <p className="text-xs text-muted-foreground mt-0.5">Focus on daily missions, weight targets, and hydration only.</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors [&:has(:checked)]:border-primary [&:has(:checked)]:bg-primary/5">
                      <RadioGroupItem value="standard" id="standard" />
                      <Label htmlFor="standard" className="flex-1 cursor-pointer">
                        <div className="font-bold uppercase flex items-center gap-2">Standard <span className="text-[10px] bg-primary/20 text-primary px-1.5 rounded font-bold normal-case">Recommended</span></div>
                        <p className="text-xs text-muted-foreground mt-0.5">Adds basic fuel tank metrics (Glycogen/Water) to guide decisions.</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors [&:has(:checked)]:border-primary [&:has(:checked)]:bg-primary/5">
                      <RadioGroupItem value="pro" id="pro" />
                      <Label htmlFor="pro" className="flex-1 cursor-pointer">
                        <div className="font-bold uppercase flex items-center gap-2">Pro <span className="text-[10px] bg-chart-5/20 text-chart-5 px-1.5 rounded font-bold normal-case">Advanced</span></div>
                        <p className="text-xs text-muted-foreground mt-0.5">Full physiological breakdown including gut content and fat oxidation.</p>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">Resources</h1>
                <p className="text-muted-foreground">What tools do you have?</p>
              </div>

              <Card className="p-6 bg-muted/10 border-muted space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Sauna Access</Label>
                    <p className="text-xs text-muted-foreground">Or hot bath availability</p>
                  </div>
                  <Switch 
                    checked={profile.hasSaunaAccess} 
                    onCheckedChange={(c) => updateProfile({ hasSaunaAccess: c })} 
                  />
                </div>
              </Card>

               <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg mt-8">
                 <h4 className="font-heading font-bold text-primary uppercase mb-2">System Analysis</h4>
                 <div className="space-y-2 text-sm text-muted-foreground">
                   <p>
                     You are <span className="text-foreground font-mono font-bold">{(profile.currentWeight - profile.targetWeightClass).toFixed(1)} lbs</span> over.
                   </p>
                   <p>
                     Max "Walking-Around" Weight: <span className="text-foreground font-mono font-bold">{(profile.targetWeightClass * 1.07).toFixed(1)} lbs</span>
                   </p>
                   {profile.currentWeight > profile.targetWeightClass * 1.07 && (
                     <p className="text-destructive font-bold text-xs">
                       ⚠️ You are above the recommended training weight range. Protocol 1 or 2 recommended.
                     </p>
                   )}
                   {profile.targetWeightClass > profile.currentWeight && (
                     <p className="text-primary font-bold text-xs">
                       💪 You are moving up a weight class. Protocol 4 (Hypertrophy) is recommended.
                     </p>
                   )}
                 </div>
               </div>
            </div>
          )}
        </div>

        <Button onClick={handleNext} className="w-full h-14 text-lg font-bold uppercase tracking-wider bg-primary text-black hover:bg-primary/90 mt-8">
          {step === 4 ? "Initialize Protocol" : "Next Step"} <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </MobileLayout>
  );
}

function GoalOption({ value, title, desc, icon: Icon, isDestructive, recommended }: any) {
  return (
    <div className={cn(
      "flex items-center space-x-3 border p-4 rounded-lg transition-all relative overflow-hidden",
      "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5",
      isDestructive ? "border-destructive/30 hover:border-destructive/60" : "border-muted hover:border-muted-foreground/50",
      recommended ? "bg-primary/5 border-primary ring-1 ring-primary" : "bg-muted/10"
    )}>
      {recommended && (
        <div className="absolute top-0 right-0 bg-primary text-black text-[9px] font-bold px-2 py-0.5 uppercase">Recommended</div>
      )}
      <RadioGroupItem value={value} id={value} className="mt-1" />
      <div className="flex-1 cursor-pointer">
         <Label htmlFor={value} className="font-bold text-base cursor-pointer flex items-center gap-2">
            {title}
         </Label>
         <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Icon className={cn("w-5 h-5 opacity-50", isDestructive ? "text-destructive" : "text-primary")} />
    </div>
  );
}
