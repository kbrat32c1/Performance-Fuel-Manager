import { useState } from "react";
import { Droplets } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const STUDY_URL = "https://pubmed.ncbi.nlm.nih.gov/29182412/";

/** What water loading is and costs. Shown before an athlete opts in. */
function WaterLoadingExplainer() {
  return (
    <div className="mt-2 space-y-2 text-xs leading-snug text-muted-foreground">
      <p>
        Staying hydrated supports performance. Water should be the last lever for making weight, and most weeks you
        shouldn&apos;t need to deliberately dehydrate.
      </p>
      <p>
        <strong className="text-foreground">What it is:</strong> Drinking more fluid than usual for several days, then
        cutting back before weigh-in. It&apos;s commonly used in combat sports and may increase short-term weight loss
        beyond restricting fluids alone. In one controlled{" "}
        <a href={STUDY_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
          study
        </a>
        , athletes lost about 0.6% more body weight on average. The amount varies, and the exact schedule in this app
        hasn&apos;t been tested.
      </p>
      <p>
        <strong className="text-foreground">The tradeoff:</strong> Reducing body water can hurt performance. How much
        depends on you, what else you&apos;ve done to make weight, and how much time you have between weigh-in and your
        first match. Drinking too much water can also be dangerous because it can dilute the sodium in your blood. Keep
        your electrolytes up while you&apos;re drinking more, but electrolytes don&apos;t remove that risk, so don&apos;t
        drink past what the plan calls for.
      </p>
      <p>
        <strong className="text-foreground">If you&apos;re considering it:</strong> Discuss the situation with your
        coach and athletic trainer or sports dietitian. Don&apos;t use it to compensate for being far above your weight
        class.
      </p>
    </div>
  );
}

/** The athlete's own opt-in switch for the water loading plan (off by default; off = drink normally). */
export function WaterLoadingSwitch({ className }: { className?: string }) {
  const { profile, updateProfile } = useStore();
  const on = profile.waterLoading !== false;
  const [showDetails, setShowDetails] = useState(false);

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
          <span className="text-sm font-bold">Water loading (optional)</span>
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
      {on ? (
        <>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            On: extra water through the week, then cut back sharply the day before weigh-in.
          </p>
          <button
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails(v => !v)}
            className="min-h-11 text-xs font-semibold text-primary"
          >
            {showDetails ? "Hide details" : "What this means"}
          </button>
          {showDetails && <WaterLoadingExplainer />}
        </>
      ) : (
        <>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">Off: drink normally every day.</p>
          <WaterLoadingExplainer />
        </>
      )}
    </div>
  );
}
