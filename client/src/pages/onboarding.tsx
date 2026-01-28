import { useState } from "react";
import { useStore, Protocol } from "@/lib/store";
import { useLocation } from "wouter";
import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Weight, Target, ChevronRight, Activity, AlertTriangle, CheckCircle } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { ProtocolWizard } from "@/components/protocol-wizard";
import { getWeightMultiplier } from "@/lib/constants";

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const { profile, updateProfile } = useStore();
  const [, setLocation] = useLocation();

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      // Mark onboarding complete and clear any demo mode
      updateProfile({ simulatedDate: null, hasCompletedOnboarding: true });
      setLocation('/dashboard');
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <MobileLayout showNav={false}>
      <div className="h-full flex flex-col">
        {/* Header with Back Button */}
        <div className="flex items-center gap-2 mb-6">
           {step > 1 ? (
             <Button variant="ghost" size="icon" onClick={handleBack} className="-ml-2 h-10 w-10 text-muted-foreground hover:text-foreground">
               <ChevronRight className="w-6 h-6 rotate-180" />
             </Button>
           ) : <div className="w-8" />} {/* Spacer */}
           
           {/* Progress Bar */}
           <div className="flex-1 bg-muted h-1 rounded-full overflow-hidden">
             <div 
               className="bg-primary h-full transition-all duration-500 ease-out" 
               style={{ width: `${(step / 4) * 100}%` }}
             />
           </div>
           <div className="w-8" /> {/* Spacer for balance */}
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
                      placeholder="Enter your weight"
                      className="pl-10 text-lg h-12 bg-muted/30 border-muted focus:border-primary font-mono"
                      value={profile.currentWeight === 0 ? '' : profile.currentWeight}
                      onChange={(e) => updateProfile({ currentWeight: e.target.value ? parseFloat(e.target.value) : 0 })}
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
            <ProtocolWizard
              currentWeight={profile.currentWeight}
              targetWeightClass={profile.targetWeightClass}
              onComplete={(protocol: Protocol) => {
                updateProfile({ protocol });
                setStep(3);
              }}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
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
                    onChange={(e) => {
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      updateProfile({ weighInDate: new Date(y, m - 1, d) });
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">Final Checks</h1>
                <p className="text-muted-foreground">Confirm your setup.</p>
              </div>

               <div className="bg-muted/30 border border-muted p-5 rounded-lg space-y-4">
                 <h4 className="font-heading font-bold text-lg uppercase flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" /> Safety Check
                 </h4>
                 
                 <div className="space-y-3 text-sm">
                   <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                      <span className="text-muted-foreground">Current Weight</span>
                      <span className="font-mono font-bold text-foreground">{profile.currentWeight.toFixed(1)} lbs</span>
                   </div>

                   <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                      <span className="text-muted-foreground">Target Class</span>
                      <span className="font-mono font-bold text-foreground">{profile.targetWeightClass} lbs</span>
                   </div>

                   <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                      <span className="text-muted-foreground">Current Distance</span>
                      <span className="font-mono font-bold">{(profile.currentWeight - profile.targetWeightClass).toFixed(1)} lbs over</span>
                   </div>
                   
                   <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                      <div>
                        <span className="text-muted-foreground">Ideal Walk-Around</span>
                        <span className="block text-[10px] text-muted-foreground/70">Target by Sunday for easier cuts</span>
                      </div>
                      <span className="font-mono font-bold text-primary">{(profile.targetWeightClass * getWeightMultiplier(5)).toFixed(1)} lbs</span>
                   </div>

                   {(() => {
                     const weightClasses = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285];
                     const daysUntilWeighIn = differenceInDays(profile.weighInDate, new Date());
                     const lbsToLose = profile.currentWeight - profile.targetWeightClass;
                     const percentLoss = (lbsToLose / profile.currentWeight) * 100;
                     const isRapidCut = percentLoss > 5 && daysUntilWeighIn < 7;
                     const isDangerousCut = percentLoss > 5 && daysUntilWeighIn < 3;

                     // Find next weight class up
                     const currentIndex = weightClasses.indexOf(profile.targetWeightClass);
                     const nextWeightClass = currentIndex < weightClasses.length - 1 ? weightClasses[currentIndex + 1] : null;

                     // Show dangerous cut warning
                     if (isDangerousCut && lbsToLose > 0) {
                       return (
                         <div className="bg-red-600/20 text-red-500 p-3 rounded text-xs leading-relaxed border border-red-500/50 space-y-3">
                           <div className="flex gap-2">
                             <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                             <div className="font-bold">
                               <strong>DANGEROUS CUT:</strong> Losing {lbsToLose.toFixed(1)} lbs ({percentLoss.toFixed(1)}%) in {daysUntilWeighIn} days
                               risks severe dehydration and hurts performance.
                             </div>
                           </div>
                           <div className="text-[11px] text-red-400 pl-6">
                             <strong>Recommended actions:</strong>
                           </div>
                           <div className="flex flex-col gap-2 pl-6">
                             {nextWeightClass && (
                               <Button
                                 size="sm"
                                 variant="outline"
                                 className="border-red-500/50 text-red-500 hover:bg-red-500/20 justify-start h-auto py-2"
                                 onClick={() => updateProfile({ targetWeightClass: nextWeightClass })}
                               >
                                 <span className="text-left">
                                   <span className="font-bold">Move up to {nextWeightClass} lbs</span>
                                   <span className="block text-[10px] opacity-80">Safer cut, better performance</span>
                                 </span>
                               </Button>
                             )}
                             {profile.protocol !== '1' && (
                               <Button
                                 size="sm"
                                 variant="outline"
                                 className="border-red-500/50 text-red-500 hover:bg-red-500/20 justify-start h-auto py-2"
                                 onClick={() => { updateProfile({ protocol: '1' }); setStep(2); }}
                               >
                                 <span className="text-left">
                                   <span className="font-bold">Switch to Body Comp Phase</span>
                                   <span className="block text-[10px] opacity-80">Best protocol for aggressive cuts</span>
                                 </span>
                               </Button>
                             )}
                             <Button
                               size="sm"
                               variant="outline"
                               className="border-red-500/50 text-red-500 hover:bg-red-500/20 justify-start h-auto py-2"
                               onClick={() => setStep(3)}
                             >
                               <span className="text-left">
                                 <span className="font-bold">Change weigh-in date</span>
                                 <span className="block text-[10px] opacity-80">More time = safer cut</span>
                               </span>
                             </Button>
                           </div>
                         </div>
                       );
                     }

                     // Show rapid cut warning
                     if (isRapidCut && lbsToLose > 0) {
                       return (
                         <div className="bg-orange-500/20 text-orange-500 p-3 rounded text-xs leading-relaxed border border-orange-500/50 space-y-3">
                           <div className="flex gap-2">
                             <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                             <div className="font-bold">
                               <strong>AGGRESSIVE CUT:</strong> Cutting {percentLoss.toFixed(1)}% ({lbsToLose.toFixed(1)} lbs) in {daysUntilWeighIn} days
                               is aggressive but doable.
                             </div>
                           </div>
                           <div className="text-[11px] text-orange-400 pl-6">
                             <strong>You can proceed, but consider:</strong>
                           </div>
                           <div className="flex flex-col gap-2 pl-6">
                             {nextWeightClass && (
                               <Button
                                 size="sm"
                                 variant="outline"
                                 className="border-orange-500/50 text-orange-500 hover:bg-orange-500/20 justify-start h-auto py-2"
                                 onClick={() => updateProfile({ targetWeightClass: nextWeightClass })}
                               >
                                 <span className="text-left">
                                   <span className="font-bold">Move up to {nextWeightClass} lbs</span>
                                   <span className="block text-[10px] opacity-80">Easier cut, more energy on the mat</span>
                                 </span>
                               </Button>
                             )}
                             {profile.protocol !== '1' && (
                               <Button
                                 size="sm"
                                 variant="outline"
                                 className="border-orange-500/50 text-orange-500 hover:bg-orange-500/20 justify-start h-auto py-2"
                                 onClick={() => { updateProfile({ protocol: '1' }); setStep(2); }}
                               >
                                 <span className="text-left">
                                   <span className="font-bold">Switch to Body Comp Phase</span>
                                   <span className="block text-[10px] opacity-80">Best protocol for aggressive cuts</span>
                                 </span>
                               </Button>
                             )}
                             <Button
                               size="sm"
                               variant="outline"
                               className="border-orange-500/50 text-orange-500 hover:bg-orange-500/20 justify-start h-auto py-2"
                               onClick={() => setStep(3)}
                             >
                               <span className="text-left">
                                 <span className="font-bold">Change weigh-in date</span>
                                 <span className="block text-[10px] opacity-80">More time makes it easier</span>
                               </span>
                             </Button>
                           </div>
                           <p className="text-[10px] text-orange-400/80 pl-6 pt-1">
                             Or continue below to proceed with the aggressive cut - follow the protocol strictly.
                           </p>
                         </div>
                       );
                     }

                     // Standard warnings
                     if (profile.currentWeight > profile.targetWeightClass * getWeightMultiplier(5)) {
                       return (
                         <div className="bg-destructive/10 text-destructive p-3 rounded text-xs font-bold leading-relaxed flex gap-2">
                           <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                           <div>
                             You are starting heavy. Body Comp Phase is highly recommended to safely make weight.
                           </div>
                         </div>
                       );
                     }

                     if (profile.targetWeightClass > profile.currentWeight) {
                       return (
                         <div className="bg-primary/10 text-primary p-3 rounded text-xs font-bold leading-relaxed flex gap-2">
                           <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                           <div>
                             You are moving up a weight class. Build Phase is active.
                           </div>
                         </div>
                       );
                     }

                     return (
                       <div className="bg-green-500/10 text-green-500 p-3 rounded text-xs font-bold leading-relaxed flex gap-2">
                         <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                         <div>
                           You are in a safe range. Standard protocol will work well.
                         </div>
                       </div>
                     );
                   })()}
                 </div>
               </div>
            </div>
          )}
        </div>

        {/* Only show bottom button for steps that don't have their own navigation */}
        {step !== 2 && (
          <Button onClick={handleNext} className="w-full h-14 text-lg font-bold uppercase tracking-wider bg-primary text-black hover:bg-primary/90 mt-8">
            {step === 4 ? "Initialize Protocol" : "Next Step"} <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
        )}
      </div>
    </MobileLayout>
  );
}

