import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { MobileLayout } from "@/components/mobile-layout";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft, Utensils, Droplets, Check, Clock, AlertTriangle,
  ChevronDown, Ban, Target, Plus, History
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useStore } from "@/lib/store";
import { MacroBar } from "@/components/ui/macro-bar";
import { alignGuideWithProtein, getTodaysFuelGuide } from "@/lib/food-data";
import { getProtocolPhase, CARB_LABELS, PROTEIN_LABELS } from "@/lib/phase-helpers";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FoodHistoryPanel } from "@/components/food-history-panel";

export default function Fuel() {
  const [, setLocation] = useLocation();
  const {
    profile, getDailyTracking,
    getDaysUntilWeighIn, getMacroTargets, getHydrationTarget,
    getNutritionMode, getSliceTargets,
    getWeeklyCompliance, getWeekDescentData,
  } = useStore();

  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);
  const daysUntilWeighIn = getDaysUntilWeighIn();
  const protocol = profile.protocol;
  const macros = getMacroTargets();
  const hydration = getHydrationTarget();
  const nutritionMode = getNutritionMode();
  const isSparMode = nutritionMode === 'spar';
  const showSliceTracker = isSparMode;
  const sliceTargets = showSliceTracker ? getSliceTargets() : null;
  // todaysFoods/foodLists removed — embedded trackers replaced with AddFoodFlow

  const phaseInfo = getProtocolPhase(protocol, daysUntilWeighIn, macros.ratio, profile.waterLoading !== false);

  // Guide data — only shown in grams mode (sugar system food recommendations)
  const guide = useMemo(() => {
    if (isSparMode) return null;
    return alignGuideWithProtein(getTodaysFuelGuide(protocol, daysUntilWeighIn), daysUntilWeighIn, macros.protein);
  }, [protocol, daysUntilWeighIn, isSparMode, macros.protein.min, macros.protein.max]);

  // ─── Progress calculations ───
  const carbProgress = macros.carbs.max > 0 ? Math.min(100, (tracking.carbsConsumed / macros.carbs.max) * 100) : 0;
  const proteinProgress = macros.protein.max > 0 ? Math.min(100, (tracking.proteinConsumed / macros.protein.max) * 100) : 0;
  const waterProgress = hydration.targetOz > 0 ? Math.min(100, (tracking.waterConsumed / hydration.targetOz) * 100) : 0;

  const sparBlockedSet = useMemo(() => {
    const blocked: string[] = [];
    if (macros.carbs.max === 0 && macros.protein.max === 0) {
      blocked.push('protein', 'carb');
      if (isSparMode) blocked.push('veg');
    } else if (macros.protein.max === 0) {
      blocked.push('protein');
      if (isSparMode) blocked.push('veg');
    }
    return new Set(blocked);
  }, [macros.carbs.max, macros.protein.max, isSparMode]);

  const isProteinBlocked = sparBlockedSet.has('protein');
  const isCarbBlocked = sparBlockedSet.has('carb');
  const isVegBlocked = sparBlockedSet.has('veg');

  const sparProteinProgress = sliceTargets && !isProteinBlocked && sliceTargets.protein > 0 ? Math.min(100, (tracking.proteinSlices / sliceTargets.protein) * 100) : 0;
  const sparCarbProgress = sliceTargets && !isCarbBlocked && sliceTargets.carb > 0 ? Math.min(100, (tracking.carbSlices / sliceTargets.carb) * 100) : 0;
  const sparVegProgress = sliceTargets && !isVegBlocked && sliceTargets.veg > 0 ? Math.min(100, (tracking.vegSlices / sliceTargets.veg) * 100) : 0;
  // P5 v2: fruit & fat progress
  const isV2 = sliceTargets ? (sliceTargets.isV2 || sliceTargets.fruit > 0 || sliceTargets.fat > 0) : false;
  const sparFruitProgress = sliceTargets && sliceTargets.fruit > 0 ? Math.min(100, ((tracking.fruitSlices || 0) / sliceTargets.fruit) * 100) : 0;
  const sparFatProgress = sliceTargets && sliceTargets.fat > 0 ? Math.min(100, ((tracking.fatSlices || 0) / sliceTargets.fat) * 100) : 0;

  const sugarCarbsDone = macros.carbs.max === 0 || carbProgress >= 100;
  const sugarProteinDone = macros.protein.max === 0 || proteinProgress >= 100;
  const sparProteinDone = isProteinBlocked ? true : (sliceTargets ? tracking.proteinSlices >= sliceTargets.protein : false);
  const sparCarbDone = isCarbBlocked ? true : (sliceTargets ? tracking.carbSlices >= sliceTargets.carb : false);
  const sparVegDone = isVegBlocked ? true : (sliceTargets ? tracking.vegSlices >= sliceTargets.veg : false);
  const sparFruitDone = !sliceTargets || sliceTargets.fruit === 0 || (tracking.fruitSlices || 0) >= sliceTargets.fruit;
  const sparFatDone = !sliceTargets || sliceTargets.fat === 0 || (tracking.fatSlices || 0) >= sliceTargets.fat;
  const waterDone = hydration.targetOz === 0 || waterProgress >= 100;
  const isSipOnly = hydration.type === 'Sip Only';

  const allDone = showSliceTracker
    ? sparProteinDone && sparCarbDone && sparVegDone && sparFruitDone && sparFatDone && waterDone
    : sugarCarbsDone && sugarProteinDone && waterDone;

  // Overall progress
  const overallProgress = useMemo(() => {
    const pcts: number[] = [];
    if (showSliceTracker && sliceTargets) {
      if (!isProteinBlocked && sliceTargets.protein > 0) pcts.push(sparProteinProgress);
      if (!isCarbBlocked && sliceTargets.carb > 0) pcts.push(sparCarbProgress);
      if (!isVegBlocked && sliceTargets.veg > 0) pcts.push(sparVegProgress);
      if (sliceTargets.fruit > 0) pcts.push(sparFruitProgress);
      if (sliceTargets.fat > 0) pcts.push(sparFatProgress);
    } else {
      if (macros.carbs.max > 0) pcts.push(carbProgress);
      if (macros.protein.max > 0) pcts.push(proteinProgress);
    }
    if (hydration.targetOz > 0) pcts.push(waterProgress);
    return pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  }, [showSliceTracker, sliceTargets, isProteinBlocked, isCarbBlocked, isVegBlocked,
    sparProteinProgress, sparCarbProgress, sparVegProgress, sparFruitProgress, sparFatProgress,
    carbProgress, proteinProgress, waterProgress]);

  // Open AddFoodFlow or water FAB
  const openAddFood = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-add-food', { detail: {} }));
  }, []);
  const openWaterFAB = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { openTab: 'water' } }));
  }, []);

  // Weekly compliance for streak dots
  const weeklyCompliance = useMemo(() => {
    try { return getWeeklyCompliance(); } catch { return null; }
  }, [getWeeklyCompliance]);

  // Streak data
  const insights = useMemo(() => {
    try { return getWeekDescentData(); } catch { return null; }
  }, [getWeekDescentData]);
  const loggingStreak = insights?.loggingStreak || 0;

  // Food history Sheet
  const [historyOpen, setHistoryOpen] = useState(false);
  const foodLogCount = (tracking.foodLog || []).length;
  // Fuel tab selection — auto-select first incomplete macro
  type FuelTab = 'carbs' | 'protein' | 'water' | 'guide';
  const [fuelTab, setFuelTab] = useState<FuelTab>(() => {
    const cd = showSliceTracker ? sparCarbDone : sugarCarbsDone;
    const pd = showSliceTracker ? sparProteinDone : sugarProteinDone;
    if (!cd && !isCarbBlocked) return 'carbs';
    if (!pd && !isProteinBlocked) return 'protein';
    if (!waterDone) return 'water';
    return 'guide'; // all done — show the guide
  });

  // sparCategoryFromTab/macroFilterFromTab removed — embedded trackers replaced with AddFoodFlow

  // Ring fill animation — start at 0 and animate to actual value
  const [ringAnimated, setRingAnimated] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setRingAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);
  const displayProgress = ringAnimated ? overallProgress : 0;

  // MacroBar imported from @/components/ui/macro-bar

  return (
    <MobileLayout className="lg:max-w-4xl">
      <div className="animate-in fade-in duration-300">
        {/* ── Header: Back + Phase Identity ── */}
        <div className="flex items-center gap-3">
          <button
            aria-label="Back to dashboard"
            onClick={() => setLocation('/dashboard')}
            className="w-9 h-9 rounded-xl relative after:absolute after:-inset-1 bg-muted/30 flex items-center justify-center hover:bg-muted/50 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{phaseInfo.emoji}</span>
              <span className={cn("text-sm font-black uppercase tracking-wider", phaseInfo.color)}>
                {phaseInfo.phase}
              </span>
              {daysUntilWeighIn >= 0 && (
                <span className={cn(
                  "text-xs font-mono font-black flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ml-auto",
                  daysUntilWeighIn === 0 ? "text-yellow-500 bg-yellow-500/10" :
                  daysUntilWeighIn === 1 ? "text-red-500 bg-red-500/10" :
                  daysUntilWeighIn <= 3 ? "text-orange-500 bg-orange-500/10" :
                  "text-muted-foreground/60 bg-muted/20"
                )}>
                  <Clock className="w-3 h-3" />
                  {daysUntilWeighIn === 0 ? 'TODAY' : `${daysUntilWeighIn}d`}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/60 mt-0.5">{phaseInfo.foodTip}</p>
          </div>
        </div>

        {/* ── Two-column layout: left = progress/guide/compliance, right = food tracker ── */}
        <div className="lg:grid lg:grid-cols-[1fr_1.2fr] lg:gap-6 space-y-4 lg:space-y-0 mt-4">
        <div className="space-y-4">

        {/* ── Overall Progress Ring + Number ── */}
        <Card className={cn(
          "p-4 transition-all",
          allDone ? "border-green-500/30 bg-green-500/5" : "border-muted/30"
        )}>
          <div className="flex items-center gap-4">
            {/* Big ring with animate-on-load */}
            <div className={cn("w-20 h-20 relative shrink-0", allDone && "animate-ring-glow text-green-500")}>
              <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" strokeWidth="6" className="stroke-muted/15" />
                <circle cx="40" cy="40" r="34" fill="none" strokeWidth="6" strokeLinecap="round"
                  className={cn(
                    allDone ? "stroke-green-500" :
                    overallProgress > 66 ? "stroke-blue-500" :
                    overallProgress > 33 ? "stroke-amber-500" :
                    "stroke-orange-500",
                    "transition-all duration-1000 ease-out"
                  )}
                  style={{
                    strokeDasharray: 2 * Math.PI * 34,
                    strokeDashoffset: 2 * Math.PI * 34 * (1 - displayProgress / 100),
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {allDone ? (
                  <Check className="w-7 h-7 text-green-500" />
                ) : (
                  <>
                    <span className="text-xl font-black text-foreground">{displayProgress}</span>
                    <span className="text-xs font-bold text-muted-foreground/50 -mt-0.5">%</span>
                  </>
                )}
              </div>
              {/* Streak flame */}
              {loggingStreak >= 2 && (
                <div className="absolute -top-1 -right-1 flex items-center gap-0.5 bg-orange-500/15 text-orange-500 rounded-full px-1.5 py-0.5 text-xs font-black border border-orange-500/30 animate-in zoom-in duration-300">
                  <span>🔥</span>{loggingStreak}
                </div>
              )}
            </div>

            {/* Progress bars */}
            <div className="flex-1 space-y-2">
              {showSliceTracker && sliceTargets ? (
                <>
                  {!isCarbBlocked && sliceTargets.carb > 0 && (
                    <MacroBar label="Carbs" consumed={tracking.carbSlices} target={sliceTargets.carb} color="bg-amber-500" variant="stacked" />
                  )}
                  {!isProteinBlocked && sliceTargets.protein > 0 && (
                    <MacroBar label="Protein" consumed={tracking.proteinSlices} target={sliceTargets.protein} color="bg-orange-500" variant="stacked" />
                  )}
                  {!isVegBlocked && sliceTargets.veg > 0 && (
                    <MacroBar label="Veg" consumed={tracking.vegSlices} target={sliceTargets.veg} color="bg-green-500" variant="stacked" />
                  )}
                  {isV2 && sliceTargets.fruit > 0 && (
                    <MacroBar label="Fruit" consumed={tracking.fruitSlices || 0} target={sliceTargets.fruit} color="bg-pink-500" variant="stacked" />
                  )}
                  {isV2 && sliceTargets.fat > 0 && (
                    <MacroBar label="Fat" consumed={tracking.fatSlices || 0} target={sliceTargets.fat} color="bg-yellow-600" variant="stacked" />
                  )}
                </>
              ) : (
                <>
                  <>
                      {macros.carbs.max > 0 && (
                        <MacroBar label="Carbs" consumed={tracking.carbsConsumed} target={macros.carbs.max} color="bg-amber-500" unit="g" variant="stacked" />
                      )}
                      {macros.protein.max > 0 && (
                        <MacroBar label="Protein" consumed={tracking.proteinConsumed} target={macros.protein.max} color="bg-orange-500" unit="g" variant="stacked" />
                      )}
                  </>
                </>
              )}
              <MacroBar label="Water" consumed={tracking.waterConsumed} target={hydration.targetOz} color="bg-cyan-500" unit="oz" variant="stacked" />
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="flex gap-2 pt-3 mt-3 border-t border-muted/10">
            <button
              onClick={openAddFood}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 text-primary text-xs font-bold active:scale-[0.98] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Food
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/30 text-muted-foreground hover:bg-muted/50 text-xs font-bold transition-all"
            >
              <History className="w-3.5 h-3.5" />
              Food Log{foodLogCount > 0 ? ` (${foodLogCount})` : ''}
            </button>
          </div>
        </Card>

        {/* ── Tabbed Fuel Section (P1-4: Carbs/Protein/Water/Guide, P5: Water only) ── */}
        {guide && protocol !== '5' && protocol !== '6' ? (
          <Card className="p-0 overflow-hidden border-muted/30">
            {/* Tab bar */}
            <div className="flex border-b border-muted/20">
              {([
                { id: 'carbs' as FuelTab, label: 'Carbs', icon: '🍚', color: 'text-amber-500', border: 'border-amber-500', done: showSliceTracker ? sparCarbDone : sugarCarbsDone, blocked: isCarbBlocked },
                { id: 'protein' as FuelTab, label: 'Protein', icon: '🥩', color: 'text-orange-500', border: 'border-orange-500', done: showSliceTracker ? sparProteinDone : sugarProteinDone, blocked: isProteinBlocked },
                { id: 'water' as FuelTab, label: 'Water', icon: '💧', color: 'text-cyan-500', border: 'border-cyan-500', done: waterDone, blocked: false },
                { id: 'guide' as FuelTab, label: 'Guide', icon: '📋', color: 'text-muted-foreground', border: 'border-primary', done: false, blocked: false },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFuelTab(tab.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-bold transition-all border-b-2 -mb-[1px]",
                    tab.blocked
                      ? "text-muted-foreground/30 line-through border-transparent"
                      : fuelTab === tab.id
                      ? cn(tab.color, tab.border)
                      : "text-muted-foreground/60 border-transparent hover:text-muted-foreground"
                  )}
                  disabled={tab.blocked}
                >
                  <span className="text-xs">{tab.done && !tab.blocked ? '✅' : tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="px-4 py-3 animate-in fade-in duration-150">
              {/* ── Carbs Tab ── */}
              {fuelTab === 'carbs' && (
                <div className="space-y-3">
                  {/* Progress */}
                  {showSliceTracker && sliceTargets && !isCarbBlocked ? (
                    <MacroBar label="Carbs" consumed={tracking.carbSlices} target={sliceTargets.carb} color="bg-amber-500" variant="stacked" />
                  ) : macros.carbs.max > 0 ? (
                    <MacroBar label="Carbs" consumed={tracking.carbsConsumed} target={macros.carbs.max} color="bg-amber-500" unit="g" variant="stacked" />
                  ) : null}

                  {/* Meal timing context */}
                  {guide.mealGuide && (() => {
                    const hour = new Date().getHours();
                    const current = hour < 12
                      ? { time: 'Morning', tip: guide.mealGuide.morning, icon: '🌅' }
                      : hour < 17
                      ? { time: 'Afternoon', tip: guide.mealGuide.afternoon, icon: '☀️' }
                      : { time: 'Evening', tip: guide.mealGuide.evening, icon: '🌙' };
                    return (
                      <div className="flex gap-2 items-center bg-muted/10 rounded-lg px-2.5 py-1.5">
                        <span className="text-sm shrink-0">{current.icon}</span>
                        <span className="text-xs text-foreground/60">{current.tip}</span>
                      </div>
                    );
                  })()}

                  {/* Food pills (read-only: what to eat) */}
                  {guide.eatCarbs.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-amber-500/60 uppercase mb-1.5">What to eat</p>
                      <div className="flex flex-wrap gap-1.5">
                        {guide.eatCarbs.map(f => (
                          <span
                            key={f.name}
                            className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-amber-500/10 text-amber-400"
                          >
                            {f.name} <span className="text-amber-500/50">{f.carbs}g</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Log Food button — opens AddFoodFlow */}
                  {!(showSliceTracker ? sparCarbDone : sugarCarbsDone) && !isCarbBlocked && (
                    <button
                      onClick={openAddFood}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500/15 text-amber-500 font-bold text-sm border border-amber-500/30 active:scale-[0.98] transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Log Food
                    </button>
                  )}
                </div>
              )}

              {/* ── Protein Tab ── */}
              {fuelTab === 'protein' && (
                <div className="space-y-3">
                  {/* Progress */}
                  {isProteinBlocked ? (
                    <div className="flex items-center gap-2 text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                      <Ban className="w-4 h-4" />
                      <span className="text-xs font-bold">Protein blocked this phase</span>
                    </div>
                  ) : showSliceTracker && sliceTargets ? (
                    <MacroBar label="Protein" consumed={tracking.proteinSlices} target={sliceTargets.protein} color="bg-orange-500" variant="stacked" />
                  ) : macros.protein.max > 0 ? (
                    <MacroBar label="Protein" consumed={tracking.proteinConsumed} target={macros.protein.max} color="bg-orange-500" unit="g" variant="stacked" />
                  ) : null}

                  {/* Food pills (read-only: what to eat) */}
                  {!isProteinBlocked && guide.eatProtein.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-orange-500/60 uppercase mb-1.5">What to eat</p>
                      <div className="flex flex-wrap gap-1.5">
                        {guide.eatProtein.map(f => (
                          <span
                            key={f.name}
                            className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-orange-500/10 text-orange-400"
                          >
                            {f.name} <span className="text-orange-500/50">{f.protein}g</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Log Food button — opens AddFoodFlow */}
                  {!isProteinBlocked && !(showSliceTracker ? sparProteinDone : sugarProteinDone) && (
                    <button
                      onClick={openAddFood}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500/15 text-orange-500 font-bold text-sm border border-orange-500/30 active:scale-[0.98] transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Log Food
                    </button>
                  )}
                </div>
              )}

              {/* ── Water Tab ── */}
              {fuelTab === 'water' && (
                <div className="space-y-3">
                  <MacroBar label="Water" consumed={tracking.waterConsumed} target={hydration.targetOz} color="bg-cyan-500" unit="oz" variant="stacked" />

                  {isSipOnly && (
                    <div className="flex items-center gap-2 text-orange-500 bg-orange-500/10 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-bold">Sip only — small amounts</span>
                    </div>
                  )}

                  {/* Log Water button — opens FAB water tab */}
                  {!waterDone && (
                    <button
                      onClick={openWaterFAB}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500/15 text-cyan-500 font-bold text-sm border border-cyan-500/30 active:scale-[0.98] transition-all"
                    >
                      <Droplets className="w-4 h-4" />
                      Log Water
                    </button>
                  )}
                </div>
              )}

              {/* ── Guide Tab ── */}
              {fuelTab === 'guide' && (
                <div className="space-y-3">
                  {/* Meal timing — all windows */}
                  {guide.mealGuide && (
                    <div className="space-y-2">
                      {[
                        { time: 'Morning', tip: guide.mealGuide.morning, icon: '🌅' },
                        { time: 'Afternoon', tip: guide.mealGuide.afternoon, icon: '☀️' },
                        { time: 'Evening', tip: guide.mealGuide.evening, icon: '🌙' },
                      ].map(({ time, tip, icon }) => (
                        <div key={time} className="flex gap-2 items-start">
                          <span className="text-sm shrink-0">{icon}</span>
                          <div>
                            <span className="text-xs font-bold text-muted-foreground uppercase">{time}</span>
                            <p className="text-xs text-foreground/80 leading-snug">{tip}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Badges */}
                  <div className="flex items-center gap-2">
                    {(() => {
                      const ci = CARB_LABELS[guide.carbType] || CARB_LABELS.mixed;
                      return <span className={cn("text-xs font-bold px-2 py-1 rounded-lg", ci.color, ci.bg)}>{ci.label}</span>;
                    })()}
                    {(() => {
                      const pi = PROTEIN_LABELS[guide.proteinStatus] || PROTEIN_LABELS.full;
                      return <span className={cn("text-xs font-bold px-2 py-1 rounded-lg", pi.color, pi.bg)}>{pi.label}</span>;
                    })()}
                  </div>

                  {/* Avoid list */}
                  {guide.avoidFoods.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                      <p className="text-xs font-bold text-red-400 uppercase mb-1 flex items-center gap-1">
                        <Ban className="w-3 h-3" /> Avoid
                      </p>
                      <p className="text-xs text-red-400/70 leading-snug">{guide.avoidSummary}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        ) : (
          /* P5 / SPAR: Just water progress + log button (no food guide) */
          <Card className="p-4 border-muted/30 space-y-3">
            <MacroBar label="Water" consumed={tracking.waterConsumed} target={hydration.targetOz} color="bg-cyan-500" unit="oz" variant="stacked" />
            {!waterDone && (
              <button
                onClick={() => openWaterFAB()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500/15 text-cyan-500 font-bold text-sm border border-cyan-500/30 active:scale-[0.98] transition-all"
              >
                <Droplets className="w-4 h-4" />
                Log Water
              </button>
            )}
          </Card>
        )}

        {/* ── Weekly Compliance Summary ── */}
        {weeklyCompliance && weeklyCompliance.daysTracked > 0 && (
          <Card className="p-4 border-muted/30">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> 7-Day Compliance ({weeklyCompliance.daysTracked} days tracked)
            </p>

            {/* Category compliance bars */}
            <div className="space-y-2">
              {[
                { label: 'Protein', data: weeklyCompliance.protein, color: 'bg-orange-500' },
                { label: 'Carbs', data: weeklyCompliance.carb, color: 'bg-amber-500' },
                { label: 'Veggies', data: weeklyCompliance.veg, color: 'bg-green-500' },
                { label: 'Fruit', data: weeklyCompliance.fruit, color: 'bg-pink-500' },
                { label: 'Fats', data: weeklyCompliance.fat, color: 'bg-yellow-600' },
              ].filter(c => c.data.avgTarget > 0).map(({ label, data, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-12 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", data.percentage >= 80 ? "bg-green-500" : color)}
                      style={{ width: `${Math.min(data.percentage, 100)}%` }} />
                  </div>
                  <span className={cn("text-xs font-mono font-bold w-8 text-right",
                    data.percentage >= 80 ? "text-green-500" : "text-muted-foreground"
                  )}>{data.percentage}%</span>
                </div>
              ))}
            </div>

            {/* Insight */}
            <div className="mt-3 pt-2 border-t border-muted/10">
              <p className="text-xs text-muted-foreground/70 leading-snug">{weeklyCompliance.insight}</p>
            </div>
          </Card>
        )}
        </div>{/* end left column */}

        {/* ── Right column: Food Progress Summary + Add Food ── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="p-4 border-muted/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-primary/70" />
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {showSliceTracker ? 'Food & Slices' : 'Food & Macros'}
                </span>
              </div>
              <button
                onClick={() => setHistoryOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 text-muted-foreground text-xs font-bold transition-all"
              >
                <History className="w-3.5 h-3.5" />
                Log{foodLogCount > 0 ? ` (${foodLogCount})` : ''}
              </button>
            </div>

            {/* Progress bars */}
            <div className="space-y-2.5">
              {macros.weightWarning && (
                <div className="flex items-start gap-2 text-chart-3 bg-chart-3/10 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="text-xs font-medium">{macros.weightWarning}</span>
                </div>
              )}
              {showSliceTracker && sliceTargets ? (
                <>
                  {!isProteinBlocked && sliceTargets.protein > 0 && (
                    <MacroBar label="Protein" consumed={tracking.proteinSlices} target={sliceTargets.protein} color="bg-orange-500" variant="stacked" />
                  )}
                  {!isCarbBlocked && sliceTargets.carb > 0 && (
                    <MacroBar label="Carbs" consumed={tracking.carbSlices} target={sliceTargets.carb} color="bg-amber-500" variant="stacked" />
                  )}
                  {!isVegBlocked && sliceTargets.veg > 0 && (
                    <MacroBar label="Veggies" consumed={tracking.vegSlices} target={sliceTargets.veg} color="bg-emerald-500" variant="stacked" />
                  )}
                  {isV2 && sliceTargets.fruit > 0 && (
                    <MacroBar label="Fruit" consumed={tracking.fruitSlices || 0} target={sliceTargets.fruit} color="bg-pink-500" variant="stacked" />
                  )}
                  {isV2 && sliceTargets.fat > 0 && (
                    <MacroBar label="Fats" consumed={tracking.fatSlices || 0} target={sliceTargets.fat} color="bg-yellow-500" variant="stacked" />
                  )}
                </>
              ) : (
                <>
                  {macros.carbs.max > 0 && (
                    <MacroBar label="Carbs" consumed={tracking.carbsConsumed} target={macros.carbs.max} color="bg-amber-500" unit="g" variant="stacked" />
                  )}
                  {macros.protein.max > 0 && (
                    <MacroBar label="Protein" consumed={tracking.proteinConsumed} target={macros.protein.max} color="bg-orange-500" unit="g" variant="stacked" />
                  )}
                </>
              )}
            </div>

            {/* Add Food button */}
              <button
                onClick={openAddFood}
                className="w-full flex items-center justify-center gap-2 mt-4 py-3 rounded-xl bg-primary/10 text-primary font-bold text-sm active:scale-[0.98] transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Food
              </button>
          </Card>
        </div>
        </div>{/* end grid */}
      </div>

      {/* ── Food History Sheet ── */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[420px] p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-muted/20 shrink-0">
            <SheetTitle className="text-sm font-bold uppercase tracking-wide">
              Today's Food Log
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <FoodHistoryPanel dateKey={dateKey} />
          </div>
        </SheetContent>
      </Sheet>
    </MobileLayout>
  );
}
