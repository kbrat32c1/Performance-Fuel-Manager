import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  pullProgress: number;
  isRefreshing: boolean;
  threshold?: number;
}

/**
 * Visual indicator for pull-to-refresh gesture.
 * Shows a spinner that grows/rotates based on pull progress.
 */
export function PullToRefreshIndicator({
  pullDistance,
  pullProgress,
  isRefreshing,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  const isReady = pullProgress >= 1;
  const rotation = pullProgress * 360;
  const scale = 0.5 + pullProgress * 0.5;
  const opacity = Math.min(pullProgress * 1.5, 1);

  return (
    <div
      className="fixed left-0 right-0 flex justify-center z-50 pointer-events-none"
      style={{
        top: Math.max(pullDistance - 40, 0),
        transition: isRefreshing ? 'none' : 'top 150ms ease-out',
      }}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center transition-all",
          isReady || isRefreshing
            ? "bg-primary text-white shadow-lg"
            : "bg-muted text-muted-foreground"
        )}
        style={{
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <RefreshCw
          className={cn(
            "w-5 h-5 transition-transform",
            isRefreshing && "animate-spin"
          )}
          style={{
            transform: !isRefreshing ? `rotate(${rotation}deg)` : undefined,
          }}
        />
      </div>
    </div>
  );
}
