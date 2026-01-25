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
import { ArrowRight, Weight, Target, ChevronRight } from "lucide-react";
import { format } from "date-fns";

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const { profile, updateProfile } = useStore();
  const [, setLocation] = useLocation();

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Analyze and assign track (Mock Logic)
      const diff = profile.currentWeight - profile.targetWeightClass;
      const track = diff > 8 ? 'A' : 'B'; // If > 8lbs over, Track A (Fat Loss), else Track B (Performance)
      updateProfile({ track });
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
            style={{ width: `${(step / 3) * 100}%` }}
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
                <h1 className="text-4xl font-heading font-bold uppercase italic">Timeline</h1>
                <p className="text-muted-foreground">When do you need to perform?</p>
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
                  <Label>Experience Level</Label>
                  <RadioGroup 
                    value={profile.experienceLevel} 
                    onValueChange={(v: any) => updateProfile({ experienceLevel: v })}
                    className="grid grid-cols-1 gap-3"
                  >
                    <div className="flex items-center space-x-2 border border-muted p-4 rounded-lg bg-muted/10 data-[state=checked]:border-primary data-[state=checked]:bg-primary/10 transition-all">
                      <RadioGroupItem value="novice" id="r1" />
                      <Label htmlFor="r1" className="flex-1 font-medium">Novice <span className="block text-xs text-muted-foreground font-normal">First 1-2 seasons</span></Label>
                    </div>
                    <div className="flex items-center space-x-2 border border-muted p-4 rounded-lg bg-muted/10 data-[state=checked]:border-primary data-[state=checked]:bg-primary/10 transition-all">
                      <RadioGroupItem value="intermediate" id="r2" />
                      <Label htmlFor="r2" className="flex-1 font-medium">Intermediate <span className="block text-xs text-muted-foreground font-normal">Varsity starter</span></Label>
                    </div>
                    <div className="flex items-center space-x-2 border border-muted p-4 rounded-lg bg-muted/10 data-[state=checked]:border-primary data-[state=checked]:bg-primary/10 transition-all">
                      <RadioGroupItem value="advanced" id="r3" />
                      <Label htmlFor="r3" className="flex-1 font-medium">Advanced <span className="block text-xs text-muted-foreground font-normal">College/National level</span></Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
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
                 <p className="text-sm text-muted-foreground">
                   Based on being <span className="text-foreground font-mono font-bold">{(profile.currentWeight - profile.targetWeightClass).toFixed(1)} lbs</span> over, 
                   PWM will calculate your optimal descent track.
                 </p>
               </div>
            </div>
          )}
        </div>

        <Button onClick={handleNext} className="w-full h-14 text-lg font-bold uppercase tracking-wider bg-primary text-black hover:bg-primary/90 mt-8">
          {step === 3 ? "Initialize Protocol" : "Next Step"} <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </MobileLayout>
  );
}

// Missing Switch component import was needed, adding simplistic version inline for speed or assuming ui/switch exists (it does in package list)
import { Switch } from "@/components/ui/switch";
