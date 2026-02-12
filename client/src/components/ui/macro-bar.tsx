/**
 * MacroBar — Shared progress bar for macro/nutrition tracking.
 *
 * Two variants:
 * - "inline" (default): Label → bar → remaining (used on Food page)
 * - "stacked": Label+value on top, bar below (used on Fuel page)
 */

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface MacroBarProps {
  label: string;
  consumed: number;
  target: number;
  color: string;        // Tailwind bg class e.g. "bg-cyan-500"
  unit?: string;        // e.g. "oz", "g" — appended to numbers
  variant?: 'inline' | 'stacked';
}

export function MacroBar({
  label, consumed, target, color, unit = '', variant = 'inline',
}: MacroBarProps) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const done = consumed >= target && target > 0;
  const remaining = Math.max(0, target - consumed);

  if (variant === 'stacked') {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
          <span className={cn("text-xs font-mono font-bold", done ? "text-green-500" : "text-foreground")}>
            {done && <Check className="w-3 h-3 inline mr-0.5" />}{consumed}{unit} / {target}{unit}
          </span>
        </div>
        <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500 ease-out", done ? "bg-green-500" : color)}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
    );
  }

  // Default: inline variant
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-muted-foreground w-14 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted/15 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", done ? "bg-green-500" : color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn(
        "text-[11px] font-mono font-bold w-20 text-right shrink-0",
        done ? "text-green-500" : "text-muted-foreground/70"
      )}>
        {done ? (
          <><Check className="w-3 h-3 inline mr-0.5" />{consumed}{unit}</>
        ) : (
          <>{remaining}{unit} left</>
        )}
      </span>
    </div>
  );
}
