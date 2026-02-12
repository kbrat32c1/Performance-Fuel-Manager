import { useStore } from "@/lib/store";
import { HydrationTracker } from "./dashboard/hydration-tracker";

/**
 * Water tab content for the Quick Log FAB.
 * Renders HydrationTracker in non-embedded mode so quick-add buttons show.
 */
export function QuickLogWaterTab() {
  const { getHydrationTarget } = useStore();
  const hydration = getHydrationTarget();

  return (
    <HydrationTracker hydration={hydration} />
  );
}
