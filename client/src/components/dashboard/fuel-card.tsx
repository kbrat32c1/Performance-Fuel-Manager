import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Utensils, Droplets, ChevronDown, Check, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useStore } from "@/lib/store";
import { MacroTracker } from "./macro-tracker";
import { HydrationTracker } from "./hydration-tracker";
import { getCompetitionState, getCurrentPhase } from "@/components/competition-banner";

interface FuelCardProps {
  macros: {
    carbs: { min: number; max: number };
    protein: { min: number; max: number };
    ratio: string;
    note?: string;
    weightWarning?: string;
  };
  todaysFoods: {
    carbs: Array<{ name: string; ratio: string; serving: string; carbs: number; note?: string; timing?: string }>;
    protein: Array<{ name: string; serving: string; protein: number; note?: string; timing?: string }>;
    avoid: Array<{ name: string; reason: string }>;
    carbsLabel: string;
    proteinLabel: string;
  };
  foodLists: ReturnType<ReturnType<typeof useStore>['getFoodLists']>;
  hydration: {
    amount: string;
    type: string;
    note: string;
    targetOz: number;
  };
  daysUntilWeighIn: number;
  protocol: string;
  readOnly?: boolean;
}

export function FuelCard({
  macros,
  todaysFoods,
  foodLists,
  hydration,
  daysUntilWeighIn,
  protocol,
  readOnly = false,
}: FuelCardProps) {
  const { getDailyTracking, updateDailyTracking, profile } = useStore();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);
  const [expanded, setExpanded] = useState(false);

  // Water add flash feedback
  const [flashedButton, setFlashedButton] = useState<number | null>(null);
  const flashTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  // Macro progress
  const doNotEat = macros.carbs.max === 0 && macros.protein.max === 0 && macros.weightWarning;
  const carbProgress = macros.carbs.max > 0
    ? Math.min(100, (tracking.carbsConsumed / macros.carbs.max) * 100)
    : 0;
  const proteinProgress = macros.protein.max > 0
    ? Math.min(100, (tracking.proteinConsumed / macros.protein.max) * 100)
    : 0;
  const carbsDone = macros.carbs.max === 0 || carbProgress >= 100;
  const proteinDone = macros.protein.max === 0 || proteinProgress >= 100;
  const ateWhileDoNotEat = doNotEat && (tracking.carbsConsumed > 0 || tracking.proteinConsumed > 0);
  const isSipOnly = hydration.type === 'Sip Only';
  const overDrinkingSip = doNotEat && isSipOnly && tracking.waterConsumed > 16;

  // Hydration progress
  const waterProgress = hydration.targetOz > 0
    ? Math.min(100, (tracking.waterConsumed / hydration.targetOz) * 100)
    : 0;
  const waterDone = hydration.targetOz === 0 || waterProgress >= 100;

  // All fuel goals met
  const allDone = carbsDone && proteinDone && waterDone;
  const quickAddAmounts = isSipOnly ? [2, 4, 6, 8] : [8, 16, 24, 32];

  // Competition context — show current phase food tip
  const [compTip, setCompTip] = useState<{ priority: string; color: string } | null>(null);
  useEffect(() => {
    const check = () => {
      const state = getCompetitionState();
      if (state.active && state.mode !== 'idle') {
        const phase = getCurrentPhase(state.mode, state.elapsed);
        if (phase) {
          setCompTip({ priority: phase.priority, color: phase.color });
          return;
        }
      }
      setCompTip(null);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAddWater = (oz: number) => {
    updateDailyTracking(dateKey, { waterConsumed: tracking.waterConsumed + oz });

    // Flash feedback
    setFlashedButton(oz);
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setFlashedButton(null), 800);
  };

  return (
    <Card className={cn(
      "border-muted overflow-hidden transition-all",
      allDone && "bg-green-500/5 border-green-500/30"
    )}>
      <CardContent className="p-0">
        {/* ── Summary (tap to expand) ── */}
        <div
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left px-3 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer select-none"
        >
          {/* Header row: icon + title + chevron */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Utensils className={cn("w-4 h-4", allDone ? "text-green-500" : "text-primary")} />
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fuel</span>
              {allDone && (
                <span className="text-[9px] font-bold bg-green-500/15 text-green-500 px-1.5 py-0.5 rounded">ALL DONE</span>
              )}
            </div>
            <ChevronDown className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )} />
          </div>

          {/* Weight warning — overweight on cut days */}
          {macros.weightWarning && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-2.5 py-1.5 mb-2">
              <p className="text-[10px] text-red-400 font-medium">
                <span className="font-bold">⚠ OVERWEIGHT:</span> {macros.weightWarning}
              </p>
            </div>
          )}

          {/* Progress bars — stacked, full width, easy to read */}
          <div className="space-y-2">
            {/* Alert: ate food while DO NOT EAT */}
            {ateWhileDoNotEat && (
              <div className="bg-red-500/15 border border-red-500/40 rounded-lg px-2.5 py-1.5">
                <p className="text-[10px] text-red-400 font-bold">
                  🚨 {tracking.carbsConsumed + tracking.proteinConsumed}g consumed — target is ZERO. Every gram adds weight.
                </p>
              </div>
            )}

            {/* Carbs */}
            {doNotEat && !ateWhileDoNotEat ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-red-400 uppercase">Do not eat — target is 0g</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground w-8 shrink-0">Carb</span>
                <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", ateWhileDoNotEat ? "bg-red-500" : carbsDone ? "bg-green-500" : "bg-primary")}
                    style={{ width: ateWhileDoNotEat ? '100%' : `${carbProgress}%` }}
                  />
                </div>
                {carbsDone && !ateWhileDoNotEat ? (
                  <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : (
                  <span className={cn("text-[11px] font-mono font-bold shrink-0 w-14 text-right", ateWhileDoNotEat ? "text-red-400" : "text-foreground")}>
                    {tracking.carbsConsumed}<span className={ateWhileDoNotEat ? "text-red-400/60" : "text-muted-foreground"}>/{macros.carbs.max}</span>
                  </span>
                )}
              </div>
            )}

            {/* Protein */}
            {doNotEat && !ateWhileDoNotEat ? null : (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground w-8 shrink-0">Pro</span>
                <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", ateWhileDoNotEat ? "bg-red-500" : proteinDone ? "bg-green-500" : "bg-orange-500")}
                    style={{ width: ateWhileDoNotEat ? '100%' : `${proteinProgress}%` }}
                  />
                </div>
                {proteinDone && !ateWhileDoNotEat ? (
                  <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : (
                  <span className={cn("text-[11px] font-mono font-bold shrink-0 w-14 text-right", ateWhileDoNotEat ? "text-red-400" : "text-foreground")}>
                    {tracking.proteinConsumed}<span className={ateWhileDoNotEat ? "text-red-400/60" : "text-muted-foreground"}>/{macros.protein.max}</span>
                  </span>
                )}
              </div>
            )}

            {/* Water over-drinking alert */}
            {overDrinkingSip && (
              <div className="bg-orange-500/15 border border-orange-500/40 rounded-lg px-2.5 py-1.5">
                <p className="text-[10px] text-orange-400 font-bold">
                  ⚠️ {tracking.waterConsumed}oz consumed — sips only! Extra water adds weight before weigh-in.
                </p>
              </div>
            )}

            {/* Water */}
            <div className="flex items-center gap-2">
              <Droplets className={cn("w-3.5 h-3.5 shrink-0", overDrinkingSip ? "text-red-500" : isSipOnly ? "text-orange-500" : waterDone ? "text-green-500" : "text-cyan-500")} />
              <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    overDrinkingSip ? "bg-red-500" : waterDone ? "bg-green-500" : isSipOnly ? "bg-orange-500" : "bg-cyan-500"
                  )}
                  style={{ width: overDrinkingSip ? '100%' : `${waterProgress}%` }}
                />
              </div>
              {waterDone && !overDrinkingSip ? (
                <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
              ) : (
                <span className={cn("text-[11px] font-mono font-bold shrink-0 w-14 text-right", overDrinkingSip ? "text-red-400" : "text-foreground")}>
                  {tracking.waterConsumed}<span className={overDrinkingSip ? "text-red-400/60" : "text-muted-foreground"}>/{hydration.targetOz}</span>
                </span>
              )}
              {isSipOnly && !overDrinkingSip && (
                <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-orange-500/20 text-orange-500 border border-orange-500/50 shrink-0">SIP</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Competition Phase Tip ── */}
        {compTip && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 border-t border-primary/10">
            <Zap className={cn("w-3 h-3 shrink-0", compTip.color)} />
            <span className={cn("text-[10px] font-bold uppercase", compTip.color)}>
              Now: {compTip.priority}
            </span>
            <span className="text-[9px] text-muted-foreground">• Competition active</span>
          </div>
        )}

        {/* ── Water Quick-Add (always visible) ── */}
        {!readOnly && (
          <div className="flex gap-1.5 items-center px-3 pb-2.5">
            <Droplets className={cn("w-3.5 h-3.5 shrink-0", isSipOnly ? "text-orange-500" : "text-cyan-500")} />
            {isSipOnly && (
              <span className="text-[9px] text-orange-500 font-bold uppercase">SIP</span>
            )}
            {quickAddAmounts.map(oz => {
              const isFlashed = flashedButton === oz;
              return (
                <button
                  key={oz}
                  onClick={() => handleAddWater(oz)}
                  className={cn(
                    "h-6 px-2 text-[10px] font-medium rounded-md border transition-all",
                    isFlashed
                      ? "bg-cyan-500/30 border-cyan-500 text-cyan-500 scale-105"
                      : "border-muted bg-muted/30 hover:bg-muted/60 active:bg-muted"
                  )}
                >
                  {isFlashed ? (
                    <span className="flex items-center gap-0.5">
                      <Check className="w-3 h-3" />
                      +{oz}oz
                    </span>
                  ) : (
                    `+${oz}oz`
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Expanded Detail ── */}
        {expanded && (
          <div className="border-t border-muted animate-in slide-in-from-top-2 duration-200">
            <div className="p-3 space-y-4">
              {/* Full MacroTracker with header, progress rings, +Log button */}
              <MacroTracker
                macros={macros}
                todaysFoods={todaysFoods}
                foodLists={foodLists}
                daysUntilWeighIn={daysUntilWeighIn}
                protocol={protocol}
                readOnly={readOnly}
              />

              {/* Full HydrationTracker with header, progress bar, why explanations */}
              <HydrationTracker
                hydration={hydration}
                readOnly={readOnly}
              />

              {/* USDA search is now integrated into MacroTracker */}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
