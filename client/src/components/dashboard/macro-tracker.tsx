import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Utensils, Plus, Pencil, Trash2, ChevronRight, HelpCircle, Apple, Wheat, Fish, AlertTriangle, Check, Undo2, History, ChevronDown, Search, X, Star, Loader2, Database, Minus, ScanBarcode, ShoppingBag } from "lucide-react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { useToast } from "@/hooks/use-toast";

// Food log entry for tracking additions
interface FoodLogEntry {
  id: string;
  name: string;
  macroType: 'carbs' | 'protein';
  amount: number;
  timestamp: Date;
  category: string; // fructose, glucose, zerofiber, protein
  liquidOz?: number; // for juices/liquids that also count as water
}
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useStore } from "@/lib/store";

interface MacroTrackerProps {
  macros: {
    carbs: { min: number; max: number };
    protein: { min: number; max: number };
    ratio: string;
    note?: string;
  };
  todaysFoods: {
    carbs: Array<{ name: string; ratio: string; serving: string; carbs: number; note?: string }>;
    protein: Array<{ name: string; serving: string; protein: number; note?: string; timing?: string }>;
    avoid: Array<{ name: string; reason: string }>;
    carbsLabel: string;
    proteinLabel: string;
  };
  foodLists: ReturnType<ReturnType<typeof useStore>['getFoodLists']>;
  daysUntilWeighIn: number;
  protocol: string;
  readOnly?: boolean;
  /** When true, renders without Card wrapper and auto-opens food log */
  embedded?: boolean;
}

// Circular Progress Component
function CircularProgress({
  value,
  max,
  color,
  size = 60,
  label,
  consumed,
  sliceEquivalent,
}: {
  value: number;
  max: number;
  color: string;
  size?: number;
  label: string;
  consumed: number;
  sliceEquivalent?: string;
}) {
  const progress = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const isOver = max > 0 && value > max;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
            opacity={0.3}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={isOver ? "hsl(45, 93%, 47%)" : progress >= 100 ? "hsl(var(--chart-2))" : color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-sm font-bold font-mono leading-tight", isOver ? "text-amber-500" : progress >= 100 ? "text-green-500" : "")}>
            {consumed}g
          </span>
          {isOver && (
            <span className="text-[7px] text-amber-500/80 font-bold font-mono leading-tight">
              +{consumed - max} over
            </span>
          )}
          {sliceEquivalent && (
            <span className={cn(
              "text-[9px] font-mono leading-none mt-0.5",
              isOver ? "text-amber-500/60" : "text-muted-foreground/50"
            )}>
              {sliceEquivalent}
            </span>
          )}
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground mt-1 font-medium">{label}</span>
      <span className="text-[9px] text-muted-foreground">/ {max}g</span>
    </div>
  );
}

// Why Explanation Component
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

// Color mapping for food categories
const CATEGORY_COLORS: Record<string, { bg: string; bgHover: string; bgActive: string; bgRing: string; text: string; icon: string }> = {
  fructose: { bg: "bg-green-500/5", bgHover: "hover:bg-green-500/15", bgActive: "active:bg-green-500/25", bgRing: "bg-green-500/30 ring-2 ring-green-500", text: "text-green-500", icon: "text-green-500" },
  glucose: { bg: "bg-amber-500/5", bgHover: "hover:bg-amber-500/15", bgActive: "active:bg-amber-500/25", bgRing: "bg-amber-500/30 ring-2 ring-amber-500", text: "text-amber-500", icon: "text-amber-500" },
  zerofiber: { bg: "bg-red-500/5", bgHover: "hover:bg-red-500/15", bgActive: "active:bg-red-500/25", bgRing: "bg-red-500/30 ring-2 ring-red-500", text: "text-red-500", icon: "text-red-500" },
  protein: { bg: "bg-orange-500/5", bgHover: "hover:bg-orange-500/15", bgActive: "active:bg-orange-500/25", bgRing: "bg-orange-500/30 ring-2 ring-orange-500", text: "text-orange-500", icon: "text-orange-500" },
  custom: { bg: "bg-purple-500/5", bgHover: "hover:bg-purple-500/15", bgActive: "active:bg-purple-500/25", bgRing: "bg-purple-500/30 ring-2 ring-purple-500", text: "text-purple-500", icon: "text-purple-500" },
  meals: { bg: "bg-blue-500/5", bgHover: "hover:bg-blue-500/15", bgActive: "active:bg-blue-500/25", bgRing: "bg-blue-500/30 ring-2 ring-blue-500", text: "text-blue-500", icon: "text-blue-500" },
  usda: { bg: "bg-cyan-500/5", bgHover: "hover:bg-cyan-500/15", bgActive: "active:bg-cyan-500/25", bgRing: "bg-cyan-500/30 ring-2 ring-cyan-500", text: "text-cyan-500", icon: "text-cyan-500" },
  off: { bg: "bg-emerald-500/5", bgHover: "hover:bg-emerald-500/15", bgActive: "active:bg-emerald-500/25", bgRing: "bg-emerald-500/30 ring-2 ring-emerald-500", text: "text-emerald-500", icon: "text-emerald-500" },
};

// Shared food row component for plan foods (carbs)
function FoodRow({ food, index, category, isJustAdded, onAdd }: {
  food: { name: string; carbs?: number; protein?: number; serving?: string; oz?: number };
  index: number;
  category: string;
  isJustAdded: boolean;
  onAdd: () => void;
}) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.fructose;
  const amount = food.carbs ?? food.protein ?? 0;
  const macroLabel = food.protein !== undefined && !food.carbs ? 'P' : 'C';
  const foodOz = (food as any).oz as number | undefined;

  return (
    <button
      onClick={onAdd}
      className={cn(
        "w-full flex items-center justify-between rounded px-2 py-2 transition-all text-left",
        isJustAdded ? colors.bgRing : `${colors.bg} ${colors.bgHover} ${colors.bgActive}`
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isJustAdded ? (
          <Check className={cn("w-3.5 h-3.5 shrink-0", colors.icon)} />
        ) : (
          <Plus className={cn("w-3 h-3 shrink-0", colors.icon)} />
        )}
        <span className="text-[11px] font-medium text-foreground truncate">{food.name}</span>
        {foodOz && <span className="text-[9px] text-cyan-500 font-bold">+{foodOz}oz</span>}
      </div>
      <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
        {food.serving && <span className="text-muted-foreground hidden sm:inline">{food.serving}</span>}
        <span className={cn("font-mono font-bold", colors.text)}>+{amount}g {macroLabel}</span>
      </div>
    </button>
  );
}

export function MacroTracker({ macros, todaysFoods, foodLists, daysUntilWeighIn, protocol, readOnly = false, embedded = false }: MacroTrackerProps) {
  const { getDailyTracking, updateDailyTracking, profile } = useStore();
  const { toast } = useToast();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);

  const [addCarbs, setAddCarbs] = useState('');
  const [addProtein, setAddProtein] = useState('');
  const [isEditingCarbs, setIsEditingCarbs] = useState(false);
  const [isEditingProtein, setIsEditingProtein] = useState(false);
  const [editCarbsValue, setEditCarbsValue] = useState('');
  const [editProteinValue, setEditProteinValue] = useState('');
  const [showFoodRef, setShowFoodRef] = useState(embedded); // Auto-open when embedded in FuelCard

  // ─── Filter mode: replaces 6 tabs with 3 chips ───
  const [filterMode, setFilterMode] = useState<'all' | 'my-foods' | 'my-meals'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customFoodName, setCustomFoodName] = useState('');
  const [customFoodCarbs, setCustomFoodCarbs] = useState('');
  const [customFoodProtein, setCustomFoodProtein] = useState('');
  const [customFoodServing, setCustomFoodServing] = useState('');

  // Custom foods state - persisted to localStorage
  const customFoodsKey = 'pwm-custom-foods';
  const [customFoods, setCustomFoods] = useState<Array<{
    id: string;
    name: string;
    carbs: number;
    protein: number;
    serving: string;
  }>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(customFoodsKey);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.warn('Failed to parse custom foods:', e);
          return [];
        }
      }
    }
    return [];
  });

  // Persist custom foods
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(customFoodsKey, JSON.stringify(customFoods));
    }
  }, [customFoods]);

  // Custom meals state - persisted to localStorage
  interface CustomMealItem { name: string; carbs: number; protein: number; liquidOz?: number; }
  interface CustomMeal { id: string; name: string; items: CustomMealItem[]; totalCarbs: number; totalProtein: number; totalWater: number; }

  const customMealsKey = 'pwm-custom-meals';
  const [customMeals, setCustomMeals] = useState<CustomMeal[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(customMealsKey);
      if (saved) { try { return JSON.parse(saved); } catch (e) { console.warn('Failed to parse custom meals:', e); return []; } }
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(customMealsKey, JSON.stringify(customMeals));
    }
  }, [customMeals]);

  // Meal creation state
  const [showCreateMeal, setShowCreateMeal] = useState(false);
  const [mealName, setMealName] = useState('');
  const [mealItems, setMealItems] = useState<CustomMealItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCarbs, setNewItemCarbs] = useState('');
  const [newItemProtein, setNewItemProtein] = useState('');
  const [newItemLiquidOz, setNewItemLiquidOz] = useState('');

  // Add custom food
  const handleAddCustomFood = () => {
    if (!customFoodName || (!customFoodCarbs && !customFoodProtein)) return;

    const newFood = {
      id: `custom-${Date.now()}`,
      name: customFoodName,
      carbs: parseInt(customFoodCarbs) || 0,
      protein: parseInt(customFoodProtein) || 0,
      serving: customFoodServing || '1 serving',
    };

    setCustomFoods(prev => [...prev, newFood]);
    setCustomFoodName('');
    setCustomFoodCarbs('');
    setCustomFoodProtein('');
    setCustomFoodServing('');
    setShowAddCustom(false);
  };

  // Delete custom food
  const handleDeleteCustomFood = (id: string) => {
    setCustomFoods(prev => prev.filter(f => f.id !== id));
  };

  // Meal handlers
  const handleAddItemToMeal = () => {
    if (!newItemName || (!newItemCarbs && !newItemProtein)) return;
    setMealItems(prev => [...prev, {
      name: newItemName,
      carbs: parseInt(newItemCarbs) || 0,
      protein: parseInt(newItemProtein) || 0,
      liquidOz: parseInt(newItemLiquidOz) || undefined,
    }]);
    setNewItemName(''); setNewItemCarbs(''); setNewItemProtein(''); setNewItemLiquidOz('');
  };

  const handleRemoveMealItem = (index: number) => {
    setMealItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveMeal = () => {
    if (!mealName || mealItems.length === 0) return;
    const newMeal: CustomMeal = {
      id: `meal-${Date.now()}`,
      name: mealName,
      items: mealItems,
      totalCarbs: mealItems.reduce((s, i) => s + i.carbs, 0),
      totalProtein: mealItems.reduce((s, i) => s + i.protein, 0),
      totalWater: mealItems.reduce((s, i) => s + (i.liquidOz || 0), 0),
    };
    setCustomMeals(prev => [...prev, newMeal]);
    setMealName(''); setMealItems([]); setShowCreateMeal(false);
  };

  const handleDeleteMeal = (id: string) => {
    setCustomMeals(prev => prev.filter(m => m.id !== id));
  };

  const handleMealAdd = (meal: CustomMeal) => {
    // Log each item individually for undo support
    meal.items.forEach((item, idx) => {
      if (item.carbs > 0) {
        const entry: FoodLogEntry = {
          id: `${Date.now()}-c${idx}-${Math.random().toString(36).substr(2, 9)}`,
          name: `${meal.name} — ${item.name}`,
          macroType: 'carbs',
          amount: item.carbs,
          timestamp: new Date(Date.now() + idx),
          category: 'meals',
          liquidOz: item.liquidOz || undefined,
        };
        setFoodHistory(prev => [...prev, entry]);
      }
      if (item.protein > 0) {
        const entry: FoodLogEntry = {
          id: `${Date.now()}-p${idx}-${Math.random().toString(36).substr(2, 9)}`,
          name: `${meal.name} — ${item.name}`,
          macroType: 'protein',
          amount: item.protein,
          timestamp: new Date(Date.now() + idx + 1),
          category: 'meals',
        };
        setFoodHistory(prev => [...prev, entry]);
      }
    });

    // Update totals in one batch + cross-sync slices
    const updates: Record<string, any> = {};
    if (meal.totalCarbs > 0) {
      updates.carbsConsumed = tracking.carbsConsumed + meal.totalCarbs;
      updates.carbSlices = tracking.carbSlices + Math.max(1, Math.round(meal.totalCarbs / 26));
    }
    if (meal.totalProtein > 0) {
      updates.proteinConsumed = tracking.proteinConsumed + meal.totalProtein;
      updates.proteinSlices = tracking.proteinSlices + Math.max(1, Math.round(meal.totalProtein / 25));
    }
    if (meal.totalWater > 0) updates.waterConsumed = tracking.waterConsumed + meal.totalWater;
    updateDailyTracking(dateKey, updates);

    setLastAdded({ index: customMeals.indexOf(meal), type: 'meals', amount: meal.totalCarbs + meal.totalProtein });
  };

  // Filter foods by search query
  const filterFoods = <T extends { name: string }>(foods: T[]): T[] => {
    if (!searchQuery) return foods;
    const query = searchQuery.toLowerCase();
    return foods.filter(f => f.name.toLowerCase().includes(query));
  };

  // Memoized filtered food lists
  const filteredFructose = useMemo(() => filterFoods(foodLists.highFructose), [foodLists.highFructose, searchQuery]);
  const filteredGlucose = useMemo(() => filterFoods(foodLists.highGlucose), [foodLists.highGlucose, searchQuery]);
  const filteredZeroFiber = useMemo(() => filterFoods(foodLists.zeroFiber), [foodLists.zeroFiber, searchQuery]);
  const filteredProtein = useMemo(() => filterFoods(todaysFoods.protein), [todaysFoods.protein, searchQuery]);
  const filteredCustom = useMemo(() => filterFoods(customFoods), [customFoods, searchQuery]);
  const filteredMeals = useMemo(() => {
    if (!searchQuery) return customMeals;
    const q = searchQuery.toLowerCase();
    return customMeals.filter(m => m.name.toLowerCase().includes(q) || m.items.some(i => i.name.toLowerCase().includes(q)));
  }, [customMeals, searchQuery]);

  // ─── USDA Search State ───
  interface USDAFood {
    fdcId: number;
    name: string;
    category: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
    servingSize: number | null;
    servingSizeUnit: string;
  }

  const [usdaResults, setUsdaResults] = useState<USDAFood[]>([]);
  const [usdaLoading, setUsdaLoading] = useState(false);
  const [usdaSearched, setUsdaSearched] = useState(false);
  const [selectedUSDA, setSelectedUSDA] = useState<USDAFood | null>(null);
  const [usdaServingGrams, setUsdaServingGrams] = useState('100');
  const usdaDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ─── Open Food Facts Search State ───
  interface OFFFood {
    barcode: string;
    name: string;
    brand: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
    servingSize: number | null;
    servingSizeLabel: string;
    imageUrl: string | null;
    dataQuality: 'complete' | 'partial' | 'poor';
  }

  const [offResults, setOffResults] = useState<OFFFood[]>([]);
  const [offLoading, setOffLoading] = useState(false);
  const [offSearched, setOffSearched] = useState(false);
  const [selectedOFF, setSelectedOFF] = useState<OFFFood | null>(null);
  const [offServingGrams, setOffServingGrams] = useState('100');
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  // Debounced USDA + OFF search - triggers when searchQuery changes and has 3+ chars
  useEffect(() => {
    if (usdaDebounceRef.current) clearTimeout(usdaDebounceRef.current);

    if (!searchQuery || searchQuery.trim().length < 3) {
      setUsdaResults([]);
      setUsdaSearched(false);
      setOffResults([]);
      setOffSearched(false);
      return;
    }

    usdaDebounceRef.current = setTimeout(async () => {
      const q = encodeURIComponent(searchQuery.trim());

      // Fire USDA and OFF searches in parallel
      setUsdaLoading(true);
      setUsdaSearched(true);
      setOffLoading(true);
      setOffSearched(true);

      const usdaPromise = fetch(`/api/foods/search?q=${q}`)
        .then(r => {
          if (!r.ok) throw new Error('USDA search failed');
          return r.json();
        })
        .then(data => setUsdaResults(data.foods || []))
        .catch(() => {
          setUsdaResults([]);
          toast({ title: "Search error", description: "USDA database unavailable", variant: "destructive" });
        })
        .finally(() => setUsdaLoading(false));

      const offPromise = fetch(`/api/foods/off-search?q=${q}`)
        .then(r => {
          if (!r.ok) throw new Error('OFF search failed');
          return r.json();
        })
        .then(data => setOffResults(data.foods || []))
        .catch(() => {
          setOffResults([]);
          // Don't double-toast if USDA also failed - just silently fail OFF
        })
        .finally(() => setOffLoading(false));

      await Promise.allSettled([usdaPromise, offPromise]);
    }, 500);

    return () => {
      if (usdaDebounceRef.current) clearTimeout(usdaDebounceRef.current);
    };
  }, [searchQuery]);

  // Format USDA food name to title case, shorter
  const formatUSDAName = (name: string) => {
    return name
      .toLowerCase()
      .split(",")[0]
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .trim();
  };

  // Log a USDA food with custom serving size
  const handleUSDAFoodAdd = (food: USDAFood, servingG: number) => {
    const scale = servingG / 100;
    const carbs = Math.round(food.carbs * scale);
    const protein = Math.round(food.protein * scale);
    const foodName = `${formatUSDAName(food.name)} (${servingG}g)`;

    // Build updates object for both macros at once + cross-sync slices
    const updates: Record<string, any> = {};
    if (carbs > 0) {
      updates.carbsConsumed = tracking.carbsConsumed + carbs;
      updates.carbSlices = tracking.carbSlices + Math.max(1, Math.round(carbs / 26));
    }
    if (protein > 0) {
      updates.proteinConsumed = tracking.proteinConsumed + protein;
      updates.proteinSlices = tracking.proteinSlices + Math.max(1, Math.round(protein / 25));
    }

    if (Object.keys(updates).length > 0) {
      updateDailyTracking(dateKey, updates);
    }

    // Add food history entries
    if (carbs > 0) {
      const entry: FoodLogEntry = {
        id: `${Date.now()}-c-${Math.random().toString(36).substr(2, 9)}`,
        name: foodName,
        macroType: 'carbs',
        amount: carbs,
        timestamp: new Date(),
        category: 'usda',
      };
      setFoodHistory(prev => [...prev, entry]);
    }
    if (protein > 0) {
      const entry: FoodLogEntry = {
        id: `${Date.now()}-p-${Math.random().toString(36).substr(2, 9)}`,
        name: foodName,
        macroType: 'protein',
        amount: protein,
        timestamp: new Date(Date.now() + 1),
        category: 'usda',
      };
      setFoodHistory(prev => [...prev, entry]);
    }

    setLastAdded({ index: -1, type: 'usda', amount: carbs + protein });
    setSelectedUSDA(null);
    setUsdaServingGrams('100');
  };

  // Log an Open Food Facts food with custom serving size
  const handleOFFFoodAdd = (food: OFFFood, servingG: number) => {
    const scale = servingG / 100;
    const carbs = Math.round(food.carbs * scale);
    const protein = Math.round(food.protein * scale);
    const brandLabel = food.brand ? ` (${food.brand})` : '';
    const foodName = `${food.name}${brandLabel} · ${servingG}g`;

    const updates: Record<string, any> = {};
    if (carbs > 0) {
      updates.carbsConsumed = tracking.carbsConsumed + carbs;
      updates.carbSlices = tracking.carbSlices + Math.max(1, Math.round(carbs / 26));
    }
    if (protein > 0) {
      updates.proteinConsumed = tracking.proteinConsumed + protein;
      updates.proteinSlices = tracking.proteinSlices + Math.max(1, Math.round(protein / 25));
    }

    if (Object.keys(updates).length > 0) {
      updateDailyTracking(dateKey, updates);
    }

    if (carbs > 0) {
      const entry: FoodLogEntry = {
        id: `${Date.now()}-c-${Math.random().toString(36).substr(2, 9)}`,
        name: foodName,
        macroType: 'carbs',
        amount: carbs,
        timestamp: new Date(),
        category: 'off',
      };
      setFoodHistory(prev => [...prev, entry]);
    }
    if (protein > 0) {
      const entry: FoodLogEntry = {
        id: `${Date.now()}-p-${Math.random().toString(36).substr(2, 9)}`,
        name: foodName,
        macroType: 'protein',
        amount: protein,
        timestamp: new Date(Date.now() + 1),
        category: 'off',
      };
      setFoodHistory(prev => [...prev, entry]);
    }

    setLastAdded({ index: -1, type: 'off', amount: carbs + protein });
    setSelectedOFF(null);
    setOffServingGrams('100');
  };

  // Handle barcode scan result
  const handleBarcodeScan = async (barcode: string) => {
    setShowBarcodeScanner(false);
    setBarcodeLoading(true);
    try {
      const res = await fetch(`/api/foods/off-barcode?code=${encodeURIComponent(barcode)}`);
      if (!res.ok) throw new Error('Barcode lookup failed');
      const data = await res.json();
      if (data.found && data.food) {
        setSelectedOFF(data.food);
        setOffResults([data.food]);
        setOffSearched(true);
        setOffServingGrams(data.food.servingSize ? String(Math.round(data.food.servingSize)) : '100');
        setSearchQuery(''); // Clear search to show barcode result prominently
      } else {
        setOffResults([]);
        setOffSearched(true);
        toast({ title: "Product not found", description: "This barcode isn't in our database. Try searching by name." });
      }
    } catch {
      setOffResults([]);
      toast({ title: "Scan failed", description: "Could not look up barcode. Try again.", variant: "destructive" });
    } finally {
      setBarcodeLoading(false);
    }
  };

  // Track last added food for visual feedback
  const [lastAdded, setLastAdded] = useState<{ index: number; type: string; amount: number } | null>(null);
  const lastAddedTimeout = useRef<NodeJS.Timeout | null>(null);

  // Food history log for undo functionality - persisted to localStorage per day
  const foodHistoryKey = `pwm-food-history-${dateKey}`;
  const [foodHistory, setFoodHistory] = useState<FoodLogEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false); // Collapsed by default, tap to expand
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Load food history when dateKey changes (new day or date navigation)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(foodHistoryKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Restore Date objects from ISO strings
          setFoodHistory(parsed.map((entry: FoodLogEntry) => ({
            ...entry,
            timestamp: new Date(entry.timestamp)
          })));
        } catch (e) {
          console.warn('Failed to parse food history:', e);
          setFoodHistory([]);
        }
      } else {
        setFoodHistory([]);
      }
    }
  }, [foodHistoryKey]);

  // Persist food history to localStorage whenever it changes
  // Use a ref to track if this is the initial load to avoid overwriting
  const isInitialLoad = useRef(true);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Skip the first save that happens right after loading
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
        return;
      }
      localStorage.setItem(foodHistoryKey, JSON.stringify(foodHistory));
    }
  }, [foodHistory, foodHistoryKey]);

  // Reset initial load flag when dateKey changes
  useEffect(() => {
    isInitialLoad.current = true;
  }, [dateKey]);

  // Clear the "added" indicator after animation
  useEffect(() => {
    if (lastAdded) {
      if (lastAddedTimeout.current) clearTimeout(lastAddedTimeout.current);
      lastAddedTimeout.current = setTimeout(() => setLastAdded(null), 1500);
    }
    return () => {
      if (lastAddedTimeout.current) clearTimeout(lastAddedTimeout.current);
    };
  }, [lastAdded]);

  // Helper to add food with visual feedback and history tracking
  // Also tracks water intake for liquid foods (juice, etc.)
  const handleFoodAdd = (index: number, macroType: 'carbs' | 'protein', amount: number, tabType: string, foodName: string, liquidOz?: number) => {
    const updates: Record<string, any> = {};

    if (macroType === 'carbs') {
      updates.carbsConsumed = tracking.carbsConsumed + amount;
      // Cross-sync: also update slice count
      updates.carbSlices = tracking.carbSlices + Math.max(1, Math.round(amount / 26));
    } else {
      updates.proteinConsumed = tracking.proteinConsumed + amount;
      // Cross-sync: also update slice count
      updates.proteinSlices = tracking.proteinSlices + Math.max(1, Math.round(amount / 25));
    }

    // If this is a liquid food, also add to water intake
    if (liquidOz && liquidOz > 0) {
      updates.waterConsumed = tracking.waterConsumed + liquidOz;
    }

    updateDailyTracking(dateKey, updates);
    setLastAdded({ index, type: tabType, amount });

    // Add to food history (include oz info for undo and display)
    const entry: FoodLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: foodName,
      macroType,
      amount,
      timestamp: new Date(),
      category: tabType,
      liquidOz: liquidOz || undefined,
    };
    setFoodHistory(prev => [...prev, entry]);
  };

  // Undo last food addition
  const handleUndo = () => {
    if (foodHistory.length === 0) return;

    const lastEntry = foodHistory[foodHistory.length - 1];
    const updates: Record<string, any> = {};

    // Subtract the amount from tracking + cross-sync slices
    if (lastEntry.macroType === 'carbs') {
      updates.carbsConsumed = Math.max(0, tracking.carbsConsumed - lastEntry.amount);
      updates.carbSlices = Math.max(0, tracking.carbSlices - Math.max(1, Math.round(lastEntry.amount / 26)));
    } else {
      updates.proteinConsumed = Math.max(0, tracking.proteinConsumed - lastEntry.amount);
      updates.proteinSlices = Math.max(0, tracking.proteinSlices - Math.max(1, Math.round(lastEntry.amount / 25)));
    }

    // Also undo water if it was a liquid
    if (lastEntry.liquidOz && lastEntry.liquidOz > 0) {
      updates.waterConsumed = Math.max(0, tracking.waterConsumed - lastEntry.liquidOz);
    }

    updateDailyTracking(dateKey, updates);

    // Remove from history
    setFoodHistory(prev => prev.slice(0, -1));
  };

  // Delete a specific food entry by id
  const handleDeleteEntry = (entryId: string) => {
    const entry = foodHistory.find(e => e.id === entryId);
    if (!entry) return;

    const updates: Record<string, any> = {};

    if (entry.macroType === 'carbs') {
      updates.carbsConsumed = Math.max(0, tracking.carbsConsumed - entry.amount);
      updates.carbSlices = Math.max(0, tracking.carbSlices - Math.max(1, Math.round(entry.amount / 26)));
    } else {
      updates.proteinConsumed = Math.max(0, tracking.proteinConsumed - entry.amount);
      updates.proteinSlices = Math.max(0, tracking.proteinSlices - Math.max(1, Math.round(entry.amount / 25)));
    }

    if (entry.liquidOz && entry.liquidOz > 0) {
      updates.waterConsumed = Math.max(0, tracking.waterConsumed - entry.liquidOz);
    }

    updateDailyTracking(dateKey, updates);
    setFoodHistory(prev => prev.filter(e => e.id !== entryId));
  };

  const carbProgress = macros.carbs.max > 0 ? Math.min(100, (tracking.carbsConsumed / macros.carbs.max) * 100) : 0;
  const proteinProgress = macros.protein.max > 0 ? Math.min(100, (tracking.proteinConsumed / macros.protein.max) * 100) : 0;

  // Quick add amounts
  const quickCarbAmounts = [25, 50, 75];
  const quickProteinAmounts = [15, 25, 30];

  const handleAddMacros = () => {
    const parsedCarbs = parseInt(addCarbs) || 0;
    const parsedProtein = parseInt(addProtein) || 0;
    const newCarbs = tracking.carbsConsumed + parsedCarbs;
    const newProtein = tracking.proteinConsumed + parsedProtein;
    const updates: Record<string, any> = { carbsConsumed: newCarbs, proteinConsumed: newProtein };
    // Cross-sync slices
    if (parsedCarbs > 0) updates.carbSlices = tracking.carbSlices + Math.max(1, Math.round(parsedCarbs / 26));
    if (parsedProtein > 0) updates.proteinSlices = tracking.proteinSlices + Math.max(1, Math.round(parsedProtein / 25));
    updateDailyTracking(dateKey, updates);
    setAddCarbs('');
    setAddProtein('');
  };

  const handleEditCarbs = () => {
    setEditCarbsValue(tracking.carbsConsumed.toString());
    setIsEditingCarbs(true);
  };

  const handleSaveCarbs = () => {
    const newCarbs = parseInt(editCarbsValue) || 0;
    updateDailyTracking(dateKey, { carbsConsumed: newCarbs, carbSlices: Math.round(newCarbs / 26) });
    setIsEditingCarbs(false);
    setEditCarbsValue('');
  };

  const handleEditProtein = () => {
    setEditProteinValue(tracking.proteinConsumed.toString());
    setIsEditingProtein(true);
  };

  const handleSaveProtein = () => {
    const newProtein = parseInt(editProteinValue) || 0;
    updateDailyTracking(dateKey, { proteinConsumed: newProtein, proteinSlices: Math.round(newProtein / 25) });
    setIsEditingProtein(false);
    setEditProteinValue('');
  };

  const handleResetMacros = () => {
    updateDailyTracking(dateKey, { carbsConsumed: 0, proteinConsumed: 0 });
    setFoodHistory([]);
    // Also clear from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem(foodHistoryKey);
    }
    setConfirmingReset(false);
  };

  // Determine if we're in fructose or glucose phase based on days until weigh-in
  // Protocol 4 (Build) and Protocol 3 (Hold Weight) don't use cutting phase restrictions
  const isCuttingProtocol = protocol !== '3' && protocol !== '4';
  const isFructosePhase = isCuttingProtocol && daysUntilWeighIn >= 3 && daysUntilWeighIn <= 5; // 3-5 days out
  const isGlucosePhase = isCuttingProtocol && daysUntilWeighIn >= 1 && daysUntilWeighIn <= 2; // 1-2 days out
  const isZeroFiberPhase = isCuttingProtocol && (daysUntilWeighIn === 1 || daysUntilWeighIn === 2); // 1-2 days out - critical for weigh-in
  const isProteinAllowed = todaysFoods.protein.length > 0;

  // Get protein status info
  const getProteinStatus = () => {
    if (protocol === '3' || protocol === '4') {
      return { allowed: true, message: todaysFoods.proteinLabel, color: "text-primary", bgColor: "bg-primary/10 border-primary/30" };
    }
    if (daysUntilWeighIn >= 4 && daysUntilWeighIn <= 5) {
      // 4-5 days out: NO PROTEIN
      return { allowed: false, message: "NO PROTEIN TODAY", color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/30" };
    }
    if (daysUntilWeighIn === 3) {
      // 3 days out: Collagen only
      return { allowed: true, message: "COLLAGEN ONLY (Dinner)", color: "text-orange-500", bgColor: "bg-orange-500/10 border-orange-500/30" };
    }
    if (daysUntilWeighIn === 0) {
      // Competition day: Protein after weigh-in
      return { allowed: true, message: "PROTEIN AFTER WEIGH-IN", color: "text-yellow-500", bgColor: "bg-yellow-500/10 border-yellow-500/30" };
    }
    return { allowed: true, message: todaysFoods.proteinLabel, color: "text-primary", bgColor: "bg-primary/10 border-primary/30" };
  };

  const proteinStatus = getProteinStatus();

  // ─── Build recommended foods for default view (no search) ───
  const recommendedSections = useMemo(() => {
    const sections: Array<{
      title: string;
      badge?: string;
      badgeColor?: string;
      icon: 'fructose' | 'glucose' | 'zerofiber' | 'protein';
      foods: Array<{ name: string; carbs?: number; protein?: number; serving?: string; oz?: number; category: string; originalIndex: number }>;
    }> = [];

    // Priority: zero fiber (if close to weigh-in), then phase-appropriate carbs, then protein
    if (isZeroFiberPhase && foodLists.zeroFiber.length > 0) {
      sections.push({
        title: "Zero Fiber",
        badge: "CRITICAL FOR WEIGH-IN",
        badgeColor: "bg-red-500/20 text-red-500",
        icon: 'zerofiber',
        foods: foodLists.zeroFiber.map((f, i) => ({
          name: f.name,
          carbs: f.carbs,
          serving: f.serving,
          oz: (f as any).oz,
          category: 'zerofiber',
          originalIndex: i,
        })),
      });
    }

    if (isFructosePhase && foodLists.highFructose.length > 0) {
      sections.push({
        title: "Fructose Sources",
        badge: "RECOMMENDED TODAY",
        badgeColor: "bg-green-500/20 text-green-500",
        icon: 'fructose',
        foods: foodLists.highFructose.map((f, i) => ({
          name: f.name,
          carbs: f.carbs,
          serving: f.serving,
          oz: (f as any).oz,
          category: 'fructose',
          originalIndex: i,
        })),
      });
    } else if (isGlucosePhase && foodLists.highGlucose.length > 0) {
      sections.push({
        title: "Glucose/Starch Sources",
        badge: "RECOMMENDED TODAY",
        badgeColor: "bg-amber-500/20 text-amber-500",
        icon: 'glucose',
        foods: foodLists.highGlucose.map((f, i) => ({
          name: f.name,
          carbs: f.carbs,
          serving: f.serving,
          oz: (f as any).oz,
          category: 'glucose',
          originalIndex: i,
        })),
      });
    } else {
      // Default: show fructose
      if (foodLists.highFructose.length > 0) {
        sections.push({
          title: "Fructose Sources",
          icon: 'fructose',
          foods: foodLists.highFructose.map((f, i) => ({
            name: f.name,
            carbs: f.carbs,
            serving: f.serving,
            oz: (f as any).oz,
            category: 'fructose',
            originalIndex: i,
          })),
        });
      }
      if (foodLists.highGlucose.length > 0) {
        sections.push({
          title: "Glucose/Starch",
          icon: 'glucose',
          foods: foodLists.highGlucose.map((f, i) => ({
            name: f.name,
            carbs: f.carbs,
            serving: f.serving,
            oz: (f as any).oz,
            category: 'glucose',
            originalIndex: i,
          })),
        });
      }
    }

    // Protein section (if allowed)
    if (isProteinAllowed && todaysFoods.protein.length > 0) {
      sections.push({
        title: "Protein Sources",
        icon: 'protein',
        foods: todaysFoods.protein.map((f, i) => ({
          name: f.name,
          protein: f.protein,
          serving: f.serving,
          category: 'protein',
          originalIndex: i,
        })),
      });
    }

    return sections;
  }, [isFructosePhase, isGlucosePhase, isZeroFiberPhase, isProteinAllowed, foodLists, todaysFoods.protein]);

  // Icon map for sections
  const sectionIcons: Record<string, React.ElementType> = {
    fructose: Apple,
    glucose: Wheat,
    zerofiber: AlertTriangle,
    protein: Fish,
  };

  const content = (
    <>
        {/* Header + Progress — shown only in standalone mode */}
        {!embedded && (
          <>
            {/* Compact Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm">Food & Macros</h3>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
                {macros.ratio}
              </span>
            </div>

            {/* Compact Progress Row */}
            <div className="flex items-center gap-3 mb-2">
              {/* Carbs */}
              <div className="flex-1">
                {!readOnly && isEditingCarbs ? (
                  <div className="flex items-center gap-1">
                    <Input type="number" value={editCarbsValue} onChange={(e) => setEditCarbsValue(e.target.value)} className="h-7 w-16 text-center text-xs font-mono" autoFocus />
                    <button onClick={handleSaveCarbs} className="text-[10px] text-green-500 font-bold">Save</button>
                    <button onClick={() => setIsEditingCarbs(false)} className="text-[10px] text-muted-foreground">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CircularProgress value={tracking.carbsConsumed} max={macros.carbs.max} color="hsl(var(--primary))" consumed={tracking.carbsConsumed} label="Carbs" size={52} sliceEquivalent={macros.carbs.max > 0 ? `~${Math.round(tracking.carbsConsumed / 26)} slc` : undefined} />
                    {!readOnly && (
                      <button onClick={handleEditCarbs} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Protein */}
              <div className="flex-1">
                {!readOnly && isEditingProtein ? (
                  <div className="flex items-center gap-1">
                    <Input type="number" value={editProteinValue} onChange={(e) => setEditProteinValue(e.target.value)} className="h-7 w-16 text-center text-xs font-mono" autoFocus />
                    <button onClick={handleSaveProtein} className="text-[10px] text-green-500 font-bold">Save</button>
                    <button onClick={() => setIsEditingProtein(false)} className="text-[10px] text-muted-foreground">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CircularProgress value={tracking.proteinConsumed} max={macros.protein.max} color="hsl(24, 95%, 53%)" consumed={tracking.proteinConsumed} label="Protein" size={52} sliceEquivalent={macros.protein.max > 0 ? `~${Math.round(tracking.proteinConsumed / 25)} slc` : undefined} />
                    {!readOnly && (
                      <button onClick={handleEditProtein} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {!readOnly && (
                <div className="flex flex-col gap-1 shrink-0">
                  {!showFoodRef && (
                    <button
                      onClick={() => setShowFoodRef(true)}
                      className="h-8 px-3 text-[11px] font-bold rounded-lg bg-primary/90 hover:bg-primary text-white flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Log
                    </button>
                  )}
                  {(tracking.carbsConsumed > 0 || tracking.proteinConsumed > 0) && (
                    confirmingReset ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-destructive">Reset all?</span>
                        <button onClick={handleResetMacros} className="text-[9px] font-bold text-destructive">Yes</button>
                        <button onClick={() => setConfirmingReset(false)} className="text-[9px] font-bold text-muted-foreground">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmingReset(true)} className="text-[9px] text-muted-foreground hover:text-destructive flex items-center justify-center gap-0.5">
                        <Trash2 className="w-2.5 h-2.5" />
                        Reset
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Embedded: slim inline edit + reset row */}
        {embedded && !readOnly && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              {isEditingCarbs ? (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground font-bold">C:</span>
                  <Input type="number" value={editCarbsValue} onChange={(e) => setEditCarbsValue(e.target.value)} className="h-6 w-14 text-center text-[11px] font-mono" autoFocus />
                  <button onClick={handleSaveCarbs} className="text-[10px] text-green-500 font-bold">Save</button>
                  <button onClick={() => setIsEditingCarbs(false)} className="text-[10px] text-muted-foreground">✕</button>
                </div>
              ) : (
                <button onClick={handleEditCarbs} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                  <Pencil className="w-3 h-3" />
                  <span className="font-mono">C: {tracking.carbsConsumed}</span>
                </button>
              )}
              {isEditingProtein ? (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground font-bold">P:</span>
                  <Input type="number" value={editProteinValue} onChange={(e) => setEditProteinValue(e.target.value)} className="h-6 w-14 text-center text-[11px] font-mono" autoFocus />
                  <button onClick={handleSaveProtein} className="text-[10px] text-green-500 font-bold">Save</button>
                  <button onClick={() => setIsEditingProtein(false)} className="text-[10px] text-muted-foreground">✕</button>
                </div>
              ) : (
                <button onClick={handleEditProtein} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                  <Pencil className="w-3 h-3" />
                  <span className="font-mono">P: {tracking.proteinConsumed}</span>
                </button>
              )}
            </div>
            {(tracking.carbsConsumed > 0 || tracking.proteinConsumed > 0) && (
              confirmingReset ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-destructive">Reset all?</span>
                  <button onClick={handleResetMacros} className="text-[9px] font-bold text-destructive">Yes</button>
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

            {/* Food History - Always visible when there are logged items */}
            {foodHistory.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-2.5 border border-muted/50 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-1.5 text-foreground"
                  >
                    <History className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-bold">Today's Log</span>
                    <span className="text-[10px] text-muted-foreground">({foodHistory.length})</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", showHistory && "rotate-180")} />
                  </button>
                  <div className="flex items-center gap-2">
                    {lastAdded && (
                      <div className="flex items-center gap-1 text-green-500 animate-in fade-in slide-in-from-right-2 duration-200">
                        <Check className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold">+{lastAdded.amount}g</span>
                      </div>
                    )}
                    <button
                      onClick={handleUndo}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                      title={`Undo: ${foodHistory[foodHistory.length - 1].name}`}
                      aria-label="Undo last food addition"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium">Undo</span>
                    </button>
                  </div>
                </div>

                {showHistory && (
                  <div className="space-y-1 max-h-[25vh] overflow-y-auto">
                    {[...foodHistory].reverse().map((entry) => (
                      <div
                        key={entry.id}
                        className={cn(
                          "flex items-center justify-between px-2 py-1.5 rounded text-[10px]",
                          entry.category === 'usda'
                            ? "bg-cyan-500/10"
                            : entry.category === 'off'
                              ? "bg-emerald-500/10"
                              : entry.category === 'meals'
                                ? "bg-blue-500/10"
                                : entry.macroType === 'carbs'
                                  ? entry.category === 'fructose'
                                    ? "bg-green-500/10"
                                    : entry.category === 'zerofiber'
                                      ? "bg-red-500/10"
                                      : "bg-amber-500/10"
                                  : "bg-orange-500/10"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground font-mono">
                            {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="font-medium truncate">{entry.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className={cn(
                            "font-mono font-bold",
                            entry.category === 'usda'
                              ? "text-cyan-500"
                              : entry.category === 'off'
                                ? "text-emerald-500"
                                : entry.category === 'meals'
                                  ? "text-blue-500"
                                  : entry.macroType === 'carbs'
                                    ? entry.category === 'fructose'
                                      ? "text-green-500"
                                      : entry.category === 'zerofiber'
                                        ? "text-red-500"
                                        : "text-amber-500"
                                    : "text-orange-500"
                          )}>
                            +{entry.amount}g {entry.macroType === 'carbs' ? 'C' : 'P'}
                          </span>
                          {entry.liquidOz && (
                            <span className="font-mono font-bold text-cyan-500">+{entry.liquidOz}oz</span>
                          )}
                          <button
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                            title={`Remove ${entry.name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Protein Status Banner */}
            <div className={cn("rounded-lg border p-3 mb-3", proteinStatus.bgColor)}>
              <div className="flex items-center gap-2">
                <Fish className="w-4 h-4" />
                <span className={cn("text-[11px] font-bold uppercase", proteinStatus.color)}>
                  {proteinStatus.message}
                </span>
              </div>
              {!proteinStatus.allowed && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Protein blocks fat burning. Stick to fructose-heavy carbs only.
                </p>
              )}
            </div>

            {/* Why Explanations */}
            <div className="space-y-2 mb-3">
              {daysUntilWeighIn >= 3 && daysUntilWeighIn <= 5 && (
                <WhyExplanation title="fructose heavy (3-5 days out)">
                  <strong>Fructose burns fat better.</strong> Unlike glucose, fructose is processed by the liver and doesn't spike
                  insulin as much. This keeps your body in a fat-burning state while still providing energy for training.
                </WhyExplanation>
              )}
              {daysUntilWeighIn >= 1 && daysUntilWeighIn <= 2 && (
                <WhyExplanation title="switch to glucose (1-2 days out)">
                  <strong>Glucose for quick energy.</strong> As you approach competition, we shift from fructose to glucose-based
                  carbs (rice, potatoes). Glucose goes straight to muscle glycogen for explosive energy without fiber.
                </WhyExplanation>
              )}
              {(daysUntilWeighIn >= 4 && daysUntilWeighIn <= 5) && protocol !== '3' && protocol !== '4' && (
                <WhyExplanation title="no protein (4-5 days out)">
                  <strong>Protein blocks fat burning.</strong> During the metabolic phase, protein triggers insulin and mTOR
                  pathways that shut down fat oxidation. Keeping protein minimal lets you burn more actual body fat.
                </WhyExplanation>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* ═══ UNIFIED FOOD LOG SECTION ═══════════════════════ */}
            {/* ═══════════════════════════════════════════════════════ */}
            {showFoodRef && (
              <div className="space-y-3">
                {/* Section Header with Hide option */}
                <div className="flex items-center justify-between border-b border-muted pb-2">
                  <div className="flex items-center gap-2">
                    <Apple className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold">Log Food</span>
                    <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">tap to add</span>
                  </div>
                  <button
                    onClick={() => setShowFoodRef(false)}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    Hide
                  </button>
                </div>

                {/* Search Bar + Barcode Scanner */}
                <div className="flex gap-1.5 mb-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search foods..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {filterMode === 'all' && (
                    <button
                      onClick={() => setShowBarcodeScanner(true)}
                      className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center transition-colors shrink-0",
                        barcodeLoading
                          ? "bg-emerald-500/20"
                          : "bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30"
                      )}
                      title="Scan barcode"
                      disabled={barcodeLoading}
                    >
                      {barcodeLoading ? (
                        <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                      ) : (
                        <ScanBarcode className="w-4 h-4 text-emerald-500" />
                      )}
                    </button>
                  )}
                </div>

                {/* ─── 3 Filter Chips ─── */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setFilterMode('all')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                      filterMode === 'all'
                        ? "bg-primary text-white"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted active:bg-muted/80"
                    )}
                  >
                    All Foods
                  </button>
                  <button
                    onClick={() => setFilterMode('my-foods')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                      filterMode === 'my-foods'
                        ? "bg-purple-500 text-white"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted active:bg-muted/80"
                    )}
                  >
                    My Foods{customFoods.length > 0 && ` (${customFoods.length})`}
                  </button>
                  <button
                    onClick={() => setFilterMode('my-meals')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                      filterMode === 'my-meals'
                        ? "bg-blue-500 text-white"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted active:bg-muted/80"
                    )}
                  >
                    My Meals{customMeals.length > 0 && ` (${customMeals.length})`}
                  </button>
                </div>

                {/* ═══ ALL FOODS VIEW ═══ */}
                {filterMode === 'all' && (
                  <div className="space-y-3 max-h-[45vh] overflow-y-auto">
                    {!searchQuery ? (
                      /* ─── Default: Phase-recommended foods as flat list ─── */
                      <>
                        {recommendedSections.map((section) => {
                          const SectionIcon = sectionIcons[section.icon] || Apple;
                          const colors = CATEGORY_COLORS[section.icon] || CATEGORY_COLORS.fructose;
                          return (
                            <div key={section.icon + section.title} className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <SectionIcon className={cn("w-3.5 h-3.5", colors.icon)} />
                                <span className={cn("text-[10px] uppercase font-bold", colors.text)}>{section.title}</span>
                                {section.badge && (
                                  <span className={cn("text-[8px] px-1.5 py-0.5 rounded font-bold", section.badgeColor)}>
                                    {section.badge}
                                  </span>
                                )}
                              </div>
                              {section.icon === 'zerofiber' && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                                  <p className="text-[10px] text-red-400">
                                    <strong>Fiber = gut weight.</strong> Any fiber during restriction/cut days stays in your system through weigh-in.
                                  </p>
                                </div>
                              )}
                              {section.foods.map((food) => {
                                const isJustAdded = lastAdded?.index === food.originalIndex && lastAdded?.type === food.category;
                                const macroType = food.protein !== undefined && food.carbs === undefined ? 'protein' : 'carbs';
                                const amount = macroType === 'protein' ? (food.protein || 0) : (food.carbs || 0);
                                return (
                                  <FoodRow
                                    key={`${food.category}-${food.originalIndex}`}
                                    food={food}
                                    index={food.originalIndex}
                                    category={food.category}
                                    isJustAdded={isJustAdded}
                                    onAdd={() => handleFoodAdd(food.originalIndex, macroType, amount, food.category, food.name, food.oz)}
                                  />
                                );
                              })}
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      /* ─── Search: Unified results ─── */
                      <>
                        {/* FROM YOUR PLAN - matching protocol foods */}
                        {(filteredFructose.length > 0 || filteredGlucose.length > 0 || filteredZeroFiber.length > 0 || filteredProtein.length > 0) && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Apple className="w-3.5 h-3.5 text-primary" />
                              <span className="text-[10px] text-primary uppercase font-bold">From Your Plan</span>
                            </div>
                            {filteredFructose.map((food, i) => {
                              const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'fructose';
                              return (
                                <FoodRow
                                  key={`search-fruct-${i}`}
                                  food={food}
                                  index={i}
                                  category="fructose"
                                  isJustAdded={isJustAdded}
                                  onAdd={() => handleFoodAdd(i, 'carbs', food.carbs, 'fructose', food.name, (food as any).oz)}
                                />
                              );
                            })}
                            {filteredGlucose.map((food, i) => {
                              const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'glucose';
                              return (
                                <FoodRow
                                  key={`search-gluc-${i}`}
                                  food={food}
                                  index={i}
                                  category="glucose"
                                  isJustAdded={isJustAdded}
                                  onAdd={() => handleFoodAdd(i, 'carbs', food.carbs, 'glucose', food.name, (food as any).oz)}
                                />
                              );
                            })}
                            {filteredZeroFiber.map((food, i) => {
                              const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'zerofiber';
                              return (
                                <FoodRow
                                  key={`search-zf-${i}`}
                                  food={food}
                                  index={i}
                                  category="zerofiber"
                                  isJustAdded={isJustAdded}
                                  onAdd={() => handleFoodAdd(i, 'carbs', food.carbs, 'zerofiber', food.name, (food as any).oz)}
                                />
                              );
                            })}
                            {filteredProtein.map((item, i) => {
                              const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'protein';
                              return (
                                <FoodRow
                                  key={`search-prot-${i}`}
                                  food={{ name: item.name, protein: item.protein, serving: item.serving }}
                                  index={i}
                                  category="protein"
                                  isJustAdded={isJustAdded}
                                  onAdd={() => handleFoodAdd(i, 'protein', item.protein, 'protein', item.name)}
                                />
                              );
                            })}
                          </div>
                        )}

                        {/* MY FOODS - matching custom foods */}
                        {filteredCustom.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Star className="w-3.5 h-3.5 text-purple-500" />
                              <span className="text-[10px] text-purple-500 uppercase font-bold">My Foods</span>
                            </div>
                            {filteredCustom.map((food) => {
                              const isJustAdded = lastAdded?.index === customFoods.indexOf(food) && lastAdded?.type === 'custom';
                              return (
                                <div
                                  key={food.id}
                                  className={cn(
                                    "w-full flex items-center justify-between rounded px-2 py-2 transition-all",
                                    isJustAdded ? "bg-purple-500/30 ring-2 ring-purple-500" : "bg-purple-500/5 hover:bg-purple-500/15"
                                  )}
                                >
                                  <button
                                    onClick={() => {
                                      if (food.carbs > 0) handleFoodAdd(customFoods.indexOf(food), 'carbs', food.carbs, 'custom', food.name);
                                      if (food.protein > 0) handleFoodAdd(customFoods.indexOf(food), 'protein', food.protein, 'custom', food.name);
                                    }}
                                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                                  >
                                    {isJustAdded ? <Check className="w-3.5 h-3.5 text-purple-500 shrink-0" /> : <Plus className="w-3 h-3 text-purple-500 shrink-0" />}
                                    <div className="min-w-0">
                                      <span className="text-[11px] font-medium text-foreground truncate block">{food.name}</span>
                                      <span className="text-[9px] text-muted-foreground">{food.serving}</span>
                                    </div>
                                  </button>
                                  <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                                    {food.carbs > 0 && <span className="font-mono font-bold text-primary">+{food.carbs}c</span>}
                                    {food.protein > 0 && <span className="font-mono font-bold text-orange-500">+{food.protein}p</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* MY MEALS - matching meals */}
                        {filteredMeals.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Utensils className="w-3.5 h-3.5 text-blue-500" />
                              <span className="text-[10px] text-blue-500 uppercase font-bold">My Meals</span>
                            </div>
                            {filteredMeals.map((meal) => {
                              const isJustAdded = lastAdded?.index === customMeals.indexOf(meal) && lastAdded?.type === 'meals';
                              return (
                                <div
                                  key={meal.id}
                                  className={cn(
                                    "w-full rounded px-2 py-2 transition-all",
                                    isJustAdded ? "bg-blue-500/30 ring-2 ring-blue-500" : "bg-blue-500/5 hover:bg-blue-500/10"
                                  )}
                                >
                                  <button onClick={() => handleMealAdd(meal)} className="flex-1 w-full text-left active:opacity-70">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      {isJustAdded ? <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" /> : <Plus className="w-3 h-3 text-blue-500 shrink-0" />}
                                      <span className="text-[11px] font-bold text-foreground">{meal.name}</span>
                                      <div className="flex items-center gap-1 ml-auto text-[10px]">
                                        {meal.totalCarbs > 0 && <span className="font-mono font-bold text-primary">+{meal.totalCarbs}c</span>}
                                        {meal.totalProtein > 0 && <span className="font-mono font-bold text-orange-500">+{meal.totalProtein}p</span>}
                                      </div>
                                    </div>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* No plan matches */}
                        {filteredFructose.length === 0 && filteredGlucose.length === 0 && filteredZeroFiber.length === 0 && filteredProtein.length === 0 && filteredCustom.length === 0 && filteredMeals.length === 0 && !usdaLoading && usdaResults.length === 0 && !offLoading && offResults.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">No plan foods match "{searchQuery}"</p>
                        )}

                        {/* ─── PACKAGED FOODS (Open Food Facts) ─── */}
                        {(searchQuery.trim().length >= 3 || offSearched) && (
                          <div className="space-y-1.5 pt-2 border-t border-emerald-500/30">
                            <div className="flex items-center gap-2">
                              <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-[10px] text-emerald-500 uppercase font-bold">Packaged Foods</span>
                              {offLoading && <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />}
                            </div>

                            {offLoading && (
                              <div className="flex items-center justify-center py-3 gap-2 text-muted-foreground">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span className="text-[10px]">Searching packaged foods...</span>
                              </div>
                            )}

                            {!offLoading && offSearched && offResults.length === 0 && (
                              <p className="text-[10px] text-muted-foreground text-center py-2">No packaged food results</p>
                            )}

                            {!offLoading && offResults.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[9px] text-muted-foreground px-1">
                                  {offResults.length} results · per 100g
                                </p>
                                {offResults.map((food) => {
                                  const isSelected = selectedOFF?.barcode === food.barcode;

                                  return (
                                    <div key={food.barcode} className="rounded-lg overflow-hidden">
                                      <button
                                        onClick={() => {
                                          setSelectedOFF(isSelected ? null : food);
                                          if (!isSelected && food.servingSize) {
                                            setOffServingGrams(String(Math.round(food.servingSize)));
                                          } else if (!isSelected) {
                                            setOffServingGrams('100');
                                          }
                                        }}
                                        className={cn(
                                          "w-full flex items-center justify-between rounded-lg px-2.5 py-2.5 transition-all text-left",
                                          isSelected
                                            ? "bg-emerald-500/20 ring-1 ring-emerald-500/50"
                                            : "bg-emerald-500/5 hover:bg-emerald-500/15 active:bg-emerald-500/25"
                                        )}
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <Plus className="w-3 h-3 text-emerald-500 shrink-0" />
                                          <div className="min-w-0">
                                            <span className="text-[11px] font-medium text-foreground block truncate">
                                              {food.name}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                              {food.brand && (
                                                <span className="text-[9px] text-muted-foreground truncate">{food.brand}</span>
                                              )}
                                              {food.dataQuality === 'partial' && (
                                                <span className="text-[8px] text-amber-500 bg-amber-500/10 px-1 rounded">partial data</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                                          <span className="font-mono font-bold text-primary">{food.carbs}c</span>
                                          <span className="font-mono font-bold text-orange-500">{food.protein}p</span>
                                        </div>
                                      </button>

                                      {/* Expanded: serving picker + log button */}
                                      {isSelected && (
                                        <div className="bg-emerald-500/10 px-3 py-2.5 space-y-2 animate-in slide-in-from-top-1 duration-150 border-t border-emerald-500/20">
                                          {/* Nutrition per 100g */}
                                          <div className="grid grid-cols-4 gap-1.5">
                                            <div className="text-center p-1 bg-muted/20 rounded">
                                              <span className="text-[10px] font-mono font-bold block">{food.calories}</span>
                                              <span className="text-[8px] text-muted-foreground">cal</span>
                                            </div>
                                            <div className="text-center p-1 bg-primary/10 rounded">
                                              <span className="text-[10px] font-mono font-bold text-primary block">{food.carbs}g</span>
                                              <span className="text-[8px] text-muted-foreground">carbs</span>
                                            </div>
                                            <div className="text-center p-1 bg-orange-500/10 rounded">
                                              <span className="text-[10px] font-mono font-bold text-orange-500 block">{food.protein}g</span>
                                              <span className="text-[8px] text-muted-foreground">protein</span>
                                            </div>
                                            <div className="text-center p-1 bg-yellow-500/10 rounded">
                                              <span className="text-[10px] font-mono font-bold text-yellow-500 block">{food.fat}g</span>
                                              <span className="text-[8px] text-muted-foreground">fat</span>
                                            </div>
                                          </div>

                                          {/* Wrestling tips */}
                                          {food.fiber > 3 && (
                                            <p className="text-[9px] text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">
                                              ⚠ High fiber ({food.fiber}g) — may cause bloating
                                            </p>
                                          )}
                                          {food.carbs > 50 && food.fiber < 2 && food.fat < 3 && (
                                            <p className="text-[9px] text-green-500 bg-green-500/10 px-2 py-1 rounded">
                                              ✓ Fast carbs, low fiber — great for recovery
                                            </p>
                                          )}

                                          {/* Serving size + log */}
                                          <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                              <label className="text-[8px] text-muted-foreground uppercase block mb-0.5">Serving (g)</label>
                                              <div className="flex items-center gap-1">
                                                <button
                                                  onClick={() => setOffServingGrams(String(Math.max(10, parseInt(offServingGrams) - 25)))}
                                                  className="w-7 h-7 rounded bg-muted/50 flex items-center justify-center hover:bg-muted active:scale-95"
                                                >
                                                  <Minus className="w-3 h-3" />
                                                </button>
                                                <Input
                                                  type="number"
                                                  value={offServingGrams}
                                                  onChange={(e) => setOffServingGrams(e.target.value)}
                                                  className="h-7 w-16 text-center text-sm font-mono"
                                                />
                                                <button
                                                  onClick={() => setOffServingGrams(String(parseInt(offServingGrams) + 25))}
                                                  className="w-7 h-7 rounded bg-muted/50 flex items-center justify-center hover:bg-muted active:scale-95"
                                                >
                                                  <Plus className="w-3 h-3" />
                                                </button>
                                              </div>
                                            </div>
                                            <div className="text-right text-[10px] min-w-[60px]">
                                              <div className="font-mono font-bold text-primary">
                                                {Math.round(food.carbs * parseInt(offServingGrams || '100') / 100)}g C
                                              </div>
                                              <div className="font-mono font-bold text-orange-500">
                                                {Math.round(food.protein * parseInt(offServingGrams || '100') / 100)}g P
                                              </div>
                                            </div>
                                            <button
                                              onClick={() => handleOFFFoodAdd(food, parseInt(offServingGrams) || 100)}
                                              className="h-9 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-[11px] flex items-center gap-1 active:scale-95 transition-transform shrink-0"
                                            >
                                              <Plus className="w-3.5 h-3.5" />
                                              Log
                                            </button>
                                          </div>

                                          {/* Quick serving presets */}
                                          <div className="flex gap-1.5 flex-wrap">
                                            {food.servingSize && Math.round(food.servingSize) !== 100 && (
                                              <button
                                                onClick={() => setOffServingGrams(String(Math.round(food.servingSize!)))}
                                                className={cn(
                                                  "px-2 py-1 rounded text-[9px] font-mono transition-colors",
                                                  parseInt(offServingGrams) === Math.round(food.servingSize!)
                                                    ? "bg-emerald-500 text-black font-bold"
                                                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                                                )}
                                              >
                                                {Math.round(food.servingSize!)}g
                                                {food.servingSizeLabel && (
                                                  <span className="ml-0.5 opacity-70">({food.servingSizeLabel})</span>
                                                )}
                                              </button>
                                            )}
                                            {[50, 100, 150, 200, 250].map(g => (
                                              <button
                                                key={g}
                                                onClick={() => setOffServingGrams(String(g))}
                                                className={cn(
                                                  "px-2 py-1 rounded text-[9px] font-mono transition-colors",
                                                  parseInt(offServingGrams) === g
                                                    ? "bg-emerald-500 text-black font-bold"
                                                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                                                )}
                                              >
                                                {g}g
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ─── USDA DATABASE ─── */}
                        {searchQuery.trim().length >= 3 && (
                          <div className="space-y-1.5 pt-2 border-t border-cyan-500/30">
                            <div className="flex items-center gap-2">
                              <Database className="w-3.5 h-3.5 text-cyan-500" />
                              <span className="text-[10px] text-cyan-500 uppercase font-bold">USDA Database</span>
                              {usdaLoading && <Loader2 className="w-3 h-3 animate-spin text-cyan-500" />}
                            </div>

                            {usdaLoading && (
                              <div className="flex items-center justify-center py-3 gap-2 text-muted-foreground">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span className="text-[10px]">Searching USDA database...</span>
                              </div>
                            )}

                            {!usdaLoading && usdaSearched && usdaResults.length === 0 && (
                              <p className="text-[10px] text-muted-foreground text-center py-2">No USDA results for "{searchQuery}"</p>
                            )}

                            {!usdaLoading && usdaResults.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[9px] text-muted-foreground px-1">
                                  {usdaResults.length} results · per 100g
                                </p>
                                {usdaResults.map((food) => {
                                  const isSelected = selectedUSDA?.fdcId === food.fdcId;

                                  return (
                                    <div key={food.fdcId} className="rounded-lg overflow-hidden">
                                      <button
                                        onClick={() => setSelectedUSDA(isSelected ? null : food)}
                                        className={cn(
                                          "w-full flex items-center justify-between rounded-lg px-2.5 py-2.5 transition-all text-left",
                                          isSelected
                                            ? "bg-cyan-500/20 ring-1 ring-cyan-500/50"
                                            : "bg-cyan-500/5 hover:bg-cyan-500/15 active:bg-cyan-500/25"
                                        )}
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <Plus className="w-3 h-3 text-cyan-500 shrink-0" />
                                          <div className="min-w-0">
                                            <span className="text-[11px] font-medium text-foreground block truncate">
                                              {formatUSDAName(food.name)}
                                            </span>
                                            {food.category && (
                                              <span className="text-[9px] text-muted-foreground block truncate">{food.category}</span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                                          <span className="font-mono font-bold text-primary">{food.carbs}c</span>
                                          <span className="font-mono font-bold text-orange-500">{food.protein}p</span>
                                        </div>
                                      </button>

                                      {/* Expanded: serving picker + log button */}
                                      {isSelected && (
                                        <div className="bg-cyan-500/10 px-3 py-2.5 space-y-2 animate-in slide-in-from-top-1 duration-150 border-t border-cyan-500/20">
                                          {/* Nutrition per 100g */}
                                          <div className="grid grid-cols-4 gap-1.5">
                                            <div className="text-center p-1 bg-muted/20 rounded">
                                              <span className="text-[10px] font-mono font-bold block">{food.calories}</span>
                                              <span className="text-[8px] text-muted-foreground">cal</span>
                                            </div>
                                            <div className="text-center p-1 bg-primary/10 rounded">
                                              <span className="text-[10px] font-mono font-bold text-primary block">{food.carbs}g</span>
                                              <span className="text-[8px] text-muted-foreground">carbs</span>
                                            </div>
                                            <div className="text-center p-1 bg-orange-500/10 rounded">
                                              <span className="text-[10px] font-mono font-bold text-orange-500 block">{food.protein}g</span>
                                              <span className="text-[8px] text-muted-foreground">protein</span>
                                            </div>
                                            <div className="text-center p-1 bg-yellow-500/10 rounded">
                                              <span className="text-[10px] font-mono font-bold text-yellow-500 block">{food.fat}g</span>
                                              <span className="text-[8px] text-muted-foreground">fat</span>
                                            </div>
                                          </div>

                                          {/* Wrestling tips */}
                                          {food.fiber > 3 && (
                                            <p className="text-[9px] text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">
                                              ⚠ High fiber ({food.fiber}g) — may cause bloating
                                            </p>
                                          )}
                                          {food.carbs > 50 && food.fiber < 2 && food.fat < 3 && (
                                            <p className="text-[9px] text-green-500 bg-green-500/10 px-2 py-1 rounded">
                                              ✓ Fast carbs, low fiber — great for recovery
                                            </p>
                                          )}

                                          {/* Serving size + log */}
                                          <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                              <label className="text-[8px] text-muted-foreground uppercase block mb-0.5">Serving (g)</label>
                                              <div className="flex items-center gap-1">
                                                <button
                                                  onClick={() => setUsdaServingGrams(String(Math.max(10, parseInt(usdaServingGrams) - 25)))}
                                                  className="w-7 h-7 rounded bg-muted/50 flex items-center justify-center hover:bg-muted active:scale-95"
                                                >
                                                  <Minus className="w-3 h-3" />
                                                </button>
                                                <Input
                                                  type="number"
                                                  value={usdaServingGrams}
                                                  onChange={(e) => setUsdaServingGrams(e.target.value)}
                                                  className="h-7 w-16 text-center text-sm font-mono"
                                                />
                                                <button
                                                  onClick={() => setUsdaServingGrams(String(parseInt(usdaServingGrams) + 25))}
                                                  className="w-7 h-7 rounded bg-muted/50 flex items-center justify-center hover:bg-muted active:scale-95"
                                                >
                                                  <Plus className="w-3 h-3" />
                                                </button>
                                              </div>
                                            </div>
                                            <div className="text-right text-[10px] min-w-[60px]">
                                              <div className="font-mono font-bold text-primary">
                                                {Math.round(food.carbs * parseInt(usdaServingGrams || '100') / 100)}g C
                                              </div>
                                              <div className="font-mono font-bold text-orange-500">
                                                {Math.round(food.protein * parseInt(usdaServingGrams || '100') / 100)}g P
                                              </div>
                                            </div>
                                            <button
                                              onClick={() => handleUSDAFoodAdd(food, parseInt(usdaServingGrams) || 100)}
                                              className="h-9 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-black font-bold text-[11px] flex items-center gap-1 active:scale-95 transition-transform shrink-0"
                                            >
                                              <Plus className="w-3.5 h-3.5" />
                                              Log
                                            </button>
                                          </div>

                                          {/* Quick serving presets */}
                                          <div className="flex gap-1.5 flex-wrap">
                                            {[50, 100, 150, 200, 250].map(g => (
                                              <button
                                                key={g}
                                                onClick={() => setUsdaServingGrams(String(g))}
                                                className={cn(
                                                  "px-2 py-1 rounded text-[9px] font-mono transition-colors",
                                                  parseInt(usdaServingGrams) === g
                                                    ? "bg-cyan-500 text-black font-bold"
                                                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                                                )}
                                              >
                                                {g}g
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ═══ MY FOODS VIEW ═══ */}
                {filterMode === 'my-foods' && (
                  <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Star className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-[10px] text-purple-500 uppercase font-bold">My Custom Foods</span>
                      </div>
                      {!showAddCustom && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowAddCustom(true)}
                          className="h-6 text-[10px] px-2 border-purple-500/30 text-purple-500 hover:bg-purple-500/10"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add Food
                        </Button>
                      )}
                    </div>

                    {/* Add Custom Food Form */}
                    {showAddCustom && (
                      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 space-y-2">
                        <Input
                          placeholder="Food name"
                          value={customFoodName}
                          onChange={(e) => setCustomFoodName(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[9px] text-muted-foreground block mb-1">Carbs (g)</label>
                            <Input
                              type="number"
                              placeholder="0"
                              value={customFoodCarbs}
                              onChange={(e) => setCustomFoodCarbs(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[9px] text-muted-foreground block mb-1">Protein (g)</label>
                            <Input
                              type="number"
                              placeholder="0"
                              value={customFoodProtein}
                              onChange={(e) => setCustomFoodProtein(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <Input
                          placeholder="Serving size (e.g., 1 cup)"
                          value={customFoodServing}
                          onChange={(e) => setCustomFoodServing(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleAddCustomFood}
                            disabled={!customFoodName || (!customFoodCarbs && !customFoodProtein)}
                            className="h-7 text-xs bg-purple-500 hover:bg-purple-600"
                          >
                            <Check className="w-3 h-3 mr-1" /> Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setShowAddCustom(false);
                              setCustomFoodName('');
                              setCustomFoodCarbs('');
                              setCustomFoodProtein('');
                              setCustomFoodServing('');
                            }}
                            className="h-7 text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Custom Foods List */}
                    {filteredCustom.length === 0 && !showAddCustom && (
                      <div className="text-center py-4 text-muted-foreground">
                        <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No custom foods yet</p>
                        <p className="text-[10px]">Add your favorite foods for quick logging</p>
                      </div>
                    )}
                    {filteredCustom.map((food) => {
                      const isJustAdded = lastAdded?.index === customFoods.indexOf(food) && lastAdded?.type === 'custom';
                      const hasCarbs = food.carbs > 0;
                      const hasProtein = food.protein > 0;

                      return (
                        <div
                          key={food.id}
                          className={cn(
                            "w-full flex items-center justify-between rounded px-2 py-2 transition-all",
                            isJustAdded
                              ? "bg-purple-500/30 ring-2 ring-purple-500"
                              : "bg-purple-500/5"
                          )}
                        >
                          <button
                            onClick={() => {
                              if (hasCarbs) {
                                handleFoodAdd(customFoods.indexOf(food), 'carbs', food.carbs, 'custom', food.name);
                              }
                              if (hasProtein) {
                                handleFoodAdd(customFoods.indexOf(food), 'protein', food.protein, 'custom', food.name);
                              }
                            }}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80"
                          >
                            {isJustAdded ? (
                              <Check className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            ) : (
                              <Plus className="w-3 h-3 text-purple-500 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="text-[11px] font-medium text-foreground truncate block">{food.name}</span>
                              <span className="text-[9px] text-muted-foreground">{food.serving}</span>
                            </div>
                          </button>
                          <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                            {hasCarbs && (
                              <span className="font-mono font-bold text-primary">+{food.carbs}c</span>
                            )}
                            {hasProtein && (
                              <span className="font-mono font-bold text-orange-500">+{food.protein}p</span>
                            )}
                            <button
                              onClick={() => handleDeleteCustomFood(food.id)}
                              className="p-2 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive min-w-[36px] min-h-[36px] flex items-center justify-center"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ═══ MY MEALS VIEW ═══ */}
                {filterMode === 'my-meals' && (
                  <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Utensils className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[10px] text-blue-500 uppercase font-bold">My Saved Meals</span>
                      </div>
                      {!showCreateMeal && (
                        <button
                          onClick={() => setShowCreateMeal(true)}
                          className="h-6 text-[10px] px-2 rounded border border-blue-500/30 text-blue-500 hover:bg-blue-500/10 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Create Meal
                        </button>
                      )}
                    </div>

                    {/* Create Meal Form */}
                    {showCreateMeal && (
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 space-y-2">
                        <Input
                          placeholder="Meal name (e.g., Pre-Practice Breakfast)"
                          value={mealName}
                          onChange={(e) => setMealName(e.target.value)}
                          className="h-8 text-sm"
                        />

                        {/* Items added to meal */}
                        {mealItems.length > 0 && (
                          <div className="space-y-1 p-2 bg-muted/30 rounded border border-muted">
                            <span className="text-[9px] text-muted-foreground uppercase font-bold">Items in meal:</span>
                            {mealItems.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[10px] p-1.5 bg-background rounded">
                                <span className="font-medium truncate">{item.name}</span>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  {item.carbs > 0 && <span className="font-mono text-primary">+{item.carbs}c</span>}
                                  {item.protein > 0 && <span className="font-mono text-orange-500">+{item.protein}p</span>}
                                  {item.liquidOz && <span className="font-mono text-cyan-500">+{item.liquidOz}oz</span>}
                                  <button onClick={() => handleRemoveMealItem(idx)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                            <div className="text-[9px] text-muted-foreground font-mono pt-1 border-t border-muted">
                              Total: {mealItems.reduce((s, i) => s + i.carbs, 0)}c / {mealItems.reduce((s, i) => s + i.protein, 0)}p
                              {mealItems.some(i => i.liquidOz) && ` / ${mealItems.reduce((s, i) => s + (i.liquidOz || 0), 0)}oz`}
                            </div>
                          </div>
                        )}

                        {/* Add item to meal */}
                        <div className="space-y-1.5 border-t border-blue-500/20 pt-2">
                          <span className="text-[9px] text-muted-foreground uppercase font-bold">Add item:</span>
                          <Input placeholder="Item name" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="h-7 text-sm" />
                          <div className="flex gap-1.5">
                            <div className="flex-1">
                              <Input type="number" placeholder="Carbs (g)" value={newItemCarbs} onChange={(e) => setNewItemCarbs(e.target.value)} className="h-7 text-[11px]" />
                            </div>
                            <div className="flex-1">
                              <Input type="number" placeholder="Protein (g)" value={newItemProtein} onChange={(e) => setNewItemProtein(e.target.value)} className="h-7 text-[11px]" />
                            </div>
                            <div className="flex-1">
                              <Input type="number" placeholder="Liquid (oz)" value={newItemLiquidOz} onChange={(e) => setNewItemLiquidOz(e.target.value)} className="h-7 text-[11px]" />
                            </div>
                          </div>
                          <button
                            onClick={handleAddItemToMeal}
                            disabled={!newItemName || (!newItemCarbs && !newItemProtein)}
                            className="w-full h-7 text-[11px] font-medium rounded bg-blue-500/80 hover:bg-blue-500 text-white disabled:opacity-40 flex items-center justify-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add to Meal
                          </button>
                        </div>

                        {/* Save / Cancel */}
                        <div className="flex gap-2 pt-1 border-t border-blue-500/20">
                          <button
                            onClick={handleSaveMeal}
                            disabled={!mealName || mealItems.length === 0}
                            className="flex-1 h-7 text-[11px] font-bold rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 flex items-center justify-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Save Meal
                          </button>
                          <button
                            onClick={() => { setShowCreateMeal(false); setMealName(''); setMealItems([]); setNewItemName(''); setNewItemCarbs(''); setNewItemProtein(''); setNewItemLiquidOz(''); }}
                            className="h-7 px-3 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Empty state */}
                    {filteredMeals.length === 0 && !showCreateMeal && (
                      <div className="text-center py-4 text-muted-foreground">
                        <Utensils className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No saved meals yet</p>
                        <p className="text-[10px]">Create meal combos for one-tap logging</p>
                      </div>
                    )}

                    {/* Meals list */}
                    {filteredMeals.map((meal) => {
                      const isJustAdded = lastAdded?.index === customMeals.indexOf(meal) && lastAdded?.type === 'meals';
                      return (
                        <div
                          key={meal.id}
                          className={cn(
                            "w-full rounded px-2 py-2 transition-all",
                            isJustAdded ? "bg-blue-500/30 ring-2 ring-blue-500" : "bg-blue-500/5 hover:bg-blue-500/10"
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <button onClick={() => handleMealAdd(meal)} className="flex-1 text-left active:opacity-70">
                              <div className="flex items-center gap-2 mb-0.5">
                                {isJustAdded ? <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" /> : <Plus className="w-3 h-3 text-blue-500 shrink-0" />}
                                <span className="text-[11px] font-bold text-foreground">{meal.name}</span>
                              </div>
                              <div className="pl-5 space-y-0.5">
                                {meal.items.map((item, idx) => (
                                  <div key={idx} className="text-[9px] text-muted-foreground">
                                    • {item.name}
                                    {item.carbs > 0 && <span className="ml-1 text-primary font-mono">{item.carbs}c</span>}
                                    {item.protein > 0 && <span className="ml-1 text-orange-500 font-mono">{item.protein}p</span>}
                                    {item.liquidOz && <span className="ml-1 text-cyan-500 font-mono">{item.liquidOz}oz</span>}
                                  </div>
                                ))}
                              </div>
                            </button>
                            <div className="flex items-center gap-2 ml-2 shrink-0">
                              <div className="text-right text-[10px]">
                                {meal.totalCarbs > 0 && <div className="font-mono font-bold text-primary">+{meal.totalCarbs}c</div>}
                                {meal.totalProtein > 0 && <div className="font-mono font-bold text-orange-500">+{meal.totalProtein}p</div>}
                                {meal.totalWater > 0 && <div className="font-mono font-bold text-cyan-500">+{meal.totalWater}oz</div>}
                              </div>
                              <button
                                onClick={() => handleDeleteMeal(meal.id)}
                                className="p-2 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive min-w-[36px] min-h-[36px] flex items-center justify-center"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Avoid Foods */}
                {todaysFoods.avoid.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-muted">
                    <span className="text-[10px] text-destructive uppercase font-bold">Avoid Today:</span>
                    <div className="space-y-1">
                      {todaysFoods.avoid.slice(0, 5).map((item, i) => (
                        <div key={i} className="flex items-center justify-between bg-destructive/5 rounded px-2 py-1">
                          <span className="text-[11px] font-medium text-destructive">{item.name}</span>
                          <span className="text-[9px] text-muted-foreground">{item.reason}</span>
                        </div>
                      ))}
                      {todaysFoods.avoid.length > 5 && (
                        <span className="text-[9px] text-muted-foreground">+{todaysFoods.avoid.length - 5} more...</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

      {/* Barcode Scanner Modal */}
      <BarcodeScanner
        open={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
      />
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
