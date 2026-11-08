/**
 * CalorieSummary — the day's calories, fat and fiber in the Calories diary.
 * Counts only saved numbers, says "incomplete" when anything is left out, and
 * shows a goal only where the plan has an established one.
 */

import { incompleteReasons, type LogNutrition } from "@/lib/food-totals";

interface CalorieSummaryProps {
  nutrition: LogNutrition;
  goals: { calories: number; fat: number } | null;
  hasTotalsWithoutEntries?: boolean;
}

function ProgressBar({ value, goal }: { value: number; goal: number }) {
  return (
    <div className="flex-1 h-2 bg-muted-foreground/20 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${Math.min(100, (value / goal) * 100)}%` }}
      />
    </div>
  );
}

export function CalorieSummary({ nutrition, goals, hasTotalsWithoutEntries }: CalorieSummaryProps) {
  const reasons = incompleteReasons(nutrition);
  if (hasTotalsWithoutEntries) reasons.push('earlier totals have no food entries');
  const incomplete = nutrition.incomplete || !!hasTotalsWithoutEntries;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-2xl font-bold tabular-nums">{nutrition.calories.toLocaleString()} cal</span>
        {incomplete && <span className="text-xs font-bold text-foreground">Incomplete</span>}
        {goals && <span className="ml-auto text-xs text-muted-foreground tabular-nums">Goal {goals.calories.toLocaleString()} cal</span>}
      </div>
      {goals && <ProgressBar value={nutrition.calories} goal={goals.calories} />}

      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground w-14 shrink-0">Fat</span>
        {goals ? <ProgressBar value={nutrition.fat} goal={goals.fat} /> : <div className="flex-1" />}
        <span className="text-xs font-mono font-bold text-muted-foreground text-right shrink-0 whitespace-nowrap tabular-nums">
          {nutrition.fat}g{goals ? ` / ${goals.fat}g` : ''}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground w-14 shrink-0">Fiber</span>
        <div className="flex-1" />
        <span className="text-xs font-mono font-bold text-muted-foreground text-right shrink-0 whitespace-nowrap tabular-nums">
          {nutrition.fiber}g where listed
        </span>
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
