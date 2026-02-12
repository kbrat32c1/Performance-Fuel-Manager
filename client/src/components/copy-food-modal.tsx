import { useState, useMemo } from "react";
import { X, CalendarDays, Copy, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { useStore, type FoodLogEntry } from "@/lib/store";

interface CopyFoodModalProps {
  open: boolean;
  onClose: () => void;
  onCopy: (entries: FoodLogEntry[], dayLabel: string) => void;
  mode: 'spar' | 'sugar';
  currentDateKey: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function CopyFoodModal({ open, onClose, onCopy, mode, currentDateKey }: CopyFoodModalProps) {
  const { getDailyTracking } = useStore();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Build last 7 days data
  const days = useMemo(() => {
    const today = new Date(currentDateKey + 'T12:00:00');
    const result: Array<{
      dateKey: string;
      label: string;
      dayName: string;
      entries: FoodLogEntry[];
      summary: string;
    }> = [];

    for (let i = 1; i <= 7; i++) {
      const d = subDays(today, i);
      const dk = format(d, 'yyyy-MM-dd');
      const dayName = DAY_NAMES[d.getDay()];
      const label = i === 1 ? 'Yesterday' : dayName;

      // Try to load food log from localStorage (both tracker formats)
      let entries: FoodLogEntry[] = [];
      if (typeof window !== 'undefined') {
        // SPAR tracker format
        const sparSaved = localStorage.getItem(`pwm-spar-history-${dk}`);
        if (sparSaved) {
          try {
            const parsed = JSON.parse(sparSaved) as FoodLogEntry[];
            entries = [...entries, ...parsed];
          } catch {}
        }
        // Macro tracker format
        const macroSaved = localStorage.getItem(`pwm-food-history-${dk}`);
        if (macroSaved) {
          try {
            const parsed = JSON.parse(macroSaved);
            entries = [...entries, ...parsed.map((e: any) => ({
              ...e,
              timestamp: typeof e.timestamp === 'string' ? e.timestamp : new Date(e.timestamp).toISOString(),
            }))];
          } catch {}
        }
      }

      // Also check store's daily tracking foodLog
      const tracking = getDailyTracking(dk);
      if (tracking.foodLog && tracking.foodLog.length > 0) {
        // Merge but avoid duplicates by id
        const existingIds = new Set(entries.map(e => e.id));
        for (const entry of tracking.foodLog) {
          if (!existingIds.has(entry.id)) {
            entries.push(entry);
          }
        }
      }

      // Build summary based on mode
      let summary = '';
      if (entries.length > 0) {
        if (mode === 'spar') {
          const sliceCounts: Record<string, number> = {};
          entries.forEach(e => {
            if (e.sliceType) {
              sliceCounts[e.sliceType] = (sliceCounts[e.sliceType] || 0) + (e.sliceCount || 1);
            }
          });
          const parts = [];
          if (sliceCounts.protein) parts.push(`${sliceCounts.protein}P`);
          if (sliceCounts.carb) parts.push(`${sliceCounts.carb}C`);
          if (sliceCounts.veg) parts.push(`${sliceCounts.veg}V`);
          if (sliceCounts.fruit) parts.push(`${sliceCounts.fruit}Fr`);
          if (sliceCounts.fat) parts.push(`${sliceCounts.fat}Ft`);
          summary = parts.length > 0 ? parts.join(' / ') : `${entries.length} items`;
        } else {
          const totalCarbs = entries.reduce((s, e) => s + ((e.macroType === 'carbs' || e.mode === 'sugar') ? (e.amount || 0) : 0), 0);
          const totalProtein = entries.reduce((s, e) => s + ((e.macroType === 'protein') ? (e.amount || 0) : 0), 0);
          const parts = [];
          if (totalCarbs > 0) parts.push(`${totalCarbs}g C`);
          if (totalProtein > 0) parts.push(`${totalProtein}g P`);
          summary = parts.length > 0 ? parts.join(' / ') : `${entries.length} items`;
        }
      }

      result.push({ dateKey: dk, label, dayName, entries, summary });
    }

    return result;
  }, [currentDateKey, mode, getDailyTracking]);

  const selectedDayData = useMemo(() => {
    return days.find(d => d.dateKey === selectedDay);
  }, [days, selectedDay]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header — with safe-area padding for iOS notch */}
      <div className="flex items-center justify-between p-4 border-b border-muted" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">
            {selectedDay ? 'Preview & Copy' : 'Copy Food From...'}
          </span>
        </div>
        <button
          onClick={() => { setSelectedDay(null); onClose(); }}
          className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Day list */}
        {!selectedDay && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase font-bold mb-3">Last 7 days</p>
            {days.map(day => {
              const hasEntries = day.entries.length > 0;
              return (
                <button
                  key={day.dateKey}
                  onClick={() => hasEntries ? setSelectedDay(day.dateKey) : null}
                  disabled={!hasEntries}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left",
                    hasEntries
                      ? "border-muted bg-card hover:bg-muted/30 active:bg-muted/50"
                      : "border-muted/30 bg-muted/5 opacity-40 cursor-not-allowed"
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">{day.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(day.dateKey + 'T12:00:00'), 'MMM d')}
                      {hasEntries && ` · ${day.entries.length} items`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasEntries ? (
                      <>
                        <span className="text-[10px] font-mono font-bold text-primary">{day.summary}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">No food logged</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Preview selected day */}
        {selectedDay && selectedDayData && (
          <div className="space-y-3">
            <button
              onClick={() => setSelectedDay(null)}
              className="text-[10px] text-primary font-bold uppercase flex items-center gap-1 hover:underline"
            >
              ← Back to days
            </button>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">{selectedDayData.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(selectedDayData.dateKey + 'T12:00:00'), 'EEEE, MMM d')} · {selectedDayData.entries.length} items
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold text-primary">{selectedDayData.summary}</span>
            </div>

            {/* Food list preview */}
            <div className="space-y-1">
              {selectedDayData.entries.map((entry, i) => {
                const sparColor = entry.sliceType ? (
                  entry.sliceType === 'protein' ? 'text-orange-500' :
                  entry.sliceType === 'carb' ? 'text-amber-500' :
                  entry.sliceType === 'veg' ? 'text-green-500' :
                  entry.sliceType === 'fruit' ? 'text-pink-500' :
                  'text-yellow-600'
                ) : 'text-muted-foreground';

                return (
                  <div key={entry.id || i} className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-muted/20">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {entry.mode === 'spar' && entry.sliceType && (
                        <span className={cn("text-[9px] font-bold shrink-0", sparColor)}>
                          +{entry.sliceCount || 1}
                        </span>
                      )}
                      {entry.mode === 'sugar' && entry.macroType && (
                        <span className={cn("text-[9px] font-bold font-mono shrink-0",
                          entry.macroType === 'protein' ? 'text-orange-500' : 'text-amber-500'
                        )}>
                          +{entry.amount}g
                        </span>
                      )}
                      <span className="text-[11px] truncate">{entry.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Copy button */}
      {selectedDay && selectedDayData && selectedDayData.entries.length > 0 && (
        <div className="border-t border-muted bg-card p-4">
          <button
            onClick={() => {
              onCopy(selectedDayData.entries, selectedDayData.label);
              setSelectedDay(null);
              onClose();
            }}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Copy className="w-4 h-4" />
            Copy {selectedDayData.entries.length} items to today
          </button>
        </div>
      )}
    </div>
  );
}
