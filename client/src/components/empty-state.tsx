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
  LucideIcon
} from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: "default" | "compact" | "card";
  className?: string;
}

export function EmptyState({
  icon: Icon = FileText,
  title,
  description,
  action,
  variant = "default",
  className
}: EmptyStateProps) {
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
        <Button onClick={action.onClick} className="h-12 px-6 bg-primary text-black font-bold">
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
      icon={Scale}
      title="No Weight Logs"
      description="Start tracking your weight to see patterns and progress toward your goals."
      action={onAddLog ? { label: "Log Weight", onClick: onAddLog } : undefined}
      variant="card"
    />
  );
}

export function NoHistoryData() {
  return (
    <EmptyState
      icon={Calendar}
      title="No Logs for This Day"
      description="Select a different date or add a log entry."
      variant="compact"
    />
  );
}

export function NoPatternData() {
  return (
    <EmptyState
      icon={TrendingDown}
      title="Not Enough Data"
      description="Log more weights to see your patterns and predictions."
      variant="compact"
    />
  );
}

export function NoHydrationLogs() {
  return (
    <EmptyState
      icon={Droplets}
      title="Track Hydration"
      description="Log your water intake to stay on track with your protocol."
      variant="compact"
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
