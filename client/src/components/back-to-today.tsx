import { ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";

/** A "← Today" link for pages that aren't bottom-nav tabs, so there's always an obvious way back. */
export function BackToToday() {
  const [, setLocation] = useLocation();
  return (
    <button
      type="button"
      onClick={() => setLocation('/dashboard')}
      className="inline-flex items-center gap-0.5 min-h-11 -ml-2 pr-3 pl-1 text-sm font-semibold text-primary active:scale-95"
    >
      <ChevronLeft className="w-5 h-5" aria-hidden="true" />
      Today
    </button>
  );
}
