import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  pullProgress: number;
  isRefreshing: boolean;
}

/**
 * SPAR triangle that draws itself — used as loading indicator
 */
function SparTriangleLoader({ size = 24, color = '#E8501E' }: { size?: number; color?: string }) {
  const perimeter = 78;
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" style={{ overflow: 'visible' }}>
      <polygon
        points="15,3 28,27 2,27"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{
          strokeDasharray: perimeter,
          strokeDashoffset: perimeter,
          animation: 'spar-tri-draw 1.8s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes spar-tri-draw {
          0% { stroke-dashoffset: ${perimeter}; opacity: 0.3; }
          50% { stroke-dashoffset: 0; opacity: 1; }
          70% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: -${perimeter}; opacity: 0.3; }
        }
      `}</style>
    </svg>
  );
}

/**
 * WHOOP-style pull-to-refresh indicator.
 * Shows a down arrow while pulling, SPAR triangle when refreshing.
 * No spinning circles.
 */
export function PullToRefreshIndicator({
  pullDistance,
  pullProgress,
  isRefreshing,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  const isReady = pullProgress >= 1;
  const opacity = Math.min(pullProgress * 2, 1);
  const arrowRotation = pullProgress * 180;
  const scale = 0.6 + Math.min(pullProgress, 1) * 0.4;

  return (
    <div
      className="fixed left-0 right-0 flex justify-center z-50 pointer-events-none"
      style={{ top: Math.max(pullDistance - 44, 8) }}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          "backdrop-blur-sm shadow-lg",
          isRefreshing
            ? "bg-primary/90"
            : isReady
              ? "bg-primary text-white"
              : "bg-card/90 text-muted-foreground border border-border/50"
        )}
        style={{
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        {isRefreshing ? (
          <SparTriangleLoader size={18} color="white" />
        ) : (
          <ArrowDown
            className="w-5 h-5"
            style={{
              transform: `rotate(${arrowRotation}deg)`,
            }}
          />
        )}
      </div>
    </div>
  );
}
