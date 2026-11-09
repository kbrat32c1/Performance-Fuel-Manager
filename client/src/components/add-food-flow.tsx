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
import { amountBaseServing, amountUnits, foodPrep, foodSourceLabel, prepTag, searchFoodName, searchFoodPortion, servingsFromAmount, sliceCountText, sliceNotCountedText, sortCookedFirst, typedAmountLabel, type AmountUnit } from "@/lib/food-search-display";
import { barcodeMultiplier, barcodeServingLabel, barcodeUnit, buildFoodEntry, calorieText, classifyFood, isListed, type FoodToLog, nextTotals } from "@/lib/food-totals";

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
  const showsDetailed = !isSparMode;

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
  const [customCalories, setCustomCalories] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [customFiber, setCustomFiber] = useState('');
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
  // Each entry carries its own grams, portions and calories; the day's totals are rebuilt from the log.
  const logFoodEntry = useCallback((food: FoodToLog) => {
    const foodLog = [...(tracking.foodLog || []), buildFoodEntry(food, { mealSection: activeMeal, nowMs: Date.now() })];
    const updates: Record<string, any> = { ...nextTotals(tracking, foodLog), foodLog };
    if (showSliceTracker) updates.nutritionMode = 'spar';
    if (food.liquidOz && food.liquidOz > 0) {
      updates.waterConsumed = tracking.waterConsumed + food.liquidOz;
    }

    updateDailyTracking(dateKey, updates);
    syncLocalStorage(foodLog);
    hapticSuccess();

    // Flash feedback
    setFlashedFood(food.name);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setFlashedFood(null), 1200);
  }, [showSliceTracker, tracking, dateKey, activeMeal, updateDailyTracking, syncLocalStorage]);

  // ─── FatSecret food add ───
  const handleFSAdd = useCallback((food: FatSecretFood, serving: FatSecretServing, qty: number = 1, amountLabel?: string) => {
    const { carbs, protein, fat, sliceType, sliceCount } = searchFoodPortion(serving, food.sparCategory, qty, amountLabel != null);
    const qtyLabel = qty !== 1 ? ` ×${qty % 1 === 0 ? qty : qty.toFixed(1)}` : '';
    const foodName = searchFoodName(formatUSDAName(food.name), food.brand, amountLabel ?? `${serving.description}${qtyLabel}`);

    logFoodEntry({
      name: foodName,
      carbs,
      protein,
      sliceType,
      sliceCount,
      // A value the database doesn't list stays blank; known values are kept either way.
      ...(isListed(serving.calories, serving.reported?.calories) ? { calories: Math.round((serving.calories || 0) * qty) } : {}),
      ...(isListed(serving.fat, serving.reported?.fat) ? { fat } : {}),
      fiber: Math.round((serving.fiber || 0) * qty * 10) / 10,
      nutrientSource: 'database',
      servings: qty,
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
    const perServing = selectedOFF.nutrientBasis === 'serving';
    const multiplier = barcodeMultiplier(selectedOFF.nutrientBasis, offServingGrams);
    const carbs = Math.round(selectedOFF.carbs * multiplier);
    const protein = Math.round(selectedOFF.protein * multiplier);
    const brandLabel = selectedOFF.brand ? ` (${selectedOFF.brand})` : '';
    const servingLabel = barcodeServingLabel(selectedOFF, offServingGrams);
    const foodName = `${selectedOFF.name}${brandLabel} — ${servingLabel}`;

    const fat = Math.round((selectedOFF.fat || 0) * multiplier);
    const { sliceType, sliceCount } = classifyFood({ carbs, protein, fat });

    // Barcode data is crowd-sourced and the serving is a guess, so it is never treated as exact.
    // A value the product doesn't list stays blank rather than becoming zero.
    const caloriesListed = isListed(selectedOFF.calories, selectedOFF.reported?.calories);
    const fatListed = isListed(selectedOFF.fat, selectedOFF.reported?.fat);
    logFoodEntry({
      name: foodName,
      carbs,
      protein,
      sliceType,
      sliceCount,
      ...(caloriesListed ? { calories: Math.round(selectedOFF.calories * multiplier) } : {}),
      ...(fatListed ? { fat } : {}),
      fiber: Math.round((selectedOFF.fiber || 0) * multiplier * 10) / 10,
      nutrientSource: 'estimate',
      ...(perServing ? { servings: multiplier } : {}),
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

    validFoods.forEach((food, index) => {
      const carbs = Math.round(food.carbs || 0);
      const protein = Math.round(food.protein || 0);
      const fat = Math.round(food.fat || 0);
      // Same portion rule as search and barcode: grams decide protein/carb portions.
      const { sliceType, sliceCount } = classifyFood({ carbs, protein, fat }, food.sparCategory || null, food.sliceCount ?? 1);
      // Photo and voice amounts are estimates. An unrecognized food has no numbers at all.
      const hasNumbers = food.calories > 0 || carbs > 0 || protein > 0 || fat > 0;
      newEntries.push(buildFoodEntry({
        name: food.name,
        carbs,
        protein,
        sliceType,
        sliceCount,
        ...(food.calories > 0 ? { calories: Math.round(food.calories) } : {}),
        ...(hasNumbers ? {
          ...(food.fatUnknown ? {} : { fat }),
          fiber: Math.round((food.fiber || 0) * 10) / 10,
          nutrientSource: 'estimate' as const,
        } : {}),
      }, { mealSection: activeMeal, nowMs: now, index }));
    });

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
    if (showsDetailed) {
      const calories = parseFloat(customCalories);
      const hasCalories = customCalories.trim() !== '' && calories >= 0;
      if (!hasCalories && carbs === 0 && protein === 0) {
        toast({ title: "Enter calories, carbs or protein", variant: "destructive" });
        return;
      }
      logFoodEntry({
        name,
        carbs,
        protein,
        ...(hasCalories ? { calories: Math.round(calories) } : {}),
        ...(customFat.trim() !== '' ? { fat: parseFloat(customFat) || 0 } : {}),
        ...(customFiber.trim() !== '' ? { fiber: parseFloat(customFiber) || 0 } : {}),
        nutrientSource: 'entered',
        servings: 1,
      });
    } else {
      logFoodEntry({
        name,
        carbs,
        protein,
        sliceType: customSliceType,
        sliceCount: 1,
        // A quick portion has no checked calorie value, so it stays out of calorie totals.
        nutrientSource: 'portion',
      });
    }
    // Reset form
    setCustomName('');
    setCustomCarbs('');
    setCustomProtein('');
    setCustomCalories('');
    setCustomFat('');
    setCustomFiber('');
    setShowCustomEntry(false);
  }, [customName, customCarbs, customProtein, customCalories, customFat, customFiber, customSliceType, showsDetailed, logFoodEntry, toast]);

  // ─── Favorites list ───
  const favoriteNames = useMemo(() => getFavoriteNames(), [getFavoriteNames]);

  // Active search state
  const isSearching = query.trim().length >= 3;
  const orderedResults = useMemo(() => sortCookedFirst(fsResults, query), [fsResults, query]);
  const hasResults = fsResults.length > 0;
  const isLoading = fsLoading;

  return (
    <div className="flex flex-col h-full" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
      {/* ── Header: Close + Meal Selector ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-muted/20 shrink-0">
        <button aria-label="Close" onClick={onClose} className="w-11 h-11 rounded-full relative bg-muted/30 flex items-center justify-center hover:bg-muted/50">
          <X className="w-5 h-5" aria-hidden="true" />
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
              const m = barcodeMultiplier(selectedOFF.nutrientBasis, offServingGrams);
              const cal = Math.round(selectedOFF.calories * m);
              const c = Math.round(selectedOFF.carbs * m);
              const p = Math.round(selectedOFF.protein * m);
              const f = Math.round(selectedOFF.fat * m);
              return (
                <div className="flex items-center gap-3 text-xs font-mono font-bold">
                  <span className="text-muted-foreground">{calorieText(cal, selectedOFF.reported?.calories)}</span>
                  <span className="text-amber-500">{c}g C</span>
                  <span className="text-orange-500">{p}g P</span>
                  <span className="text-yellow-600">{isListed(selectedOFF.fat, selectedOFF.reported?.fat) ? `${f}g F` : 'Fat not listed'}</span>
                </div>
              );
            })()}

            {/* Serving size input */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground/60 shrink-0">Serving:</span>
              <input aria-label={selectedOFF.nutrientBasis === 'serving' ? "Number of servings" : `Serving size in ${barcodeUnit(selectedOFF.nutrientBasis)}`}
                type="number"
                value={offServingGrams}
                onChange={(e) => setOffServingGrams(e.target.value)}
                className="w-16 h-7 text-[12px] font-mono font-bold text-center bg-background border border-muted/30 rounded px-1"
              />
              <span className="text-xs text-muted-foreground/60">{barcodeUnit(selectedOFF.nutrientBasis)}</span>
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
            {orderedResults.length > 0 && (
              <div className="divide-y divide-muted/15">
                <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wide pb-1">Database Results</p>
                {orderedResults.slice(0, 20).map(food => (
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
                    showSlices={isSparMode}
                    onServingChange={setSelectedFSServing}
                    onAdd={(qty, amount) => {
                      const serving = amount?.base ?? selectedFSServing;
                      if (serving) handleFSAdd(food, serving, qty, amount?.label);
                    }}
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
            <>
            {showsDetailed && (
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'custom-food-calories', label: 'Calories', value: customCalories, set: setCustomCalories },
                  { id: 'custom-food-fat', label: 'Fat (g)', value: customFat, set: setCustomFat },
                  { id: 'custom-food-fiber', label: 'Fiber (g)', value: customFiber, set: setCustomFiber },
                ]).map(field => (
                  <div key={field.id}>
                    <label htmlFor={field.id} className="text-xs font-bold text-muted-foreground uppercase mb-0.5 block">{field.label}</label>
                    <input id={field.id}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={field.value}
                      onChange={(e) => field.set(e.target.value)}
                      className="w-full min-h-11 px-3 py-2 rounded-lg bg-background border border-muted/30 text-[12px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>
            )}
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
            </>
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
const ENTER_AMOUNT = "__enter_amount";

function FSFoodRow({ food, isExpanded, selectedServing, isFav, flashed, showSlices, onToggle, onServingChange, onAdd, onToggleFav }: {
  food: FatSecretFood;
  isExpanded: boolean;
  selectedServing: FatSecretServing | null;
  isFav: boolean;
  flashed: boolean | undefined;
  onToggle: () => void;
  onServingChange: (s: FatSecretServing) => void;
  showSlices: boolean;
  onAdd: (qty: number, amount?: { base: FatSecretServing; label: string }) => void;
  onToggleFav: () => void;
}) {
  const [qty, setQty] = useState(1);
  const activeServing = isExpanded && selectedServing ? selectedServing : (food.servings.find(s => s.isDefault) || food.servings[0]);

  const [amountMode, setAmountMode] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [amountUnit, setAmountUnit] = useState<AmountUnit>('g');

  // Reset the amount when collapsing or changing food
  useEffect(() => { if (!isExpanded) { setQty(1); setAmountMode(false); setAmountText(''); } }, [isExpanded]);

  const amountBase = selectedServing ? amountBaseServing(selectedServing, food.servings) : null;
  const units = amountBase ? amountUnits(amountBase) : [];
  const typedServings = amountMode && amountBase ? servingsFromAmount(amountText, amountUnit, amountBase) : null;
  // A typed amount is measured against its own serving, which can differ from the one picked.
  const portionServing = amountMode && amountBase ? amountBase : activeServing;
  const portionQty = amountMode ? (typedServings ?? 0) : qty;

  const startAmount = () => {
    if (!amountBase) return;
    setAmountMode(true);
    setAmountUnit(units[0]);
    setAmountText(String(amountBase.metricAmount));
  };

  const totalCal = portionServing ? Math.round(portionServing.calories * portionQty) : 0;
  const totalCarbs = portionServing ? Math.round(portionServing.carbs * portionQty) : 0;
  const totalProtein = portionServing ? Math.round(portionServing.protein * portionQty) : 0;
  const totalFat = portionServing ? Math.round(portionServing.fat * portionQty) : 0;
  const portion = portionServing && portionQty > 0 ? searchFoodPortion(portionServing, food.sparCategory, portionQty, amountMode) : null;
  const prep = portionServing ? prepTag(foodPrep(food.name, portionServing.description), food.name, portionServing.description) : null;
  const source = foodSourceLabel(food.type);
  const amountReady = !amountMode || typedServings != null;
  const typedLabel = amountMode && amountBase && typedServings != null
    ? typedAmountLabel(amountText, amountUnit, food.name, amountBase.description)
    : null;

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
            {prep && !amountMode && <span className="font-semibold text-muted-foreground">{prep} · </span>}
            {food.brand && <span>{food.brand} · </span>}
            {amountMode ? (
              typedLabel && portionServing ? (
                <>
                  <span className="text-muted-foreground/80">{typedLabel}</span>
                  {' · '}
                  {calorieText(totalCal, portionServing.reported?.calories)}
                  {` · ${totalCarbs}C ${totalProtein}P`}
                  {isListed(portionServing.fat, portionServing.reported?.fat) && ` ${totalFat}F`}
                </>
              ) : 'Enter an amount'
            ) : activeServing ? (
              <>
                <span className="text-muted-foreground/80">{activeServing.description}</span>
                {' · '}
                {calorieText(activeServing.calories, activeServing.reported?.calories)}
                {activeServing.carbs > 0 && ` · ${Math.round(activeServing.carbs)}C`}
                {activeServing.protein > 0 && ` ${Math.round(activeServing.protein)}P`}
                {isListed(activeServing.fat, activeServing.reported?.fat) && ` ${Math.round(activeServing.fat)}F`}
              </>
            ) : calorieText(food.calories, undefined)}
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
          <div className="flex flex-wrap items-center gap-2">
            {food.servings.length > 1 || amountBase ? (
              <select aria-label="Serving size"
                value={amountMode ? ENTER_AMOUNT : selectedServing.id}
                onChange={(e) => {
                  if (e.target.value === ENTER_AMOUNT) { startAmount(); return; }
                  setAmountMode(false);
                  const s = food.servings.find(sv => sv.id === e.target.value);
                  if (s) onServingChange(s);
                }}
                className={cn("flex-1 py-2 px-3 rounded-lg bg-muted/20 border border-muted/30 text-[12px] font-medium min-w-0", amountMode && "basis-full")}
              >
                {food.servings.map(s => (
                  <option key={s.id} value={s.id}>{s.description}</option>
                ))}
                {amountBase && <option value={ENTER_AMOUNT}>Enter amount</option>}
              </select>
            ) : (
              <span className="flex-1 text-[12px] font-medium text-muted-foreground truncate">{selectedServing.description}</span>
            )}

            {/* Typed amount, or quantity stepper */}
            {amountMode && amountBase ? (
              <div className="flex w-full items-center gap-2">
                <label htmlFor={`amount-${food.id}`} className="text-xs text-muted-foreground">Amount</label>
                <input id={`amount-${food.id}`}
                  type="number" inputMode="decimal" min="0"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-20 h-11 rounded-lg border border-muted/30 bg-transparent text-center text-[13px] font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {units.length > 1 ? (
                  <>
                    <label htmlFor={`unit-${food.id}`} className="text-xs text-muted-foreground">Unit</label>
                    <select id={`unit-${food.id}`}
                      value={amountUnit}
                      onChange={(e) => setAmountUnit(e.target.value as AmountUnit)}
                      className="h-11 rounded-lg border border-muted/30 bg-muted/20 px-2 text-[12px] font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {units.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </>
                ) : <span className="text-[12px] font-medium text-muted-foreground">{units[0]}</span>}
              </div>
            ) : (
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
            )}
          </div>

          {/* Macro breakdown (multiplied by qty) */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-muted-foreground">{portionServing ? calorieText(totalCal, portionServing.reported?.calories) : ''}</span>
            <span className="text-amber-500">{totalCarbs}g C</span>
            <span className="text-orange-500">{totalProtein}g P</span>
            <span className="text-muted-foreground/60">{portionServing && isListed(portionServing.fat, portionServing.reported?.fat) ? `${totalFat}g F` : 'Fat not listed'}</span>
          </div>

          {amountMode && !typedLabel && <p role="alert" className="text-xs text-muted-foreground">Enter an amount above 0.</p>}
          {amountMode && amountBase && amountBase !== selectedServing && (
            <p className="text-xs text-muted-foreground">Measured as: {amountBase.description}</p>
          )}
          {showSlices && portion && (
            <p className="text-xs font-semibold">{portion.sliceCountKnown ? sliceCountText(portion.sliceType, portion.sliceCount) : sliceNotCountedText(portion.sliceType)}</p>
          )}
          {source && <p className="text-xs text-muted-foreground/60">Source: {source}</p>}

          {/* Add button */}
          <button
            disabled={!amountReady}
            onClick={(e) => {
              e.stopPropagation();
              if (amountMode && amountBase && typedServings != null && typedLabel) {
                onAdd(typedServings, { base: amountBase, label: typedLabel });
              } else {
                onAdd(qty);
              }
            }}
            className="w-full py-2.5 rounded-xl bg-primary text-white text-[12px] font-bold active:scale-[0.98] transition-all disabled:opacity-50"
          >
            Add{typedLabel ? ` ${typedLabel}` : !amountMode && qty !== 1 ? ` ${qty % 1 === 0 ? qty : qty.toFixed(1)} ×` : ''} {formatUSDAName(food.name)}
          </button>
        </div>
      )}
    </div>
  );
}

