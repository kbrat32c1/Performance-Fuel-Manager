import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Droplets, Pencil, Trash2, HelpCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useStore } from "@/lib/store";

interface HydrationTrackerProps {
  hydration: {
    amount: string;
    type: string;
    note: string;
    targetOz: number;
  };
  readOnly?: boolean;
  /** When true, renders without Card wrapper and hides quick-add buttons (handled by parent) */
  embedded?: boolean;
}

// Why Explanation Component - Tap to expand
function WhyExplanation({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="w-full text-left"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
        <HelpCircle className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase font-bold">Why {title}?</span>
        <ChevronRight className={cn("w-3 h-3 transition-transform", isOpen && "rotate-90")} />
      </div>
      {isOpen && (
        <div className="mt-2 p-2.5 bg-muted/30 rounded-lg text-xs text-muted-foreground leading-relaxed border border-muted/50">
          {children}
        </div>
      )}
    </button>
  );
}

export function HydrationTracker({ hydration, readOnly = false, embedded = false }: HydrationTrackerProps) {
  const { getDailyTracking, updateDailyTracking, profile, getDaysUntilWeighIn } = useStore();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);
  const daysUntilWeighIn = getDaysUntilWeighIn();
  const [addAmount, setAddAmount] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);

  // SPAR users don't do weight cuts, so hide water loading explanations
  const isSparProtocol = profile.protocol === '5';

  const progress = hydration.targetOz > 0 ? Math.min(100, (tracking.waterConsumed / hydration.targetOz) * 100) : 0;
  const consumedOz = tracking.waterConsumed;

  // Only apply sip-only mode for competition users doing weight cuts
  const isSipOnly = !isSparProtocol && (hydration.type === 'Sip Only' || daysUntilWeighIn === 1);
  const quickAddAmounts = isSipOnly ? [2, 4, 6, 8] : [8, 16, 24, 32];

  const handleAddWater = (oz: number) => {
    updateDailyTracking(dateKey, { waterConsumed: tracking.waterConsumed + oz });
  };

  const handleCustomAdd = () => {
    if (addAmount) {
      handleAddWater(parseInt(addAmount));
      setAddAmount('');
    }
  };

  const handleEdit = () => {
    setEditValue(tracking.waterConsumed.toString());
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    updateDailyTracking(dateKey, { waterConsumed: parseInt(editValue) || 0 });
    setIsEditing(false);
    setEditValue('');
  };

  const handleReset = () => {
    updateDailyTracking(dateKey, { waterConsumed: 0 });
    setConfirmingReset(false);
  };

  const content = (
    <>
        {/* Header + Progress — shown only in standalone mode */}
        {!embedded && (
          <>
            {/* Compact Header Row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-cyan-500" />
                <span className="font-bold text-sm">
                  {consumedOz} <span className="text-xs text-muted-foreground font-normal">oz</span>
                </span>
                <span className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
                  hydration.type === 'Sip Only'
                    ? "bg-orange-500/20 text-orange-500 border border-orange-500/50 animate-pulse"
                    : "bg-cyan-500/20 text-cyan-500"
                )}>
                  {hydration.type}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-6 w-14 text-xs font-mono"
                      autoFocus
                    />
                    <span className="text-[10px] text-muted-foreground">oz</span>
                    <button onClick={handleSaveEdit} className="text-[10px] text-green-500 font-bold px-1.5">Save</button>
                    <button onClick={() => setIsEditing(false)} className="text-[10px] text-muted-foreground px-1">✕</button>
                  </div>
                ) : (
                  <>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {tracking.waterConsumed}/{hydration.targetOz}oz
                    </span>
                    {!readOnly && (
                      <>
                        <button onClick={handleEdit} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground active:scale-95 transition-transform min-w-[44px] min-h-[44px] flex items-center justify-center">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {tracking.waterConsumed > 0 && (
                          confirmingReset ? (
                              <div className="flex items-center gap-1">
                                <button onClick={handleReset} className="text-xs font-bold text-destructive px-3 py-2 min-h-[44px] active:scale-95 transition-transform">Yes</button>
                                <button onClick={() => setConfirmingReset(false)} className="text-xs font-bold text-muted-foreground px-3 py-2 min-h-[44px] active:scale-95 transition-transform">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmingReset(true)} className="p-2 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive active:scale-95 transition-transform min-w-[44px] min-h-[44px] flex items-center justify-center">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={tracking.waterConsumed}
                aria-valuemin={0}
                aria-valuemax={hydration.targetOz}
              >
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    progress >= 100 ? "bg-green-500" : "bg-cyan-500"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={cn(
                "text-[10px] font-bold w-8 text-right",
                progress >= 100 ? "text-green-500" : progress >= 75 ? "text-cyan-500" : "text-muted-foreground"
              )}>
                {progress.toFixed(0)}%
              </span>
            </div>
          </>
        )}

        {/* Embedded: slim inline edit + reset row */}
        {embedded && !readOnly && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Droplets className="w-3.5 h-3.5 text-cyan-500" />
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8 w-16 text-center text-xs font-mono" autoFocus />
                  <span className="text-[10px] text-muted-foreground">oz</span>
                  <button onClick={handleSaveEdit} className="text-xs text-green-500 font-bold px-2 py-1 min-h-[36px] active:scale-95 transition-transform">Save</button>
                  <button onClick={() => setIsEditing(false)} className="text-xs text-muted-foreground px-2 py-1 min-h-[36px] active:scale-95 transition-transform">✕</button>
                </div>
              ) : (
                <button onClick={handleEdit} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 min-h-[36px] active:scale-95 transition-transform">
                  <Pencil className="w-3.5 h-3.5" />
                  <span className="font-mono">{tracking.waterConsumed}/{hydration.targetOz}oz</span>
                </button>
              )}
            </div>
            {tracking.waterConsumed > 0 && (
              confirmingReset ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-destructive">Reset?</span>
                  <button onClick={handleReset} className="text-xs font-bold text-destructive px-2 py-1.5 min-h-[36px] active:scale-95 transition-transform">Yes</button>
                  <button onClick={() => setConfirmingReset(false)} className="text-xs font-bold text-muted-foreground px-2 py-1.5 min-h-[36px] active:scale-95 transition-transform">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmingReset(true)} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 px-2 py-1.5 min-h-[36px] active:scale-95 transition-transform">
                  <Trash2 className="w-3.5 h-3.5" />
                  Reset
                </button>
              )
            )}
          </div>
        )}

        {/* Phase note */}
        <p className="text-[10px] text-muted-foreground mb-2">{hydration.note}</p>

        {/* Quick Add Buttons — only when standalone (not embedded, parent handles these) */}
        {!readOnly && !embedded && (
          <div className="flex gap-2 items-center flex-wrap">
            {quickAddAmounts.map(oz => (
              <button
                key={oz}
                onClick={() => handleAddWater(oz)}
                className="min-h-[44px] px-4 text-sm font-semibold rounded-lg border border-muted bg-muted/30 hover:bg-muted/60 active:bg-muted active:scale-95 transition-all"
              >
                +{oz}oz
              </button>
            ))}
            <div className="flex gap-1.5 ml-auto">
              <Input
                type="number"
                placeholder="oz"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                className="h-10 w-16 text-xs font-mono"
              />
              <button
                onClick={handleCustomAdd}
                disabled={!addAmount}
                className="min-h-[40px] px-3 text-xs font-medium rounded-lg border border-muted bg-muted/30 hover:bg-muted/60 disabled:opacity-40 active:scale-95 transition-all"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Why Explanations — only for competition users doing weight cuts */}
        {!isSparProtocol && (
          <div className="pt-2 mt-2 border-t border-muted space-y-2">
            {daysUntilWeighIn >= 3 && daysUntilWeighIn <= 5 && (
              <WhyExplanation title="water loading (3-5 days out)">
                <strong>Water loading triggers natural diuresis.</strong> By drinking 1.5-2 gallons daily, your body
                increases urine production. When you cut water the day before, your body keeps flushing even without
                intake, helping you drop water weight safely without severe dehydration.
              </WhyExplanation>
            )}
            {daysUntilWeighIn === 2 && (
              <WhyExplanation title="flush day (2 days out)">
                <strong>Water weight starts dropping.</strong> After days of high water intake, your body is in
                full flush mode. Maintain high intake to keep kidneys active while cutting sodium and fiber
                to accelerate water loss.
              </WhyExplanation>
            )}
            {daysUntilWeighIn === 1 && (
              <WhyExplanation title="sip only (1 day out)">
                <strong>Your body is still flushing.</strong> After days of high water intake, your kidneys are in
                overdrive. Sipping just enough to stay functional lets your body continue eliminating water
                naturally. Gulping would halt this process and add weight back.
              </WhyExplanation>
            )}
          </div>
        )}
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card className="border-muted">
      <CardContent className="p-3">
        {content}
      </CardContent>
    </Card>
  );
}
