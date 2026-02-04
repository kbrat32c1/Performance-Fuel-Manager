import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Utensils, Droplets, ChevronDown, Check, Zap, Salad } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useStore } from "@/lib/store";
import { MacroTracker } from "./macro-tracker";
import { SparTracker } from "./spar-tracker";
import { HydrationTracker } from "./hydration-tracker";
import { getCompetitionState, getCurrentPhase } from "@/components/competition-banner";
import { SUGAR_FOODS, type SparFood } from "@/lib/food-data";

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
  const { getDailyTracking, updateDailyTracking, profile, getNutritionMode, getSliceTargets } = useStore();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);
  const [expanded, setExpanded] = useState(false);

  // Determine nutrition mode
  const nutritionMode = getNutritionMode();
  const isSparMode = nutritionMode === 'spar';
  // Protocol determines food system: only Protocol 5 uses SPAR food lists
  const isSparProtocol = protocol === '5';
  // Show slice-based tracker (SparTracker UI) when:
  // - Protocol 5 (always SPAR), OR
  // - Protocols 1-4 with slices preference (uses Sugar Diet foods in slice UI)
  const showSliceTracker = isSparProtocol || isSparMode;
  const showMacroTracker = !showSliceTracker;

  // ─── Cross-sync reconciliation on mode switch ───
  // When switching between slices↔grams, reconcile data so both sides match.
  // The "source of truth" is the `nutritionMode` field on the tracking record:
  // if it was last logged as 'spar', slices are authoritative → derive grams from slices
  // if it was last logged as 'sugar' (or undefined), grams are authoritative → derive slices from grams
  const prevModeRef = useRef(nutritionMode);
  useEffect(() => {
    if (prevModeRef.current === nutritionMode) return;
    prevModeRef.current = nutritionMode;

    const lastLoggedMode = tracking.nutritionMode;
    const updates: Record<string, any> = {};

    if (lastLoggedMode === 'spar') {
      // Slices are truth → sync grams FROM slices
      const expectedCarbs = tracking.carbSlices * 30;
      const expectedProtein = tracking.proteinSlices * 25;
      if (Math.abs(tracking.carbsConsumed - expectedCarbs) > 5) {
        updates.carbsConsumed = expectedCarbs;
      }
      if (Math.abs(tracking.proteinConsumed - expectedProtein) > 5) {
        updates.proteinConsumed = expectedProtein;
      }
    } else {
      // Grams are truth → sync slices FROM grams
      const expectedCarbSlices = Math.round(tracking.carbsConsumed / 30);
      const expectedProteinSlices = Math.round(tracking.proteinConsumed / 25);
      if (Math.abs(tracking.carbSlices - expectedCarbSlices) > 0) {
        updates.carbSlices = expectedCarbSlices;
      }
      if (Math.abs(tracking.proteinSlices - expectedProteinSlices) > 0) {
        updates.proteinSlices = expectedProteinSlices;
      }
    }

    if (Object.keys(updates).length > 0) {
      updateDailyTracking(dateKey, updates);
    }
  }, [nutritionMode, tracking, dateKey, updateDailyTracking]);

  // Water add flash feedback
  const [flashedButton, setFlashedButton] = useState<number | null>(null);
  const flashTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  // ─── Sugar Mode Progress ───
  const doNotEat = macros.carbs.max === 0 && macros.protein.max === 0 && macros.weightWarning;
  const carbProgress = macros.carbs.max > 0
    ? Math.min(100, (tracking.carbsConsumed / macros.carbs.max) * 100)
    : 0;
  const proteinProgress = macros.protein.max > 0
    ? Math.min(100, (tracking.proteinConsumed / macros.protein.max) * 100)
    : 0;
  const sugarCarbsDone = macros.carbs.max === 0 || carbProgress >= 100;
  const sugarProteinDone = macros.protein.max === 0 || proteinProgress >= 100;
  const ateWhileDoNotEat = doNotEat && (tracking.carbsConsumed > 0 || tracking.proteinConsumed > 0);
  const isSipOnly = hydration.type === 'Sip Only';
  const overDrinkingSip = doNotEat && isSipOnly && tracking.waterConsumed > 16;

  // ─── Slice Mode Progress ───
  const sliceTargets = showSliceTracker ? getSliceTargets() : null;

  // Protocol restrictions for slice tracker (applies to both P5 and P1-4 in slice mode)
  const sparRestrictions = useMemo(() => {
    if (!showSliceTracker) return undefined;
    const blocked: Array<'protein' | 'carb' | 'veg'> = [];
    let warning: string | undefined;
    let warningDetail: string | undefined;

    if (macros.carbs.max === 0 && macros.protein.max === 0) {
      blocked.push('protein', 'carb', 'veg');
      warning = 'DO NOT EAT';
      warningDetail = macros.weightWarning || 'Any food adds weight. Focus on extra workouts.';
    } else if (macros.protein.max === 0) {
      blocked.push('protein', 'veg');
      warning = 'FRUCTOSE CARBS ONLY';
      warningDetail = 'Protein and veggies block fat burning. Only fructose-heavy carbs today.';
    }

    return blocked.length > 0 ? {
      blockedCategories: Array.from(new Set(blocked)),
      warning,
      warningDetail,
      ratioLabel: macros.ratio,
    } : undefined;
  }, [showSliceTracker, macros.carbs.max, macros.protein.max, macros.weightWarning, macros.ratio]);

  // Map Sugar Diet foods into SparFood format for slice tracker (Protocols 1-4)
  const sugarFoodOverride = useMemo(() => {
    if (isSparProtocol) return undefined; // Protocol 5 uses built-in SPAR foods
    if (!showSliceTracker) return undefined;
    // Map Sugar food categories → slice tracker categories
    const carbFoods: SparFood[] = [
      ...SUGAR_FOODS.highFructose.map(f => ({
        name: f.name, serving: f.serving, calories: f.carbs * 4,
        carbs: f.carbs, icon: f.oz ? '🧃' : '🍯', oz: f.oz,
      })),
      ...SUGAR_FOODS.highGlucose.map(f => ({
        name: f.name, serving: f.serving, calories: f.carbs * 4,
        carbs: f.carbs, icon: f.oz ? '🧃' : '🍚', oz: f.oz,
      })),
      ...SUGAR_FOODS.zeroFiber.map(f => ({
        name: f.name, serving: f.serving, calories: f.carbs * 4,
        carbs: f.carbs, icon: f.oz ? '🧃' : '🍚', oz: f.oz,
      })),
    ];
    // Deduplicate by name
    const seenCarbs = new Set<string>();
    const uniqueCarbs = carbFoods.filter(f => {
      if (seenCarbs.has(f.name)) return false;
      seenCarbs.add(f.name);
      return true;
    });
    const proteinFoods: SparFood[] = SUGAR_FOODS.protein.map(f => ({
      name: f.name, serving: f.serving, calories: f.protein * 4,
      protein: f.protein, icon: '🥩',
    }));
    return {
      protein: proteinFoods,
      carb: uniqueCarbs,
      veg: [] as SparFood[], // Sugar Diet doesn't have a separate veg category
    };
  }, [isSparProtocol, showSliceTracker]);

  const sparBlockedSet = new Set(sparRestrictions?.blockedCategories || []);
  const isProteinBlocked = sparBlockedSet.has('protein');
  const isVegBlocked = sparBlockedSet.has('veg');
  const isCarbBlocked = sparBlockedSet.has('carb');

  const sparProteinProgress = sliceTargets && !isProteinBlocked ? Math.min(100, (tracking.proteinSlices / sliceTargets.protein) * 100) : 0;
  const sparCarbProgress = sliceTargets && !isCarbBlocked ? Math.min(100, (tracking.carbSlices / sliceTargets.carb) * 100) : 0;
  const sparVegProgress = sliceTargets && !isVegBlocked ? Math.min(100, (tracking.vegSlices / sliceTargets.veg) * 100) : 0;
  const sparProteinDone = isProteinBlocked ? true : (sliceTargets ? tracking.proteinSlices >= sliceTargets.protein : false);
  const sparCarbDone = isCarbBlocked ? true : (sliceTargets ? tracking.carbSlices >= sliceTargets.carb : false);
  const sparVegDone = isVegBlocked ? true : (sliceTargets ? tracking.vegSlices >= sliceTargets.veg : false);

  // ─── Hydration progress (shared) ───
  const waterProgress = hydration.targetOz > 0
    ? Math.min(100, (tracking.waterConsumed / hydration.targetOz) * 100)
    : 0;
  const waterDone = hydration.targetOz === 0 || waterProgress >= 100;

  // All fuel goals met (protocol-aware)
  const allDone = showSliceTracker
    ? sparProteinDone && sparCarbDone && sparVegDone && waterDone
    : sugarCarbsDone && sugarProteinDone && waterDone;

  const quickAddAmounts = isSipOnly ? [2, 4, 6, 8] : [8, 16, 24, 32];

  // Overall completion percentage for the header badge
  const overallProgress = useMemo(() => {
    let done = 0;
    let total = 0;
    if (showSliceTracker && sliceTargets) {
      if (!isProteinBlocked && sliceTargets.protein > 0) { total++; if (sparProteinDone) done++; }
      if (!isCarbBlocked && sliceTargets.carb > 0) { total++; if (sparCarbDone) done++; }
      if (!isVegBlocked && sliceTargets.veg > 0) { total++; if (sparVegDone) done++; }
    } else {
      if (macros.carbs.max > 0) { total++; if (sugarCarbsDone) done++; }
      if (macros.protein.max > 0) { total++; if (sugarProteinDone) done++; }
    }
    if (hydration.targetOz > 0) { total++; if (waterDone) done++; }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [showSliceTracker, sliceTargets, isProteinBlocked, isCarbBlocked, isVegBlocked,
    sparProteinDone, sparCarbDone, sparVegDone, sugarCarbsDone, sugarProteinDone, waterDone, macros, hydration]);

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
    <Card data-tour="fuel" className={cn(
      "border-muted overflow-hidden transition-all",
      allDone && "bg-green-500/5 border-green-500/30"
    )}>
      <CardContent className="p-0">
        {/* ── Summary (tap to expand) ── */}
        <div
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left px-3 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer select-none"
        >
          {/* Header row: icon + title + mode badge + chevron */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              {allDone ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : showSliceTracker ? (
                <Salad className="w-4 h-4 text-primary" />
              ) : (
                <Utensils className="w-4 h-4 text-primary" />
              )}
              <span className={cn("text-xs font-bold uppercase tracking-wide", allDone ? "text-green-500" : "text-muted-foreground")}>
                {isSparProtocol ? 'SPAR Nutrition' : 'Fuel'}
              </span>
              {/* Mode indicator badge */}
              <span className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
                showSliceTracker
                  ? "bg-primary/15 text-primary"
                  : "bg-amber-500/15 text-amber-500"
              )}>
                {showSliceTracker ? 'SLICES' : 'GRAMS'}
              </span>
            </div>
            <ChevronDown className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )} />
          </div>

          {/* Weight warning — overweight on cut days (both modes) */}
          {macros.weightWarning && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-2.5 py-1.5 mb-2">
              <p className="text-[10px] text-red-400 font-medium">
                <span className="font-bold">⚠ OVERWEIGHT:</span> {macros.weightWarning}
              </p>
            </div>
          )}

          {/* Compact summary — one-line progress + thin bar */}
          <div className="space-y-1.5">
            {/* Warnings first */}
            {macros.weightWarning && ateWhileDoNotEat && (
              <div className="bg-red-500/15 border border-red-500/40 rounded-lg px-2.5 py-1">
                <p className="text-[10px] text-red-400 font-bold">
                  🚨 {tracking.carbsConsumed + tracking.proteinConsumed}g consumed — target is ZERO
                </p>
              </div>
            )}

            {overDrinkingSip && (
              <div className="bg-orange-500/15 border border-orange-500/40 rounded-lg px-2.5 py-1">
                <p className="text-[10px] text-orange-400 font-bold">
                  ⚠️ {tracking.waterConsumed}oz — sips only!
                </p>
              </div>
            )}

            {/* One-line category summary */}
            <div className="flex items-center gap-1 flex-wrap">
              {showSliceTracker && sliceTargets ? (
                /* SPAR mode: slice counts */
                <>
                  {[
                    { label: 'Pro', consumed: tracking.proteinSlices, target: sliceTargets.protein, blocked: isProteinBlocked, done: sparProteinDone, color: 'text-orange-500', doneColor: 'text-green-500' },
                    { label: 'Carb', consumed: tracking.carbSlices, target: sliceTargets.carb, blocked: isCarbBlocked, done: sparCarbDone, color: 'text-amber-500', doneColor: 'text-green-500' },
                    { label: 'Veg', consumed: tracking.vegSlices, target: sliceTargets.veg, blocked: isVegBlocked, done: sparVegDone, color: 'text-emerald-500', doneColor: 'text-green-500' },
                    // V2: Fruit and Fat (only show if targets > 0)
                    ...(sliceTargets.isV2 || sliceTargets.fruit > 0 || sliceTargets.fat > 0 ? [
                      { label: 'Fruit', consumed: tracking.fruitSlices || 0, target: sliceTargets.fruit, blocked: false, done: (tracking.fruitSlices || 0) >= sliceTargets.fruit, color: 'text-pink-500', doneColor: 'text-green-500' },
                      { label: 'Fat', consumed: tracking.fatSlices || 0, target: sliceTargets.fat, blocked: false, done: (tracking.fatSlices || 0) >= sliceTargets.fat, color: 'text-yellow-600', doneColor: 'text-green-500' },
                    ] : []),
                  ].map(({ label, consumed, target, blocked, done, color, doneColor }) => {
                    if (blocked) return (
                      <span key={label} className="text-[11px] text-muted-foreground/40 font-mono line-through">{label}</span>
                    );
                    if (target === 0) return null;
                    return (
                      <span key={label} className={cn("text-[11px] font-mono font-bold", done ? doneColor : color)}>
                        {done && '✓'}{label} {consumed}/{target}
                      </span>
                    );
                  })}
                </>
              ) : (
                /* Sugar mode: gram counts */
                <>
                  {doNotEat ? (
                    <span className="text-[11px] font-bold text-red-400 uppercase">Do not eat</span>
                  ) : (
                    <>
                      <span className={cn("text-[11px] font-mono font-bold", sugarCarbsDone ? "text-green-500" : "text-foreground")}>
                        {sugarCarbsDone && '✓'}Carb {tracking.carbsConsumed}/{macros.carbs.max}g
                      </span>
                      <span className={cn("text-[11px] font-mono font-bold", sugarProteinDone ? "text-green-500" : "text-foreground")}>
                        {sugarProteinDone && '✓'}Pro {tracking.proteinConsumed}/{macros.protein.max}g
                      </span>
                    </>
                  )}
                </>
              )}
              {/* Water inline */}
              <span className={cn("text-[11px] font-mono font-bold ml-auto",
                overDrinkingSip ? "text-red-400" : waterDone ? "text-green-500" : isSipOnly ? "text-orange-500" : "text-cyan-500"
              )}>
                {waterDone && !overDrinkingSip && '✓'}💧{tracking.waterConsumed}/{hydration.targetOz}
                {isSipOnly && !overDrinkingSip && <span className="text-[8px] ml-0.5 text-orange-500">SIP</span>}
              </span>
            </div>

            {/* Thin overall progress bar */}
            <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out",
                  allDone ? "bg-green-500" : "bg-primary"
                )}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Competition Phase Tip (Sugar mode only) ── */}
        {!showSliceTracker && compTip && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 border-t border-primary/10">
            <Zap className={cn("w-3 h-3 shrink-0", compTip.color)} />
            <span className={cn("text-[10px] font-bold uppercase", compTip.color)}>
              Now: {compTip.priority}
            </span>
            <span className="text-[9px] text-muted-foreground">• Competition active</span>
          </div>
        )}

        {/* ── Expanded Detail (mode-aware) ── */}
        {expanded && (
          <div className="border-t border-muted animate-in slide-in-from-top-2 duration-200">
            <div className="p-3 space-y-4">
              {/* Water Quick-Add — moved here from collapsed view */}
              {!readOnly && (
                <div className="flex gap-2 items-center">
                  <Droplets className={cn("w-4 h-4 shrink-0", isSipOnly ? "text-orange-500" : "text-cyan-500")} />
                  {isSipOnly && (
                    <span className="text-[10px] text-orange-500 font-bold uppercase">SIP</span>
                  )}
                  {quickAddAmounts.map(oz => {
                    const isFlashed = flashedButton === oz;
                    return (
                      <button
                        key={oz}
                        onClick={(e) => { e.stopPropagation(); handleAddWater(oz); }}
                        className={cn(
                          "min-h-[44px] flex-1 text-sm font-semibold rounded-lg border transition-all active:scale-95",
                          isFlashed
                            ? "bg-cyan-500/30 border-cyan-500 text-cyan-500 scale-105"
                            : "border-muted bg-muted/30 hover:bg-muted/60 active:bg-muted"
                        )}
                      >
                        {isFlashed ? (
                          <span className="flex items-center justify-center gap-0.5">
                            <Check className="w-4 h-4" />
                            +{oz}
                          </span>
                        ) : (
                          `+${oz}oz`
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {showSliceTracker ? (
                /* Slice-based tracker: Protocol 5 uses SPAR foods, P1-4 uses Sugar Diet foods */
                <SparTracker
                  readOnly={readOnly}
                  embedded
                  restrictions={sparRestrictions}
                  foodOverride={sugarFoodOverride}
                  headerLabel={isSparProtocol ? undefined : 'Food & Slices'}
                  gramTargets={isSparProtocol ? undefined : macros}
                />
              ) : (
                /* Grams mode: gram-based tracker with Sugar System foods */
                <MacroTracker
                  macros={macros}
                  todaysFoods={todaysFoods}
                  foodLists={foodLists}
                  daysUntilWeighIn={daysUntilWeighIn}
                  protocol={protocol}
                  readOnly={readOnly}
                />
              )}

              {/* Full HydrationTracker — shared by both modes */}
              <HydrationTracker
                hydration={hydration}
                readOnly={readOnly}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
