/**
 * ProtocolSwitchBanner — Dashboard banner that shows when:
 * 1. The store's getStatus().recommendation.switchProtocol is true (projection-based), OR
 * 2. The wrestler's current protocol doesn't match the weight-based recommendation
 *    (e.g., on Optimal Cut but weight says Rapid Cut).
 *
 * Dismissal strategy:
 * - "Switch" button: changes protocol to match recommendation → banner naturally hides
 *   (no dismissal stored — if they change back, banner reappears)
 * - "X" button: stores the recommended target protocol → banner stays hidden until
 *   recommendation changes (e.g., weight changes, protocol changes in settings)
 */

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROTOCOL_CONFIG, getProtocolRecommendation } from "@/lib/protocol-utils";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = 'protocol-switch-dismissed-target';

export function ProtocolSwitchBanner() {
  const { getStatus, profile, updateProfile } = useStore();
  const { toast } = useToast();

  // Track which recommended target was dismissed. If the recommendation changes
  // (different target protocol), the dismissal no longer applies.
  const [dismissedTarget, setDismissedTarget] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(STORAGE_KEY) || null;
    }
    return null;
  });

  // ── Source 1: Projection-based recommendation from store ──
  const statusInfo = getStatus();
  const projRec = statusInfo.recommendation;
  const hasProjectionSwitch = projRec?.switchProtocol === true;

  // ── Source 2: Weight-based recommendation (always available if we have weight data) ──
  const currentWeight = profile.currentWeight;
  const targetWeightClass = profile.targetWeightClass;
  const hasWeightData = currentWeight > 0 && targetWeightClass > 0;
  const weightRec = hasWeightData
    ? getProtocolRecommendation(currentWeight, targetWeightClass)
    : null;
  const hasWeightMismatch = weightRec !== null
    && weightRec.protocol !== profile.protocol
    && profile.protocol !== '5' // Don't nag SPAR General users
    && profile.protocol !== '6'; // Don't nag SPAR Competition users (they have auto-adjusting targets)

  // If neither source triggers, don't show
  if (!hasProjectionSwitch && !hasWeightMismatch) {
    return null;
  }

  // Projection-based takes priority (more urgent, has context about days remaining)
  const isProjectionBased = hasProjectionSwitch;
  const isCritical = isProjectionBased && projRec?.urgency === 'critical';

  // Determine target protocol and message
  const targetProtocol = isProjectionBased ? '1' : weightRec!.protocol;
  const config = PROTOCOL_CONFIG[targetProtocol];
  const message = isProjectionBased
    ? projRec!.message
    : weightRec!.reason + (weightRec!.warning ? ` ${weightRec!.warning}` : '');

  // Check dismissal: only hide if the dismissed target matches the current recommendation
  // AND the current protocol is the same (user hasn't changed protocols since dismissing)
  const dismissKey = `${targetProtocol}:${profile.protocol}`;
  if (dismissedTarget === dismissKey) {
    return null;
  }

  // Color scheme: projection-critical = red, projection-high = amber, weight-based = amber
  const isRed = isCritical;

  const handleDismiss = () => {
    // Store both the recommended target AND current protocol so dismissal is specific
    // to this exact scenario. If either changes, the banner reappears.
    const key = `${targetProtocol}:${profile.protocol}`;
    setDismissedTarget(key);
    sessionStorage.setItem(STORAGE_KEY, key);
  };

  const handleSwitch = () => {
    updateProfile({ protocol: targetProtocol });
    toast({
      title: 'Protocol switched',
      description: `Now on ${config.label}. Your targets have been updated.`,
    });
    // Don't call handleDismiss — the banner naturally hides because protocol
    // now matches recommendation. If user changes back, banner reappears.
  };

  return (
    <Card className={cn(
      "mb-2 border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300",
      isRed
        ? "bg-red-500/5 border-red-500/30"
        : "bg-amber-500/5 border-amber-500/30"
    )}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1">
            <AlertTriangle className={cn(
              "w-4 h-4 mt-0.5 shrink-0",
              isRed ? "text-red-500" : "text-amber-500"
            )} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  "text-xs font-bold uppercase",
                  isRed ? "text-red-500" : "text-amber-500"
                )}>
                  Protocol Alert
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {message}
              </p>
              <Button
                size="sm"
                className={cn(
                  "mt-2 h-7 text-[10px] font-bold",
                  isRed
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-amber-500 hover:bg-amber-600 text-white"
                )}
                onClick={handleSwitch}
              >
                Switch to {config.label}
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
