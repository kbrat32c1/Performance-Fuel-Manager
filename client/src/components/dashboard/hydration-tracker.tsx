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

export function HydrationTracker({ hydration }: HydrationTrackerProps) {
  const { getDailyTracking, updateDailyTracking, profile, getDaysUntilWeighIn } = useStore();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);
  const daysUntilWeighIn = getDaysUntilWeighIn();
  const [addAmount, setAddAmount] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const progress = hydration.targetOz > 0 ? Math.min(100, (tracking.waterConsumed / hydration.targetOz) * 100) : 0;

  const quickAddAmounts = [8, 16, 24, 32];

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
  };

  return (
    <Card className="border-muted">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
            <Droplets className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold">Hydration: {hydration.amount}</h3>
                {/* Water Type Badge */}
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                  hydration.type === 'Distilled'
                    ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/50"
                    : hydration.type === 'Sip Only'
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
                      className="h-6 w-16 text-xs font-mono"
                      autoFocus
                      aria-label="Edit water consumed in ounces"
                    />
                    <span className="text-xs text-muted-foreground" aria-hidden="true">oz</span>
                    <Button size="sm" variant="ghost" onClick={handleSaveEdit} className="h-6 px-2 text-xs" aria-label="Save water intake">Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-6 px-2 text-xs" aria-label="Cancel editing">Cancel</Button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-mono text-muted-foreground">
                      {tracking.waterConsumed} / {hydration.targetOz} oz
                    </span>
                    <button
                      onClick={handleEdit}
                      className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit"
                      aria-label="Edit water intake"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {tracking.waterConsumed > 0 && (
                      <button
                        onClick={handleReset}
                        className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                        title="Reset to 0"
                        aria-label="Reset water intake to zero"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div
              className="h-3 bg-muted/50 rounded-full overflow-hidden mb-2"
              role="progressbar"
              aria-valuenow={tracking.waterConsumed}
              aria-valuemin={0}
              aria-valuemax={hydration.targetOz}
              aria-label={`Hydration progress: ${tracking.waterConsumed} of ${hydration.targetOz} ounces`}
            >
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  progress >= 100 ? "bg-green-500" : "bg-cyan-500"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">{hydration.type} • {hydration.note}</p>
              <span className={cn(
                "text-xs font-bold",
                progress >= 100 ? "text-green-500" : progress >= 75 ? "text-cyan-500" : "text-muted-foreground"
              )}>
                {progress.toFixed(0)}%
              </span>
            </div>

            {/* Quick Add Buttons */}
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Quick add water buttons">
              {quickAddAmounts.map(oz => (
                <Button
                  key={oz}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddWater(oz)}
                  className="h-8 text-xs px-3"
                  aria-label={`Add ${oz} ounces of water`}
                >
                  +{oz}oz
                </Button>
              ))}
              <div className="flex gap-1">
                <Input
                  type="number"
                  placeholder="oz"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  className="h-8 w-16 text-xs font-mono"
                  aria-label="Custom water amount in ounces"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCustomAdd}
                  className="h-8 text-xs px-3"
                  disabled={!addAmount}
                  aria-label="Add custom water amount"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Why Explanations */}
            <div className="pt-3 mt-3 border-t border-muted space-y-2">
              {daysUntilWeighIn >= 3 && daysUntilWeighIn <= 5 && (
                <WhyExplanation title="water loading (3-5 days out)">
                  <strong>Water loading triggers natural diuresis.</strong> By drinking 1.5-2 gallons daily, your body
                  increases urine production. When you cut water the day before, your body keeps flushing even without
                  intake, helping you drop water weight safely without severe dehydration.
                </WhyExplanation>
              )}
              {daysUntilWeighIn === 2 && (
                <WhyExplanation title="distilled water (2 days out)">
                  <strong>Mineral-free water flushes sodium.</strong> Distilled water has no minerals, so your body
                  pulls sodium from tissues to balance it out. This accelerates sodium and water loss while maintaining
                  your hydration momentum from earlier in the week.
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
