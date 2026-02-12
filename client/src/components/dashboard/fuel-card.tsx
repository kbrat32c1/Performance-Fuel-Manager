/**
 * FuelCard — Dashboard nutrition progress card with gamified visuals.
 * Multi-segment animated ring, logging streak flame, category progress pills,
 * and satisfying completion animations. Tapping navigates to /food.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ChevronRight, Flame, Utensils, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { useStore } from "@/lib/store";

interface FuelCardProps {
  macros: {
    carbs: { min: number; max: number };
    protein: { min: number; max: number };
    ratio: string;
    note?: string;
    weightWarning?: string;
  };
  todaysFoods?: any;
  foodLists?: any;
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
  hydration,
  protocol,
  readOnly = false,
}: FuelCardProps) {
  const { getDailyTracking, updateDailyTracking, profile, getNutritionMode, getSliceTargets } = useStore();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);
  const [, setLocation] = useLocation();

  // Determine nutrition mode
  const nutritionMode = getNutritionMode();
  const isSparMode = nutritionMode === 'spar';
  const isSparProtocol = protocol === '5' || protocol === '6';
  const showSliceTracker = isSparMode;

  // ─── Cross-sync reconciliation on mode switch ───
  const prevModeRef = useRef(nutritionMode);
  useEffect(() => {
    if (prevModeRef.current === nutritionMode) return;
    prevModeRef.current = nutritionMode;

    const lastLoggedMode = tracking.nutritionMode;
    const updates: Record<string, any> = {};

    if (lastLoggedMode === 'spar') {
      const expectedCarbs = tracking.carbSlices * 30;
      const expectedProtein = tracking.proteinSlices * 25;
      if (Math.abs(tracking.carbsConsumed - expectedCarbs) > 5) updates.carbsConsumed = expectedCarbs;
      if (Math.abs(tracking.proteinConsumed - expectedProtein) > 5) updates.proteinConsumed = expectedProtein;
    } else {
      const expectedCarbSlices = Math.round(tracking.carbsConsumed / 26);
      const expectedProteinSlices = Math.round(tracking.proteinConsumed / 25);
      if (Math.abs(tracking.carbSlices - expectedCarbSlices) > 0) updates.carbSlices = expectedCarbSlices;
      if (Math.abs(tracking.proteinSlices - expectedProteinSlices) > 0) updates.proteinSlices = expectedProteinSlices;
    }

    if (Object.keys(updates).length > 0) updateDailyTracking(dateKey, updates);
  }, [nutritionMode, tracking, dateKey, updateDailyTracking]);

  // ─── Progress calculations ───
  const doNotEat = macros.carbs.max === 0 && macros.protein.max === 0 && macros.weightWarning;
  const sliceTargets = showSliceTracker ? getSliceTargets() : null;

  const sparBlockedSet = useMemo(() => {
    const blocked: string[] = [];
    if (macros.carbs.max === 0 && macros.protein.max === 0) {
      blocked.push('protein', 'carb');
      if (isSparProtocol) blocked.push('veg');
    } else if (macros.protein.max === 0) {
      blocked.push('protein');
      if (isSparProtocol) blocked.push('veg');
    }
    return new Set(blocked);
  }, [macros.carbs.max, macros.protein.max, isSparProtocol]);

  const isProteinBlocked = sparBlockedSet.has('protein');
  const isCarbBlocked = sparBlockedSet.has('carb');
  const isVegBlocked = sparBlockedSet.has('veg');

  const isV2 = sliceTargets ? (sliceTargets.isV2 || sliceTargets.fruit > 0 || sliceTargets.fat > 0) : false;

  // Slice progress
  const sparProteinPct = sliceTargets && !isProteinBlocked && sliceTargets.protein > 0 ? Math.min(100, (tracking.proteinSlices / sliceTargets.protein) * 100) : 0;
  const sparCarbPct = sliceTargets && !isCarbBlocked && sliceTargets.carb > 0 ? Math.min(100, (tracking.carbSlices / sliceTargets.carb) * 100) : 0;
  const sparVegPct = sliceTargets && !isVegBlocked && sliceTargets.veg > 0 ? Math.min(100, (tracking.vegSlices / sliceTargets.veg) * 100) : 0;
  const sparFruitPct = sliceTargets && sliceTargets.fruit > 0 ? Math.min(100, ((tracking.fruitSlices || 0) / sliceTargets.fruit) * 100) : 0;
  const sparFatPct = sliceTargets && sliceTargets.fat > 0 ? Math.min(100, ((tracking.fatSlices || 0) / sliceTargets.fat) * 100) : 0;

  const sparProteinDone = isProteinBlocked || (sliceTargets ? tracking.proteinSlices >= sliceTargets.protein : false);
  const sparCarbDone = isCarbBlocked || (sliceTargets ? tracking.carbSlices >= sliceTargets.carb : false);
  const sparVegDone = isVegBlocked || (sliceTargets ? tracking.vegSlices >= sliceTargets.veg : false);
  const sparFruitDone = !sliceTargets || sliceTargets.fruit === 0 || (tracking.fruitSlices || 0) >= sliceTargets.fruit;
  const sparFatDone = !sliceTargets || sliceTargets.fat === 0 || (tracking.fatSlices || 0) >= sliceTargets.fat;

  // Gram progress
  const carbProgress = macros.carbs.max > 0 ? Math.min(100, (tracking.carbsConsumed / macros.carbs.max) * 100) : 0;
  const proteinProgress = macros.protein.max > 0 ? Math.min(100, (tracking.proteinConsumed / macros.protein.max) * 100) : 0;
  const sugarCarbsDone = macros.carbs.max === 0 || carbProgress >= 100;
  const sugarProteinDone = macros.protein.max === 0 || proteinProgress >= 100;

  // Hydration
  const waterProgress = hydration.targetOz > 0 ? Math.min(100, (tracking.waterConsumed / hydration.targetOz) * 100) : 0;
  const waterDone = hydration.targetOz === 0 || waterProgress >= 100;
  const isSipOnly = hydration.type === 'Sip Only';

  const allDone = showSliceTracker
    ? sparProteinDone && sparCarbDone && sparVegDone && sparFruitDone && sparFatDone && waterDone
    : sugarCarbsDone && sugarProteinDone && waterDone;

  // Overall progress
  const overallProgress = useMemo(() => {
    const pcts: number[] = [];
    if (showSliceTracker && sliceTargets) {
      if (!isProteinBlocked && sliceTargets.protein > 0) pcts.push(sparProteinPct);
      if (!isCarbBlocked && sliceTargets.carb > 0) pcts.push(sparCarbPct);
      if (!isVegBlocked && sliceTargets.veg > 0) pcts.push(sparVegPct);
      if (isV2 && sliceTargets.fruit > 0) pcts.push(sparFruitPct);
      if (isV2 && sliceTargets.fat > 0) pcts.push(sparFatPct);
    } else {
      if (macros.carbs.max > 0) pcts.push(carbProgress);
      if (macros.protein.max > 0) pcts.push(proteinProgress);
    }
    if (hydration.targetOz > 0) pcts.push(waterProgress);
    return pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  }, [showSliceTracker, sliceTargets, isProteinBlocked, isCarbBlocked, isVegBlocked, isV2,
    sparProteinPct, sparCarbPct, sparVegPct, sparFruitPct, sparFatPct,
    carbProgress, proteinProgress, waterProgress, macros, hydration]);

  // ─── Logging streak ───
  const loggingStreak = useMemo(() => {
    let streak = 0;
    for (let d = 0; d < 60; d++) {
      const checkDate = subDays(today, d);
      const checkKey = format(checkDate, 'yyyy-MM-dd');
      const t = getDailyTracking(checkKey);
      const hasFood = (t.foodLog && t.foodLog.length > 0) || t.carbsConsumed > 0 || t.proteinConsumed > 0
        || t.proteinSlices > 0 || t.carbSlices > 0;
      if (hasFood) streak++;
      else if (d > 0) break; // day 0 (today) might not have logging yet
      else break;
    }
    return streak;
  }, [today, getDailyTracking]);

  // ─── Animated ring on mount ───
  const [ringAnimated, setRingAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRingAnimated(true), 150);
    return () => clearTimeout(t);
  }, []);
  const displayProgress = ringAnimated ? overallProgress : 0;

  // ─── Category segments for multi-segment ring ───
  const segments = useMemo(() => {
    const segs: Array<{ pct: number; stroke: string; label: string; done: boolean }> = [];
    if (doNotEat) return segs;
    if (showSliceTracker && sliceTargets) {
      if (!isProteinBlocked && sliceTargets.protein > 0) segs.push({ pct: sparProteinPct, stroke: 'stroke-orange-500', label: 'Pro', done: sparProteinDone });
      if (!isCarbBlocked && sliceTargets.carb > 0) segs.push({ pct: sparCarbPct, stroke: 'stroke-amber-500', label: 'Carb', done: sparCarbDone });
      if (!isVegBlocked && sliceTargets.veg > 0) segs.push({ pct: sparVegPct, stroke: 'stroke-emerald-500', label: 'Veg', done: sparVegDone });
      if (isV2 && sliceTargets.fruit > 0) segs.push({ pct: sparFruitPct, stroke: 'stroke-pink-500', label: 'Fruit', done: sparFruitDone });
      if (isV2 && sliceTargets.fat > 0) segs.push({ pct: sparFatPct, stroke: 'stroke-yellow-500', label: 'Fat', done: sparFatDone });
    } else {
      if (macros.carbs.max > 0) segs.push({ pct: carbProgress, stroke: 'stroke-amber-500', label: 'Carb', done: sugarCarbsDone });
      if (macros.protein.max > 0) segs.push({ pct: proteinProgress, stroke: 'stroke-orange-500', label: 'Pro', done: sugarProteinDone });
    }
    segs.push({ pct: waterProgress, stroke: 'stroke-cyan-500', label: '💧', done: waterDone });
    return segs;
  }, [doNotEat, showSliceTracker, sliceTargets, isProteinBlocked, isCarbBlocked, isVegBlocked, isV2,
    sparProteinPct, sparCarbPct, sparVegPct, sparFruitPct, sparFatPct, sparProteinDone, sparCarbDone,
    sparVegDone, sparFruitDone, sparFatDone, carbProgress, proteinProgress, sugarCarbsDone,
    sugarProteinDone, waterProgress, waterDone, macros]);

  // Ring geometry
  const r = 28;
  const circ = 2 * Math.PI * r;
  const gap = 5;
  const segCount = segments.length;
  const segArc = segCount > 0 ? (circ - gap * segCount) / segCount : circ;

  // Category pills for bottom row
  const pills = useMemo(() => {
    const p: Array<{ label: string; consumed: number | string; target: number | string; pct: number; done: boolean; color: string; blocked?: boolean }> = [];
    if (doNotEat) return p;
    if (showSliceTracker && sliceTargets) {
      if (sliceTargets.protein > 0) p.push({ label: 'Pro', consumed: tracking.proteinSlices, target: sliceTargets.protein, pct: sparProteinPct, done: sparProteinDone, color: 'orange', blocked: isProteinBlocked });
      if (sliceTargets.carb > 0) p.push({ label: 'Carb', consumed: tracking.carbSlices, target: sliceTargets.carb, pct: sparCarbPct, done: sparCarbDone, color: 'amber', blocked: isCarbBlocked });
      if (sliceTargets.veg > 0) p.push({ label: 'Veg', consumed: tracking.vegSlices, target: sliceTargets.veg, pct: sparVegPct, done: sparVegDone, color: 'emerald', blocked: isVegBlocked });
      if (isV2 && sliceTargets.fruit > 0) p.push({ label: 'Fruit', consumed: tracking.fruitSlices || 0, target: sliceTargets.fruit, pct: sparFruitPct, done: sparFruitDone, color: 'pink' });
      if (isV2 && sliceTargets.fat > 0) p.push({ label: 'Fat', consumed: tracking.fatSlices || 0, target: sliceTargets.fat, pct: sparFatPct, done: sparFatDone, color: 'yellow' });
    } else {
      if (macros.carbs.max > 0) p.push({ label: 'Carbs', consumed: `${tracking.carbsConsumed}g`, target: `${macros.carbs.max}g`, pct: carbProgress, done: sugarCarbsDone, color: 'amber' });
      if (macros.protein.max > 0) p.push({ label: 'Protein', consumed: `${tracking.proteinConsumed}g`, target: `${macros.protein.max}g`, pct: proteinProgress, done: sugarProteinDone, color: 'orange' });
    }
    p.push({ label: 'Water', consumed: `${tracking.waterConsumed}`, target: `${hydration.targetOz}oz`, pct: waterProgress, done: waterDone, color: 'cyan' });
    return p;
  }, [doNotEat, showSliceTracker, sliceTargets, isV2, tracking, macros, hydration,
    sparProteinPct, sparCarbPct, sparVegPct, sparFruitPct, sparFatPct,
    sparProteinDone, sparCarbDone, sparVegDone, sparFruitDone, sparFatDone,
    isProteinBlocked, isCarbBlocked, isVegBlocked,
    carbProgress, proteinProgress, sugarCarbsDone, sugarProteinDone, waterProgress, waterDone]);

  // Color mapping
  const colorMap: Record<string, { bg: string; text: string; fill: string; ring: string }> = {
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-500', fill: 'bg-orange-500', ring: 'ring-orange-500/20' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-500', fill: 'bg-amber-500', ring: 'ring-amber-500/20' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', fill: 'bg-emerald-500', ring: 'ring-emerald-500/20' },
    pink: { bg: 'bg-pink-500/10', text: 'text-pink-500', fill: 'bg-pink-500', ring: 'ring-pink-500/20' },
    yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-600', fill: 'bg-yellow-500', ring: 'ring-yellow-500/20' },
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-500', fill: 'bg-cyan-500', ring: 'ring-cyan-500/20' },
  };

  return (
    <Card
      data-tour="fuel"
      className={cn(
        "overflow-hidden transition-all duration-500 mt-3 cursor-pointer active:scale-[0.98]",
        allDone
          ? "bg-gradient-to-br from-green-500/8 to-emerald-500/5 border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.08)]"
          : "border-muted/40 hover:border-muted/60"
      )}
      onClick={() => setLocation('/food')}
    >
      <CardContent className="!p-0">
        <div className="px-4 pt-4 pb-3">
          {/* ── Top row: Ring + Header + Streak ── */}
          <div className="flex items-center gap-3.5">
            {/* Multi-segment progress ring */}
            <div className={cn(
              "w-16 h-16 relative shrink-0 transition-all duration-500",
              allDone && "drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]"
            )}>
              <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                {/* Background arcs */}
                {segments.map((_seg, i) => {
                  const offset = i * (segArc + gap);
                  return (
                    <circle key={`bg-${i}`} cx="32" cy="32" r={r} fill="none"
                      strokeWidth="5" strokeLinecap="round"
                      className="stroke-muted/15"
                      style={{ strokeDasharray: `${segArc} ${circ - segArc}`, strokeDashoffset: -offset }}
                    />
                  );
                })}
                {/* Filled arcs with animation */}
                {segments.map((seg, i) => {
                  const filled = ringAnimated ? segArc * (Math.min(seg.pct, 100) / 100) : 0;
                  const offset = i * (segArc + gap);
                  return (
                    <circle key={`fill-${i}`} cx="32" cy="32" r={r} fill="none"
                      strokeWidth="5" strokeLinecap="round"
                      className={cn(seg.done ? "stroke-green-500" : seg.stroke, "transition-all duration-1000 ease-out")}
                      style={{
                        strokeDasharray: `${filled} ${circ - filled}`,
                        strokeDashoffset: -offset,
                        filter: seg.done ? 'drop-shadow(0 0 3px rgba(34,197,94,0.5))' : undefined,
                      }}
                    />
                  );
                })}
              </svg>
              {/* Center content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {allDone ? (
                  <div className="animate-bounce-once">
                    <Check className="w-6 h-6 text-green-500" strokeWidth={3} />
                  </div>
                ) : (
                  <>
                    <span className="text-lg font-black leading-none text-foreground">{displayProgress}</span>
                    <span className="text-[7px] font-bold text-muted-foreground/50 uppercase tracking-widest">%</span>
                  </>
                )}
              </div>
            </div>

            {/* Header + streak */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-primary/70" />
                  <span className={cn("text-xs font-bold uppercase tracking-wide",
                    allDone ? "text-green-500" : "text-muted-foreground"
                  )}>
                    {allDone ? 'All fueled up!' : 'Nutrition'}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
              </div>

              {/* Streak badge */}
              {loggingStreak > 0 && (
                <div className={cn(
                  "inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold",
                  loggingStreak >= 7 ? "bg-orange-500/15 text-orange-500" :
                  loggingStreak >= 3 ? "bg-amber-500/15 text-amber-500" :
                  "bg-muted/30 text-muted-foreground"
                )}>
                  <Flame className={cn("w-3 h-3", loggingStreak >= 7 && "animate-pulse")} />
                  {loggingStreak} day{loggingStreak !== 1 ? 's' : ''}
                </div>
              )}

              {/* DO NOT EAT warning */}
              {doNotEat && (
                <div className="flex items-center gap-1.5 mt-1.5 text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-bold uppercase">Do not eat</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Category progress pills ── */}
          {!doNotEat && pills.length > 0 && (
            <div className="flex gap-1.5 mt-3 overflow-x-auto">
              {pills.map((pill) => {
                const c = colorMap[pill.color] || colorMap.amber;
                if (pill.blocked) {
                  return (
                    <div key={pill.label} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-muted/10 opacity-40">
                      <span className="text-[9px] font-bold text-muted-foreground line-through block text-center">{pill.label}</span>
                    </div>
                  );
                }
                return (
                  <div key={pill.label} className={cn(
                    "flex-1 min-w-0 px-2 py-1.5 rounded-lg transition-all duration-300 relative overflow-hidden",
                    pill.done ? "bg-green-500/10 ring-1 ring-green-500/20" : cn(c.bg, "ring-1", c.ring)
                  )}>
                    {/* Mini progress fill */}
                    <div className={cn(
                      "absolute bottom-0 left-0 h-[2px] rounded-full transition-all duration-700 ease-out",
                      pill.done ? "bg-green-500" : c.fill
                    )} style={{ width: `${Math.min(pill.pct, 100)}%` }} />
                    <div className="text-center relative">
                      <span className={cn("text-[9px] font-bold uppercase block leading-tight",
                        pill.done ? "text-green-500" : c.text
                      )}>
                        {pill.done ? '✓' : ''}{pill.label}
                      </span>
                      <span className={cn("text-[11px] font-mono font-black leading-tight block",
                        pill.done ? "text-green-500" : "text-foreground"
                      )}>
                        {pill.consumed}<span className="text-muted-foreground/40 font-normal">/{pill.target}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
