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

  const progress = hydration.targetOz > 0 ? Math.min(100, (tracking.waterConsumed / hydration.targetOz) * 100) : 0;
  const consumedOz = tracking.waterConsumed;

  const isSipOnly = hydration.type === 'Sip Only' || daysUntilWeighIn === 1;
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
                        <button onClick={handleEdit} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground">
                          <Pencil className="w-3 h-3" />
                        </button>
                        {tracking.waterConsumed > 0 && (
                          confirmingReset ? (
                              <div className="flex items-center gap-1">
                                <button onClick={handleReset} className="text-[9px] font-bold text-destructive px-1">Yes</button>
                                <button onClick={() => setConfirmingReset(false)} className="text-[9px] font-bold text-muted-foreground px-1">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmingReset(true)} className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-3 h-3" />
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
                  <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-6 w-14 text-center text-[11px] font-mono" autoFocus />
                  <span className="text-[10px] text-muted-foreground">oz</span>
                  <button onClick={handleSaveEdit} className="text-[10px] text-green-500 font-bold">Save</button>
                  <button onClick={() => setIsEditing(false)} className="text-[10px] text-muted-foreground">✕</button>
                </div>
              ) : (
                <button onClick={handleEdit} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                  <Pencil className="w-3 h-3" />
                  <span className="font-mono">{tracking.waterConsumed}/{hydration.targetOz}oz</span>
                </button>
              )}
            </div>
            {tracking.waterConsumed > 0 && (
              confirmingReset ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-destructive">Reset?</span>
                  <button onClick={handleReset} className="text-[9px] font-bold text-destructive">Yes</button>
                  <button onClick={() => setConfirmingReset(false)} className="text-[9px] font-bold text-muted-foreground">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmingReset(true)} className="text-[9px] text-muted-foreground hover:text-destructive flex items-center gap-0.5">
                  <Trash2 className="w-2.5 h-2.5" />
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
          <div className="flex gap-1.5 items-center flex-wrap">
            {quickAddAmounts.map(oz => (
              <button
                key={oz}
                onClick={() => handleAddWater(oz)}
                className="h-7 px-2.5 text-[11px] font-medium rounded-md border border-muted bg-muted/30 hover:bg-muted/60 active:bg-muted transition-colors"
              >
                +{oz}oz
              </button>
            ))}
            <div className="flex gap-1 ml-auto">
              <Input
                type="number"
                placeholder="oz"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                className="h-7 w-14 text-[11px] font-mono"
              />
              <button
                onClick={handleCustomAdd}
                disabled={!addAmount}
                className="h-7 px-2 text-[11px] font-medium rounded-md border border-muted bg-muted/30 hover:bg-muted/60 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Why Explanations */}
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
