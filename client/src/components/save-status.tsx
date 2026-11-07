import { Check, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Tells the athlete whether their food and water logs have reached the cloud. */
export function SaveStatus({ className }: { className?: string }) {
  const { trackingSyncStatus, retryTrackingSync } = useStore();
  const { state, pendingCount } = trackingSyncStatus;
  const days = pendingCount === 1 ? "1 day" : `${pendingCount} days`;

  if (state === "saved") {
    return (
      <div role="status" className={cn("flex items-center justify-center gap-1 text-[11px] text-muted-foreground", className)}>
        <Check className="w-3 h-3 text-green-500" aria-hidden />
        Saved
      </div>
    );
  }

  if (state === "saving") {
    return (
      <div role="status" className={cn("flex items-center justify-center gap-1 text-[11px] text-muted-foreground", className)}>
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
        Saving…
      </div>
    );
  }

  if (state === "offline") {
    return (
      <div role="status" className={cn("flex items-center justify-center gap-1.5 text-[11px] font-medium text-amber-500", className)}>
        <CloudOff className="w-3 h-3" aria-hidden />
        Offline — {days} saved on this phone only. Will upload when you reconnect.
      </div>
    );
  }

  return (
    <div role="alert" className={cn("flex items-center justify-center gap-2 text-[11px] font-medium text-amber-500", className)}>
      <CloudOff className="w-3 h-3" aria-hidden />
      <span>Not saved to cloud ({days}) — kept on this phone</span>
      <button
        type="button"
        onClick={retryTrackingSync}
        className="flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 font-bold active:scale-95 transition-transform"
      >
        <RefreshCw className="w-3 h-3" aria-hidden />
        Retry
      </button>
    </div>
  );
}
