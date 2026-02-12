/**
 * Global AddFoodFlow Sheet — accessible from any page via `open-add-food` event.
 * Provides a single, consistent food logging experience everywhere in the app.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useStore, type MealSection, inferMealSection } from "@/lib/store";
import { AddFoodFlow } from "@/components/add-food-flow";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function AddFoodSheet() {
  const {
    profile, getMacroTargets, getNutritionMode, getSliceTargets,
  } = useStore();

  const [open, setOpen] = useState(false);
  const [mealSection, setMealSection] = useState<MealSection>(() =>
    inferMealSection(new Date().toISOString())
  );

  // Compute mode, isV2, blockedCategories from store (same as food.tsx)
  const nutritionMode = getNutritionMode();
  const isSparMode = nutritionMode === 'spar';
  const showSliceTracker = isSparMode;
  const macros = getMacroTargets();
  const sliceTargets = showSliceTracker ? getSliceTargets() : null;
  const isV2 = sliceTargets ? (sliceTargets.isV2 || sliceTargets.fruit > 0 || sliceTargets.fat > 0) : false;

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

  // Listen for open-add-food events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setMealSection(detail.mealSection || inferMealSection(new Date().toISOString()));
      setOpen(true);
    };
    window.addEventListener('open-add-food', handler);
    return () => window.removeEventListener('open-add-food', handler);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="h-[92vh] p-0 rounded-t-2xl flex flex-col [&>button.absolute]:hidden">
        <AddFoodFlow
          mealSection={mealSection}
          mode={showSliceTracker ? 'spar' : 'sugar'}
          isV2={isV2}
          blockedCategories={blockedCategories}
          onClose={handleClose}
        />
      </SheetContent>
    </Sheet>
  );
}
