/**
 * AddFoodFlow — FatSecret-style focused add-food screen.
 * Features search bar, Recent/Favorites/Database tabs,
 * photo/voice/barcode entry methods, serving selection.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  X, Search, Camera, Mic, ScanBarcode, Loader2, AlertCircle,
  Star, Clock, ChevronDown, ChevronUp, Plus, Check, Pencil,
} from "lucide-react";
import { useStore, type FoodLogEntry as StoreFoodLogEntry, type MealSection, inferMealSection } from "@/lib/store";
import { useFoodSearch, type FatSecretFood, type FatSecretServing } from "@/hooks/use-food-search";
import { useFavorites } from "@/lib/favorites";
import { formatUSDAName } from "@/lib/food-data";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { VoiceFoodLogger } from "@/components/voice-food-logger";
import { FoodPhotoCamera } from "@/components/food-photo-camera";
import { FoodPhotoReview, type PhotoFood } from "@/components/food-photo-review";
import { hapticTap, hapticSuccess } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";
import { CARB_G_PER_SLICE, PROTEIN_G_PER_SLICE, classifyFood, type SliceType, nextTotals } from "@/lib/food-totals";

type FlowTab = 'recent' | 'favorites';

interface AddFoodFlowProps {
  mealSection: MealSection;
  mode: 'spar' | 'sugar';
  isV2?: boolean;
  blockedCategories?: string[];
  onClose: () => void;
  /** If omitted, component manages its own meal selector */
  hideMealSelector?: boolean;
  /** Day to log into (yyyy-MM-dd). Defaults to today. */
  dateKey?: string;
}

const MEAL_OPTIONS: { id: MealSection; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];

export function AddFoodFlow({ mealSection: initialMeal, mode, isV2, blockedCategories, onClose, hideMealSelector, dateKey: dateKeyProp }: AddFoodFlowProps) {
  const {
    profile, getDailyTracking, updateDailyTracking,
    getNutritionMode, getTargetsForDate,
  } = useStore();
  const { toast } = useToast();
  const today = profile.simulatedDate || new Date();
  const dateKey = dateKeyProp ?? format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);
  const dayTargets = getTargetsForDate(dateKey);
  const macros = dayTargets.macros;
  const nutritionMode = getNutritionMode();
  const isSparMode = nutritionMode === 'spar';
  const showSliceTracker = isSparMode;
  const sliceTargets = showSliceTracker ? dayTargets.slices : null;

  const [activeMeal, setActiveMeal] = useState<MealSection>(initialMeal);
  const [activeTab, setActiveTab] = useState<FlowTab>('recent');
  const [showMealDropdown, setShowMealDropdown] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showPhotoCamera, setShowPhotoCamera] = useState(false);
  const [photoImage, setPhotoImage] = useState<string | null>(null);
  const [showPhotoReview, setShowPhotoReview] = useState(false);
  const [flashedFood, setFlashedFood] = useState<string | null>(null);
  const flashRef = useRef<NodeJS.Timeout | null>(null);
  const [showCustomEntry, setShowCustomEntry] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customSliceType, setCustomSliceType] = useState<'protein' | 'carb' | 'veg' | 'fruit' | 'fat'>('carb');

  const { isFavorite, toggleFavorite, getFavoriteNames } = useFavorites(mode === 'spar' ? 'spar' : 'macro');

  const search = useFoodSearch();
  const {
    query, setQuery,
    fsResults, fsLoading, fsSearched, fsError,
    barcodeLoading, barcodeLookup,
    selectedFS, setSelectedFS,
    selectedFSServing, setSelectedFSServing,
    selectedOFF, setSelectedOFF,
    offServingGrams, setOffServingGrams,
    recentFoods, addToRecents,
    clearResults,
  } = search;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mealDropdownRef = useRef<HTMLDivElement>(null);

  // Auto-focus search on mount
  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, []);

  // Close meal dropdown on outside tap
  useEffect(() => {
    if (!showMealDropdown) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (mealDropdownRef.current && !mealDropdownRef.current.contains(e.target as Node)) {
        setShowMealDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showMealDropdown]);

  // ─── Sync localStorage for tracker compatibility ───
  const syncLocalStorage = useCallback((entries: StoreFoodLogEntry[]) => {
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

  // ─── Core: log a food entry to the store ───
  // Each entry carries its own grams and portions; the day's totals are rebuilt from the log.
  const logFoodEntry = useCallback((
    name: string,
    carbs: number,
    protein: number,
    opts?: { liquidOz?: number; category?: string; sliceType?: SliceType; sliceCount?: number; fat?: number }
  ) => {
    const existingLog = tracking.foodLog || [];
    const entries: StoreFoodLogEntry[] = [];
    const now = Date.now();

    if (showSliceTracker) {
      const portion = opts?.sliceType
        ? { sliceType: opts.sliceType, sliceCount: opts.sliceCount ?? 1 }
        : classifyFood({ carbs, protein, fat: opts?.fat });
      entries.push({
        id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        timestamp: new Date(now).toISOString(),
        mode: 'spar',
        mealSection: activeMeal,
        sliceType: portion.sliceType,
        sliceCount: portion.sliceCount,
        // A quick portion with no grams counts as a standard portion in the Grams view.
        carbs: carbs === 0 && protein === 0 && portion.sliceType === 'carb' ? CARB_G_PER_SLICE * portion.sliceCount : carbs,
        protein: carbs === 0 && protein === 0 && portion.sliceType === 'protein' ? PROTEIN_G_PER_SLICE * portion.sliceCount : protein,
        ...(opts?.liquidOz ? { liquidOz: opts.liquidOz } : {}),
      });
    } else {
      // Gram mode: one entry per macro (a zero-macro food like black coffee still gets one).
      const base = { name, mode: 'sugar' as const, mealSection: activeMeal, category: opts?.category || 'custom' };
      if (carbs > 0 || protein === 0) {
        entries.push({ ...base, id: `${now}-c-${Math.random().toString(36).substr(2, 9)}`, timestamp: new Date(now).toISOString(), macroType: 'carbs', amount: carbs, ...(opts?.liquidOz ? { liquidOz: opts.liquidOz } : {}) });
      }
      if (protein > 0) {
        entries.push({ ...base, id: `${now}-p-${Math.random().toString(36).substr(2, 9)}`, timestamp: new Date(now + 1).toISOString(), macroType: 'protein', amount: protein });
      }
    }

    const foodLog = [...existingLog, ...entries];
    const updates: Record<string, any> = { ...nextTotals(tracking, foodLog), foodLog };
    if (showSliceTracker) updates.nutritionMode = 'spar';
    if (opts?.liquidOz && opts.liquidOz > 0) {
      updates.waterConsumed = tracking.waterConsumed + opts.liquidOz;
    }

    updateDailyTracking(dateKey, updates);
    syncLocalStorage(foodLog);
    hapticSuccess();

    // Flash feedback
    setFlashedFood(name);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setFlashedFood(null), 1200);
  }, [showSliceTracker, tracking, dateKey, activeMeal, updateDailyTracking, syncLocalStorage]);

  // ─── FatSecret food add ───
  const handleFSAdd = useCallback((food: FatSecretFood, serving: FatSecretServing, qty: number = 1) => {
    const carbs = Math.round(serving.carbs * qty);
    const protein = Math.round(serving.protein * qty);
    const brandLabel = food.brand ? ` (${food.brand})` : '';
    const qtyLabel = qty !== 1 ? ` ×${qty % 1 === 0 ? qty : qty.toFixed(1)}` : '';
    const foodName = `${formatUSDAName(food.name)}${brandLabel} — ${serving.description}${qtyLabel}`;

    const fat = Math.round((serving.fat || 0) * qty);
    const { sliceType, sliceCount } = classifyFood({ carbs, protein, fat }, (food.sparCategory as SliceType) || null, qty);

    logFoodEntry(foodName, carbs, protein, {
      category: 'fatsecret',
      sliceType,
      sliceCount,
      fat,
    });
    addToRecents(food, serving);
    setSelectedFS(null);
    setSelectedFSServing(null);
  }, [logFoodEntry, addToRecents, setSelectedFS, setSelectedFSServing, activeMeal]);

  // ─── Recent food quick-add ───
  const handleRecentAdd = useCallback((recent: typeof recentFoods[0]) => {
    handleFSAdd(recent.food, recent.serving);
  }, [handleFSAdd]);

  // ─── Barcode scan ───
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    setShowBarcode(false);
    const food = await barcodeLookup(barcode);
    if (!food) {
      toast({ title: "Product not found", description: "Try searching by name.", variant: "destructive" });
    }
    // If food found, selectedOFF is set by the hook and the product card will render
  }, [barcodeLookup, toast]);

  // ─── Add scanned barcode food ───
  const handleOFFAdd = useCallback(() => {
    if (!selectedOFF) return;
    const grams = parseFloat(offServingGrams) || 100;
    const carbs = Math.round(selectedOFF.carbs * grams / 100);
    const protein = Math.round(selectedOFF.protein * grams / 100);
    const brandLabel = selectedOFF.brand ? ` (${selectedOFF.brand})` : '';
    const servingLabel = selectedOFF.servingSizeLabel || `${grams}g`;
    const foodName = `${selectedOFF.name}${brandLabel} — ${servingLabel}`;

    const fat = Math.round((selectedOFF.fat || 0) * grams / 100);
    const { sliceType, sliceCount } = classifyFood({ carbs, protein, fat });

    logFoodEntry(foodName, carbs, protein, {
      category: 'off',
      sliceType,
      sliceCount,
      fat,
    });
    setSelectedOFF(null);
  }, [selectedOFF, offServingGrams, logFoodEntry, setSelectedOFF]);

  // ─── Batch log multiple foods in a single update (avoids stale closure) ───
  const batchLogFoods = useCallback((foods: PhotoFood[], source: string) => {
    if (!foods || foods.length === 0) {
      toast({ title: "No foods identified", description: "Try again with more detail.", variant: "destructive" });
      return;
    }

    const validFoods = foods.filter(f => f.name);
    if (validFoods.length === 0) return;

    const existingLog = tracking.foodLog || [];
    const newEntries: StoreFoodLogEntry[] = [];
    const now = Date.now();

    for (const food of validFoods) {
      const carbs = Math.round(food.carbs || 0);
      const protein = Math.round(food.protein || 0);
      const fat = Math.round(food.fat || 0);
      const n = newEntries.length;

      if (showSliceTracker) {
        // Same portion rule as search and barcode: grams decide protein/carb portions.
        const { sliceType, sliceCount } = classifyFood({ carbs, protein, fat }, food.sparCategory || null, food.sliceCount ?? 1);
        newEntries.push({
          id: `${now}-${n}-${Math.random().toString(36).substr(2, 9)}`,
          name: food.name,
          timestamp: new Date(now + n).toISOString(),
          mode: 'spar',
          mealSection: activeMeal,
          sliceType,
          sliceCount,
          carbs,
          protein,
        });
      } else {
        if (carbs > 0) {
          newEntries.push({ id: `${now}-${n}-c-${Math.random().toString(36).substr(2, 9)}`, name: food.name, timestamp: new Date(now + n).toISOString(), mode: 'sugar', mealSection: activeMeal, macroType: 'carbs', amount: carbs, category: source });
        }
        if (protein > 0) {
          newEntries.push({ id: `${now}-${n}-p-${Math.random().toString(36).substr(2, 9)}`, name: food.name, timestamp: new Date(now + n + 1).toISOString(), mode: 'sugar', mealSection: activeMeal, macroType: 'protein', amount: protein, category: source });
        }
      }
    }

    const foodLog = [...existingLog, ...newEntries];
    const updates: Record<string, any> = { ...nextTotals(tracking, foodLog), foodLog };
    if (showSliceTracker) updates.nutritionMode = 'spar';
    updateDailyTracking(dateKey, updates);
    syncLocalStorage(foodLog);
    hapticSuccess();

  }, [showSliceTracker, tracking, dateKey, activeMeal, updateDailyTracking, syncLocalStorage]);

  // ─── Voice result handler ───
  const handleVoiceFoods = useCallback((foods: PhotoFood[], confidence: string) => {
    setShowVoice(false);
    batchLogFoods(foods, 'voice');
  }, [batchLogFoods]);

  // ─── Photo camera (self-contained) ───
  const handleOpenCamera = useCallback(() => {
    setShowPhotoCamera(true);
  }, []);

  const handlePhotoCapture = useCallback((imageDataUrl: string) => {
    setPhotoImage(imageDataUrl);
    setShowPhotoCamera(false);
    setShowPhotoReview(true);
  }, []);

  const handlePhotoLogFoods = useCallback((foods: PhotoFood[]) => {
    setShowPhotoReview(false);
    setPhotoImage(null);
    batchLogFoods(foods, 'photo');
  }, [batchLogFoods]);

  // ─── Custom food add ───
  const handleCustomAdd = useCallback(() => {
    const name = customName.trim();
    if (!name) {
      toast({ title: "Enter a food name", variant: "destructive" });
      return;
    }
    const carbs = parseFloat(customCarbs) || 0;
    const protein = parseFloat(customProtein) || 0;
    if (carbs === 0 && protein === 0 && !showSliceTracker) {
      toast({ title: "Enter carbs or protein amount", variant: "destructive" });
      return;
    }
    logFoodEntry(name, carbs, protein, {
      category: 'custom',
      sliceType: showSliceTracker ? customSliceType : undefined,
      sliceCount: 1,
    });
    // Reset form
    setCustomName('');
    setCustomCarbs('');
    setCustomProtein('');
    setShowCustomEntry(false);
  }, [customName, customCarbs, customProtein, customSliceType, showSliceTracker, logFoodEntry, toast]);

  // ─── Favorites list ───
  const favoriteNames = useMemo(() => getFavoriteNames(), [getFavoriteNames]);

  // Active search state
  const isSearching = query.trim().length >= 3;
  const hasResults = fsResults.length > 0;
  const isLoading = fsLoading;

  return (
    <div className="flex flex-col h-full" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
      {/* ── Header: Close + Meal Selector ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-muted/20 shrink-0">
        <button aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full relative after:absolute after:-inset-1.5 bg-muted/30 flex items-center justify-center hover:bg-muted/50">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          {!hideMealSelector ? (
            <div className="relative" ref={mealDropdownRef}>
              <button
                onClick={() => setShowMealDropdown(!showMealDropdown)}
                className="flex items-center gap-1.5 text-sm font-bold"
              >
                <span>{MEAL_OPTIONS.find(m => m.id === activeMeal)?.label}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              {showMealDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-background border border-muted/30 rounded-xl shadow-lg z-50 overflow-hidden">
                  {MEAL_OPTIONS.map(meal => (
                    <button
                      key={meal.id}
                      onClick={() => { setActiveMeal(meal.id); setShowMealDropdown(false); hapticTap(); }}
                      className={cn(
                        "flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium hover:bg-muted/10 transition-colors",
                        activeMeal === meal.id && "bg-primary/10 text-primary font-bold"
                      )}
                    >
                      <span>{meal.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm font-bold">Add Food</span>
          )}
        </div>
      </div>

      {/* ── Search bar (full width, clean) ── */}
      <div className="px-4 py-2 space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input aria-label="Search foods"
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods..."
            className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-muted/20 border border-muted/30 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {query && (
            <button
              aria-label="Clear search"
              onClick={() => clearResults()}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full after:absolute after:-inset-3 bg-muted/50 flex items-center justify-center"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Tab switcher (only when not actively searching) */}
        {!isSearching && !showCustomEntry && (
          <div className="flex gap-0.5 bg-muted/15 rounded-xl p-1">
            {([
              { id: 'recent' as FlowTab, label: 'Recent', icon: Clock },
              { id: 'favorites' as FlowTab, label: 'Favorites', icon: Star },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); hapticTap(); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-bold rounded-lg transition-all",
                  activeTab === tab.id
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground/60 hover:text-muted-foreground"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Main content (scrollable) ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">

        {/* Loading state */}
        {isSearching && isLoading && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Searching...</span>
          </div>
        )}

        {/* Barcode loading */}
        {barcodeLoading && (
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Looking up barcode...</span>
          </div>
        )}

        {/* ── Scanned barcode product card ── */}
        {selectedOFF && !barcodeLoading && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold truncate">{selectedOFF.name}</p>
                {selectedOFF.brand && (
                  <p className="text-xs text-muted-foreground/60 truncate">{selectedOFF.brand}</p>
                )}
              </div>
              <button
                aria-label="Clear selected food"
                onClick={() => setSelectedOFF(null)}
                className="w-6 h-6 rounded-full relative after:absolute after:-inset-2.5 bg-muted/30 flex items-center justify-center shrink-0"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>

            {/* Nutrition per serving */}
            {(() => {
              const g = parseFloat(offServingGrams) || 100;
              const cal = Math.round(selectedOFF.calories * g / 100);
              const c = Math.round(selectedOFF.carbs * g / 100);
              const p = Math.round(selectedOFF.protein * g / 100);
              const f = Math.round(selectedOFF.fat * g / 100);
              return (
                <div className="flex items-center gap-3 text-xs font-mono font-bold">
                  <span className="text-muted-foreground">{cal} cal</span>
                  <span className="text-amber-500">{c}g C</span>
                  <span className="text-orange-500">{p}g P</span>
                  <span className="text-yellow-600">{f}g F</span>
                </div>
              );
            })()}

            {/* Serving size input */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground/60 shrink-0">Serving:</span>
              <input aria-label="Serving size in grams"
                type="number"
                value={offServingGrams}
                onChange={(e) => setOffServingGrams(e.target.value)}
                className="w-16 h-7 text-[12px] font-mono font-bold text-center bg-background border border-muted/30 rounded px-1"
              />
              <span className="text-xs text-muted-foreground/60">g</span>
              {selectedOFF.servingSizeLabel && (
                <span className="text-xs text-muted-foreground/40 truncate">
                  ({selectedOFF.servingSizeLabel})
                </span>
              )}
              <button
                onClick={() => { handleOFFAdd(); hapticTap(); }}
                className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-bold active:scale-95 transition-all shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </div>
        )}

        {/* ── Search Results ── */}
        {isSearching && !isLoading && (
          <>
            {/* Database results */}
            {fsResults.length > 0 && (
              <div className="divide-y divide-muted/15">
                <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wide pb-1">Database Results</p>
                {fsResults.slice(0, 15).map(food => (
                  <FSFoodRow
                    key={food.id}
                    food={food}
                    isExpanded={selectedFS?.id === food.id}
                    selectedServing={selectedFSServing}
                    isFav={isFavorite(food.name)}
                    flashed={flashedFood === food.name || flashedFood?.includes(food.name)}
                    onToggle={() => {
                      if (selectedFS?.id === food.id) {
                        setSelectedFS(null);
                        setSelectedFSServing(null);
                      } else {
                        setSelectedFS(food);
                        const def = food.servings.find(s => s.isDefault) || food.servings[0];
                        setSelectedFSServing(def || null);
                      }
                    }}
                    onServingChange={setSelectedFSServing}
                    onAdd={(qty: number) => selectedFSServing && handleFSAdd(food, selectedFSServing, qty)}
                    onToggleFav={() => toggleFavorite(food.name)}
                  />
                ))}
              </div>
            )}

            {/* No results or API error */}
            {fsSearched && !isLoading && fsResults.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {fsError ? (
                  <>
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-amber-500/60" />
                    <p className="text-sm font-medium">Search temporarily unavailable</p>
                    <p className="text-xs mt-1 opacity-60">Food database is connecting — try again shortly</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">No foods found</p>
                    <p className="text-xs mt-1 opacity-60">Try a different search term</p>
                  </>
                )}
                <button
                  onClick={() => { setShowCustomEntry(true); setCustomName(query); }}
                  className="mt-3 text-xs font-bold text-primary hover:underline"
                >
                  + Add "{query}" as custom food
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Recent Tab ── */}
        {!isSearching && activeTab === 'recent' && (
          <div className="space-y-1">
            {recentFoods.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-6 h-6 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No recent foods</p>
                <p className="text-xs opacity-60 mt-1">Foods you search and add will appear here</p>
              </div>
            ) : (
              recentFoods.map((recent, i) => {
                const food = recent.food;
                const serving = recent.serving;
                const flashed = flashedFood === food.name || flashedFood?.includes(food.name);
                return (
                  <button
                    key={`${food.id}-${i}`}
                    onClick={() => { handleRecentAdd(recent); hapticTap(); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.98]",
                      flashed ? "bg-green-500/15 ring-1 ring-green-500/30" : "hover:bg-muted/10"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate">{formatUSDAName(food.name)}</p>
                      <p className="text-xs text-muted-foreground/60 truncate">
                        {serving.description} · {Math.round(serving.carbs)}C {Math.round(serving.protein)}P
                      </p>
                    </div>
                    {flashed ? (
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <Plus className="w-4 h-4 text-primary/50 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* ── Favorites Tab ── */}
        {!isSearching && activeTab === 'favorites' && (
          <div className="space-y-1">
            {favoriteNames.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Star className="w-6 h-6 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No favorites yet</p>
                <p className="text-xs opacity-60 mt-1">Tap the star on any food to save it</p>
              </div>
            ) : (
              favoriteNames.map(name => (
                <div key={name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/10">
                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
                  <span className="text-[12px] font-medium flex-1 truncate">{name}</span>
                  <span className="text-xs text-muted-foreground/50">Search to add</span>
                </div>
              ))
            )}
          </div>
        )}

      </div>

      {/* ── Custom Entry Panel (slides up above bottom bar) ── */}
      {showCustomEntry && (
        <div className="shrink-0 border-t border-muted/20 bg-muted/5 px-4 py-3 space-y-2.5 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Custom Food</span>
            <button aria-label="Close custom food" onClick={() => { setShowCustomEntry(false); hapticTap(); }} className="p-1 rounded-lg relative after:absolute after:-inset-3 hover:bg-muted/20">
              <X className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
          <input aria-label="Food name"
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Food name (e.g. Grilled chicken)"
            className="w-full px-3 py-2 rounded-lg bg-background border border-muted/30 text-[12px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {showSliceTracker ? (
            <div className="flex gap-1.5 flex-wrap">
              {(['protein', 'carb', 'veg', 'fruit', 'fat'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCustomSliceType(cat)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase transition-all",
                    customSliceType === cat
                      ? "bg-primary text-white"
                      : "bg-muted/20 text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="custom-food-carbs" className="text-xs font-bold text-muted-foreground/60 uppercase mb-0.5 block">Carbs (g)</label>
                <input id="custom-food-carbs"
                  type="number"
                  value={customCarbs}
                  onChange={(e) => setCustomCarbs(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-muted/30 text-[12px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="custom-food-protein" className="text-xs font-bold text-muted-foreground/60 uppercase mb-0.5 block">Protein (g)</label>
                <input id="custom-food-protein"
                  type="number"
                  value={customProtein}
                  onChange={(e) => setCustomProtein(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-muted/30 text-[12px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>
          )}
          <button
            onClick={handleCustomAdd}
            className="w-full py-2.5 rounded-xl bg-primary text-white text-[12px] font-bold active:scale-[0.98] transition-all"
          >
            Add Custom Food
          </button>
        </div>
      )}

      {/* ── Bottom Action Bar ── */}
      <div className="shrink-0 border-t border-muted/20 bg-background px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-around bg-muted/10 rounded-2xl py-2.5 px-2">
          <button
            onClick={() => { handleOpenCamera(); hapticTap(); }}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl active:scale-95 active:bg-muted/20 transition-all"
          >
            <Camera className="w-5 h-5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Photo</span>
          </button>
          <button
            onClick={() => { setShowVoice(true); hapticTap(); }}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl active:scale-95 active:bg-muted/20 transition-all"
          >
            <Mic className="w-5 h-5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Voice</span>
          </button>
          <button
            onClick={() => { setShowCustomEntry(!showCustomEntry); hapticTap(); }}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl active:scale-95 transition-all",
              showCustomEntry ? "bg-primary/15" : "active:bg-muted/20"
            )}
          >
            <Pencil className={cn("w-5 h-5", showCustomEntry ? "text-primary" : "text-muted-foreground")} />
            <span className={cn("text-xs font-medium", showCustomEntry ? "text-primary" : "text-muted-foreground")}>Custom</span>
          </button>
          <button
            onClick={() => { setShowBarcode(true); hapticTap(); }}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl active:scale-95 active:bg-muted/20 transition-all"
          >
            <ScanBarcode className="w-5 h-5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Scan</span>
          </button>
        </div>
      </div>

      {/* ── Overlays (portaled to body to escape Sheet z-index) ── */}
      {showBarcode && createPortal(
        <div className="fixed inset-0 z-[200] pointer-events-auto" style={{ isolation: 'isolate' }}>
          <BarcodeScanner
            open={showBarcode}
            onClose={() => setShowBarcode(false)}
            onScan={handleBarcodeScan}
          />
        </div>,
        document.body
      )}

      {showPhotoCamera && createPortal(
        <div className="fixed inset-0 z-[200] pointer-events-auto" style={{ isolation: 'isolate' }}>
          <FoodPhotoCamera
            open={showPhotoCamera}
            onClose={() => setShowPhotoCamera(false)}
            onCapture={handlePhotoCapture}
          />
        </div>,
        document.body
      )}

      {showPhotoReview && photoImage && createPortal(
        <div className="fixed inset-0 z-[200] pointer-events-auto" style={{ isolation: 'isolate' }}>
          <FoodPhotoReview
            open={showPhotoReview}
            imageDataUrl={photoImage}
            onClose={() => { setShowPhotoReview(false); setPhotoImage(null); }}
            onLogFoods={handlePhotoLogFoods}
            mode={mode}
            isV2={isV2}
            blockedCategories={blockedCategories}
          />
        </div>,
        document.body
      )}

      {showVoice && (
        <div className="fixed inset-0 z-[200] bg-background" style={{ isolation: 'isolate' }}>
          <VoiceFoodLogger
            onFoodsReady={handleVoiceFoods}
            onClose={() => setShowVoice(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── FatSecret Food Row ───
function FSFoodRow({ food, isExpanded, selectedServing, isFav, flashed, onToggle, onServingChange, onAdd, onToggleFav }: {
  food: FatSecretFood;
  isExpanded: boolean;
  selectedServing: FatSecretServing | null;
  isFav: boolean;
  flashed: boolean | undefined;
  onToggle: () => void;
  onServingChange: (s: FatSecretServing) => void;
  onAdd: (qty: number) => void;
  onToggleFav: () => void;
}) {
  const [qty, setQty] = useState(1);
  const activeServing = isExpanded && selectedServing ? selectedServing : (food.servings.find(s => s.isDefault) || food.servings[0]);

  // Reset qty when collapsing or changing food
  useEffect(() => { if (!isExpanded) setQty(1); }, [isExpanded]);

  const totalCal = activeServing ? Math.round(activeServing.calories * qty) : 0;
  const totalCarbs = activeServing ? Math.round(activeServing.carbs * qty) : 0;
  const totalProtein = activeServing ? Math.round(activeServing.protein * qty) : 0;
  const totalFat = activeServing ? Math.round(activeServing.fat * qty) : 0;

  return (
    <div className={cn(
      "rounded-lg transition-all overflow-hidden",
      isExpanded ? "border border-primary/30 bg-primary/5" : "border border-transparent hover:bg-muted/10",
      flashed && "bg-green-500/10 border-green-500/30"
    )}>
      {/* Name row */}
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-1.5 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate">{formatUSDAName(food.name)}</p>
          <p className="text-xs text-muted-foreground/60 truncate">
            {food.brand && <span>{food.brand} · </span>}
            {activeServing ? (
              <>
                <span className="text-muted-foreground/80">{activeServing.description}</span>
                {' · '}
                {Math.round(activeServing.calories)} cal
                {activeServing.carbs > 0 && ` · ${Math.round(activeServing.carbs)}C`}
                {activeServing.protein > 0 && ` ${Math.round(activeServing.protein)}P`}
              </>
            ) : `${food.calories} cal`}
          </p>
        </div>
        <button
          aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
          onClick={(e) => { e.stopPropagation(); onToggleFav(); hapticTap(); }}
          className="p-1 shrink-0 relative after:absolute after:-inset-3"
        >
          <Star className={cn("w-3.5 h-3.5", isFav ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/30")} aria-hidden="true" />
        </button>
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />}
      </button>

      {/* Expanded: serving selection + quantity + add */}
      {isExpanded && selectedServing && (
        <div className="px-3 pb-3 space-y-2 border-t border-muted/20 pt-2">
          {/* Serving selector + quantity row */}
          <div className="flex items-center gap-2">
            {food.servings.length > 1 ? (
              <select aria-label="Serving size"
                value={selectedServing.id}
                onChange={(e) => {
                  const s = food.servings.find(sv => sv.id === e.target.value);
                  if (s) onServingChange(s);
                }}
                className="flex-1 py-2 px-3 rounded-lg bg-muted/20 border border-muted/30 text-[12px] font-medium min-w-0"
              >
                {food.servings.map(s => (
                  <option key={s.id} value={s.id}>{s.description}</option>
                ))}
              </select>
            ) : (
              <span className="flex-1 text-[12px] font-medium text-muted-foreground truncate">{selectedServing.description}</span>
            )}

            {/* Quantity stepper */}
            <div className="flex items-center gap-0 shrink-0 border border-muted/30 rounded-lg overflow-hidden">
              <button
                aria-label="Decrease servings"
                onClick={(e) => { e.stopPropagation(); setQty(q => Math.max(0.5, q - (q <= 1 ? 0.5 : 1))); hapticTap(); }}
                className="w-8 h-8 flex items-center justify-center text-sm font-bold text-muted-foreground hover:bg-muted/20 active:bg-muted/30"
              >
                −
              </button>
              <span className="w-8 text-center text-[13px] font-bold tabular-nums">{qty % 1 === 0 ? qty : qty.toFixed(1)}</span>
              <button
                aria-label="Increase servings"
                onClick={(e) => { e.stopPropagation(); setQty(q => q + (q < 1 ? 0.5 : 1)); hapticTap(); }}
                className="w-8 h-8 flex items-center justify-center text-sm font-bold text-muted-foreground hover:bg-muted/20 active:bg-muted/30"
              >
                +
              </button>
            </div>
          </div>

          {/* Macro breakdown (multiplied by qty) */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-muted-foreground">{totalCal} cal</span>
            <span className="text-amber-500">{totalCarbs}g C</span>
            <span className="text-orange-500">{totalProtein}g P</span>
            <span className="text-muted-foreground/60">{totalFat}g F</span>
          </div>

          {/* Add button */}
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(qty); }}
            className="w-full py-2.5 rounded-xl bg-primary text-white text-[12px] font-bold active:scale-[0.98] transition-all"
          >
            Add{qty !== 1 ? ` ${qty % 1 === 0 ? qty : qty.toFixed(1)} ×` : ''} {formatUSDAName(food.name)}
          </button>
        </div>
      )}
    </div>
  );
}

