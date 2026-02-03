import { useState, useMemo, useEffect } from "react";
import { useStore, Protocol } from "@/lib/store";
import { useLocation } from "wouter";
import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Weight, Target, ChevronRight, Activity, AlertTriangle, CheckCircle, User, Clock, Ruler, Salad, X, Flame, Scale, Dumbbell, Trophy, Zap, Beaker, ChevronDown, ChevronUp, Pencil, Check } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { WEIGHT_CLASSES, getWeightMultiplier } from "@/lib/constants";
import { SPAR_MACRO_PROTOCOLS, type SparMacroProtocol } from "@/lib/spar-calculator";

// Step flow:
// 1. Basics (name, weight) - no weight class yet
// 2. Goal Selection ("Compete at weight class" vs "SPAR Nutrition")
// 3a. If Competition: Weight Class + Protocol selection
// 3b. If SPAR: SPAR profile (height, age, activity, goal)
// 4a. If Competition: Timeline (weigh-in date)
// 4b. If SPAR: Final summary
// 5. If Competition: Final summary

type UserGoal = 'competition' | 'spar' | null;

export default function Onboarding() {
  const { profile, updateProfile } = useStore();
  const [, setLocation] = useLocation();

  // Check for protocol switch - start at step 2 (goal selection) to preserve existing name/weight
  const initialSwitchingProtocol = typeof window !== 'undefined' ? sessionStorage.getItem('switchingProtocol') : null;
  const [step, setStep] = useState(initialSwitchingProtocol ? 2 : 1);

  // Detect if this is a re-run from settings
  const isRerun = typeof window !== 'undefined' && sessionStorage.getItem('rerunWizard') === 'true';

  // Detect if switching protocols from settings
  const switchingProtocol = typeof window !== 'undefined' ? sessionStorage.getItem('switchingProtocol') : null;

  // Determine initial goal based on switching context or current profile
  const getInitialGoal = (): UserGoal => {
    if (switchingProtocol) {
      return switchingProtocol === '5' ? 'spar' : 'competition';
    }
    if (profile.protocol === '5') return 'spar';
    if (profile.hasCompletedOnboarding) return 'competition';
    return null;
  };

  // User's primary goal - drives the entire flow
  const [userGoal, setUserGoal] = useState<UserGoal>(getInitialGoal());

  // Apply protocol immediately when switching from settings
  useEffect(() => {
    if (switchingProtocol) {
      updateProfile({ protocol: switchingProtocol as Protocol });
    }
  }, []);

  // Dynamic total steps
  const TOTAL_STEPS = userGoal === 'spar' ? 4 : 5;

  const handleCancel = () => {
    sessionStorage.removeItem('rerunWizard');
    sessionStorage.removeItem('switchingProtocol');
    setLocation('/dashboard');
  };

  // Form state
  const [firstName, setFirstName] = useState(profile.name || '');
  const [lastName, setLastName] = useState(profile.lastName || '');
  const [customTargetWeight, setCustomTargetWeight] = useState(profile.targetWeight?.toString() || '');
  const [showValidation, setShowValidation] = useState(false);
  const [showProtocolScience, setShowProtocolScience] = useState<Protocol | false>(false);
  const [editingWeight, setEditingWeight] = useState(false);
  const [tempWeight, setTempWeight] = useState(profile.currentWeight.toString());

  const updateName = (first: string, last: string) => {
    setFirstName(first);
    setLastName(last);
    updateProfile({ name: first.trim(), lastName: last.trim() });
  };

  // Validation
  const isFirstNameValid = firstName.trim().length > 0;
  const isLastNameValid = lastName.trim().length > 0;
  const isWeightValid = profile.currentWeight > 0;
  const isStep1Valid = isFirstNameValid && isLastNameValid && isWeightValid;

  // SPAR weeks calculation
  const sparWeeksToGoal = useMemo(() => {
    if (!customTargetWeight || profile.weeklyGoal === 'maintain') return null;
    const target = parseFloat(customTargetWeight);
    if (isNaN(target)) return null;
    const diff = Math.abs(profile.currentWeight - target);
    const weeklyRate = profile.weeklyGoal === 'cut' ? 1 : 0.5;
    return Math.ceil(diff / weeklyRate);
  }, [customTargetWeight, profile.currentWeight, profile.weeklyGoal]);

  // Competition protocol recommendation
  const getProtocolRecommendation = () => {
    const walkAroundWeight = profile.targetWeightClass * 1.07;
    const percentOver = ((profile.currentWeight - profile.targetWeightClass) / profile.targetWeightClass) * 100;
    const lbsOverWalkAround = profile.currentWeight - walkAroundWeight;
    const lbsOverTarget = profile.currentWeight - profile.targetWeightClass;

    if (profile.currentWeight < profile.targetWeightClass) {
      return {
        protocol: '4' as Protocol,
        reason: `You're ${Math.abs(lbsOverTarget).toFixed(1)} lbs under target. Build Phase helps gain muscle safely.`
      };
    }
    if (percentOver > 7) {
      return {
        protocol: '1' as Protocol,
        reason: `You're ${percentOver.toFixed(1)}% over (${lbsOverWalkAround.toFixed(1)} lbs above walk-around). Body Comp burns fat while preserving performance.`,
        warning: "Run 2-4 weeks max, then transition."
      };
    }
    if (profile.currentWeight > walkAroundWeight) {
      return {
        protocol: '2' as Protocol,
        reason: `You're ${lbsOverWalkAround.toFixed(1)} lbs above walk-around. Make Weight manages weekly cuts.`
      };
    }
    return {
      protocol: '3' as Protocol,
      reason: `You're at walk-around weight. Hold Weight keeps you competition-ready.`
    };
  };

  const handleNext = async () => {
    if (step === 1 && !isStep1Valid) {
      setShowValidation(true);
      return;
    }

    if (step < TOTAL_STEPS) {
      setShowValidation(false);
      setStep(step + 1);
    } else {
      // Complete onboarding - ensure protocol is explicitly saved
      sessionStorage.removeItem('rerunWizard');
      sessionStorage.removeItem('switchingProtocol');

      // Build the final profile update with the correct protocol
      const finalUpdate: any = {
        simulatedDate: null,
        hasCompletedOnboarding: true,
        // Explicitly set protocol based on user goal
        protocol: userGoal === 'spar' ? '5' : profile.protocol,
      };

      // For SPAR, clear competition-specific fields that might cause confusion
      if (userGoal === 'spar') {
        finalUpdate.protocol = '5';
      }

      // Await profile save to ensure it persists to Supabase before navigating
      await updateProfile(finalUpdate);
      setLocation('/dashboard');
    }
  };

  const handleBack = () => {
    // When switching protocols, don't go back to step 1 (name/weight)
    const minStep = switchingProtocol ? 2 : 1;
    if (step > minStep) setStep(step - 1);
    else if (switchingProtocol) handleCancel(); // Cancel if trying to go back from step 2 when switching
  };

  return (
    <MobileLayout showNav={false}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          {step > (switchingProtocol ? 2 : 1) ? (
            <Button variant="ghost" size="icon" onClick={handleBack} className="-ml-2 h-10 w-10 text-muted-foreground">
              <ChevronRight className="w-6 h-6 rotate-180" />
            </Button>
          ) : <div className="w-8" />}

          <div className="flex-1 bg-muted h-1 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-500"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>

          {isRerun ? (
            <Button variant="ghost" size="icon" onClick={handleCancel} className="-mr-2 h-10 w-10 text-muted-foreground">
              <X className="w-5 h-5" />
            </Button>
          ) : <div className="w-8" />}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ═══ Step 1: The Basics ═══ */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">The Basics</h1>
                <p className="text-muted-foreground">Let's get started with your profile.</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <div className="relative">
                      <User className={cn("absolute left-3 top-3 w-5 h-5", showValidation && !isFirstNameValid ? "text-destructive" : "text-muted-foreground")} />
                      <Input
                        type="text"
                        placeholder="First"
                        className={cn("pl-10 text-lg h-12 bg-muted/30", showValidation && !isFirstNameValid && "border-destructive/50")}
                        value={firstName}
                        onChange={(e) => updateName(e.target.value, lastName)}
                      />
                    </div>
                    {showValidation && !isFirstNameValid && (
                      <p className="text-[10px] text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Required
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      type="text"
                      placeholder="Last"
                      className={cn("text-lg h-12 bg-muted/30", showValidation && !isLastNameValid && "border-destructive/50")}
                      value={lastName}
                      onChange={(e) => updateName(firstName, e.target.value)}
                    />
                    {showValidation && !isLastNameValid && (
                      <p className="text-[10px] text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Required
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Current Weight (lbs)</Label>
                  <div className="relative">
                    <Weight className={cn("absolute left-3 top-3 w-5 h-5", showValidation && !isWeightValid ? "text-destructive" : "text-muted-foreground")} />
                    <Input
                      type="number"
                      placeholder="Enter your weight"
                      className={cn("pl-10 text-lg h-12 bg-muted/30 font-mono", showValidation && !isWeightValid && "border-destructive/50")}
                      value={profile.currentWeight === 0 ? '' : profile.currentWeight}
                      onChange={(e) => updateProfile({ currentWeight: e.target.value ? parseFloat(e.target.value) : 0 })}
                    />
                  </div>
                  {showValidation && !isWeightValid && (
                    <p className="text-[10px] text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Required
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ Step 2: Goal Selection ═══ */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">Your Goal</h1>
                <p className="text-muted-foreground">What are you trying to achieve?</p>
              </div>

              {/* Show current profile when switching protocols — allow editing weight */}
              {switchingProtocol && (
                <Card className="p-3 bg-muted/30 border-muted">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Current Weight</span>
                    {editingWeight ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          className="w-24 h-8 font-mono text-right bg-background"
                          value={tempWeight}
                          onChange={(e) => setTempWeight(e.target.value)}
                          autoFocus
                        />
                        <span className="text-muted-foreground text-xs">lbs</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            const newWeight = parseFloat(tempWeight);
                            if (!isNaN(newWeight) && newWeight > 0) {
                              updateProfile({ currentWeight: newWeight });
                            }
                            setEditingWeight(false);
                          }}
                        >
                          <Check className="w-4 h-4 text-green-500" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setTempWeight(profile.currentWeight.toString());
                          setEditingWeight(true);
                        }}
                        className="flex items-center gap-1.5 font-mono font-bold hover:text-primary transition-colors"
                      >
                        {profile.currentWeight} lbs
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {editingWeight ? "Enter your current weight" : "Tap to edit if your weight has changed."}
                  </p>
                </Card>
              )}

              <div className="space-y-3">
                {/* Competition Goal */}
                <Card
                  className={cn(
                    "p-5 border-2 cursor-pointer transition-all active:scale-[0.98]",
                    userGoal === 'competition' ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/50"
                  )}
                  onClick={() => setUserGoal('competition')}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Trophy className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg">Compete at a Weight Class</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Wrestling, MMA, or other sports with weight classes. Includes water loading protocols and countdown to weigh-in.
                      </p>
                    </div>
                    {userGoal === 'competition' && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
                  </div>
                </Card>

                {/* SPAR Goal */}
                <Card
                  className={cn(
                    "p-5 border-2 cursor-pointer transition-all active:scale-[0.98]",
                    userGoal === 'spar' ? "border-green-500 bg-green-500/5" : "border-muted hover:border-muted-foreground/50"
                  )}
                  onClick={() => {
                    setUserGoal('spar');
                    updateProfile({ protocol: '5' });
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                      <Salad className="w-6 h-6 text-green-500" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg">SPAR Nutrition</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Clean eating with portion tracking. No weight class, no water manipulation. Great for off-season or general fitness.
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold bg-green-500/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded">
                          Simple as Pie
                        </span>
                      </div>
                    </div>
                    {userGoal === 'spar' && <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* ═══ Step 3 (Competition): Weight Class + Protocol ═══ */}
          {step === 3 && userGoal === 'competition' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">Your Protocol</h1>
                <p className="text-muted-foreground">Select your weight class and protocol.</p>
              </div>

              {/* Weight Class Selection */}
              <div className="space-y-2">
                <Label>Target Weight Class</Label>
                <div className="relative">
                  <Target className="absolute left-3 top-3 text-muted-foreground w-5 h-5 z-10" />
                  <Select
                    value={profile.targetWeightClass.toString()}
                    onValueChange={(v) => updateProfile({ targetWeightClass: parseInt(v) })}
                  >
                    <SelectTrigger className="pl-10 text-lg h-12 bg-muted/30 font-mono">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {WEIGHT_CLASSES.map(w => (
                        <SelectItem key={w} value={w.toString()}>{w} lbs</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {profile.targetWeightClass > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Walk-around: {(profile.targetWeightClass * 1.07).toFixed(1)} lbs •
                    You're {profile.currentWeight > profile.targetWeightClass
                      ? `${(profile.currentWeight - profile.targetWeightClass).toFixed(1)} lbs over`
                      : `${(profile.targetWeightClass - profile.currentWeight).toFixed(1)} lbs under`}
                  </p>
                )}
              </div>

              {/* Protocol Selection */}
              <div className="space-y-3 pt-2">
                <Label>Protocol</Label>
                {(() => {
                  const rec = getProtocolRecommendation();
                  const protocols: { id: Protocol; label: string; desc: string; icon: any; color: string }[] = [
                    { id: '1', label: 'Body Comp Phase', desc: 'Aggressive fat loss via fructose-only', icon: Flame, color: 'text-red-500' },
                    { id: '2', label: 'Make Weight Phase', desc: 'Weekly cut with water loading', icon: Zap, color: 'text-primary' },
                    { id: '3', label: 'Hold Weight Phase', desc: 'Maintain at walk-around weight', icon: Trophy, color: 'text-yellow-500' },
                    { id: '4', label: 'Build Phase', desc: 'Off-season muscle gain', icon: Dumbbell, color: 'text-blue-500' },
                  ];

                  // Sort to put recommended first
                  const sorted = [
                    protocols.find(p => p.id === rec.protocol)!,
                    ...protocols.filter(p => p.id !== rec.protocol)
                  ];

                  return sorted.map(p => {
                    const isRec = p.id === rec.protocol;
                    const isSelected = profile.protocol === p.id;
                    const Icon = p.icon;

                    return (
                      <Card
                        key={p.id}
                        className={cn(
                          "p-3 border-2 cursor-pointer transition-all",
                          isSelected ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/50"
                        )}
                        onClick={() => updateProfile({ protocol: p.id })}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={cn("w-5 h-5 shrink-0", p.color)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">{p.label}</span>
                              {isRec && (
                                <span className="text-[8px] font-bold uppercase bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                                  Recommended
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {isRec ? rec.reason : p.desc}
                            </p>
                          </div>
                          {isSelected && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                        </div>

                        {/* Science toggle */}
                        {isSelected && (
                          <div className="mt-2 pt-2 border-t border-muted">
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowProtocolScience(showProtocolScience === p.id ? false : p.id); }}
                              className="flex items-center gap-1 text-[10px] text-primary font-bold uppercase"
                            >
                              <Beaker className="w-3 h-3" />
                              How it works
                              {showProtocolScience === p.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            {showProtocolScience === p.id && (
                              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                                {p.id === '1' && 'Uses fructose-dominant fueling to activate fat-burning hormones while preserving muscle glycogen. Water loading drops 3-5 lbs safely.'}
                                {p.id === '2' && '3-day water load suppresses ADH hormone, then sharp restriction exploits delayed response. Your body keeps flushing water.'}
                                {p.id === '3' && 'Balanced macros (40C/35P/25F) keep energy optimal. No restrictions — eat normal, train hard.'}
                                {p.id === '4' && 'Higher calories to support muscle growth. Protein at 1.0-1.2 g/lb for maximum synthesis.'}
                              </p>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* ═══ Step 3 (SPAR): Nutrition Profile ═══ */}
          {step === 3 && userGoal === 'spar' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">Your Profile</h1>
                <p className="text-muted-foreground">We'll calculate your daily portion targets.</p>
              </div>

              {/* Goal Selection */}
              <div className="space-y-3">
                <Label>What's your goal?</Label>
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
                        "p-3 border-2 cursor-pointer transition-all",
                        isSelected ? `${goal.bg}` : "border-muted hover:border-muted-foreground/50"
                      )}
                      onClick={() => {
                        if (goal.value === 'maintain') {
                          setCustomTargetWeight('');
                          updateProfile({ weeklyGoal: 'maintain', targetWeight: undefined });
                        } else {
                          updateProfile({ weeklyGoal: goal.value as any });
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={cn("w-5 h-5", isSelected ? goal.color : "text-muted-foreground")} />
                        <div className="flex-1">
                          <span className={cn("font-bold", isSelected && goal.color)}>{goal.label}</span>
                          <p className="text-[11px] text-muted-foreground">{goal.desc}</p>
                        </div>
                        {isSelected && <CheckCircle className={cn("w-4 h-4", goal.color)} />}
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Target Weight (optional) */}
              {profile.weeklyGoal !== 'maintain' && (
                <div className="space-y-2">
                  <Label className="text-xs">Target Weight (optional)</Label>
                  <Input
                    type="number"
                    placeholder={profile.weeklyGoal === 'cut' ? 'e.g. 165' : 'e.g. 180'}
                    className="h-11 bg-muted/30 font-mono"
                    value={customTargetWeight}
                    onChange={(e) => {
                      setCustomTargetWeight(e.target.value);
                      const val = parseFloat(e.target.value);
                      updateProfile({ targetWeight: !isNaN(val) && val > 0 ? val : undefined });
                    }}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Current: {profile.currentWeight} lbs</span>
                    {sparWeeksToGoal && <span className="text-primary">~{sparWeeksToGoal} weeks</span>}
                  </div>
                </div>
              )}

              {/* Nutrition Profile Fields */}
              <div className="space-y-4 pt-4 border-t border-muted">
                <div className="space-y-2">
                  <Label className="text-xs">Height</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="5"
                        min="4" max="7"
                        className="h-11 bg-muted/30 font-mono pr-8"
                        value={profile.heightInches ? Math.floor(profile.heightInches / 12) : ''}
                        onChange={(e) => {
                          const feet = parseInt(e.target.value) || 0;
                          const inches = (profile.heightInches || 0) % 12;
                          updateProfile({ heightInches: feet * 12 + inches });
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="10"
                        min="0" max="11"
                        className="h-11 bg-muted/30 font-mono pr-8"
                        value={profile.heightInches ? profile.heightInches % 12 : ''}
                        onChange={(e) => {
                          const inches = Math.min(parseInt(e.target.value) || 0, 11);
                          const feet = Math.floor((profile.heightInches || 0) / 12);
                          updateProfile({ heightInches: feet * 12 + inches });
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Age</Label>
                  <Input
                    type="number"
                    placeholder="Enter age"
                    min="10" max="80"
                    className="h-11 bg-muted/30 font-mono"
                    value={profile.age || ''}
                    onChange={(e) => updateProfile({ age: parseInt(e.target.value) || undefined })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Gender</Label>
                    <Select value={profile.gender || 'male'} onValueChange={(v) => updateProfile({ gender: v as any })}>
                      <SelectTrigger className="h-11 bg-muted/30">
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
                    <Select value={profile.activityLevel || 'active'} onValueChange={(v) => updateProfile({ activityLevel: v as any })}>
                      <SelectTrigger className="h-11 bg-muted/30">
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

              {/* Macro Protocol Selection */}
              <div className="space-y-3 pt-4 border-t border-muted">
                <Label className="text-xs flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Macro Protocol
                </Label>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  How should your calories be split? You can change this anytime in settings.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['sports', 'maintenance', 'recomp', 'fatloss'] as SparMacroProtocol[]).map((protocolId) => {
                    const config = SPAR_MACRO_PROTOCOLS[protocolId];
                    const isSelected = (profile.sparMacroProtocol || 'maintenance') === protocolId;
                    const IconComponent = protocolId === 'sports' ? Zap :
                                          protocolId === 'maintenance' ? Scale :
                                          protocolId === 'recomp' ? Dumbbell : Flame;
                    const iconColor = protocolId === 'sports' ? 'text-yellow-500' :
                                      protocolId === 'maintenance' ? 'text-blue-500' :
                                      protocolId === 'recomp' ? 'text-green-500' : 'text-orange-500';
                    const borderColor = protocolId === 'sports' ? 'border-yellow-500/30 bg-yellow-500/10' :
                                        protocolId === 'maintenance' ? 'border-blue-500/30 bg-blue-500/10' :
                                        protocolId === 'recomp' ? 'border-green-500/30 bg-green-500/10' : 'border-orange-500/30 bg-orange-500/10';
                    return (
                      <Card
                        key={protocolId}
                        className={cn(
                          "p-2.5 border-2 cursor-pointer transition-all",
                          isSelected ? borderColor : "border-muted hover:border-muted-foreground/50"
                        )}
                        onClick={() => updateProfile({ sparMacroProtocol: protocolId })}
                      >
                        <div className="flex items-center gap-2">
                          <IconComponent className={cn("w-4 h-4 shrink-0", iconColor)} />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-bold block truncate">{config.shortName}</span>
                            <span className="text-[9px] text-muted-foreground block truncate">{config.description}</span>
                          </div>
                          {isSelected && <CheckCircle className={cn("w-4 h-4 shrink-0", iconColor)} />}
                        </div>
                        <div className="flex gap-2 mt-1.5 text-[9px] font-mono">
                          <span className="text-amber-500">C{config.carbs}%</span>
                          <span className="text-orange-500">P{config.protein}%</span>
                          <span className="text-blue-400">F{config.fat}%</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {SPAR_MACRO_PROTOCOLS[profile.sparMacroProtocol || 'maintenance']?.whoFor}
                </p>
              </div>

              {/* SPAR visual guide */}
              <Card className="p-4 bg-green-500/5 border-green-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Salad className="w-4 h-4 text-green-500" />
                  <span className="font-bold text-sm text-green-600 dark:text-green-400">How SPAR Works</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                    <div className="text-xl mb-1">🤚</div>
                    <p className="text-[9px] font-bold text-orange-500">PROTEIN</p>
                    <p className="text-[8px] text-muted-foreground">Palm-sized</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="text-xl mb-1">✊</div>
                    <p className="text-[9px] font-bold text-primary">CARBS</p>
                    <p className="text-[8px] text-muted-foreground">Fist-sized</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="text-xl mb-1">✊</div>
                    <p className="text-[9px] font-bold text-green-500">VEGGIES</p>
                    <p className="text-[8px] text-muted-foreground">Fist-sized</p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ═══ Step 4 (Competition): Timeline ═══ */}
          {step === 4 && userGoal === 'competition' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">Timeline</h1>
                <p className="text-muted-foreground">When's your next weigh-in?</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Weigh-in Date</Label>
                  <Input
                    type="date"
                    className="text-lg h-12 bg-muted/30 font-mono"
                    value={format(profile.weighInDate, 'yyyy-MM-dd')}
                    onChange={(e) => {
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      updateProfile({ weighInDate: new Date(y, m - 1, d) });
                    }}
                  />
                  {(() => {
                    const days = differenceInDays(profile.weighInDate, new Date());
                    return (
                      <p className="text-[11px] text-muted-foreground">
                        {days < 0 && "Past date - update to next weigh-in"}
                        {days === 0 && "Competition day!"}
                        {days > 0 && days <= 5 && `${days} days away - Cut week!`}
                        {days > 5 && `${days} days away`}
                      </p>
                    );
                  })()}
                </div>

                <div className="space-y-2">
                  <Label>Weigh-in Time</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 text-muted-foreground w-5 h-5 z-10" />
                    <Input
                      type="time"
                      className="pl-10 text-lg h-12 bg-muted/30 font-mono"
                      value={profile.weighInTime || '07:00'}
                      onChange={(e) => updateProfile({ weighInTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Step 4 (SPAR): Final Summary ═══ */}
          {step === 4 && userGoal === 'spar' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">You're Set!</h1>
                <p className="text-muted-foreground">Here's your SPAR plan summary.</p>
              </div>

              <Card className="p-5 bg-muted/30 border-muted space-y-4">
                <div className="flex items-center gap-2">
                  <Salad className="w-5 h-5 text-green-500" />
                  <h4 className="font-heading font-bold text-lg uppercase">Your SPAR Plan</h4>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between pb-2 border-b border-muted/50">
                    <span className="text-muted-foreground">Athlete</span>
                    <span className="font-bold">{profile.name} {profile.lastName}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-muted/50">
                    <span className="text-muted-foreground">Current Weight</span>
                    <span className="font-mono font-bold">{profile.currentWeight.toFixed(1)} lbs</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-muted/50">
                    <span className="text-muted-foreground">Goal</span>
                    <span className="font-bold capitalize flex items-center gap-1.5">
                      {profile.weeklyGoal === 'cut' && <Flame className="w-4 h-4 text-orange-500" />}
                      {profile.weeklyGoal === 'maintain' && <Scale className="w-4 h-4 text-primary" />}
                      {profile.weeklyGoal === 'build' && <Dumbbell className="w-4 h-4 text-green-500" />}
                      {profile.weeklyGoal === 'cut' ? 'Lose Weight' : profile.weeklyGoal === 'build' ? 'Build Muscle' : 'Maintain'}
                    </span>
                  </div>
                  {profile.targetWeight && profile.weeklyGoal !== 'maintain' && (
                    <>
                      <div className="flex justify-between pb-2 border-b border-muted/50">
                        <span className="text-muted-foreground">Target Weight</span>
                        <span className="font-mono font-bold text-primary">{profile.targetWeight.toFixed(1)} lbs</span>
                      </div>
                      <div className="flex justify-between pb-2 border-b border-muted/50">
                        <span className="text-muted-foreground">Estimated Time</span>
                        <span className="font-mono font-bold">~{sparWeeksToGoal} weeks</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-3 rounded text-xs font-bold flex gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Track your daily portions using SPAR. We'll calculate your slice targets based on your stats.</span>
                </div>
              </Card>
            </div>
          )}

          {/* ═══ Step 5 (Competition): Final Summary ═══ */}
          {step === 5 && userGoal === 'competition' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <h1 className="text-4xl font-heading font-bold uppercase italic">Ready!</h1>
                <p className="text-muted-foreground">Your protocol is set up.</p>
              </div>

              <Card className="p-5 bg-muted/30 border-muted space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  <h4 className="font-heading font-bold text-lg uppercase">Your Plan</h4>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between pb-2 border-b border-muted/50">
                    <span className="text-muted-foreground">Athlete</span>
                    <span className="font-bold">{profile.name} {profile.lastName}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-muted/50">
                    <span className="text-muted-foreground">Current Weight</span>
                    <span className="font-mono font-bold">{profile.currentWeight.toFixed(1)} lbs</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-muted/50">
                    <span className="text-muted-foreground">Target Class</span>
                    <span className="font-mono font-bold">{profile.targetWeightClass} lbs</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-muted/50">
                    <span className="text-muted-foreground">Protocol</span>
                    <span className="font-bold">
                      {profile.protocol === '1' && 'Body Comp Phase'}
                      {profile.protocol === '2' && 'Make Weight Phase'}
                      {profile.protocol === '3' && 'Hold Weight Phase'}
                      {profile.protocol === '4' && 'Build Phase'}
                    </span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-muted/50">
                    <span className="text-muted-foreground">Weigh-in</span>
                    <span className="font-mono font-bold">{format(profile.weighInDate, 'MMM d, yyyy')}</span>
                  </div>
                </div>

                {(() => {
                  const lbsToLose = profile.currentWeight - profile.targetWeightClass;
                  const days = differenceInDays(profile.weighInDate, new Date());
                  const percentLoss = (lbsToLose / profile.currentWeight) * 100;

                  if (lbsToLose <= 0) {
                    return (
                      <div className="bg-primary/10 text-primary p-3 rounded text-xs font-bold flex gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>You're at or below target. Train hard!</span>
                      </div>
                    );
                  }

                  if (percentLoss > 5 && days < 3) {
                    return (
                      <div className="bg-red-500/10 text-red-500 p-3 rounded text-xs font-bold flex gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Warning: Cutting {lbsToLose.toFixed(1)} lbs in {days} days is aggressive. Follow protocol strictly.</span>
                      </div>
                    );
                  }

                  return (
                    <div className="bg-primary/10 text-primary p-3 rounded text-xs font-bold flex gap-2">
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>You're set! Follow the daily targets and you'll make weight.</span>
                    </div>
                  );
                })()}
              </Card>
            </div>
          )}
        </div>

        {/* Bottom Button */}
        <Button
          onClick={handleNext}
          disabled={step === 2 && !userGoal}
          className={cn(
            "w-full h-14 text-lg font-bold uppercase tracking-wider mt-6 transition-all",
            (step === 1 && !isStep1Valid) || (step === 2 && !userGoal)
              ? "bg-muted text-muted-foreground hover:bg-muted"
              : "bg-primary text-white hover:bg-primary/90"
          )}
        >
          {step === TOTAL_STEPS ? "Let's Go!" : "Next Step"} <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </MobileLayout>
  );
}
