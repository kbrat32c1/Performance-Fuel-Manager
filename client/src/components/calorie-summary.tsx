/**
 * CalorieSummary — the day's calories, fat and fiber in the Detailed diary.
 * Counts only saved numbers and says "incomplete" when anything is left out.
 * No calorie or fat goal yet: the calculator's figures rest on portion calories
 * that have not been checked.
 */

import { incompleteReasons, type LogNutrition } from "@/lib/food-totals";

interface CalorieSummaryProps {
  nutrition: LogNutrition;
  hasTotalsWithoutEntries?: boolean;
}

export function CalorieSummary({ nutrition, hasTotalsWithoutEntries }: CalorieSummaryProps) {
  const reasons = incompleteReasons(nutrition);
  if (hasTotalsWithoutEntries) reasons.push('earlier totals have no food entries');
  const incomplete = nutrition.incomplete || !!hasTotalsWithoutEntries;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-2xl font-bold tabular-nums">{nutrition.calories.toLocaleString()} cal</span>
        {incomplete && <span className="text-xs font-bold text-foreground">Incomplete</span>}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Fat</span>
        <span className="text-xs font-mono font-bold text-muted-foreground whitespace-nowrap tabular-nums">{nutrition.fat}g</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Fiber</span>
        <span className="text-xs font-mono font-bold text-muted-foreground whitespace-nowrap tabular-nums">{nutrition.fiber}g where listed</span>
      </div>

      {reasons.length > 0 && <p className="text-xs text-muted-foreground">{reasons.join('. ')}.</p>}
      {nutrition.estimates > 0 && (
        <p className="text-xs text-muted-foreground">
          Includes {nutrition.estimates} {nutrition.estimates === 1 ? 'estimate' : 'estimates'} from photo, voice or barcode.
        </p>
      )}
    </div>
  );
}
