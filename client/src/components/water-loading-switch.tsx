import { Droplets } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** The athlete's own on/off choice for the water loading plan (off = steady hydration). */
export function WaterLoadingSwitch({ className }: { className?: string }) {
  const { profile, updateProfile } = useStore();
  const on = profile.waterLoading === true;

  return (
    <div className={cn("rounded-xl border border-muted bg-card p-3", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Water loading"
        onClick={() => updateProfile({ waterLoading: !on }, { silent: true })}
        className="flex w-full min-h-11 items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <Droplets className="h-4 w-4 shrink-0 text-secondary" />
          <span className="text-sm font-bold">Water loading</span>
        </span>
        <span
          aria-hidden
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            on ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-5" : "translate-x-0.5"
            )}
          />
        </span>
      </button>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">
        {on
          ? "On: extra water 4 to 2 days before weigh-in, then less the day before. Adds about 1 lb of extra loss."
          : "Off: drink the same steady amount every day. Turn on to use the water loading plan."}
      </p>
    </div>
  );
}
