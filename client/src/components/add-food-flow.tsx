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

type FlowTab = 'recent' | 'favorites';

interface AddFoodFlowProps {
  mealSection: MealSection;
  mode: 'spar' | 'sugar';
  isV2?: boolean;
  blockedCategories?: string[];
  onClose: () => void;
  /** If omitted, component manages its own meal selector */
  hideMealSelector?: boolean;
}

const MEAL_OPTIONS: { id: MealSection; label: string; emoji: string }[] = [
  { id: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { id: 'lunch', label: 'Lunch', emoji: '☀️' },
  { id: 'dinner', label: 'Dinner', emoji: '🌙' },
  { id: 'snacks', label: 'Snacks', emoji: '🍿' },
];

export function AddFoodFlow({ mealSection: initialMeal, mode, isV2, blockedCategories, onClose, hideMealSelector }: AddFoodFlowProps) {
  const {
    profile, getDailyTracking, updateDailyTracking,
    getMacroTargets, getSliceTargets, getNutritionMode,
  } = useStore();
  const { toast } = useToast();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);
  const macros = getMacroTargets();
  const nutritionMode = getNutritionMode();
  const isSparMode = nutritionMode === 'spar';
  const isSparProtocol = profile.protocol === '5' || profile.protocol === '6';
  const showSliceTracker = isSparMode;
  const sliceTargets = showSliceTracker ? getSliceTargets() : null;

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
  const logFoodEntry = useCallback((
    name: string,
    carbs: number,
    protein: number,
    opts?: { liquidOz?: number; category?: string; sliceType?: 'protein' | 'carb' | 'veg' | 'fruit' | 'fat'; sliceCount?: number; gramAmount?: number }
  ) => {
    const updates: Record<string, any> = {};

    if (showSliceTracker) {
      // Determine slice type
      const cat = opts?.sliceType || (protein > 0 && carbs === 0 ? 'protein' : 'carb');
      const sliceCount = opts?.sliceCount || 1;
      const sliceKey = cat === 'protein' ? 'proteinSlices'
        : cat === 'carb' ? 'carbSlices'
        : cat === 'veg' ? 'vegSlices'
        : cat === 'fruit' ? 'fruitSlices'
        : 'fatSlices';
      const currentSlices = cat === 'protein' ? tracking.proteinSlices
        : cat === 'carb' ? tracking.carbSlices
        : cat === 'veg' ? tracking.vegSlices
        : cat === 'fruit' ? (tracking.fruitSlices || 0)
        : (tracking.fatSlices || 0);
      updates[sliceKey] = currentSlices + sliceCount;

      // Cross-sync grams
      if (carbs > 0) updates.carbsConsumed = tracking.carbsConsumed + carbs;
      if (protein > 0) updates.proteinConsumed = tracking.proteinConsumed + protein;
      updates.nutritionMode = 'spar';

      // Build food log entry
      const entry: StoreFoodLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        timestamp: new Date().toISOString(),
        mode: 'spar',
        mealSection: activeMeal,
        sliceType: cat,
        sliceCount,
        gramAmount: opts?.gramAmount || (protein > 0 && carbs === 0 ? protein : carbs),
        ...(opts?.liquidOz ? { liquidOz: opts.liquidOz } : {}),
      };
      const existingLog = tracking.foodLog || [];
      updates.foodLog = [...existingLog, entry];
    } else {
      // Sugar/gram mode
      if (carbs > 0) {
        updates.carbsConsumed = tracking.carbsConsumed + carbs;
        updates.carbSlices = tracking.carbSlices + Math.max(1, Math.round(carbs / 26));
      }
      if (protein > 0) {
        updates.proteinConsumed = tracking.proteinConsumed + protein;
        updates.proteinSlices = tracking.proteinSlices + Math.max(1, Math.round(protein / 25));
      }

      const existingLog = tracking.foodLog || [];
      const entries: StoreFoodLogEntry[] = [];

      if (carbs > 0) {
        entries.push({
          id: `${Date.now()}-c-${Math.random().toString(36).substr(2, 9)}`,
          name,
          timestamp: new Date().toISOString(),
          mode: 'sugar',
          mealSection: activeMeal,
          macroType: 'carbs',
          amount: carbs,
          gramAmount: carbs,
          category: opts?.category || 'custom',
          ...(opts?.liquidOz ? { liquidOz: opts.liquidOz } : {}),
        });
      }
      if (protein > 0) {
        entries.push({
          id: `${Date.now()}-p-${Math.random().toString(36).substr(2, 9)}`,
          name,
          timestamp: new Date(Date.now() + 1).toISOString(),
          mode: 'sugar',
          mealSection: activeMeal,
          macroType: 'protein',
          amount: protein,
          gramAmount: protein,
          category: opts?.category || 'custom',
        });
      }
      updates.foodLog = [...existingLog, ...entries];
    }

    if (opts?.liquidOz && opts.liquidOz > 0) {
      updates.waterConsumed = tracking.waterConsumed + opts.liquidOz;
    }

    updateDailyTracking(dateKey, updates);
    syncLocalStorage(updates.foodLog);
    hapticSuccess();

    // Flash feedback
    setFlashedFood(name);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setFlashedFood(null), 1200);
  }, [showSliceTracker, tracking, dateKey, activeMeal, updateDailyTracking, syncLocalStorage]);

  // ─── FatSecret food add ───
  const handleFSAdd = useCallback((food: FatSecretFood, serving: FatSecretServing) => {
    const carbs = Math.round(serving.carbs);
    const protein = Math.round(serving.protein);
    const brandLabel = food.brand ? ` (${food.brand})` : '';
    const foodName = `${formatUSDAName(food.name)}${brandLabel} — ${serving.description}`;

    logFoodEntry(foodName, carbs, protein, {
      category: 'fatsecret',
      sliceType: food.sparCategory as any || (protein > carbs ? 'protein' : 'carb'),
    });
    addToRecents(food, serving);
    setSelectedFS(null);
    setSelectedFSServing(null);
    const mealLabel = MEAL_OPTIONS.find(m => m.id === activeMeal)?.label || activeMeal;
    toast({ title: `✓ Added to ${mealLabel}`, description: formatUSDAName(food.name) });
  }, [logFoodEntry, addToRecents, setSelectedFS, setSelectedFSServing, toast, activeMeal]);

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
  }, [barcodeLookup, toast]);

  // ─── Batch log multiple foods in a single update (avoids stale closure) ───
  const batchLogFoods = useCallback((foods: PhotoFood[], source: string) => {
    if (!foods || foods.length === 0) {
      toast({ title: "No foods identified", description: "Try again with more detail.", variant: "destructive" });
      return;
    }

    const validFoods = foods.filter(f => f.name);
    if (validFoods.length === 0) return;

    const updates: Record<string, any> = {};
    const existingLog = tracking.foodLog || [];
    const newEntries: StoreFoodLogEntry[] = [];

    // Accumulate totals across ALL foods before writing
    let addCarbSlices = 0;
    let addProteinSlices = 0;
    let addVegSlices = 0;
    let addFruitSlices = 0;
    let addFatSlices = 0;
    let addCarbs = 0;
    let addProtein = 0;

    for (const food of validFoods) {
      const carbs = Math.round(food.carbs || 0);
      const protein = Math.round(food.protein || 0);
      const sliceCount = food.sliceCount || 1;
      const cat = food.sparCategory || (protein > 0 && carbs === 0 ? 'protein' : 'carb');

      if (showSliceTracker) {
        // Accumulate slice counts
        if (cat === 'protein') addProteinSlices += sliceCount;
        else if (cat === 'carb') addCarbSlices += sliceCount;
        else if (cat === 'veg') addVegSlices += sliceCount;
        else if (cat === 'fruit') addFruitSlices += sliceCount;
        else if (cat === 'fat') addFatSlices += sliceCount;

        if (carbs > 0) addCarbs += carbs;
        if (protein > 0) addProtein += protein;

        newEntries.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: food.name,
          timestamp: new Date(Date.now() + newEntries.length).toISOString(),
          mode: 'spar',
          mealSection: activeMeal,
          sliceType: cat,
          sliceCount,
          gramAmount: protein > 0 && carbs === 0 ? protein : carbs,
        });
      } else {
        // Grams mode
        if (carbs > 0) addCarbs += carbs;
        if (protein > 0) addProtein += protein;

        if (carbs > 0) {
          addCarbSlices += Math.max(1, Math.round(carbs / 26));
          newEntries.push({
            id: `${Date.now()}-c-${Math.random().toString(36).substr(2, 9)}`,
            name: food.name,
            timestamp: new Date(Date.now() + newEntries.length).toISOString(),
            mode: 'sugar',
            mealSection: activeMeal,
            macroType: 'carbs',
            amount: carbs,
            gramAmount: carbs,
            category: 'voice',
          });
        }
        if (protein > 0) {
          addProteinSlices += Math.max(1, Math.round(protein / 25));
          newEntries.push({
            id: `${Date.now()}-p-${Math.random().toString(36).substr(2, 9)}`,
            name: food.name,
            timestamp: new Date(Date.now() + newEntries.length + 1).toISOString(),
            mode: 'sugar',
            mealSection: activeMeal,
            macroType: 'protein',
            amount: protein,
            gramAmount: protein,
            category: 'voice',
          });
        }
      }
    }

    // Apply all accumulated changes in ONE update
    if (showSliceTracker) {
      if (addProteinSlices > 0) updates.proteinSlices = tracking.proteinSlices + addProteinSlices;
      if (addCarbSlices > 0) updates.carbSlices = tracking.carbSlices + addCarbSlices;
      if (addVegSlices > 0) updates.vegSlices = tracking.vegSlices + addVegSlices;
      if (addFruitSlices > 0) updates.fruitSlices = (tracking.fruitSlices || 0) + addFruitSlices;
      if (addFatSlices > 0) updates.fatSlices = (tracking.fatSlices || 0) + addFatSlices;
      if (addCarbs > 0) updates.carbsConsumed = tracking.carbsConsumed + addCarbs;
      if (addProtein > 0) updates.proteinConsumed = tracking.proteinConsumed + addProtein;
      updates.nutritionMode = 'spar';
    } else {
      if (addCarbs > 0) {
        updates.carbsConsumed = tracking.carbsConsumed + addCarbs;
        updates.carbSlices = tracking.carbSlices + addCarbSlices;
      }
      if (addProtein > 0) {
        updates.proteinConsumed = tracking.proteinConsumed + addProtein;
        updates.proteinSlices = tracking.proteinSlices + addProteinSlices;
      }
    }

    updates.foodLog = [...existingLog, ...newEntries];
    updateDailyTracking(dateKey, updates);
    syncLocalStorage(updates.foodLog);
    hapticSuccess();

    const mealLabel = MEAL_OPTIONS.find(m => m.id === activeMeal)?.label || activeMeal;
    toast({ title: `✓ Logged ${validFoods.length} food${validFoods.length > 1 ? 's' : ''} to ${mealLabel}`, description: `Via ${source}` });
  }, [showSliceTracker, tracking, dateKey, activeMeal, updateDailyTracking, syncLocalStorage, toast]);

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
    const mealLabel = MEAL_OPTIONS.find(m => m.id === activeMeal)?.label || activeMeal;
    toast({ title: `✓ Added to ${mealLabel}`, description: name });
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
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center hover:bg-muted/50">
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {!hideMealSelector ? (
            <div className="relative" ref={mealDropdownRef}>
              <button
                onClick={() => setShowMealDropdown(!showMealDropdown)}
                className="flex items-center gap-1.5 text-sm font-bold"
              >
                <span>{MEAL_OPTIONS.find(m => m.id === activeMeal)?.emoji}</span>
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
                      <span>{meal.emoji}</span>
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
      <div className="px-4 py-3 space-y-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods..."
            className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-muted/20 border border-muted/30 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {query && (
            <button
              onClick={() => clearResults()}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center"
            >
              <X className="w-3 h-3" />
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
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">

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

        {/* ── Search Results ── */}
        {isSearching && !isLoading && (
          <>
            {/* Database results */}
            {fsResults.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wide">Database Results</p>
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
                    onAdd={() => selectedFSServing && handleFSAdd(food, selectedFSServing)}
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
                  className="mt-3 text-[11px] font-bold text-primary hover:underline"
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
                      <p className="text-[10px] text-muted-foreground/60 truncate">
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
                  <span className="text-[10px] text-muted-foreground/50">Search to add</span>
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
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Custom Food</span>
            <button onClick={() => { setShowCustomEntry(false); hapticTap(); }} className="p-1 rounded-lg hover:bg-muted/20">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <input
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
                    "px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
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
                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase mb-0.5 block">Carbs (g)</label>
                <input
                  type="number"
                  value={customCarbs}
                  onChange={(e) => setCustomCarbs(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-muted/30 text-[12px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase mb-0.5 block">Protein (g)</label>
                <input
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
            <span className="text-[10px] font-medium text-muted-foreground">Photo</span>
          </button>
          <button
            onClick={() => { setShowVoice(true); hapticTap(); }}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl active:scale-95 active:bg-muted/20 transition-all"
          >
            <Mic className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Voice</span>
          </button>
          <button
            onClick={() => { setShowCustomEntry(!showCustomEntry); hapticTap(); }}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl active:scale-95 transition-all",
              showCustomEntry ? "bg-primary/15" : "active:bg-muted/20"
            )}
          >
            <Pencil className={cn("w-5 h-5", showCustomEntry ? "text-primary" : "text-muted-foreground")} />
            <span className={cn("text-[10px] font-medium", showCustomEntry ? "text-primary" : "text-muted-foreground")}>Custom</span>
          </button>
          <button
            onClick={() => { setShowBarcode(true); hapticTap(); }}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl active:scale-95 active:bg-muted/20 transition-all"
          >
            <ScanBarcode className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Scan</span>
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
  onAdd: () => void;
  onToggleFav: () => void;
}) {
  const activeServing = isExpanded && selectedServing ? selectedServing : (food.servings.find(s => s.isDefault) || food.servings[0]);

  return (
    <div className={cn(
      "rounded-xl border transition-all overflow-hidden",
      isExpanded ? "border-primary/30 bg-primary/5" : "border-transparent hover:bg-muted/10",
      flashed && "bg-green-500/10 border-green-500/30"
    )}>
      {/* Name row */}
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate">{formatUSDAName(food.name)}</p>
          <p className="text-[10px] text-muted-foreground/60 truncate">
            {food.brand && <span>{food.brand} · </span>}
            {activeServing ? `${Math.round(activeServing.calories)} cal · ${Math.round(activeServing.carbs)}C ${Math.round(activeServing.protein)}P` : `${food.calories} cal`}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(); hapticTap(); }}
          className="p-1 shrink-0"
        >
          <Star className={cn("w-3.5 h-3.5", isFav ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/30")} />
        </button>
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />}
      </button>

      {/* Expanded: serving selection + add */}
      {isExpanded && selectedServing && (
        <div className="px-3 pb-3 space-y-2 border-t border-muted/20 pt-2">
          {/* Serving selector */}
          {food.servings.length > 1 && (
            <select
              value={selectedServing.id}
              onChange={(e) => {
                const s = food.servings.find(sv => sv.id === e.target.value);
                if (s) onServingChange(s);
              }}
              className="w-full py-2 px-3 rounded-lg bg-muted/20 border border-muted/30 text-[12px] font-medium"
            >
              {food.servings.map(s => (
                <option key={s.id} value={s.id}>{s.description}</option>
              ))}
            </select>
          )}

          {/* Macro breakdown */}
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="text-muted-foreground">{Math.round(selectedServing.calories)} cal</span>
            <span className="text-amber-500">{Math.round(selectedServing.carbs)}g C</span>
            <span className="text-orange-500">{Math.round(selectedServing.protein)}g P</span>
            <span className="text-muted-foreground/60">{Math.round(selectedServing.fat)}g F</span>
          </div>

          {/* Add button */}
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="w-full py-2.5 rounded-xl bg-primary text-white text-[12px] font-bold active:scale-[0.98] transition-all"
          >
            Add Food
          </button>
        </div>
      )}
    </div>
  );
}

