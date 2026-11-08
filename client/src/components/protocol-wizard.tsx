import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Beaker,
} from "lucide-react";
import type { Protocol } from "@/lib/store";
import { PROTOCOL_SCIENCE, PROTOCOL_CONFIG, getProtocolRecommendation } from "@/lib/protocol-utils";
import { activateOnKey } from "@/lib/a11y";

interface ProtocolWizardProps {
  currentWeight: number;
  targetWeightClass: number;
  bodyFatPercent?: number | null;
  weighInDate?: Date | string | null;
  onComplete: (protocol: Protocol) => void;
  onBack?: () => void;
  submitLabel?: string;
}

export function ProtocolWizard({ currentWeight, targetWeightClass, bodyFatPercent, weighInDate, onComplete, onBack, submitLabel }: ProtocolWizardProps) {
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [showScience, setShowScience] = useState<Protocol | false>(false);

  // Calculate weight metrics
  const walkAroundWeight = targetWeightClass * 1.07;
  const percentOver = ((currentWeight - targetWeightClass) / targetWeightClass) * 100;

  const recommendation = getProtocolRecommendation(currentWeight, targetWeightClass, { bodyFatPercent, weighInDate });

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
    if (percentOver > 12) {
      return { icon: AlertTriangle, label: "Over 12%", color: "text-destructive" };
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
        {[recommendation.protocol, ...(['1', '2', '3', '4', '5', '6'] as Protocol[]).filter(p => p !== recommendation.protocol)].map(protocol => {
          const isRecommended = protocol === recommendation.protocol;
          const isSelected = selectedProtocol === protocol;
          const config = PROTOCOL_CONFIG[protocol];
          const Icon = config.icon;

          return (
            <Card
              role="button" tabIndex={0} onKeyDown={activateOnKey}
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
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="font-bold text-lg leading-tight">{config.label}</h3>
                    {isRecommended && (
                      <span className="text-xs font-bold uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mt-1">{config.pickIf}</p>
                  {isRecommended && (
                    <p className="text-sm mt-2">
                      <span className="font-bold">Why it fits you: </span>
                      {recommendation.reason}
                    </p>
                  )}

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
                        className="flex items-center gap-1 mt-3 text-xs text-primary font-bold uppercase tracking-wide"
                      >
                        <Beaker className="w-3 h-3" />
                        How it works
                        {showScience === protocol ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      {showScience === protocol && (
                        <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-muted space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                          <p className="text-xs text-muted-foreground">{PROTOCOL_SCIENCE[protocol].summary}</p>

                          {/* Visual SPAR portion guide */}
                          {(protocol === '5' || protocol === '6') && (
                            <div className="grid grid-cols-3 gap-2 py-2">
                              <div className="text-center p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                                <div className="text-2xl mb-1">🤚</div>
                                <p className="text-xs font-bold text-orange-500 uppercase">Protein</p>
                                <p className="text-xs text-muted-foreground">Palm-sized</p>
                                <p className="text-xs text-orange-400 mt-0.5">~110 cal</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-primary/10 border border-primary/30">
                                <div className="text-2xl mb-1">✊</div>
                                <p className="text-xs font-bold text-primary uppercase">Carbs</p>
                                <p className="text-xs text-muted-foreground">Fist-sized</p>
                                <p className="text-xs text-primary mt-0.5">~120 cal</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                                <div className="text-2xl mb-1">✊</div>
                                <p className="text-xs font-bold text-green-500 uppercase">Veggies</p>
                                <p className="text-xs text-muted-foreground">Fist-sized</p>
                                <p className="text-xs text-green-400 mt-0.5">~50 cal</p>
                              </div>
                            </div>
                          )}

                          <ul className="space-y-1.5">
                            {PROTOCOL_SCIENCE[protocol].points.map((point, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex gap-2">
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
          <Button variant="outline" onClick={onBack} className="shrink-0 h-12 px-5">
            Back
          </Button>
        )}
        <Button
          onClick={handleComplete}
          disabled={!selectedProtocol}
          className="flex-1 min-w-0 h-12 text-base font-bold uppercase tracking-wide bg-primary text-white hover:bg-primary/90"
        >
          {submitLabel || 'Continue'} <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

