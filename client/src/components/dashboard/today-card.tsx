/**
 * Today Card Component
 *
 * A focused, always-visible card that answers the 4 critical questions
 * a stressed athlete needs to know immediately:
 *
 * 1. What is my target weight RIGHT NOW?
 * 2. Where am I vs that target? (delta)
 * 3. What's my ONE action?
 * 4. Is this safe?
 *
 * Design principles:
 * - Large, readable numbers (athlete may be exhausted/dehydrated)
 * - Clear color coding (green/yellow/red)
 * - Single primary action, not a list
 * - Safety warnings are prominent and unambiguous
 */

import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Scale,
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  Droplets,
  TrendingDown,
  ShieldAlert,
  ArrowDown,
  ArrowUp,
  Minus,
} from "lucide-react";
import { format } from "date-fns";
import {
  PROTOCOLS,
  MAX_SAFE_TOTAL_CUT_PERCENT,
  CRITICAL_DAYS_THRESHOLD,
  DANGER_DELTA_24H_LBS,
  WARNING_DELTA_48H_LBS,
  type SafetyLevel,
} from "@/lib/constants";

interface SafetyAssessment {
  level: SafetyLevel;
  message: string;
  detail?: string;
}

function assessSafety(
  currentWeight: number,
  targetWeight: number,
  daysUntil: number,
  protocol: string
): SafetyAssessment {
  // SPAR users are not doing weight cuts
  if (protocol === PROTOCOLS.SPAR) {
    return { level: 'safe', message: 'Nutrition tracking mode' };
  }

  const delta = currentWeight - targetWeight;
  const percentOver = (delta / targetWeight) * 100;

  // Already at or below target
  if (delta <= 0) {
    return {
      level: 'safe',
      message: 'On target',
      detail: delta < -2 ? 'Consider rehydrating slightly' : undefined,
    };
  }

  // Final 24 hours
  if (daysUntil <= 1) {
    if (delta > DANGER_DELTA_24H_LBS) {
      return {
        level: 'danger',
        message: 'Extreme cut required',
        detail: `${delta.toFixed(1)} lbs in <24h is dangerous. Consider moving up a weight class.`,
      };
    }
    if (delta > 2) {
      return {
        level: 'warning',
        message: 'Aggressive cut needed',
        detail: 'Water cut only. No food until after weigh-in.',
      };
    }
    return {
      level: 'caution',
      message: 'Final push',
      detail: 'Sip water only. Stay warm to maintain sweat.',
    };
  }

  // Final 48 hours
  if (daysUntil <= CRITICAL_DAYS_THRESHOLD) {
    if (delta > WARNING_DELTA_48H_LBS) {
      return {
        level: 'danger',
        message: 'Behind schedule',
        detail: `${delta.toFixed(1)} lbs with ${daysUntil} days is risky. Extra workouts critical.`,
      };
    }
    if (delta > 3) {
      return {
        level: 'warning',
        message: 'Tight timeline',
        detail: 'Limit sodium. Extra cardio recommended.',
      };
    }
    return {
      level: 'caution',
      message: 'On pace',
      detail: 'Stay disciplined with nutrition.',
    };
  }

  // More than 2 days out
  if (percentOver > MAX_SAFE_TOTAL_CUT_PERCENT) {
    return {
      level: 'warning',
      message: 'Large cut planned',
      detail: `${percentOver.toFixed(1)}% cut is aggressive. Monitor energy levels.`,
    };
  }

  if (delta > 5) {
    return {
      level: 'caution',
      message: 'Significant weight to lose',
      detail: 'Stay consistent with daily targets.',
    };
  }

  return { level: 'safe', message: 'On track' };
}

function getPrimaryAction(
  delta: number,
  daysUntil: number,
  protocol: string,
  hasLoggedToday: boolean
): { action: string; icon: React.ReactNode; urgent: boolean } {
  // SPAR users have different priorities
  if (protocol === PROTOCOLS.SPAR) {
    if (!hasLoggedToday) {
      return {
        action: 'Log your meals',
        icon: <Flame className="w-5 h-5" />,
        urgent: false,
      };
    }
    return {
      action: 'Stay on your slices',
      icon: <CheckCircle2 className="w-5 h-5" />,
      urgent: false,
    };
  }

  // Weight cut protocols
  if (!hasLoggedToday) {
    return {
      action: 'Log morning weight',
      icon: <Scale className="w-5 h-5" />,
      urgent: true,
    };
  }

  if (daysUntil <= 1 && delta > 2) {
    return {
      action: 'Water cut only — no food',
      icon: <Droplets className="w-5 h-5" />,
      urgent: true,
    };
  }

  if (delta > 3 && daysUntil <= 3) {
    return {
      action: 'Extra cardio session needed',
      icon: <Flame className="w-5 h-5" />,
      urgent: true,
    };
  }

  if (delta > 0) {
    return {
      action: 'Stick to nutrition plan',
      icon: <TrendingDown className="w-5 h-5" />,
      urgent: false,
    };
  }

  return {
    action: 'Maintain — you\'re on target',
    icon: <CheckCircle2 className="w-5 h-5" />,
    urgent: false,
  };
}

export function TodayCard() {
  const {
    profile,
    logs,
    calculateTarget,
    getDaysUntilWeighIn,
    getTimeUntilWeighIn,
    getStatus,
    getDailyTracking,
  } = useStore();

  const target = calculateTarget();
  const currentWeight = profile.currentWeight;
  const delta = currentWeight - target;
  const daysUntil = getDaysUntilWeighIn();
  const timeUntil = getTimeUntilWeighIn();
  const status = getStatus();
  const protocol = profile.protocol;
  const isSpar = protocol === PROTOCOLS.SPAR;

  // Check if user has logged weight today
  const today = format(new Date(), 'yyyy-MM-dd');
  const todaysLogs = logs.filter(
    (log) => format(new Date(log.date), 'yyyy-MM-dd') === today
  );
  const hasLoggedToday = todaysLogs.length > 0;

  // Safety assessment
  const safety = assessSafety(currentWeight, target, daysUntil, protocol);

  // Primary action
  const primaryAction = getPrimaryAction(delta, daysUntil, protocol, hasLoggedToday);

  // Colors based on safety level
  const safetyColors: Record<SafetyLevel, { bg: string; border: string; text: string; icon: string }> = {
    safe: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      text: 'text-green-600 dark:text-green-400',
      icon: 'text-green-500',
    },
    caution: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      text: 'text-yellow-600 dark:text-yellow-400',
      icon: 'text-yellow-500',
    },
    warning: {
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/30',
      text: 'text-orange-600 dark:text-orange-400',
      icon: 'text-orange-500',
    },
    danger: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-600 dark:text-red-400',
      icon: 'text-red-500',
    },
  };

  const colors = safetyColors[safety.level];

  // Delta arrow
  const DeltaIcon = delta > 0.1 ? ArrowUp : delta < -0.1 ? ArrowDown : Minus;
  const deltaColor = delta > 0.5 ? 'text-red-500' : delta < -0.5 ? 'text-blue-500' : 'text-green-500';

  return (
    <Card className={cn("mb-4 border-2", colors.border, colors.bg)}>
      <CardContent className="p-4">
        {/* Header: Countdown + Safety Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {isSpar ? 'Today' : daysUntil <= 0 ? 'Weigh-in TODAY' : `${timeUntil} until weigh-in`}
            </span>
          </div>
          <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium", colors.bg, colors.text)}>
            {safety.level === 'danger' ? (
              <ShieldAlert className="w-3.5 h-3.5" />
            ) : safety.level === 'warning' ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {safety.message}
          </div>
        </div>

        {/* Main Numbers: Current vs Target */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Current Weight */}
          <div className="text-center">
            <div className="text-3xl font-bold font-mono tracking-tight">
              {currentWeight.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Current
            </div>
          </div>

          {/* Target Weight */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Target className="w-5 h-5 text-muted-foreground" />
              <span className="text-3xl font-bold font-mono tracking-tight">
                {target.toFixed(1)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {isSpar ? 'Goal' : "Today's Target"}
            </div>
          </div>
        </div>

        {/* Delta Display */}
        {!isSpar && (
          <div className={cn(
            "flex items-center justify-center gap-2 py-2 px-4 rounded-lg mb-4",
            delta > 0 ? "bg-red-500/10" : delta < 0 ? "bg-green-500/10" : "bg-muted/50"
          )}>
            <DeltaIcon className={cn("w-5 h-5", deltaColor)} />
            <span className={cn("text-xl font-bold font-mono", deltaColor)}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)} lbs
            </span>
            <span className="text-sm text-muted-foreground">
              {delta > 0 ? 'to lose' : delta < 0 ? 'under target' : 'on target'}
            </span>
          </div>
        )}

        {/* Primary Action */}
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-lg",
          primaryAction.urgent ? "bg-primary/10 border border-primary/30" : "bg-muted/50"
        )}>
          <div className={cn(
            "p-2 rounded-full",
            primaryAction.urgent ? "bg-primary text-primary-foreground" : "bg-muted"
          )}>
            {primaryAction.icon}
          </div>
          <div className="flex-1">
            <div className={cn(
              "font-semibold",
              primaryAction.urgent && "text-primary"
            )}>
              {primaryAction.action}
            </div>
            {safety.detail && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {safety.detail}
              </div>
            )}
          </div>
        </div>

        {/* Danger Warning (if applicable) */}
        {safety.level === 'danger' && (
          <div className="mt-3 p-3 bg-red-500/20 border border-red-500/40 rounded-lg">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-red-600 dark:text-red-400">
                  Safety Alert
                </div>
                <div className="text-sm text-red-600/80 dark:text-red-400/80">
                  {safety.detail}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TodayCard;
