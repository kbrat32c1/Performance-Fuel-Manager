import { useState, useMemo } from "react";
import { useStore, Protocol } from "@/lib/store";
import { useLocation } from "wouter";
import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Weight, Target, ChevronRight, Activity, AlertTriangle, CheckCircle, User, Clock, Ruler, Salad, X, Flame, Scale, Dumbbell } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { ProtocolWizard } from "@/components/protocol-wizard";
import { getWeightMultiplier } from "@/lib/constants";

// Dynamic steps based on protocol
const COMPETITION_STEPS = 5; // Basics → Protocol → Nutrition → Timeline → Final
const SPAR_STEPS = 4; // Basics → Protocol → SPAR Goal → Final

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const { profile, updateProfile } = useStore();
  const [, setLocation] = useLocation();

  // Detect if this is a re-run from settings (sessionStorage flag)
  const isRerun = typeof window !== 'undefined' && sessionStorage.getItem('rerunWizard') === 'true';

  // Is this a SPAR protocol user?
  const isSparProtocol = profile.protocol === '5';

  // Dynamic total steps based on protocol
  const TOTAL_STEPS = isSparProtocol ? SPAR_STEPS : COMPETITION_STEPS;

  const handleCancel = () => {
    // Clear the rerun flag and go back to dashboard
    sessionStorage.removeItem('rerunWizard');
    setLocation('/dashboard');
  };

  // First/last name from profile
  const [firstName, setFirstName] = useState(profile.name || '');
  const [lastName, setLastName] = useState(profile.lastName || '');

  // SPAR-specific: custom target weight input
  const [customTargetWeight, setCustomTargetWeight] = useState(
    profile.targetWeight?.toString() || ''
  );

  // Track if user has attempted to proceed (to show validation errors)
  const [showValidation, setShowValidation] = useState(false);

  const updateName = (first: string, last: string) => {
    setFirstName(first);
    setLastName(last);
    updateProfile({ name: first.trim(), lastName: last.trim() });
  };

  // Validation for Step 1 - different for SPAR vs Competition
  const isStep1Valid = isSparProtocol
    ? firstName.trim().length > 0 && lastName.trim().length > 0 && profile.currentWeight > 0
    : firstName.trim().length > 0 && lastName.trim().length > 0 && profile.currentWeight > 0;

  // Individual field validation
  const isFirstNameValid = firstName.trim().length > 0;
  const isLastNameValid = lastName.trim().length > 0;
  const isWeightValid = profile.currentWeight > 0;

  // Calculate estimated weeks to goal for SPAR users
  const sparWeeksToGoal = useMemo(() => {
    if (!customTargetWeight || profile.weeklyGoal === 'maintain') return null;
    const target = parseFloat(customTargetWeight);
    if (isNaN(target)) return null;
    const diff = Math.abs(profile.currentWeight - target);
    const weeklyRate = profile.weeklyGoal === 'cut' ? 1 : 0.5; // 1 lb/week cut, 0.5 lb/week build
    return Math.ceil(diff / weeklyRate);
  }, [customTargetWeight, profile.currentWeight, profile.weeklyGoal]);

  const handleNext = () => {
    // If on step 1 and not valid, show validation errors
    if (step === 1 && !isStep1Valid) {
      setShowValidation(true);
      return;
    }

    if (step < TOTAL_STEPS) {
      setShowValidation(false); // Reset for next step
      setStep(step + 1);
    } else {
      // Mark onboarding complete, clear any demo mode, and remove rerun flag
      sessionStorage.removeItem('rerunWizard');
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
               style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
             />
           </div>
           {isRerun ? (
             <Button variant="ghost" size="icon" onClick={handleCancel} className="-mr-2 h-10 w-10 text-muted-foreground hover:text-foreground">
               <X className="w-5 h-5" />
             </Button>
           ) : (
             <div className="w-8" />
           )}
        </div>

        <div className="flex-1">
          {/* ═══ Step 1: The Basics ═══ */}
          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">The Basics</h1>
                <p className="text-muted-foreground">Let's establish your baseline.</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <div className="relative">
                      <User className={cn(
                        "absolute left-3 top-3 w-5 h-5",
                        showValidation && !isFirstNameValid ? "text-destructive" : "text-muted-foreground"
                      )} />
                      <Input
                        type="text"
                        placeholder="First"
                        className={cn(
                          "pl-10 text-lg h-12 bg-muted/30 focus:border-primary",
                          showValidation && !isFirstNameValid
                            ? "border-destructive/50 focus:border-destructive"
                            : "border-muted"
                        )}
                        value={firstName}
                        onChange={(e) => updateName(e.target.value, lastName)}
                      />
                    </div>
                    {showValidation && !isFirstNameValid && (
                      <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> First name required
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      type="text"
                      placeholder="Last"
                      className={cn(
                        "text-lg h-12 bg-muted/30 focus:border-primary",
                        showValidation && !isLastNameValid
                          ? "border-destructive/50 focus:border-destructive"
                          : "border-muted"
                      )}
                      value={lastName}
                      onChange={(e) => updateName(firstName, e.target.value)}
                    />
                    {showValidation && !isLastNameValid && (
                      <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Last name required
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Current Weight (lbs)</Label>
                  <div className="relative">
                    <Weight className={cn(
                      "absolute left-3 top-3 w-5 h-5",
                      showValidation && !isWeightValid ? "text-destructive" : "text-muted-foreground"
                    )} />
                    <Input
                      type="number"
                      placeholder="Enter your weight"
                      className={cn(
                        "pl-10 text-lg h-12 bg-muted/30 focus:border-primary font-mono",
                        showValidation && !isWeightValid
                          ? "border-destructive/50 focus:border-destructive"
                          : "border-muted"
                      )}
                      value={profile.currentWeight === 0 ? '' : profile.currentWeight}
                      onChange={(e) => updateProfile({ currentWeight: e.target.value ? parseFloat(e.target.value) : 0 })}
                    />
                  </div>
                  {showValidation && !isWeightValid && (
                    <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Current weight required
                    </p>
                  )}
                </div>

                {/* Weight Class - only for competition protocols, not SPAR */}
                {!isSparProtocol && (
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
                )}
              </div>
            </div>
          )}

          {/* ═══ Step 2: Protocol Selection ═══ */}
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

          {/* ═══ Step 3: SPAR Goal (for SPAR users) OR Nutrition Profile (for competition users) ═══ */}
          {step === 3 && isSparProtocol && (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">Your Goal</h1>
                <p className="text-muted-foreground">What are you trying to achieve?</p>
              </div>

              <div className="space-y-4">
                {/* Goal Selection - Big tappable cards */}
                <div className="space-y-3">
                  {[
                    { value: 'cut', icon: Flame, label: 'Lose Weight', desc: '~1 lb per week deficit', color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/30' },
                    { value: 'maintain', icon: Scale, label: 'Maintain', desc: 'Stay at current weight', color: 'text-primary', bg: 'bg-primary/10 border-primary/30' },
                    { value: 'build', icon: Dumbbell, label: 'Build Muscle', desc: '~0.5 lb per week lean gain', color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/30' },
                  ].map(goal => {
                    const isSelected = profile.weeklyGoal === goal.value;
                    const Icon = goal.icon;
                    return (
                      <Card
                        key={goal.value}
                        className={cn(
                          "p-4 border-2 transition-all cursor-pointer active:scale-[0.98]",
                          isSelected
                            ? `${goal.bg} border-current`
                            : "border-muted hover:border-muted-foreground/50"
                        )}
                        onClick={() => {
                          updateProfile({ weeklyGoal: goal.value as any });
                          // If maintain, clear custom target
                          if (goal.value === 'maintain') {
                            setCustomTargetWeight('');
                            updateProfile({ targetWeight: undefined });
                          }
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={cn("w-6 h-6", isSelected ? goal.color : "text-muted-foreground")} />
                          <div className="flex-1">
                            <h3 className={cn("font-bold text-lg", isSelected && goal.color)}>{goal.label}</h3>
                            <p className="text-sm text-muted-foreground">{goal.desc}</p>
                          </div>
                          {isSelected && (
                            <CheckCircle className={cn("w-5 h-5", goal.color)} />
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* Target Weight Input - only for cut/build */}
                {profile.weeklyGoal !== 'maintain' && (
                  <div className="space-y-2 pt-2">
                    <Label>Target Weight (optional)</Label>
                    <div className="relative">
                      <Target className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
                      <Input
                        type="number"
                        placeholder={profile.weeklyGoal === 'cut' ? 'e.g. 165' : 'e.g. 175'}
                        className="pl-10 text-lg h-12 bg-muted/30 border-muted focus:border-primary font-mono"
                        value={customTargetWeight}
                        onChange={(e) => {
                          setCustomTargetWeight(e.target.value);
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            updateProfile({ targetWeight: val });
                          } else {
                            updateProfile({ targetWeight: undefined });
                          }
                        }}
                      />
                    </div>
                    {/* Show current weight context and estimated timeline */}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Current: {profile.currentWeight} lbs</span>
                      {sparWeeksToGoal && customTargetWeight && (
                        <span className="text-primary font-medium">~{sparWeeksToGoal} weeks</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Nutrition inputs */}
                <div className="pt-4 border-t border-muted/50 space-y-4">
                  <p className="text-xs text-muted-foreground">We need a few details to calculate your daily portion targets.</p>

                  <div className="space-y-3">
                    {/* Height - feet and inches */}
                    <div className="space-y-2">
                      <Label className="text-xs">Height</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <Input
                            type="number"
                            placeholder="5"
                            min="4"
                            max="7"
                            className="h-11 bg-muted/30 border-muted focus:border-primary font-mono pr-8"
                            value={profile.heightInches ? Math.floor(profile.heightInches / 12) : ''}
                            onChange={(e) => {
                              const feet = parseInt(e.target.value) || 0;
                              const currentInches = (profile.heightInches || 0) % 12;
                              updateProfile({ heightInches: feet * 12 + currentInches });
                            }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
                        </div>
                        <div className="relative">
                          <Input
                            type="number"
                            placeholder="10"
                            min="0"
                            max="11"
                            className="h-11 bg-muted/30 border-muted focus:border-primary font-mono pr-8"
                            value={profile.heightInches ? profile.heightInches % 12 : ''}
                            onChange={(e) => {
                              const inches = parseInt(e.target.value) || 0;
                              const currentFeet = Math.floor((profile.heightInches || 0) / 12);
                              updateProfile({ heightInches: currentFeet * 12 + Math.min(inches, 11) });
                            }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
                        </div>
                      </div>
                    </div>

                    {/* Age */}
                    <div className="space-y-2">
                      <Label className="text-xs">Age</Label>
                      <Input
                        type="number"
                        placeholder="Enter age"
                        min="10"
                        max="80"
                        className="h-11 bg-muted/30 border-muted focus:border-primary font-mono"
                        value={profile.age || ''}
                        onChange={(e) => updateProfile({ age: parseInt(e.target.value) || undefined })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Gender</Label>
                      <Select
                        value={profile.gender || 'male'}
                        onValueChange={(v) => updateProfile({ gender: v as 'male' | 'female' })}
                      >
                        <SelectTrigger className="h-11 bg-muted/30 border-muted">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Activity Level</Label>
                      <Select
                        value={profile.activityLevel || 'active'}
                        onValueChange={(v) => updateProfile({ activityLevel: v as any })}
                      >
                        <SelectTrigger className="h-11 bg-muted/30 border-muted">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sedentary">Sedentary</SelectItem>
                          <SelectItem value="light">Light (1-3 days/wk)</SelectItem>
                          <SelectItem value="moderate">Moderate (3-5 days/wk)</SelectItem>
                          <SelectItem value="active">Active (6-7 days/wk)</SelectItem>
                          <SelectItem value="very-active">Very Active (2x/day)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Visual SPAR explanation card */}
                <Card className="p-4 bg-primary/5 border-primary/20">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Salad className="w-4 h-4 text-primary" />
                      <p className="font-bold text-sm text-primary">SPAR = Simple as Pie for Achievable Results</p>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Count portions ("slices"), not calories. Your hand is your measuring tool.
                    </p>

                    {/* Visual portion guide */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30">
                        <div className="text-2xl mb-1">🤚</div>
                        <p className="text-[10px] font-bold text-orange-500 uppercase">Protein</p>
                        <p className="text-[9px] text-muted-foreground">Palm-sized</p>
                        <p className="text-[9px] text-orange-400 font-mono mt-0.5">~110 cal</p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-primary/10 border border-primary/30">
                        <div className="text-2xl mb-1">✊</div>
                        <p className="text-[10px] font-bold text-primary uppercase">Carbs</p>
                        <p className="text-[9px] text-muted-foreground">Fist-sized</p>
                        <p className="text-[9px] text-primary font-mono mt-0.5">~120 cal</p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-green-500/10 border border-green-500/30">
                        <div className="text-2xl mb-1">✊</div>
                        <p className="text-[10px] font-bold text-green-500 uppercase">Veggies</p>
                        <p className="text-[9px] text-muted-foreground">Fist-sized</p>
                        <p className="text-[9px] text-green-400 font-mono mt-0.5">~50 cal</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* ═══ Step 3: Nutrition Profile (for competition protocols) ═══ */}
          {step === 3 && !isSparProtocol && (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-4xl font-heading font-bold uppercase italic">Nutrition</h1>
                  <span className="text-[10px] font-bold bg-primary/15 text-primary px-2 py-0.5 rounded mt-2">SPAR</span>
                </div>
                <p className="text-muted-foreground">Calculate your daily portion targets.</p>
              </div>

              <div className="space-y-4">
                {/* Height - feet and inches */}
                <div className="space-y-2">
                  <Label>Height</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <Ruler className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
                      <Input
                        type="number"
                        placeholder="5"
                        min="4"
                        max="7"
                        className="pl-10 text-lg h-12 bg-muted/30 border-muted focus:border-primary font-mono pr-10"
                        value={profile.heightInches ? Math.floor(profile.heightInches / 12) : ''}
                        onChange={(e) => {
                          const feet = parseInt(e.target.value) || 0;
                          const currentInches = (profile.heightInches || 0) % 12;
                          updateProfile({ heightInches: feet * 12 + currentInches });
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">ft</span>
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="10"
                        min="0"
                        max="11"
                        className="text-lg h-12 bg-muted/30 border-muted focus:border-primary font-mono pr-10"
                        value={profile.heightInches ? profile.heightInches % 12 : ''}
                        onChange={(e) => {
                          const inches = parseInt(e.target.value) || 0;
                          const currentFeet = Math.floor((profile.heightInches || 0) / 12);
                          updateProfile({ heightInches: currentFeet * 12 + Math.min(inches, 11) });
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">in</span>
                    </div>
                  </div>
                </div>

                {/* Age */}
                <div className="space-y-2">
                  <Label>Age</Label>
                  <Input
                    type="number"
                    placeholder="Enter age"
                    min="10"
                    max="80"
                    className="text-lg h-12 bg-muted/30 border-muted focus:border-primary font-mono"
                    value={profile.age || ''}
                    onChange={(e) => updateProfile({ age: parseInt(e.target.value) || undefined })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select
                    value={profile.gender || 'male'}
                    onValueChange={(v) => updateProfile({ gender: v as 'male' | 'female' })}
                  >
                    <SelectTrigger className="text-lg h-12 bg-muted/30 border-muted">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Activity Level</Label>
                  <Select
                    value={profile.activityLevel || 'active'}
                    onValueChange={(v) => updateProfile({ activityLevel: v as any })}
                  >
                    <SelectTrigger className="text-lg h-12 bg-muted/30 border-muted">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sedentary">Sedentary — Little or no exercise</SelectItem>
                      <SelectItem value="light">Light — 1-3 days/week</SelectItem>
                      <SelectItem value="moderate">Moderate — 3-5 days/week</SelectItem>
                      <SelectItem value="active">Active — Hard exercise 6-7 days/week</SelectItem>
                      <SelectItem value="very-active">Very Active — 2x/day training</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Weekly Goal</Label>
                  <Select
                    value={profile.weeklyGoal || 'maintain'}
                    onValueChange={(v) => updateProfile({ weeklyGoal: v as any })}
                  >
                    <SelectTrigger className="text-lg h-12 bg-muted/30 border-muted">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cut">Cut — Lose ~1 lb/week</SelectItem>
                      <SelectItem value="maintain">Maintain — Stay at current weight</SelectItem>
                      <SelectItem value="build">Build — Lean muscle gain</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Visual SPAR explanation card */}
                <Card className="p-4 bg-primary/5 border-primary/20">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Salad className="w-4 h-4 text-primary" />
                      <p className="font-bold text-sm text-primary">SPAR = Simple as Pie for Achievable Results</p>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Count portions ("slices"), not calories. Your hand is your measuring tool.
                    </p>

                    {/* Visual portion guide */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30">
                        <div className="text-2xl mb-1">🤚</div>
                        <p className="text-[10px] font-bold text-orange-500 uppercase">Protein</p>
                        <p className="text-[9px] text-muted-foreground">Palm-sized</p>
                        <p className="text-[9px] text-orange-400 font-mono mt-0.5">~110 cal</p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-primary/10 border border-primary/30">
                        <div className="text-2xl mb-1">✊</div>
                        <p className="text-[10px] font-bold text-primary uppercase">Carbs</p>
                        <p className="text-[9px] text-muted-foreground">Fist-sized</p>
                        <p className="text-[9px] text-primary font-mono mt-0.5">~120 cal</p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-green-500/10 border border-green-500/30">
                        <div className="text-2xl mb-1">✊</div>
                        <p className="text-[10px] font-bold text-green-500 uppercase">Veggies</p>
                        <p className="text-[9px] text-muted-foreground">Fist-sized</p>
                        <p className="text-[9px] text-green-400 font-mono mt-0.5">~50 cal</p>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground/80 pt-1 border-t border-muted/50">
                      We use your height, weight, age, and activity to calculate your daily slice targets.
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* ═══ Step 4: Timeline (competition protocols only) ═══ */}
          {step === 4 && !isSparProtocol && (
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

                <div className="space-y-2">
                  <Label>Weigh-in Time</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
                    <Input
                      type="time"
                      className="pl-10 text-lg h-12 bg-muted/30 border-muted font-mono"
                      value={profile.weighInTime || '07:00'}
                      onChange={(e) => updateProfile({ weighInTime: e.target.value })}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    This affects your countdown timer and overnight drift window
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Final Step: Safety Checks (Step 4 for SPAR, Step 5 for competition) ═══ */}
          {((isSparProtocol && step === 4) || (!isSparProtocol && step === 5)) && (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">
                  {isSparProtocol ? "You're Set!" : "Final Checks"}
                </h1>
                <p className="text-muted-foreground">
                  {isSparProtocol ? "Here's your SPAR plan summary." : "Confirm your setup."}
                </p>
              </div>

               {/* SPAR Summary */}
               {isSparProtocol && (
                 <div className="bg-muted/30 border border-muted p-5 rounded-lg space-y-4">
                   <h4 className="font-heading font-bold text-lg uppercase flex items-center gap-2">
                      <Salad className="w-5 h-5 text-primary" /> Your SPAR Plan
                   </h4>

                   <div className="space-y-3 text-sm">
                     <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                        <span className="text-muted-foreground">Athlete</span>
                        <span className="font-bold text-foreground">{profile.name} {profile.lastName}</span>
                     </div>

                     <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                        <span className="text-muted-foreground">Current Weight</span>
                        <span className="font-mono font-bold text-foreground">{profile.currentWeight.toFixed(1)} lbs</span>
                     </div>

                     <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                        <span className="text-muted-foreground">Goal</span>
                        <span className="font-bold text-foreground capitalize flex items-center gap-1.5">
                          {profile.weeklyGoal === 'cut' && <Flame className="w-4 h-4 text-orange-500" />}
                          {profile.weeklyGoal === 'maintain' && <Scale className="w-4 h-4 text-primary" />}
                          {profile.weeklyGoal === 'build' && <Dumbbell className="w-4 h-4 text-green-500" />}
                          {profile.weeklyGoal === 'cut' ? 'Lose Weight' : profile.weeklyGoal === 'build' ? 'Build Muscle' : 'Maintain'}
                        </span>
                     </div>

                     {profile.targetWeight && profile.weeklyGoal !== 'maintain' && (
                       <>
                         <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                            <span className="text-muted-foreground">Target Weight</span>
                            <span className="font-mono font-bold text-primary">{profile.targetWeight.toFixed(1)} lbs</span>
                         </div>
                         <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                            <span className="text-muted-foreground">Estimated Timeline</span>
                            <span className="font-mono font-bold text-foreground">
                              ~{sparWeeksToGoal} weeks
                            </span>
                         </div>
                       </>
                     )}

                     <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                        <span className="text-muted-foreground">Weekly Rate</span>
                        <span className="font-mono font-bold text-foreground">
                          {profile.weeklyGoal === 'cut' ? '~1 lb/week loss' : profile.weeklyGoal === 'build' ? '~0.5 lb/week gain' : 'Maintenance'}
                        </span>
                     </div>

                     {/* Success message */}
                     <div className="bg-primary/10 text-primary p-3 rounded text-xs font-bold leading-relaxed flex gap-2">
                       <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                       <div>
                         Track your daily portions using SPAR. We'll calculate your slice targets based on your stats.
                       </div>
                     </div>
                   </div>
                 </div>
               )}

               {/* Competition Protocol Summary */}
               {!isSparProtocol && (
               <div className="bg-muted/30 border border-muted p-5 rounded-lg space-y-4">
                 <h4 className="font-heading font-bold text-lg uppercase flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" /> Safety Check
                 </h4>

                 <div className="space-y-3 text-sm">
                   <div className="flex justify-between items-center pb-2 border-b border-muted/50">
                      <span className="text-muted-foreground">Athlete</span>
                      <span className="font-bold text-foreground">{profile.name} {profile.lastName}</span>
                   </div>

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
                               onClick={() => setStep(4)}
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
                               onClick={() => setStep(4)}
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
                       <div className="bg-primary/10 text-primary p-3 rounded text-xs font-bold leading-relaxed flex gap-2">
                         <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                         <div>
                           You are in a safe range. Standard protocol will work well.
                         </div>
                       </div>
                     );
                   })()}
                 </div>
               </div>
               )}
            </div>
          )}
        </div>

        {/* Only show bottom button for steps that don't have their own navigation */}
        {step !== 2 && (
          <Button
            onClick={handleNext}
            className={cn(
              "w-full h-14 text-lg font-bold uppercase tracking-wider mt-8 transition-all",
              step === 1 && !isStep1Valid
                ? "bg-muted text-muted-foreground hover:bg-muted"
                : "bg-primary text-white hover:bg-primary/90"
            )}
          >
            {step === TOTAL_STEPS ? "Initialize Protocol" : "Next Step"} <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
        )}
      </div>
    </MobileLayout>
  );
}
