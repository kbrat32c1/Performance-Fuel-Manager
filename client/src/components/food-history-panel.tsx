/**
 * FoodHistoryPanel — Standalone food history display for the Sheet panel.
 * Reads from store's tracking.foodLog and handles mutations via updateDailyTracking.
 * Also syncs localStorage so the inline trackers (MacroTracker/SparTracker) stay in sync.
 */

import { useState, useCallback } from "react";
import { useStore, type FoodLogEntry } from "@/lib/store";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Undo2,
  Check,
  Trash2,
  Utensils,
} from "lucide-react";
import { hapticTap } from "@/lib/haptics";
import { SwipeableRow } from "@/components/ui/swipeable-row";
import { totalsFromFoodLog, withSliceCount } from "@/lib/food-totals";

interface FoodHistoryPanelProps {
  dateKey: string;
}

// Accent color for food entries
function getEntryAccent(entry: FoodLogEntry): string {
  if (entry.mode === 'spar') {
    const cat = entry.sliceType || 'protein';
    if (cat === 'protein') return 'orange';
    if (cat === 'carb') return 'amber';
    if (cat === 'veg') return 'green';
    if (cat === 'fruit') return 'pink';
    if (cat === 'fat') return 'yellow';
    return 'muted';
  }
  // Sugar mode
  const isDb = entry.category === 'usda' || entry.category === 'fatsecret';
  const isOff = entry.category === 'off';
  const isMeal = entry.category === 'meals';
  const isCarb = entry.macroType === 'carbs';
  if (isDb) return 'cyan';
  if (isOff) return 'emerald';
  if (isMeal) return 'blue';
  if (isCarb) {
    if (entry.category === 'fructose') return 'green';
    if (entry.category === 'zerofiber') return 'red';
    return 'amber';
  }
  return 'orange';
}

export function FoodHistoryPanel({ dateKey }: FoodHistoryPanelProps) {
  const { getDailyTracking, updateDailyTracking, profile } = useStore();
  const tracking = getDailyTracking(dateKey);
  const dayLabel = (() => {
    if (dateKey === format(profile.simulatedDate || new Date(), 'yyyy-MM-dd')) return 'today';
    const [y, m, d] = dateKey.split('-').map(Number);
    return `on ${format(new Date(y, m - 1, d), 'EEE, MMM d')}`;
  })();
  const foodLog = tracking.foodLog || [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);

  // ─── Sync localStorage for both tracker types ───
  const syncLocalStorage = useCallback((entries: FoodLogEntry[]) => {
    if (typeof window === 'undefined') return;
    // Determine mode from entries (or clear both)
    const hasSpar = entries.some(e => e.mode === 'spar');
    const hasSugar = entries.some(e => e.mode === 'sugar');
    if (hasSpar || entries.length === 0) {
      localStorage.setItem(`pwm-spar-history-${dateKey}`, JSON.stringify(entries.filter(e => e.mode === 'spar')));
    }
    if (hasSugar || entries.length === 0) {
      // MacroTracker stores with Date objects but JSON.parse handles strings
      localStorage.setItem(`pwm-food-history-${dateKey}`, JSON.stringify(
        entries.filter(e => e.mode === 'sugar').map(e => ({
          ...e,
          timestamp: e.timestamp, // keep as ISO string
        }))
      ));
    }
  }, [dateKey]);

  // Totals are always rebuilt from the log, so an entry's grams and portions come and go together.
  const saveLog = useCallback((newLog: FoodLogEntry[], waterDelta = 0) => {
    const updates: Record<string, any> = { ...totalsFromFoodLog(newLog), foodLog: newLog };
    if (waterDelta !== 0) updates.waterConsumed = Math.max(0, tracking.waterConsumed + waterDelta);
    updateDailyTracking(dateKey, updates);
    syncLocalStorage(newLog);
  }, [tracking, dateKey, updateDailyTracking, syncLocalStorage]);

  // ─── Delete entry ───
  const handleDelete = useCallback((entryId: string) => {
    const entry = foodLog.find(e => e.id === entryId);
    if (!entry) return;
    hapticTap();
    saveLog(foodLog.filter(e => e.id !== entryId), entry.liquidOz && entry.liquidOz > 0 ? -entry.liquidOz : 0);
  }, [foodLog, saveLog]);

  // ─── Undo last entry ───
  const handleUndo = useCallback(() => {
    if (foodLog.length === 0) return;
    hapticTap();
    const lastEntry = foodLog[foodLog.length - 1];
    saveLog(foodLog.slice(0, -1), lastEntry.liquidOz && lastEntry.liquidOz > 0 ? -lastEntry.liquidOz : 0);
  }, [foodLog, saveLog]);

  // ─── Edit entry amount ───
  const handleEdit = useCallback((entryId: string, newAmount: number) => {
    const entry = foodLog.find(e => e.id === entryId);
    if (!entry || newAmount <= 0) return;
    const newLog = foodLog.map(e => {
      if (e.id !== entryId) return e;
      return entry.mode === 'sugar' ? { ...e, amount: newAmount } : withSliceCount(e, newAmount);
    });
    saveLog(newLog);
    setEditingId(null);
    setEditingValue('');
  }, [foodLog, dateKey, tracking, updateDailyTracking, syncLocalStorage]);

  // ─── Reset all ───
  const handleReset = useCallback(() => {
    updateDailyTracking(dateKey, {
      proteinSlices: 0,
      carbSlices: 0,
      vegSlices: 0,
      fruitSlices: 0,
      fatSlices: 0,
      proteinConsumed: 0,
      carbsConsumed: 0,
      waterConsumed: tracking.waterConsumed, // don't reset water
      foodLog: [],
    });
    syncLocalStorage([]);
    setConfirmingReset(false);
  }, [dateKey, tracking.waterConsumed, updateDailyTracking, syncLocalStorage]);

  // ─── Summary totals ───
  const totals = foodLog.reduce(
    (acc, e) => {
      if (e.mode === 'spar') {
        const cat = e.sliceType || 'protein';
        const count = e.sliceCount ?? 1;
        return {
          ...acc,
          proteinSlices: acc.proteinSlices + (cat === 'protein' ? count : 0),
          carbSlices: acc.carbSlices + (cat === 'carb' ? count : 0),
          vegSlices: acc.vegSlices + (cat === 'veg' ? count : 0),
          fruitSlices: acc.fruitSlices + (cat === 'fruit' ? count : 0),
          fatSlices: acc.fatSlices + (cat === 'fat' ? count : 0),
          water: acc.water + (e.liquidOz || 0),
        };
      }
      // Sugar mode
      return {
        ...acc,
        carbsG: acc.carbsG + (e.macroType === 'carbs' ? (e.amount || 0) : 0),
        proteinG: acc.proteinG + (e.macroType === 'protein' ? (e.amount || 0) : 0),
        water: acc.water + (e.liquidOz || 0),
      };
    },
    { carbsG: 0, proteinG: 0, proteinSlices: 0, carbSlices: 0, vegSlices: 0, fruitSlices: 0, fatSlices: 0, water: 0 }
  );

  const hasSpar = foodLog.some(e => e.mode === 'spar');
  const hasSugar = foodLog.some(e => e.mode === 'sugar');

  if (foodLog.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Utensils className="w-8 h-8 mb-3 opacity-30" />
        <p className="text-sm font-medium">No food logged yet</p>
        <p className="text-xs opacity-60 mt-1">Tap "Log Food" to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {/* Summary totals */}
      <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-muted/20">
        {hasSugar && totals.carbsG > 0 && (
          <span className="text-xs font-mono font-bold text-amber-500">{totals.carbsG}g carbs</span>
        )}
        {hasSugar && totals.proteinG > 0 && (
          <span className="text-xs font-mono font-bold text-orange-500">{totals.proteinG}g protein</span>
        )}
        {hasSpar && totals.proteinSlices > 0 && (
          <span className="text-xs font-mono font-bold text-orange-500">{totals.proteinSlices} pro</span>
        )}
        {hasSpar && totals.carbSlices > 0 && (
          <span className="text-xs font-mono font-bold text-amber-500">{totals.carbSlices} carb</span>
        )}
        {hasSpar && totals.vegSlices > 0 && (
          <span className="text-xs font-mono font-bold text-green-500">{totals.vegSlices} veg</span>
        )}
        {hasSpar && totals.fruitSlices > 0 && (
          <span className="text-xs font-mono font-bold text-pink-500">{totals.fruitSlices} fruit</span>
        )}
        {hasSpar && totals.fatSlices > 0 && (
          <span className="text-xs font-mono font-bold text-yellow-600">{totals.fatSlices} fat</span>
        )}
        {totals.water > 0 && (
          <span className="text-xs font-mono font-bold text-cyan-500">{totals.water}oz water</span>
        )}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleUndo}
          disabled={foodLog.length === 0}
          className={cn(
            "flex items-center gap-1 text-xs font-bold transition-colors px-2.5 py-1.5 rounded-lg",
            foodLog.length === 0
              ? "text-muted-foreground/30"
              : "text-primary hover:bg-primary/10"
          )}
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo Last
        </button>
        {confirmingReset ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-destructive font-bold">Reset all food?</span>
            <button onClick={handleReset} className="text-xs font-bold text-destructive hover:text-destructive/80 px-2 py-1 rounded bg-destructive/10">
              Yes
            </button>
            <button onClick={() => setConfirmingReset(false)} className="text-xs font-bold text-muted-foreground px-2 py-1">
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingReset(true)}
            disabled={foodLog.length === 0}
            className={cn(
              "flex items-center gap-1 text-xs font-bold transition-colors px-2.5 py-1.5 rounded-lg",
              foodLog.length === 0
                ? "text-muted-foreground/30"
                : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            )}
          >
            <Trash2 className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>

      {/* Entry list — full height, no max-h constraint */}
      <div className="space-y-1.5">
        {[...foodLog].reverse().map((entry) => {
          const accent = getEntryAccent(entry);
          const isSpar = entry.mode === 'spar';
          const isEditing = editingId === entry.id;
          const sliceN = entry.sliceCount ?? 0;
          const displayAmount = isSpar
            ? (sliceN > 0 ? `+${sliceN}` : '')
            : `${entry.amount || 0}g`;
          const displayUnit = isSpar
            ? (sliceN === 0 ? 'tracked' : (sliceN === 1 ? 'slice' : 'slices'))
            : (entry.macroType === 'carbs' ? 'C' : 'P');

          return (
            <SwipeableRow
              key={entry.id}
              actions={[
                {
                  icon: <Trash2 className="w-4 h-4" />,
                  label: "Delete",
                  bgColor: "bg-red-600",
                  textColor: "text-white",
                  onClick: () => handleDelete(entry.id),
                },
              ]}
              className="rounded-lg overflow-hidden"
            >
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 border-l-[3px] min-h-[48px] transition-colors",
                  `border-l-${accent}-500`,
                  `bg-${accent}-500/8`,
                )}
              >
                {/* Food name + time */}
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-semibold truncate block leading-tight">{entry.name}</span>
                  <span className="text-xs text-muted-foreground/60 font-mono">
                    {(() => {
                      try {
                        return format(new Date(entry.timestamp), 'h:mm a');
                      } catch {
                        return '';
                      }
                    })()}
                  </span>
                </div>

                {/* Amount + edit */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input aria-label="Amount"
                        type="number"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEdit(entry.id, parseFloat(editingValue) || (isSpar ? 1 : entry.amount || 0));
                          if (e.key === 'Escape') { setEditingId(null); setEditingValue(''); }
                        }}
                        autoFocus
                        className="w-16 h-8 text-[12px] font-mono font-bold text-center bg-background border border-primary rounded px-1"
                      />
                      <button
                        aria-label="Save amount"
                        onClick={() => handleEdit(entry.id, parseFloat(editingValue) || (isSpar ? 1 : entry.amount || 0))}
                        className="w-8 h-8 relative after:absolute after:-inset-1.5 flex items-center justify-center rounded bg-primary/20 text-primary hover:bg-primary/30"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditingValue(String(isSpar ? (entry.sliceCount ?? 1) : (entry.amount || 0)));
                        }}
                        className={cn(
                          "text-[12px] font-mono font-bold px-2.5 py-1 rounded-md hover:ring-1 hover:ring-current transition-all",
                          `text-${accent}-500`
                        )}
                        title="Tap to edit"
                      >
                        {displayAmount} {displayUnit}
                      </button>
                      {entry.liquidOz && (
                        <span className="text-xs font-mono font-bold text-cyan-500">+{entry.liquidOz}oz</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </SwipeableRow>
          );
        })}
      </div>

      {/* Entry count */}
      <p className="text-xs text-muted-foreground/40 text-center pt-2">
        {foodLog.length} {foodLog.length === 1 ? 'item' : 'items'} logged {dayLabel}
      </p>
    </div>
  );
}
