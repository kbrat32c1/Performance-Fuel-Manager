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
  X,
  Check,
  Pencil,
  Trash2,
  Utensils,
} from "lucide-react";
import { hapticTap } from "@/lib/haptics";

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
  const { getDailyTracking, updateDailyTracking } = useStore();
  const tracking = getDailyTracking(dateKey);
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

  // ─── Subtract entry's contribution from tracking totals ───
  const subtractEntry = useCallback((entry: FoodLogEntry): Record<string, any> => {
    const updates: Record<string, any> = {};

    if (entry.mode === 'spar') {
      const sliceCount = entry.sliceCount || 1;
      const cat = entry.sliceType || 'protein';
      const sliceKey = cat === 'protein' ? 'proteinSlices'
        : cat === 'carb' ? 'carbSlices'
        : cat === 'veg' ? 'vegSlices'
        : cat === 'fruit' ? 'fruitSlices'
        : 'fatSlices';
      const current = cat === 'protein' ? tracking.proteinSlices
        : cat === 'carb' ? tracking.carbSlices
        : cat === 'veg' ? tracking.vegSlices
        : cat === 'fruit' ? (tracking.fruitSlices || 0)
        : (tracking.fatSlices || 0);
      updates[sliceKey] = Math.max(0, current - sliceCount);

      // Cross-sync gram equivalent
      const gramAmount = entry.gramAmount || (cat === 'protein' ? 25 * sliceCount : cat === 'carb' ? 30 * sliceCount : 0);
      if (gramAmount > 0 && cat !== 'veg' && cat !== 'fruit' && cat !== 'fat') {
        const gramKey = cat === 'protein' ? 'proteinConsumed' : 'carbsConsumed';
        const currentGrams = gramKey === 'proteinConsumed' ? tracking.proteinConsumed : tracking.carbsConsumed;
        updates[gramKey] = Math.max(0, currentGrams - gramAmount);
      }
    } else {
      // Sugar mode
      const amount = entry.amount || 0;
      if (entry.macroType === 'carbs') {
        updates.carbsConsumed = Math.max(0, tracking.carbsConsumed - amount);
        updates.carbSlices = Math.max(0, tracking.carbSlices - Math.max(1, Math.round(amount / 26)));
      } else if (entry.macroType === 'protein') {
        updates.proteinConsumed = Math.max(0, tracking.proteinConsumed - amount);
        updates.proteinSlices = Math.max(0, tracking.proteinSlices - Math.max(1, Math.round(amount / 25)));
      }
    }

    // Water
    if (entry.liquidOz && entry.liquidOz > 0) {
      updates.waterConsumed = Math.max(0, tracking.waterConsumed - entry.liquidOz);
    }

    return updates;
  }, [tracking]);

  // ─── Delete entry ───
  const handleDelete = useCallback((entryId: string) => {
    const entry = foodLog.find(e => e.id === entryId);
    if (!entry) return;
    hapticTap();

    const trackingUpdates = subtractEntry(entry);
    const newLog = foodLog.filter(e => e.id !== entryId);
    updateDailyTracking(dateKey, { ...trackingUpdates, foodLog: newLog });
    syncLocalStorage(newLog);
  }, [foodLog, dateKey, subtractEntry, updateDailyTracking, syncLocalStorage]);

  // ─── Undo last entry ───
  const handleUndo = useCallback(() => {
    if (foodLog.length === 0) return;
    hapticTap();

    const lastEntry = foodLog[foodLog.length - 1];
    const trackingUpdates = subtractEntry(lastEntry);
    const newLog = foodLog.slice(0, -1);
    updateDailyTracking(dateKey, { ...trackingUpdates, foodLog: newLog });
    syncLocalStorage(newLog);
  }, [foodLog, dateKey, subtractEntry, updateDailyTracking, syncLocalStorage]);

  // ─── Edit entry amount ───
  const handleEdit = useCallback((entryId: string, newAmount: number) => {
    const entry = foodLog.find(e => e.id === entryId);
    if (!entry || newAmount <= 0) return;

    const updates: Record<string, any> = {};

    if (entry.mode === 'sugar') {
      const diff = newAmount - (entry.amount || 0);
      if (entry.macroType === 'carbs') {
        updates.carbsConsumed = Math.max(0, tracking.carbsConsumed + diff);
        updates.carbSlices = Math.max(0, tracking.carbSlices + Math.round(diff / 26));
      } else if (entry.macroType === 'protein') {
        updates.proteinConsumed = Math.max(0, tracking.proteinConsumed + diff);
        updates.proteinSlices = Math.max(0, tracking.proteinSlices + Math.round(diff / 25));
      }
    }
    // SPAR mode: edit sliceCount
    if (entry.mode === 'spar') {
      const oldSlices = entry.sliceCount || 1;
      const diff = newAmount - oldSlices;
      const cat = entry.sliceType || 'protein';
      const sliceKey = cat === 'protein' ? 'proteinSlices'
        : cat === 'carb' ? 'carbSlices'
        : cat === 'veg' ? 'vegSlices'
        : cat === 'fruit' ? 'fruitSlices'
        : 'fatSlices';
      const current = cat === 'protein' ? tracking.proteinSlices
        : cat === 'carb' ? tracking.carbSlices
        : cat === 'veg' ? tracking.vegSlices
        : cat === 'fruit' ? (tracking.fruitSlices || 0)
        : (tracking.fatSlices || 0);
      updates[sliceKey] = Math.max(0, current + diff);
    }

    // Update the entry
    const newLog = foodLog.map(e => {
      if (e.id !== entryId) return e;
      return entry.mode === 'sugar'
        ? { ...e, amount: newAmount }
        : { ...e, sliceCount: newAmount };
    });
    updateDailyTracking(dateKey, { ...updates, foodLog: newLog });
    syncLocalStorage(newLog);
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
        const count = e.sliceCount || 1;
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
          <span className="text-[11px] font-mono font-bold text-amber-500">{totals.carbsG}g carbs</span>
        )}
        {hasSugar && totals.proteinG > 0 && (
          <span className="text-[11px] font-mono font-bold text-orange-500">{totals.proteinG}g protein</span>
        )}
        {hasSpar && totals.proteinSlices > 0 && (
          <span className="text-[11px] font-mono font-bold text-orange-500">{totals.proteinSlices} pro</span>
        )}
        {hasSpar && totals.carbSlices > 0 && (
          <span className="text-[11px] font-mono font-bold text-amber-500">{totals.carbSlices} carb</span>
        )}
        {hasSpar && totals.vegSlices > 0 && (
          <span className="text-[11px] font-mono font-bold text-green-500">{totals.vegSlices} veg</span>
        )}
        {hasSpar && totals.fruitSlices > 0 && (
          <span className="text-[11px] font-mono font-bold text-pink-500">{totals.fruitSlices} fruit</span>
        )}
        {hasSpar && totals.fatSlices > 0 && (
          <span className="text-[11px] font-mono font-bold text-yellow-600">{totals.fatSlices} fat</span>
        )}
        {totals.water > 0 && (
          <span className="text-[11px] font-mono font-bold text-cyan-500">{totals.water}oz water</span>
        )}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleUndo}
          disabled={foodLog.length === 0}
          className={cn(
            "flex items-center gap-1 text-[11px] font-bold transition-colors px-2.5 py-1.5 rounded-lg",
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
            <span className="text-[11px] text-destructive font-bold">Reset all food?</span>
            <button onClick={handleReset} className="text-[11px] font-bold text-destructive hover:text-destructive/80 px-2 py-1 rounded bg-destructive/10">
              Yes
            </button>
            <button onClick={() => setConfirmingReset(false)} className="text-[11px] font-bold text-muted-foreground px-2 py-1">
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingReset(true)}
            disabled={foodLog.length === 0}
            className={cn(
              "flex items-center gap-1 text-[11px] font-bold transition-colors px-2.5 py-1.5 rounded-lg",
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
          const displayAmount = isSpar
            ? `+${entry.sliceCount || 1}`
            : `${entry.amount || 0}g`;
          const sliceN = entry.sliceCount || 1;
          const displayUnit = isSpar
            ? (entry.sliceType === 'protein' ? (sliceN === 1 ? 'palm' : 'palms') : entry.sliceType === 'carb' ? (sliceN === 1 ? 'fist' : 'fists') : entry.sliceType === 'veg' ? (sliceN === 1 ? 'fist' : 'fists') : entry.sliceType === 'fruit' ? 'pc' : (sliceN === 1 ? 'thumb' : 'thumbs'))
            : (entry.macroType === 'carbs' ? 'C' : 'P');

          return (
            <div
              key={entry.id}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-l-[3px] min-h-[48px] transition-colors",
                `border-l-${accent}-500`,
                `bg-${accent}-500/8`,
                "hover:bg-muted/20"
              )}
            >
              {/* Food name + time */}
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-semibold truncate block leading-tight">{entry.name}</span>
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                  {(() => {
                    try {
                      return format(new Date(entry.timestamp), 'h:mm a');
                    } catch {
                      return '';
                    }
                  })()}
                </span>
              </div>

              {/* Amount + actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
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
                      onClick={() => handleEdit(entry.id, parseFloat(editingValue) || (isSpar ? 1 : entry.amount || 0))}
                      className="w-8 h-8 flex items-center justify-center rounded bg-primary/20 text-primary hover:bg-primary/30"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(entry.id);
                        setEditingValue(String(isSpar ? (entry.sliceCount || 1) : (entry.amount || 0)));
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
                      <span className="text-[10px] font-mono font-bold text-cyan-500">+{entry.liquidOz}oz</span>
                    )}
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                      aria-label={`Remove ${entry.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Entry count */}
      <p className="text-[10px] text-muted-foreground/40 text-center pt-2">
        {foodLog.length} {foodLog.length === 1 ? 'item' : 'items'} logged today
      </p>
    </div>
  );
}
