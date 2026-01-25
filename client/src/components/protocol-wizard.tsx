import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Flame,
  Zap,
  Trophy,
  Dumbbell,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus
} from "lucide-react";
import type { Protocol } from "@/lib/store";

interface ProtocolWizardProps {
  currentWeight: number;
  targetWeightClass: number;
  onComplete: (protocol: Protocol) => void;
  onBack?: () => void;
}

export function ProtocolWizard({ currentWeight, targetWeightClass, onComplete, onBack }: ProtocolWizardProps) {
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);

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

      {/* Recommendation */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Recommended for you:</p>

        <Card className={cn(
          "p-4 border-2 transition-all cursor-pointer",
          selectedProtocol === recommendation.protocol
            ? "border-primary bg-primary/5"
            : "border-muted hover:border-muted-foreground/50"
        )}
        onClick={() => setSelectedProtocol(recommendation.protocol)}
        >
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {recommendation.protocol === '1' && <Flame className="w-6 h-6 text-destructive" />}
              {recommendation.protocol === '2' && <Zap className="w-6 h-6 text-primary" />}
              {recommendation.protocol === '3' && <Trophy className="w-6 h-6 text-primary" />}
              {recommendation.protocol === '4' && <Dumbbell className="w-6 h-6 text-primary" />}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">
                {recommendation.protocol === '1' && "Body Comp Phase"}
                {recommendation.protocol === '2' && "Make Weight Phase"}
                {recommendation.protocol === '3' && "Hold Weight Phase"}
                {recommendation.protocol === '4' && "Build Phase"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{recommendation.reason}</p>
              {recommendation.warning && (
                <p className="text-xs text-yellow-500 mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {recommendation.warning}
                </p>
              )}
            </div>
            {selectedProtocol === recommendation.protocol && (
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            )}
          </div>
        </Card>
      </div>

      {/* Other Options */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Or choose another:</p>
        <div className="grid grid-cols-2 gap-2">
          {(['1', '2', '3', '4'] as Protocol[]).filter(p => p !== recommendation.protocol).map(protocol => (
            <ProtocolOption
              key={protocol}
              protocol={protocol}
              selected={selectedProtocol === protocol}
              onClick={() => setSelectedProtocol(protocol)}
            />
          ))}
        </div>
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
          className="flex-1 h-14 text-lg font-bold uppercase tracking-wider bg-primary text-black hover:bg-primary/90"
        >
          Continue <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

function ProtocolOption({ protocol, selected, onClick }: {
  protocol: Protocol;
  selected: boolean;
  onClick: () => void;
}) {
  const config = {
    '1': { label: 'Body Comp', desc: 'Burn fat fast', icon: Flame, destructive: true },
    '2': { label: 'Make Weight', desc: 'Weekly cut', icon: Zap, destructive: false },
    '3': { label: 'Hold Weight', desc: 'Maintain', icon: Trophy, destructive: false },
    '4': { label: 'Build', desc: 'Gain muscle', icon: Dumbbell, destructive: false },
  }[protocol];

  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 p-3 rounded-lg border transition-all text-left",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : config.destructive
            ? "border-destructive/30 hover:border-destructive/60 bg-muted/10"
            : "border-muted hover:border-muted-foreground/50 bg-muted/10"
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", config.destructive ? "text-destructive" : "text-primary")} />
      <div>
        <span className="text-sm font-bold block">{config.label}</span>
        <span className="text-[10px] text-muted-foreground">{config.desc}</span>
      </div>
      {selected && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
    </button>
  );
}
