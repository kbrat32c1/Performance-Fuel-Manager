import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Scale,
  Calendar,
  TrendingDown,
  Droplets,
  Dumbbell,
  FileText,
  LucideIcon,
  Plus
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
// ILLUSTRATED EMPTY STATE GRAPHICS — SVG illustrations for empty states
// ═══════════════════════════════════════════════════════════════════════════════

function ScaleIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={cn("w-24 h-20", className)} fill="none">
      {/* Scale base */}
      <ellipse cx="60" cy="85" rx="45" ry="8" className="fill-muted/30" />
      <rect x="25" y="60" width="70" height="25" rx="4" className="fill-muted/50" />
      {/* Scale display */}
      <rect x="35" y="30" width="50" height="30" rx="6" className="fill-card stroke-border" strokeWidth="2" />
      <rect x="42" y="38" width="36" height="14" rx="2" className="fill-muted/30" />
      {/* Question marks for no data */}
      <text x="60" y="50" textAnchor="middle" className="fill-muted-foreground text-[12px] font-mono">??.?</text>
      {/* Decorative lines */}
      <path d="M30 75 h60" className="stroke-muted/50" strokeWidth="1" strokeDasharray="4 2" />
      {/* Plus icon hint */}
      <circle cx="95" cy="25" r="12" className="fill-primary/20" />
      <path d="M95 20 v10 M90 25 h10" className="stroke-primary" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChartIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" className={cn("w-24 h-16", className)} fill="none">
      {/* Chart background */}
      <rect x="10" y="10" width="100" height="55" rx="4" className="fill-muted/20 stroke-border" strokeWidth="1" />
      {/* Grid lines */}
      <path d="M10 25 h100 M10 40 h100 M10 55 h100" className="stroke-muted/30" strokeWidth="1" />
      {/* Empty data placeholder dots */}
      <circle cx="30" cy="45" r="4" className="fill-muted/40" />
      <circle cx="50" cy="35" r="4" className="fill-muted/40" />
      <circle cx="70" cy="40" r="4" className="fill-muted/40" />
      <circle cx="90" cy="30" r="4" className="fill-muted/40" />
      {/* Dashed connecting line */}
      <path d="M30 45 L50 35 L70 40 L90 30" className="stroke-muted/30" strokeWidth="2" strokeDasharray="4 4" />
      {/* Decorative sparkle */}
      <path d="M100 15 l2 -5 l2 5 M100 15 l-5 2 l5 2" className="stroke-primary/50" strokeWidth="1" />
    </svg>
  );
}

function DropletIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 100" className={cn("w-16 h-20", className)} fill="none">
      {/* Large droplet */}
      <path
        d="M40 10 C40 10 15 45 15 65 C15 82 26 90 40 90 C54 90 65 82 65 65 C65 45 40 10 40 10Z"
        className="fill-cyan-500/20 stroke-cyan-500/50"
        strokeWidth="2"
      />
      {/* Inner highlight */}
      <path
        d="M30 55 C28 60 28 70 35 75"
        className="stroke-white/30"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Water level indicator */}
      <path d="M20 70 h40" className="stroke-cyan-500/30" strokeWidth="1" strokeDasharray="2 2" />
      {/* Zero indicator */}
      <text x="40" y="65" textAnchor="middle" className="fill-cyan-500/50 text-[14px] font-bold">0</text>
    </svg>
  );
}

function CalendarIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 90" className={cn("w-20 h-18", className)} fill="none">
      {/* Calendar body */}
      <rect x="10" y="20" width="80" height="60" rx="6" className="fill-card stroke-border" strokeWidth="2" />
      {/* Calendar header */}
      <rect x="10" y="20" width="80" height="16" rx="6" className="fill-muted/30" />
      {/* Hanging clips */}
      <rect x="30" y="12" width="6" height="16" rx="2" className="fill-muted/50" />
      <rect x="64" y="12" width="6" height="16" rx="2" className="fill-muted/50" />
      {/* Grid cells (empty) */}
      <g className="fill-muted/10 stroke-muted/30" strokeWidth="0.5">
        {[0, 1, 2, 3, 4, 5, 6].map((col) => (
          <rect key={col} x={15 + col * 10} y="42" width="9" height="9" rx="1" />
        ))}
        {[0, 1, 2, 3, 4, 5, 6].map((col) => (
          <rect key={col} x={15 + col * 10} y="54" width="9" height="9" rx="1" />
        ))}
      </g>
      {/* Question mark in center */}
      <text x="50" y="58" textAnchor="middle" className="fill-muted-foreground text-[16px]">?</text>
    </svg>
  );
}

type IllustrationType = "scale" | "chart" | "droplet" | "calendar" | "none";

interface EmptyStateProps {
  icon?: LucideIcon;
  illustration?: IllustrationType;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: "default" | "compact" | "card" | "illustrated";
  className?: string;
}

function getIllustration(type: IllustrationType) {
  switch (type) {
    case "scale": return <ScaleIllustration />;
    case "chart": return <ChartIllustration />;
    case "droplet": return <DropletIllustration />;
    case "calendar": return <CalendarIllustration />;
    default: return null;
  }
}

export function EmptyState({
  icon: Icon = FileText,
  illustration = "none",
  title,
  description,
  action,
  variant = "default",
  className
}: EmptyStateProps) {
  // Illustrated variant — uses SVG illustrations
  if (variant === "illustrated") {
    const illustrationEl = getIllustration(illustration);
    return (
      <div className={cn("text-center py-8 px-4", className)}>
        {illustrationEl && (
          <div className="mb-4 flex justify-center">
            {illustrationEl}
          </div>
        )}
        <h3 className="font-heading font-bold text-base uppercase mb-1.5">{title}</h3>
        <p className="text-xs text-muted-foreground max-w-[200px] mx-auto mb-5 leading-relaxed">
          {description}
        </p>
        {action && (
          <Button
            onClick={action.onClick}
            className="h-11 px-5 bg-primary text-white font-bold active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("text-center py-6", className)}>
        <Icon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{title}</p>
        {action && (
          <Button
            variant="outline"
            size="sm"
            onClick={action.onClick}
            className="mt-3 h-10"
          >
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <Card className={cn("border-dashed border-muted", className)}>
        <CardContent className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
            <Icon className="w-6 h-6 text-muted-foreground/50" />
          </div>
          <h3 className="font-bold text-sm mb-1">{title}</h3>
          <p className="text-xs text-muted-foreground mb-4">{description}</p>
          {action && (
            <Button
              variant="outline"
              size="sm"
              onClick={action.onClick}
              className="h-10"
            >
              {action.label}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Default variant - larger, more prominent
  return (
    <div className={cn("text-center py-12 px-4", className)}>
      <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-8 h-8 text-muted-foreground/40" />
      </div>
      <h3 className="font-heading font-bold text-lg uppercase mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} className="h-12 px-6 bg-primary text-white font-bold">
          {action.label}
        </Button>
      )}
    </div>
  );
}

// Pre-configured empty states for common scenarios
export function NoWeightLogs({ onAddLog }: { onAddLog?: () => void }) {
  return (
    <EmptyState
      illustration="scale"
      title="No Weight Logs Yet"
      description="Track your weight to see progress toward your goals."
      action={onAddLog ? { label: "Log Weight", onClick: onAddLog } : undefined}
      variant="illustrated"
    />
  );
}

export function NoHistoryData() {
  return (
    <EmptyState
      illustration="calendar"
      title="No Logs for This Day"
      description="Select a different date or add a log entry."
      variant="illustrated"
    />
  );
}

export function NoPatternData() {
  return (
    <EmptyState
      illustration="chart"
      title="Not Enough Data"
      description="Log more weights to see your patterns and predictions."
      variant="illustrated"
    />
  );
}

export function NoHydrationLogs() {
  return (
    <EmptyState
      illustration="droplet"
      title="Track Hydration"
      description="Log your water intake to stay on track with your protocol."
      variant="illustrated"
    />
  );
}

export function NoProteinSources() {
  return (
    <EmptyState
      icon={Dumbbell}
      title="No Protein Today"
      description="Protein blocks fat burning during the metabolic phase."
      variant="compact"
    />
  );
}
