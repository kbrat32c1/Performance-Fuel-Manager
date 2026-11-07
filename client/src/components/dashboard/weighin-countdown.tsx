import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPhaseStyleForDaysUntil } from "@/lib/phase-colors";
import { useStore } from "@/lib/store";

interface WeighInCountdownProps {
  daysUntilWeighIn: number;
  dayBeforeTarget?: string; // e.g., "159-161 lbs" - target for day before weigh-in
}

export function WeighInCountdown({ daysUntilWeighIn, dayBeforeTarget }: WeighInCountdownProps) {
  const { getTimeUntilWeighIn, profile } = useStore();
  const timeLeft = getTimeUntilWeighIn();
  const waterLoading = profile.waterLoading === true;

  // Day-specific messaging based on days until weigh-in
  const getMessage = () => {
    if (waterLoading) {
      if (daysUntilWeighIn === 4) return "Water loading day 1";
      if (daysUntilWeighIn === 3) return "Water loading day 2";
      if (daysUntilWeighIn === 2) return "Last water loading day";
      if (daysUntilWeighIn === 1) return "Lighter water day";
    }
    if (daysUntilWeighIn === 1) return "Day before weigh-in";
    return "Until weigh-in";
  };

  // Use phase-based colors matching the rest of the app
  const { style: phaseStyle } = getPhaseStyleForDaysUntil(daysUntilWeighIn, waterLoading);
  const colors = { bg: phaseStyle.bgMedium, border: phaseStyle.border, text: phaseStyle.text };
  const isDayBefore = daysUntilWeighIn === 1;

  return (
    <div className={cn(colors.bg, colors.border, "border rounded-lg p-3 mb-4")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isDayBefore ? (
            <AlertTriangle className={cn("w-5 h-5", colors.text)} />
          ) : (
            <Clock className={cn("w-5 h-5", colors.text)} />
          )}
          <div>
            <span className={cn("font-bold text-lg font-mono", colors.text)}>{timeLeft}</span>
            <span className="text-xs text-muted-foreground ml-2">until weigh-in</span>
          </div>
        </div>
        <span className={cn("text-xs font-medium", colors.text)}>{getMessage()}</span>
      </div>
      {/* Day before weigh-in critical target info */}
      {isDayBefore && dayBeforeTarget && (
        <div className={cn("mt-2 pt-2 border-t text-xs text-muted-foreground", phaseStyle.border)}>
          Must be <strong className={phaseStyle.text}>{dayBeforeTarget}</strong> after practice. Overnight drift takes care of the rest.
        </div>
      )}
    </div>
  );
}
