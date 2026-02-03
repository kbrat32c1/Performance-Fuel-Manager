import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Flame,
  Zap,
  Trophy,
  Dumbbell,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  Beaker,
  Salad
} from "lucide-react";
import type { Protocol } from "@/lib/store";

interface ProtocolWizardProps {
  currentWeight: number;
  targetWeightClass: number;
  onComplete: (protocol: Protocol) => void;
  onBack?: () => void;
}

// Science explanations for each protocol
const PROTOCOL_SCIENCE: Record<Protocol, { summary: string; points: string[] }> = {
  '1': {
    summary: 'Uses fructose-dominant fueling to activate FGF21 (a fat-burning hormone) while sparing muscle glycogen.',
    points: [
      'Fructose is processed by the liver, not muscles — so your muscles stay fueled for practice',
      'Zero-protein windows trigger FGF21, which accelerates fat oxidation',
      'Water loading + sodium manipulation drops 3-5 lbs of water weight safely in the final days',
      'Run for 2-4 weeks max, then transition to Make Weight or Hold Weight',
    ],
  },
  '2': {
    summary: 'Weekly cut protocol using water loading science to drop weight predictably each week.',
    points: [
      '3-day water load (Mon-Wed) suppresses ADH hormone, increasing urine output',
      'Sharp water restriction (Thu-Fri) exploits the delayed ADH response — your body keeps flushing water',
      'Sodium loading + restriction amplifies the water drop',
      'Structured macro phasing keeps energy high for practice while cutting weight',
    ],
  },
  '3': {
    summary: 'Maintenance protocol for wrestlers already at walk-around weight.',
    points: [
      'Balanced macros (40C/35P/25F) keep energy and recovery optimal',
      'No food restrictions — eat normal, train hard',
      'Water and sodium targets keep you competition-ready without active cutting',
      'Switch to Make Weight when you need to cut for a specific meet',
    ],
  },
  '4': {
    summary: 'Off-season muscle gain protocol with higher carbs and protein.',
    points: [
      'Higher calorie targets to support muscle growth',
      'Protein targets at 1.0-1.2 g/lb to maximize muscle protein synthesis',
      'No water manipulation — hydrate normally',
      'Track weight to ensure gains stay controlled and within your target class range',
    ],
  },
  '5': {
    summary: 'Simple as Pie for Achievable Results — count portions (slices), not calories.',
    points: [
      'Palm-sized protein = 1 slice (~110 cal). Fist-sized carb = 1 slice (~120 cal). Fist of veggies/fruit = 1 slice (~50 cal)',
      'Your daily targets are calculated from BMR × activity level — no calorie counting needed',
      'Focus on whole, clean foods — no competition cycling or sugar manipulation',
      'Great for everyday eating, off-season, or when 6+ days from competition',
    ],
  },
};

export function ProtocolWizard({ currentWeight, targetWeightClass, onComplete, onBack }: ProtocolWizardProps) {
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [showScience, setShowScience] = useState<Protocol | false>(false);

  // Calculate weight metrics based on your document
  const walkAroundWeight = targetWeightClass * 1.07; // Walk-around = Competition × 1.06-1.07
  const percentOver = ((currentWeight - targetWeightClass) / targetWeightClass) * 100;
  const lbsOverWalkAround = currentWeight - walkAroundWeight;
  const lbsOverTarget = currentWeight - targetWeightClass;

  // Determine recommended protocol based on document logic
  const getRecommendation = (): { protocol: Protocol; reason: string; warning?: string } => {
    // Moving UP in weight class
    if (currentWeight < targetWeightClass) {
      return {
        protocol: '4',
        reason: `You're ${Math.abs(lbsOverTarget).toFixed(1)} lbs under your target class. Build Phase will help you gain muscle safely.`
      };
    }

    // More than 7% over = need aggressive fat loss first
    if (percentOver > 7) {
      return {
        protocol: '1',
        reason: `You're ${percentOver.toFixed(1)}% over your competition weight (${lbsOverWalkAround.toFixed(1)} lbs above walk-around). Body Comp Phase will burn fat without sacrificing performance.`,
        warning: "Run for 2-4 weeks max, then transition to Make Weight or Hold Weight."
      };
    }

    // Over walk-around weight but within 7% = need to cut to walk-around
    if (currentWeight > walkAroundWeight) {
      return {
        protocol: '2',
        reason: `You're ${lbsOverWalkAround.toFixed(1)} lbs above your walk-around weight (${walkAroundWeight.toFixed(1)} lbs). Make Weight Phase manages your weekly cut while preserving performance.`
      };
    }

    // At or under walk-around weight = maintain
    return {
      protocol: '3',
      reason: `You're at your walk-around weight. Hold Weight Phase keeps you competition-ready while training hard.`
    };
  };

  const recommendation = getRecommendation();

  // Pre-select the recommended protocol
  if (selectedProtocol === null) {
    setSelectedProtocol(recommendation.protocol);
  }

  const handleComplete = () => {
    if (selectedProtocol) {
      onComplete(selectedProtocol);
    }
  };

  // Weight status display
  const getWeightStatus = () => {
    if (currentWeight < targetWeightClass) {
      return { icon: ArrowUp, label: "Under Target", color: "text-blue-500" };
    }
    if (percentOver > 7) {
      return { icon: AlertTriangle, label: "Over 7%", color: "text-destructive" };
    }
    if (currentWeight > walkAroundWeight) {
      return { icon: ArrowDown, label: "Above Walk-Around", color: "text-yellow-500" };
    }
    return { icon: CheckCircle2, label: "At Walk-Around", color: "text-primary" };
  };

  const status = getWeightStatus();
  const StatusIcon = status.icon;

  return (
    <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-heading font-bold uppercase italic">Your Protocol</h1>
        <p className="text-muted-foreground">Based on your current weight vs walk-around weight.</p>
      </div>

      {/* Weight Analysis Card */}
      <Card className="p-4 bg-muted/20 border-muted">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <StatusIcon className={cn("w-5 h-5", status.color)} />
            <span className={cn("font-bold", status.color)}>{status.label}</span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs uppercase">Current</span>
              <p className="font-mono font-bold text-lg">{currentWeight} lbs</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase">Walk-Around</span>
              <p className="font-mono font-bold text-lg">{walkAroundWeight.toFixed(1)} lbs</p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground pt-2 border-t border-muted">
            Walk-around weight = Competition weight ({targetWeightClass} lbs) × 1.07
          </div>
        </div>
      </Card>

      {/* Protocol Cards — recommended first, then the rest */}
      <div className="space-y-3">
        {/* Order: recommended first */}
        {[recommendation.protocol, ...(['1', '2', '3', '4', '5'] as Protocol[]).filter(p => p !== recommendation.protocol)].map(protocol => {
          const isRecommended = protocol === recommendation.protocol;
          const isSelected = selectedProtocol === protocol;
          const config = {
            '1': { label: 'Body Comp Phase', desc: 'Aggressive fat loss via fructose-only fueling', icon: Flame, color: 'text-destructive' },
            '2': { label: 'Make Weight Phase', desc: 'Weekly cut with water loading science', icon: Zap, color: 'text-primary' },
            '3': { label: 'Hold Weight Phase', desc: 'Stay at walk-around, train hard', icon: Trophy, color: 'text-primary' },
            '4': { label: 'Build Phase', desc: 'Off-season muscle gain', icon: Dumbbell, color: 'text-primary' },
            '5': { label: 'SPAR Nutrition', desc: 'Clean eating — count portions, not calories', icon: Salad, color: 'text-green-500' },
          }[protocol]!;
          const Icon = config.icon;

          return (
            <Card
              key={protocol}
              className={cn(
                "p-4 border-2 transition-all cursor-pointer",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/50"
              )}
              onClick={() => setSelectedProtocol(protocol)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <Icon className={cn("w-6 h-6", config.color)} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{config.label}</h3>
                    {isRecommended && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>

                  {/* Always show description */}
                  <p className="text-sm text-muted-foreground mt-1">
                    {isRecommended ? recommendation.reason : config.desc}
                  </p>

                  {isRecommended && recommendation.warning && (
                    <p className="text-xs text-yellow-500 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {recommendation.warning}
                    </p>
                  )}

                  {/* Science toggle — shown when this card is selected */}
                  {isSelected && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowScience(showScience === protocol ? false : protocol); }}
                        className="flex items-center gap-1 mt-3 text-[11px] text-primary font-bold uppercase tracking-wide"
                      >
                        <Beaker className="w-3 h-3" />
                        How it works
                        {showScience === protocol ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      {showScience === protocol && (
                        <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-muted space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                          <p className="text-xs text-muted-foreground">{PROTOCOL_SCIENCE[protocol].summary}</p>

                          {/* Visual SPAR portion guide */}
                          {protocol === '5' && (
                            <div className="grid grid-cols-3 gap-2 py-2">
                              <div className="text-center p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                                <div className="text-2xl mb-1">🤚</div>
                                <p className="text-[10px] font-bold text-orange-500 uppercase">Protein</p>
                                <p className="text-[9px] text-muted-foreground">Palm-sized</p>
                                <p className="text-[9px] text-orange-400 mt-0.5">~110 cal</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-primary/10 border border-primary/30">
                                <div className="text-2xl mb-1">✊</div>
                                <p className="text-[10px] font-bold text-primary uppercase">Carbs</p>
                                <p className="text-[9px] text-muted-foreground">Fist-sized</p>
                                <p className="text-[9px] text-primary mt-0.5">~120 cal</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                                <div className="text-2xl mb-1">✊</div>
                                <p className="text-[10px] font-bold text-green-500 uppercase">Veggies</p>
                                <p className="text-[9px] text-muted-foreground">Fist-sized</p>
                                <p className="text-[9px] text-green-400 mt-0.5">~50 cal</p>
                              </div>
                            </div>
                          )}

                          <ul className="space-y-1.5">
                            {PROTOCOL_SCIENCE[protocol].points.map((point, i) => (
                              <li key={i} className="text-[11px] text-muted-foreground flex gap-2">
                                <span className="text-primary shrink-0 mt-0.5">•</span>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {isSelected && (
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        {onBack && (
          <Button variant="outline" onClick={onBack} className="flex-1 h-12">
            Back
          </Button>
        )}
        <Button
          onClick={handleComplete}
          disabled={!selectedProtocol}
          className="flex-1 h-14 text-lg font-bold uppercase tracking-wider bg-primary text-white hover:bg-primary/90"
        >
          Continue <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

