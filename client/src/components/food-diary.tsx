/**
 * FoodDiary — FatSecret-style meal-section day view.
 * Groups food log entries by meal (Breakfast/Lunch/Dinner/Snacks),
 * shows per-section totals, inline delete, and daily summary.
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { useStore, type FoodLogEntry, type MealSection, inferMealSection } from "@/lib/store";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Plus, Check, ChevronDown, ChevronUp, Pencil, ArrowRightLeft, Trash2,
} from "lucide-react";
import { hapticTap } from "@/lib/haptics";
import { SwipeableRow } from "@/components/ui/swipeable-row";

interface FoodDiaryProps {
  dateKey: string;
  mode: 'spar' | 'sugar';
  sliceTargets?: {
    protein: number; carb: number; veg: number;
    fruit: number; fat: number;
  } | null;
  gramTargets?: {
    carbs: { min: number; max: number };
    protein: { min: number; max: number };
  };
  onAddFood: (mealSection: MealSection) => void;
}

const MEAL_CONFIG: { id: MealSection; label: string; emoji: string }[] = [
  { id: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { id: 'lunch', label: 'Lunch', emoji: '☀️' },
  { id: 'dinner', label: 'Dinner', emoji: '🌙' },
  { id: 'snacks', label: 'Snacks', emoji: '🍿' },
];

// Accent color for food entries
// Static Tailwind class maps (dynamic classes get purged)
const BG_DOT: Record<string, string> = {
  orange: 'bg-orange-500', amber: 'bg-amber-500', green: 'bg-green-500',
  pink: 'bg-pink-500', yellow: 'bg-yellow-500', red: 'bg-red-500', muted: 'bg-muted-foreground',
};
const TEXT_ACCENT: Record<string, string> = {
  orange: 'text-orange-500', amber: 'text-amber-500', green: 'text-green-500',
  pink: 'text-pink-500', yellow: 'text-yellow-500', red: 'text-red-500', muted: 'text-muted-foreground',
};

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
  const isCarb = entry.macroType === 'carbs';
  if (isCarb) {
    if (entry.category === 'fructose') return 'green';
    if (entry.category === 'zerofiber') return 'red';
    return 'amber';
  }
  return 'orange';
}

export function FoodDiary({ dateKey, mode, sliceTargets, gramTargets, onAddFood }: FoodDiaryProps) {
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
  const [collapsedSections, setCollapsedSections] = useState<Set<MealSection>>(new Set());
  const [movingId, setMovingId] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [undoEntry, setUndoEntry] = useState<FoodLogEntry | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Group entries by meal section ───
  const grouped = useMemo(() => {
    const groups: Record<MealSection, FoodLogEntry[]> = {
      breakfast: [], lunch: [], dinner: [], snacks: [],
    };
    for (const entry of foodLog) {
      const section = entry.mealSection || inferMealSection(entry.timestamp);
      groups[section].push(entry);
    }
    return groups;
  }, [foodLog]);

  // ─── Per-section totals ───
  const sectionTotals = useMemo(() => {
    const totals: Record<MealSection, { slices: number; grams: number; water: number }> = {
      breakfast: { slices: 0, grams: 0, water: 0 },
      lunch: { slices: 0, grams: 0, water: 0 },
      dinner: { slices: 0, grams: 0, water: 0 },
      snacks: { slices: 0, grams: 0, water: 0 },
    };
    for (const section of MEAL_CONFIG) {
      for (const entry of grouped[section.id]) {
        if (entry.mode === 'spar') {
          totals[section.id].slices += entry.sliceCount || 1;
        }
        totals[section.id].grams += entry.amount || entry.gramAmount || 0;
        totals[section.id].water += entry.liquidOz || 0;
      }
    }
    return totals;
  }, [grouped]);

  // ─── Sync localStorage for tracker compatibility ───
  const syncLocalStorage = useCallback((entries: FoodLogEntry[]) => {
    if (typeof window === 'undefined') return;
    const hasSpar = entries.some(e => e.mode === 'spar');
    const hasSugar = entries.some(e => e.mode === 'sugar');
    if (hasSpar || entries.length === 0) {
      localStorage.setItem(`pwm-spar-history-${dateKey}`, JSON.stringify(entries.filter(e => e.mode === 'spar')));
    }
    if (hasSugar || entries.length === 0) {
      localStorage.setItem(`pwm-food-history-${dateKey}`, JSON.stringify(entries.filter(e => e.mode === 'sugar')));
    }
  }, [dateKey]);

  // ─── Subtract entry contribution from tracking totals ───
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
      const gramAmount = entry.gramAmount || (cat === 'protein' ? 25 * sliceCount : cat === 'carb' ? 30 * sliceCount : 0);
      if (gramAmount > 0 && cat !== 'veg' && cat !== 'fruit' && cat !== 'fat') {
        const gramKey = cat === 'protein' ? 'proteinConsumed' : 'carbsConsumed';
        const currentGrams = gramKey === 'proteinConsumed' ? tracking.proteinConsumed : tracking.carbsConsumed;
        updates[gramKey] = Math.max(0, currentGrams - gramAmount);
      }
    } else {
      const amount = entry.amount || 0;
      if (entry.macroType === 'carbs') {
        updates.carbsConsumed = Math.max(0, tracking.carbsConsumed - amount);
        updates.carbSlices = Math.max(0, tracking.carbSlices - Math.max(1, Math.round(amount / 26)));
      } else if (entry.macroType === 'protein') {
        updates.proteinConsumed = Math.max(0, tracking.proteinConsumed - amount);
        updates.proteinSlices = Math.max(0, tracking.proteinSlices - Math.max(1, Math.round(amount / 25)));
      }
    }
    if (entry.liquidOz && entry.liquidOz > 0) {
      updates.waterConsumed = Math.max(0, tracking.waterConsumed - entry.liquidOz);
    }
    return updates;
  }, [tracking]);

  // ─── Re-add a previously deleted entry ───
  const restoreEntry = useCallback((entry: FoodLogEntry) => {
    const current = getDailyTracking(dateKey);
    const updates: Record<string, any> = {};

    if (entry.mode === 'spar') {
      const sliceCount = entry.sliceCount || 1;
      const cat = entry.sliceType || 'protein';
      const sliceKey = cat === 'protein' ? 'proteinSlices'
        : cat === 'carb' ? 'carbSlices'
        : cat === 'veg' ? 'vegSlices'
        : cat === 'fruit' ? 'fruitSlices'
        : 'fatSlices';
      updates[sliceKey] = (current[sliceKey as keyof typeof current] as number || 0) + sliceCount;
      const gramAmount = entry.gramAmount || 0;
      if (gramAmount > 0) {
        const gramKey = cat === 'protein' ? 'proteinConsumed' : 'carbsConsumed';
        updates[gramKey] = (current[gramKey as keyof typeof current] as number || 0) + gramAmount;
      }
    } else {
      const amount = entry.amount || 0;
      if (entry.macroType === 'carbs') {
        updates.carbsConsumed = current.carbsConsumed + amount;
        updates.carbSlices = current.carbSlices + Math.max(1, Math.round(amount / 26));
      } else if (entry.macroType === 'protein') {
        updates.proteinConsumed = current.proteinConsumed + amount;
        updates.proteinSlices = current.proteinSlices + Math.max(1, Math.round(amount / 25));
      }
    }
    if (entry.liquidOz && entry.liquidOz > 0) {
      updates.waterConsumed = current.waterConsumed + entry.liquidOz;
    }

    const currentLog = current.foodLog || [];
    const restoredLog = [...currentLog, entry];
    updateDailyTracking(dateKey, { ...updates, foodLog: restoredLog });
    syncLocalStorage(restoredLog);
  }, [dateKey, getDailyTracking, updateDailyTracking, syncLocalStorage]);

  // ─── Delete entry immediately, with inline undo ───
  const handleDelete = useCallback((entryId: string) => {
    const entry = foodLog.find(e => e.id === entryId);
    if (!entry) return;
    hapticTap();

    // Clear any previous undo timer
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    // Delete immediately — no stale closure risk
    const trackingUpdates = subtractEntry(entry);
    const newLog = foodLog.filter(e => e.id !== entryId);
    updateDailyTracking(dateKey, { ...trackingUpdates, foodLog: newLog });
    syncLocalStorage(newLog);

    // Show inline undo bar
    setUndoEntry(entry);

    // Auto-dismiss after 4 seconds
    undoTimerRef.current = setTimeout(() => {
      setUndoEntry(null);
    }, 4000);
  }, [foodLog, dateKey, subtractEntry, updateDailyTracking, syncLocalStorage]);

  const handleUndo = useCallback(() => {
    if (!undoEntry) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    restoreEntry(undoEntry);
    setUndoEntry(null);
    hapticTap();
  }, [undoEntry, restoreEntry]);

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
    const newLog = foodLog.map(e => {
      if (e.id !== entryId) return e;
      return entry.mode === 'sugar' ? { ...e, amount: newAmount } : { ...e, sliceCount: newAmount };
    });
    updateDailyTracking(dateKey, { ...updates, foodLog: newLog });
    syncLocalStorage(newLog);
    setEditingId(null);
    setEditingValue('');
  }, [foodLog, dateKey, tracking, updateDailyTracking, syncLocalStorage]);

  // ─── Move entry to different meal section ───
  const handleMove = useCallback((entryId: string, toSection: MealSection) => {
    const newLog = foodLog.map(e => {
      if (e.id !== entryId) return e;
      return { ...e, mealSection: toSection };
    });
    updateDailyTracking(dateKey, { foodLog: newLog });
    syncLocalStorage(newLog);
    setMovingId(null);
    hapticTap();
  }, [foodLog, dateKey, updateDailyTracking, syncLocalStorage]);

  const toggleSection = (section: MealSection) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      {/* ── Meal Sections ── */}
      {MEAL_CONFIG.map(meal => {
        const entries = grouped[meal.id];
        const totals = sectionTotals[meal.id];
        const isCollapsed = collapsedSections.has(meal.id);
        const hasEntries = entries.length > 0;

        return (
          <div key={meal.id} className="border border-muted/20 rounded-xl overflow-hidden">
            {/* Section header */}
            <div
              className={cn(
                "flex items-center justify-between px-3 py-2.5",
                hasEntries ? "bg-muted/10" : "bg-transparent"
              )}
            >
              <button
                onClick={() => hasEntries && toggleSection(meal.id)}
                className="flex items-center gap-2 min-w-0 flex-1"
              >
                <span className="text-sm">{meal.emoji}</span>
                <span className="text-[12px] font-bold uppercase tracking-wide text-foreground">
                  {meal.label}
                </span>
                {hasEntries && (
                  <span className="text-xs text-muted-foreground/60 font-mono">
                    {entries.length} {entries.length === 1 ? 'item' : 'items'}
                    {mode === 'spar' && totals.slices > 0 && ` · ${totals.slices} slices`}
                  </span>
                )}
                {hasEntries && (
                  isCollapsed
                    ? <ChevronDown className="w-3 h-3 text-muted-foreground/40 ml-auto" />
                    : <ChevronUp className="w-3 h-3 text-muted-foreground/40 ml-auto" />
                )}
              </button>
              <button
                aria-label={`Add food to ${meal.label}`}
                onClick={() => { hapticTap(); onAddFood(meal.id); }}
                className="w-7 h-7 rounded-full relative after:absolute after:-inset-2 bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 active:scale-90 transition-all ml-2 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {/* Entries */}
            {!isCollapsed && (
              <div>
                {entries.length === 0 ? (
                  <button
                    onClick={() => { hapticTap(); onAddFood(meal.id); }}
                    className="w-full px-3 py-3 text-xs text-muted-foreground/40 text-center hover:bg-muted/5 transition-colors"
                  >
                    Tap + to add food
                  </button>
                ) : (
                  <div className="divide-y divide-muted/10">
                    {entries.map(entry => {
                      const accent = getEntryAccent(entry);
                      const isSpar = entry.mode === 'spar';
                      const isEditing = editingId === entry.id;
                      const isMoving = movingId === entry.id;
                      const currentSection = entry.mealSection || inferMealSection(entry.timestamp);
                      const sliceN = entry.sliceCount ?? 0;
                      const displayAmount = isSpar
                        ? (sliceN > 0 ? `${sliceN}` : '')
                        : `${entry.amount || 0}g`;
                      const displayUnit = isSpar
                        ? (sliceN === 0 ? 'tracked' : (sliceN === 1 ? 'slice' : 'slices'))
                        : (entry.macroType === 'carbs' ? 'C' : 'P');

                      return (
                        <div key={entry.id}>
                          <SwipeableRow
                            actions={[
                              {
                                icon: <Pencil className="w-4 h-4" />,
                                label: "Edit",
                                bgColor: "bg-blue-600",
                                textColor: "text-white",
                                onClick: () => {
                                  setEditingId(entry.id);
                                  setEditingValue(String(isSpar ? (entry.sliceCount || 1) : (entry.amount || 0)));
                                  setSwipedId(null);
                                },
                              },
                              {
                                icon: <ArrowRightLeft className="w-4 h-4" />,
                                label: "Move",
                                bgColor: "bg-amber-600",
                                textColor: "text-white",
                                onClick: () => {
                                  setMovingId(isMoving ? null : entry.id);
                                  setSwipedId(null);
                                  hapticTap();
                                },
                              },
                              {
                                icon: <Trash2 className="w-4 h-4" />,
                                label: "Delete",
                                bgColor: "bg-red-600",
                                textColor: "text-white",
                                onClick: () => {
                                  setSwipedId(null);
                                  handleDelete(entry.id);
                                },
                              },
                            ]}
                            isOpen={swipedId === entry.id}
                            onOpenChange={(open) => setSwipedId(open ? entry.id : null)}
                          >
                            <div className="flex items-center gap-2 px-3 py-2 min-h-[44px]">
                              {/* Category dot */}
                              <div className={cn("w-2 h-2 rounded-full shrink-0", BG_DOT[accent] || 'bg-muted-foreground')} />

                              {/* Food name + time */}
                              <div className="flex-1 min-w-0">
                                <span className="text-[12px] font-medium truncate block leading-tight">{entry.name}</span>
                                <span className="text-xs text-muted-foreground/50 font-mono">
                                  {(() => { try { return format(new Date(entry.timestamp), 'h:mm a'); } catch { return ''; } })()}
                                </span>
                              </div>

                              {/* Amount display (or edit input) */}
                              <div className="flex items-center gap-1 shrink-0">
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
                                      className="w-14 h-7 text-xs font-mono font-bold text-center bg-background border border-primary rounded px-1"
                                    />
                                    <button
                                      aria-label="Save amount"
                                      onClick={() => handleEdit(entry.id, parseFloat(editingValue) || (isSpar ? 1 : entry.amount || 0))}
                                      className="w-7 h-7 relative after:absolute after:-inset-2 flex items-center justify-center rounded bg-primary/20 text-primary"
                                    >
                                      <Check className="w-3 h-3" aria-hidden="true" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <span className={cn(
                                      "text-xs font-mono font-bold px-2 py-0.5",
                                      TEXT_ACCENT[accent] || 'text-muted-foreground'
                                    )}>
                                      {displayAmount} {displayUnit}
                                    </span>
                                    {entry.liquidOz && (
                                      <span className="text-xs font-mono font-bold text-cyan-500">+{entry.liquidOz}oz</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </SwipeableRow>

                          {/* Move-to-meal inline bar */}
                          {isMoving && (
                            <div className="flex items-center gap-1 px-3 py-1.5 bg-muted/10 border-t border-muted/10">
                              <span className="text-xs text-muted-foreground/50 mr-1 shrink-0">Move to</span>
                              {MEAL_CONFIG.filter(m => m.id !== currentSection).map(m => (
                                <button
                                  key={m.id}
                                  onClick={() => handleMove(entry.id, m.id)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-background text-xs font-bold text-foreground hover:bg-primary/10 hover:text-primary active:scale-95 transition-all border border-muted/20"
                                >
                                  <span>{m.emoji}</span>
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Inline undo bar */}
      {undoEntry && (
        <div className="flex items-center justify-between px-3 py-2.5 bg-primary/15 rounded-xl border border-primary/30 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="text-xs text-foreground/70 truncate mr-2">
            Removed {undoEntry.name.length > 25 ? undoEntry.name.slice(0, 25) + '...' : undoEntry.name}
          </span>
          <button
            onClick={handleUndo}
            className="text-xs font-bold text-primary bg-primary/20 px-3 py-1 rounded-lg hover:bg-primary/30 active:scale-95 transition-all shrink-0"
          >
            Undo
          </button>
        </div>
      )}

      {/* Entry count */}
      {foodLog.length > 0 && !undoEntry && (
        <p className="text-xs text-muted-foreground/40 text-center pt-1">
          {foodLog.length} {foodLog.length === 1 ? 'item' : 'items'} logged {dayLabel}
        </p>
      )}
    </div>
  );
}

