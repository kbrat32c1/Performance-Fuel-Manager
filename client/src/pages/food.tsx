/**
 * Food Page — Standalone FatSecret-style food diary.
 * Shows meal sections (Breakfast/Lunch/Dinner/Snacks) with inline entries,
 * daily macro summary, and opens AddFoodFlow for adding foods.
 * This is the primary food tab destination in the bottom nav.
 */

import { useState, useMemo, useCallback } from "react";
import { MobileLayout } from "@/components/mobile-layout";
import { cn } from "@/lib/utils";
import { format, subDays, addDays } from "date-fns";
import { useStore, type MealSection, inferMealSection } from "@/lib/store";
import { FoodDiary } from "@/components/food-diary";
import { AddFoodFlow } from "@/components/add-food-flow";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  ChevronLeft, ChevronRight, CalendarDays,
  Droplets, Plus, Minus,
} from "lucide-react";
import { hapticTap, hapticSuccess } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";
import { MacroBar } from "@/components/ui/macro-bar";

export default function Food() {
  const {
    profile, getDailyTracking, updateDailyTracking,
    getMacroTargets, getHydrationTarget, getNutritionMode,
    getSliceTargets, getDaysUntilWeighIn,
  } = useStore();
  const { toast } = useToast();

  const today = profile.simulatedDate || new Date();
  const [dateOffset, setDateOffset] = useState(0);
  const currentDate = dateOffset === 0 ? today : addDays(today, dateOffset);
  const dateKey = format(currentDate, 'yyyy-MM-dd');
  const isToday = dateOffset === 0;

  const tracking = getDailyTracking(dateKey);
  const macros = getMacroTargets();
  const hydration = getHydrationTarget();
  const nutritionMode = getNutritionMode();
  const isSparMode = nutritionMode === 'spar';
  const isSparProtocol = profile.protocol === '5' || profile.protocol === '6';
  const showSliceTracker = isSparMode;
  const sliceTargets = showSliceTracker ? getSliceTargets() : null;
  const daysUntilWeighIn = getDaysUntilWeighIn();

  // Blocked categories for protocol restrictions
  const blockedCategories = useMemo(() => {
    if (!showSliceTracker) return undefined;
    const blocked: string[] = [];
    if (macros.carbs.max === 0 && macros.protein.max === 0) {
      blocked.push('protein', 'carb', 'veg');
    } else if (macros.protein.max === 0) {
      blocked.push('protein', 'veg');
    }
    return blocked.length > 0 ? blocked : undefined;
  }, [showSliceTracker, macros.carbs.max, macros.protein.max]);

  const isV2 = sliceTargets ? (sliceTargets.isV2 || sliceTargets.fruit > 0 || sliceTargets.fat > 0) : false;

  // ─── Progress ───
  const waterDone = hydration.targetOz === 0 || (hydration.targetOz > 0 && tracking.waterConsumed >= hydration.targetOz);

  const doNotEat = macros.carbs.max === 0 && macros.protein.max === 0 && macros.weightWarning;

  // ─── Add Food Flow ───
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [addFoodMeal, setAddFoodMeal] = useState<MealSection>(() => inferMealSection(new Date().toISOString()));

  const handleAddFood = useCallback((mealSection: MealSection) => {
    setAddFoodMeal(mealSection);
    setAddFoodOpen(true);
    hapticTap();
  }, []);

  // ─── Repeat Yesterday ───
  const yesterdayKey = format(subDays(currentDate, 1), 'yyyy-MM-dd');
  const yesterdayTracking = getDailyTracking(yesterdayKey);
  const yesterdayFoodLog = yesterdayTracking.foodLog || [];
  const hasYesterday = yesterdayFoodLog.length > 0;

  const handleRepeatYesterday = useCallback(() => {
    if (!hasYesterday) return;
    const updates: Record<string, any> = {};
    let carbsAdded = 0;
    let proteinAdded = 0;
    let waterAdded = 0;
    const sliceDelta: Record<string, number> = {};

    for (const entry of yesterdayFoodLog) {
      if (entry.mode === 'spar' && entry.sliceType) {
        const key = entry.sliceType === 'protein' ? 'proteinSlices'
          : entry.sliceType === 'carb' ? 'carbSlices'
          : entry.sliceType === 'veg' ? 'vegSlices'
          : entry.sliceType === 'fruit' ? 'fruitSlices'
          : 'fatSlices';
        sliceDelta[key] = (sliceDelta[key] || 0) + (entry.sliceCount || 1);
        if (entry.sliceType === 'protein') proteinAdded += (entry.gramAmount || 25) * (entry.sliceCount || 1);
        if (entry.sliceType === 'carb') carbsAdded += (entry.gramAmount || 30) * (entry.sliceCount || 1);
      } else if (entry.mode === 'sugar' && entry.macroType) {
        if (entry.macroType === 'carbs') carbsAdded += (entry.gramAmount || 0);
        if (entry.macroType === 'protein') proteinAdded += (entry.gramAmount || 0);
      }
      if (entry.liquidOz) waterAdded += entry.liquidOz;
    }

    for (const [key, delta] of Object.entries(sliceDelta)) {
      const current = key === 'proteinSlices' ? tracking.proteinSlices
        : key === 'carbSlices' ? tracking.carbSlices
        : key === 'vegSlices' ? tracking.vegSlices
        : key === 'fruitSlices' ? (tracking.fruitSlices || 0)
        : (tracking.fatSlices || 0);
      updates[key] = current + delta;
    }

    if (carbsAdded > 0) updates.carbsConsumed = tracking.carbsConsumed + carbsAdded;
    if (proteinAdded > 0) updates.proteinConsumed = tracking.proteinConsumed + proteinAdded;
    if (waterAdded > 0) updates.waterConsumed = tracking.waterConsumed + waterAdded;
    if (showSliceTracker) updates.nutritionMode = 'spar';

    const newEntries = yesterdayFoodLog.map(e => ({
      ...e,
      id: `${Date.now()}-copy-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      mealSection: e.mealSection || inferMealSection(e.timestamp),
    }));
    const existingLog = tracking.foodLog || [];
    updates.foodLog = [...existingLog, ...newEntries];

    updateDailyTracking(dateKey, updates);
    hapticSuccess();
    toast({ title: `Copied ${yesterdayFoodLog.length} items from yesterday` });
  }, [hasYesterday, yesterdayFoodLog, tracking, dateKey, updateDailyTracking, showSliceTracker, toast]);

  // ─── Water Controls ───
  const [editingWater, setEditingWater] = useState(false);
  const [waterInput, setWaterInput] = useState('');

  const handleQuickWater = useCallback((oz: number) => {
    const newVal = Math.max(0, tracking.waterConsumed + oz);
    updateDailyTracking(dateKey, { waterConsumed: newVal });
    hapticSuccess();
  }, [dateKey, tracking.waterConsumed, updateDailyTracking]);

  const handleSetWater = useCallback((oz: number) => {
    updateDailyTracking(dateKey, { waterConsumed: Math.max(0, oz) });
    setEditingWater(false);
    hapticSuccess();
  }, [dateKey, updateDailyTracking]);

  return (
    <MobileLayout className="lg:max-w-2xl">
      <div className="animate-in fade-in duration-300 space-y-2">

        {/* ── Date Nav ── */}
        <div className="flex items-center justify-between px-1">
          <button onClick={() => setDateOffset(d => d - 1)} className="p-2 rounded-lg hover:bg-muted/20 active:scale-95 transition-all">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setDateOffset(0)}
            className="text-sm font-bold"
          >
            {isToday ? 'Today' : format(currentDate, 'EEE, MMM d')}
          </button>
          <button
            onClick={() => dateOffset < 0 && setDateOffset(d => d + 1)}
            disabled={dateOffset >= 0}
            className={cn("p-2 rounded-lg hover:bg-muted/20 active:scale-95 transition-all", dateOffset >= 0 && "opacity-30")}
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* ── Macro Progress Bars ── */}
        <div className="px-1 space-y-2">
          {doNotEat ? (
            <div className="text-center py-3">
              <span className="text-[12px] font-bold text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg">DO NOT EAT — Weight restriction day</span>
            </div>
          ) : showSliceTracker && sliceTargets ? (
            <>
              {sliceTargets.protein > 0 && (
                <MacroBar label="Protein" consumed={tracking.proteinSlices} target={sliceTargets.protein} color="bg-orange-500" unit=" slices" />
              )}
              {sliceTargets.carb > 0 && (
                <MacroBar label="Carbs" consumed={tracking.carbSlices} target={sliceTargets.carb} color="bg-amber-500" unit=" slices" />
              )}
              {sliceTargets.veg > 0 && (
                <MacroBar label="Veggies" consumed={tracking.vegSlices} target={sliceTargets.veg} color="bg-green-500" unit=" slices" />
              )}
              {isV2 && sliceTargets.fruit > 0 && (
                <MacroBar label="Fruit" consumed={tracking.fruitSlices || 0} target={sliceTargets.fruit} color="bg-pink-500" unit=" slices" />
              )}
              {isV2 && sliceTargets.fat > 0 && (
                <MacroBar label="Fat" consumed={tracking.fatSlices || 0} target={sliceTargets.fat} color="bg-yellow-500" unit=" slices" />
              )}
            </>
          ) : (
            <>
              {macros.carbs.max > 0 && (
                <MacroBar label="Carbs" consumed={tracking.carbsConsumed} target={macros.carbs.max} color="bg-amber-500" unit="g" />
              )}
              {macros.protein.max > 0 && (
                <MacroBar label="Protein" consumed={tracking.proteinConsumed} target={macros.protein.max} color="bg-orange-500" unit="g" />
              )}
            </>
          )}
          {/* Water bar — tappable to edit */}
          {editingWater ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground w-14 shrink-0">Water</span>
              <input
                type="number"
                autoFocus
                value={waterInput}
                onChange={(e) => setWaterInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSetWater(parseInt(waterInput) || 0);
                  if (e.key === 'Escape') setEditingWater(false);
                }}
                onBlur={() => handleSetWater(parseInt(waterInput) || 0)}
                className="flex-1 h-8 text-[12px] font-mono font-bold text-center bg-background border border-cyan-500/40 rounded-lg px-2"
                placeholder="oz"
              />
              <span className="text-[11px] text-muted-foreground/50">oz</span>
            </div>
          ) : (
            <button
              onClick={() => { setEditingWater(true); setWaterInput(String(tracking.waterConsumed)); hapticTap(); }}
              className="w-full text-left"
            >
              <MacroBar label="Water" consumed={tracking.waterConsumed} target={hydration.targetOz} color="bg-cyan-500" unit="oz" />
            </button>
          )}
        </div>

        {/* ── Quick Actions ── */}
        <div className="flex gap-2 px-1">
          <button
            onClick={() => handleAddFood(inferMealSection(new Date().toISOString()))}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-bold active:scale-[0.98] transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Food
          </button>
          {tracking.waterConsumed > 0 && (
            <button
              onClick={() => handleQuickWater(-8)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-muted/15 text-muted-foreground text-[12px] font-bold hover:bg-muted/25 active:scale-[0.98] transition-all"
            >
              <Minus className="w-3.5 h-3.5" />
              8oz
            </button>
          )}
          {!waterDone && (
            <button
              onClick={() => handleQuickWater(8)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-cyan-500/15 text-cyan-600 text-[12px] font-bold hover:bg-cyan-500/20 active:scale-[0.98] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              8oz
            </button>
          )}
          {hasYesterday && (
            <button
              onClick={handleRepeatYesterday}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-muted/15 text-muted-foreground text-[12px] font-bold hover:bg-muted/25 active:scale-[0.98] transition-all"
            >
              <CalendarDays className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ── Food Diary (meal sections) ── */}
        <FoodDiary
          dateKey={dateKey}
          mode={showSliceTracker ? 'spar' : 'sugar'}
          sliceTargets={sliceTargets}
          gramTargets={macros}
          onAddFood={handleAddFood}
        />
      </div>

      {/* ── Add Food Flow Sheet ── */}
      <Sheet open={addFoodOpen} onOpenChange={setAddFoodOpen}>
        <SheetContent side="bottom" className="h-[92vh] p-0 rounded-t-2xl flex flex-col [&>button.absolute]:hidden">
          <AddFoodFlow
            mealSection={addFoodMeal}
            mode={showSliceTracker ? 'spar' : 'sugar'}
            isV2={isV2}
            blockedCategories={blockedCategories}
            onClose={() => setAddFoodOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </MobileLayout>
  );
}

// MacroBar imported from @/components/ui/macro-bar
