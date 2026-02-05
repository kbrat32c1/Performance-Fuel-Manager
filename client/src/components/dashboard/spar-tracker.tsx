import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Salad,
  Plus,
  Check,
  Undo2,
  History,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Trash2,
  HelpCircle,
  Flame,
  Wheat,
  Apple,
  Droplets,
  Calculator,
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Egg,
  Lock,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useStore, type FoodLogEntry } from "@/lib/store";
import { SPAR_FOODS, type SparFood } from "@/lib/food-data";
import { SPAR_MACRO_PROTOCOLS, type SparMacroProtocol } from "@/lib/spar-calculator";

// ─── Types ───

type SliceCategory = 'protein' | 'carb' | 'veg' | 'fruit' | 'fat';

interface ProtocolRestrictions {
  /** Categories that are blocked (e.g., protein during fructose-only days) */
  blockedCategories: SliceCategory[];
  /** Warning message to show (e.g., "NO PROTEIN TODAY") */
  warning?: string;
  /** Warning detail (e.g., "Protein blocks fat burning. Stick to fructose-heavy carbs only.") */
  warningDetail?: string;
  /** Ratio label from the protocol (e.g., "Fructose Only (60:40)") */
  ratioLabel?: string;
}

interface SparTrackerProps {
  readOnly?: boolean;
  /** When true, renders without Card wrapper */
  embedded?: boolean;
  /** Protocol-based food restrictions */
  restrictions?: ProtocolRestrictions;
  /** Override food lists (used when Protocols 1-4 display Sugar Diet foods as slices). Partial allowed for v1 mode. */
  foodOverride?: Partial<Record<SliceCategory, SparFood[]>>;
  /** Override the header label (e.g., "Fuel (Slices)" instead of "SPAR Nutrition") */
  headerLabel?: string;
  /** Gram targets to show alongside slice counts (for Sugar Diet protocols) */
  gramTargets?: { carbs: { max: number }; protein: { max: number } };
}

// Category config
const CATEGORY_CONFIG: Record<SliceCategory, {
  label: string;
  shortLabel: string;
  unit: string;
  icon: typeof Flame;
  color: string;
  bgColor: string;
  bgHover: string;
  bgActive: string;
  bgRing: string;
  progressColor: string;
}> = {
  protein: {
    label: 'Protein',
    shortLabel: 'Pro',
    unit: 'palm',
    icon: Flame,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/5',
    bgHover: 'hover:bg-orange-500/15',
    bgActive: 'active:bg-orange-500/25',
    bgRing: 'bg-orange-500/30 ring-2 ring-orange-500',
    progressColor: 'bg-orange-500',
  },
  carb: {
    label: 'Complex Carbs',
    shortLabel: 'Carb',
    unit: 'fist',
    icon: Wheat,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/5',
    bgHover: 'hover:bg-amber-500/15',
    bgActive: 'active:bg-amber-500/25',
    bgRing: 'bg-amber-500/30 ring-2 ring-amber-500',
    progressColor: 'bg-amber-500',
  },
  veg: {
    label: 'Vegetables',
    shortLabel: 'Veg',
    unit: 'fist',
    icon: Salad,
    color: 'text-green-500',
    bgColor: 'bg-green-500/5',
    bgHover: 'hover:bg-green-500/15',
    bgActive: 'active:bg-green-500/25',
    bgRing: 'bg-green-500/30 ring-2 ring-green-500',
    progressColor: 'bg-green-500',
  },
  fruit: {
    label: 'Fruit',
    shortLabel: 'Fruit',
    unit: 'piece',
    icon: Apple,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/5',
    bgHover: 'hover:bg-pink-500/15',
    bgActive: 'active:bg-pink-500/25',
    bgRing: 'bg-pink-500/30 ring-2 ring-pink-500',
    progressColor: 'bg-pink-500',
  },
  fat: {
    label: 'Healthy Fats',
    shortLabel: 'Fat',
    unit: 'thumb',
    icon: Egg,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-600/5',
    bgHover: 'hover:bg-yellow-600/15',
    bgActive: 'active:bg-yellow-600/25',
    bgRing: 'bg-yellow-600/30 ring-2 ring-yellow-600',
    progressColor: 'bg-yellow-600',
  },
};

// Number of items to show before "See all"
const PREVIEW_COUNT = 6;

// ─── Food Item Button ───

function SparFoodRow({
  food,
  category,
  isJustAdded,
  onAdd,
}: {
  food: SparFood;
  category: SliceCategory;
  isJustAdded: boolean;
  onAdd: () => void;
}) {
  const config = CATEGORY_CONFIG[category];

  return (
    <button
      onClick={onAdd}
      className={cn(
        "w-full flex items-center justify-between rounded-lg px-2.5 py-2.5 transition-all text-left",
        isJustAdded ? config.bgRing : `${config.bgColor} ${config.bgHover} ${config.bgActive}`
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isJustAdded ? (
          <Check className={cn("w-3.5 h-3.5 shrink-0", config.color)} />
        ) : (
          <span className="text-sm shrink-0">{food.icon}</span>
        )}
        <span className="text-[11px] font-medium text-foreground truncate">{food.name}</span>
        {food.oz && (
          <span className="text-[9px] text-cyan-500 font-bold flex items-center gap-0.5">
            <Droplets className="w-2.5 h-2.5" />+{food.oz}oz
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
        <span className="text-muted-foreground">{food.serving}</span>
        <span className={cn("font-mono font-bold", config.color)}>+1</span>
      </div>
    </button>
  );
}

// ─── Why Explanation ───

function WhyExplanation({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left">
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

// ─── Your Stats Section ───

function YourStatsSection({
  bmr,
  tdee,
  targetCalories,
  activityLevel,
  calorieAdjustment,
}: {
  bmr: number;
  tdee: number;
  targetCalories: number;
  activityLevel?: string;
  calorieAdjustment?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const activityLabels: Record<string, string> = {
    'sedentary': 'Sedentary',
    'light': 'Light (1-3x/wk)',
    'moderate': 'Moderate (3-5x/wk)',
    'active': 'Active (6-7x/wk)',
    'very-active': 'Very Active (2x/day)',
  };

  // Determine goal info from calorie adjustment
  const adjustment = calorieAdjustment || 0;
  const goalLabel = adjustment > 0 ? 'Building' : adjustment < 0 ? 'Cutting' : 'Maintaining';
  const GoalIcon = adjustment > 0 ? TrendingUp : adjustment < 0 ? TrendingDown : Target;
  const goalColor = adjustment > 0 ? 'text-green-500' : adjustment < 0 ? 'text-orange-500' : 'text-blue-500';

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Calculator className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase">Your Stats</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="space-y-2 p-2.5 bg-muted/20 rounded-lg border border-muted/50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Goal indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <GoalIcon className={cn("w-3.5 h-3.5", goalColor)} />
              <span className={cn("text-xs font-bold", goalColor)}>{goalLabel}</span>
            </div>
            {activityLevel && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Activity className="w-3 h-3" />
                <span className="text-[10px]">{activityLabels[activityLevel] || activityLevel}</span>
              </div>
            )}
          </div>

          {/* Calorie breakdown */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">BMR (Base Metabolic Rate)</span>
              <span className="font-mono font-medium">{bmr} cal</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">× Activity Level</span>
              <span className="font-mono font-medium">= {tdee} cal</span>
            </div>
            {adjustment !== 0 && (
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">{adjustment > 0 ? '+ Surplus' : '− Deficit'}</span>
                <span className={cn("font-mono font-medium", goalColor)}>
                  {adjustment > 0 ? '+' : ''}{adjustment} cal
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs pt-1 border-t border-muted/30">
              <span className="font-medium">Daily Target</span>
              <span className="font-mono font-bold text-primary">{targetCalories} cal</span>
            </div>
          </div>

          {/* Quick explanation */}
          <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
            Your targets are calculated using the Mifflin-St Jeor equation, adjusted for your activity level and protocol.
            {adjustment < 0 && ` A ${Math.abs(adjustment)} cal deficit = ~${Math.abs(adjustment) / 500} lb/week loss.`}
            {adjustment > 0 && ` A ${adjustment} cal surplus supports lean muscle gain.`}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main SPAR Tracker Component ───

export function SparTracker({ readOnly = false, embedded = false, restrictions, foodOverride, headerLabel, gramTargets }: SparTrackerProps) {
  const { getDailyTracking, updateDailyTracking, profile, getSliceTargets } = useStore();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);

  // Get calculated slice targets from store
  const targets = getSliceTargets();

  // Protocol restrictions
  const blockedCategories = restrictions?.blockedCategories ?? [];
  const isCategoryBlocked = (cat: SliceCategory) => blockedCategories.includes(cat);

  // UI state — default to first non-blocked category
  const defaultCategory = (['protein', 'carb', 'veg'] as SliceCategory[]).find(c => !blockedCategories.includes(c)) || 'carb';
  const [activeCategory, setActiveCategory] = useState<SliceCategory>(defaultCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [showCustomFood, setShowCustomFood] = useState(false);
  const [showCustomMeal, setShowCustomMeal] = useState(false);

  // Water added toast
  const [waterToast, setWaterToast] = useState<string | null>(null);
  const waterToastTimeout = useRef<NodeJS.Timeout | null>(null);

  // Custom food form
  const [customName, setCustomName] = useState('');
  const [customServing, setCustomServing] = useState('');
  const [customCalories, setCustomCalories] = useState('');
  const [customCategory, setCustomCategory] = useState<SliceCategory>('protein');

  // Custom meals form
  const [mealName, setMealName] = useState('');
  const [mealItems, setMealItems] = useState<Array<{ name: string; category: SliceCategory; slices: number }>>([]);
  const [newMealItemName, setNewMealItemName] = useState('');
  const [newMealItemCategory, setNewMealItemCategory] = useState<SliceCategory>('protein');
  const [newMealItemSlices, setNewMealItemSlices] = useState('1');

  // Custom foods — persisted to localStorage
  const customFoodsKey = 'pwm-spar-custom-foods';
  const [customFoods, setCustomFoods] = useState<Array<{
    id: string;
    name: string;
    serving: string;
    calories: number;
    category: SliceCategory;
    icon: string;
  }>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(customFoodsKey);
      if (saved) { try { return JSON.parse(saved); } catch (e) { console.warn('Failed to parse custom foods:', e); return []; } }
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(customFoodsKey, JSON.stringify(customFoods));
    }
  }, [customFoods]);

  // Custom meals — persisted to localStorage
  interface SparMeal {
    id: string;
    name: string;
    items: Array<{ name: string; category: SliceCategory; slices: number }>;
    totalProtein: number;
    totalCarb: number;
    totalVeg: number;
    totalFruit: number;
    totalFat: number;
  }

  const customMealsKey = 'pwm-spar-custom-meals';
  const [customMeals, setCustomMeals] = useState<SparMeal[]>(() => {
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

  // Recent foods — track last 5 per category for smart sorting
  const recentFoodsKey = 'pwm-spar-recent-foods';
  const [recentFoods, setRecentFoods] = useState<Record<string, string[]>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(recentFoodsKey);
      if (saved) { try { return JSON.parse(saved); } catch (e) { console.warn('Failed to parse recent foods:', e); return {}; } }
    }
    return {};
  });

  const trackRecentFood = useCallback((foodName: string, category: SliceCategory) => {
    setRecentFoods(prev => {
      const key = category;
      const existing = prev[key] || [];
      const updated = [foodName, ...existing.filter(n => n !== foodName)].slice(0, 5);
      const next = { ...prev, [key]: updated };
      if (typeof window !== 'undefined') {
        localStorage.setItem(recentFoodsKey, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  // Visual feedback for adding
  const [lastAdded, setLastAdded] = useState<{ foodName: string; category: SliceCategory } | null>(null);
  const lastAddedTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (lastAdded) {
      if (lastAddedTimeout.current) clearTimeout(lastAddedTimeout.current);
      lastAddedTimeout.current = setTimeout(() => setLastAdded(null), 1200);
    }
    return () => {
      if (lastAddedTimeout.current) clearTimeout(lastAddedTimeout.current);
    };
  }, [lastAdded]);

  // Food history — persisted to localStorage per day
  const foodHistoryKey = `pwm-spar-history-${dateKey}`;
  const [foodHistory, setFoodHistory] = useState<FoodLogEntry[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(foodHistoryKey);
      if (saved) {
        try {
          setFoodHistory(JSON.parse(saved));
        } catch (e) {
          console.warn('Failed to parse food history:', e);
          setFoodHistory([]);
        }
      } else {
        setFoodHistory([]);
      }
    }
  }, [foodHistoryKey]);

  // Persist food history
  useEffect(() => {
    if (typeof window !== 'undefined' && foodHistory.length > 0) {
      localStorage.setItem(foodHistoryKey, JSON.stringify(foodHistory));
    }
  }, [foodHistory, foodHistoryKey]);

  // ─── Handlers ───

  const handleAddSlice = useCallback((food: SparFood, category: SliceCategory) => {
    // Block restricted categories
    if (blockedCategories.includes(category)) return;
    const sliceKey = category === 'protein' ? 'proteinSlices'
      : category === 'carb' ? 'carbSlices'
      : category === 'veg' ? 'vegSlices'
      : category === 'fruit' ? 'fruitSlices'
      : 'fatSlices';
    const currentVal = category === 'protein' ? tracking.proteinSlices
      : category === 'carb' ? tracking.carbSlices
      : category === 'veg' ? tracking.vegSlices
      : category === 'fruit' ? (tracking.fruitSlices || 0)
      : (tracking.fatSlices || 0);

    // Gram equivalent for cross-sync
    const gramAmount = category === 'protein' ? (food.protein || 25) : category === 'carb' ? (food.carbs || 30) : 0;
    const gramKey = category === 'protein' ? 'proteinConsumed' : category === 'carb' ? 'carbsConsumed' : null;

    const updates: Record<string, any> = {
      [sliceKey]: currentVal + 1,
      nutritionMode: 'spar',
    };

    // Cross-sync: also update gram totals so switching modes stays consistent
    if (gramKey) {
      const currentGrams = gramKey === 'proteinConsumed' ? tracking.proteinConsumed : tracking.carbsConsumed;
      updates[gramKey] = currentGrams + gramAmount;
    }

    // If this is a liquid food, also add to water intake
    if (food.oz && food.oz > 0) {
      updates.waterConsumed = tracking.waterConsumed + food.oz;
      // Show water toast
      setWaterToast(`${food.name}: +1 slice +${food.oz}oz water`);
      if (waterToastTimeout.current) clearTimeout(waterToastTimeout.current);
      waterToastTimeout.current = setTimeout(() => setWaterToast(null), 2500);
    }

    updateDailyTracking(dateKey, updates);
    setLastAdded({ foodName: food.name, category });
    trackRecentFood(food.name, category);

    // Add to history (include gram amount for undo cross-sync)
    const entry: FoodLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: food.name,
      timestamp: new Date().toISOString(),
      mode: 'spar',
      sliceType: category,
      sliceCount: 1,
      liquidOz: food.oz || undefined,
      gramAmount: gramAmount || undefined,
    };
    setFoodHistory(prev => [...prev, entry]);
  }, [dateKey, tracking, updateDailyTracking, trackRecentFood]);

  const handleAddMeal = useCallback((meal: SparMeal) => {
    // Update slice counts + cross-sync grams
    const updates: Record<string, any> = { nutritionMode: 'spar' };
    if (meal.totalProtein > 0) {
      updates.proteinSlices = tracking.proteinSlices + meal.totalProtein;
      updates.proteinConsumed = tracking.proteinConsumed + (meal.totalProtein * 25);
    }
    if (meal.totalCarb > 0) {
      updates.carbSlices = tracking.carbSlices + meal.totalCarb;
      updates.carbsConsumed = tracking.carbsConsumed + (meal.totalCarb * 30);
    }
    if (meal.totalVeg > 0) updates.vegSlices = tracking.vegSlices + meal.totalVeg;
    if ((meal.totalFruit || 0) > 0) updates.fruitSlices = (tracking.fruitSlices || 0) + meal.totalFruit;
    if ((meal.totalFat || 0) > 0) updates.fatSlices = (tracking.fatSlices || 0) + meal.totalFat;

    updateDailyTracking(dateKey, updates);
    setLastAdded({ foodName: meal.name, category: 'protein' });

    // Log each item
    meal.items.forEach((item, idx) => {
      const entry: FoodLogEntry = {
        id: `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        name: `${meal.name} — ${item.name}`,
        timestamp: new Date(Date.now() + idx).toISOString(),
        mode: 'spar',
        sliceType: item.category,
        sliceCount: item.slices,
      };
      setFoodHistory(prev => [...prev, entry]);
    });
  }, [dateKey, tracking, updateDailyTracking]);

  const handleUndo = useCallback(() => {
    if (foodHistory.length === 0) return;

    const lastEntry = foodHistory[foodHistory.length - 1];
    const sliceCount = lastEntry.sliceCount || 1;
    const updates: Record<string, any> = {};

    if (lastEntry.sliceType) {
      const sliceKey = lastEntry.sliceType === 'protein' ? 'proteinSlices'
        : lastEntry.sliceType === 'carb' ? 'carbSlices'
        : lastEntry.sliceType === 'veg' ? 'vegSlices'
        : lastEntry.sliceType === 'fruit' ? 'fruitSlices'
        : 'fatSlices';
      const current = lastEntry.sliceType === 'protein' ? tracking.proteinSlices
        : lastEntry.sliceType === 'carb' ? tracking.carbSlices
        : lastEntry.sliceType === 'veg' ? tracking.vegSlices
        : lastEntry.sliceType === 'fruit' ? (tracking.fruitSlices || 0)
        : (tracking.fatSlices || 0);

      updates[sliceKey] = Math.max(0, current - sliceCount);

      // Cross-sync: also undo gram equivalent
      const gramAmount = lastEntry.gramAmount || (lastEntry.sliceType === 'protein' ? 25 : lastEntry.sliceType === 'carb' ? 30 : 0);
      if (gramAmount > 0 && lastEntry.sliceType !== 'veg') {
        const gramKey = lastEntry.sliceType === 'protein' ? 'proteinConsumed' : 'carbsConsumed';
        const currentGrams = gramKey === 'proteinConsumed' ? tracking.proteinConsumed : tracking.carbsConsumed;
        updates[gramKey] = Math.max(0, currentGrams - (gramAmount * sliceCount));
      }
    }

    // Also undo water if it was a liquid
    if (lastEntry.liquidOz && lastEntry.liquidOz > 0) {
      updates.waterConsumed = Math.max(0, tracking.waterConsumed - lastEntry.liquidOz);
    }

    updateDailyTracking(dateKey, updates);
    setFoodHistory(prev => prev.slice(0, -1));
  }, [foodHistory, tracking, dateKey, updateDailyTracking]);

  const handleReset = useCallback(() => {
    updateDailyTracking(dateKey, {
      proteinSlices: 0,
      carbSlices: 0,
      vegSlices: 0,
      fruitSlices: 0,
      fatSlices: 0,
      proteinConsumed: 0,
      carbsConsumed: 0,
    });
    setFoodHistory([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(foodHistoryKey);
    }
    setConfirmingReset(false);
    setShowHistory(false);
  }, [dateKey, updateDailyTracking, foodHistoryKey]);

  // Quick +/- for manual adjustments
  const handleQuickAdjust = useCallback((category: SliceCategory, delta: number) => {
    // Block adding to restricted categories (allow decrement for corrections)
    if (delta > 0 && blockedCategories.includes(category)) return;
    const sliceKey = category === 'protein' ? 'proteinSlices'
      : category === 'carb' ? 'carbSlices'
      : category === 'veg' ? 'vegSlices'
      : category === 'fruit' ? 'fruitSlices'
      : 'fatSlices';
    const current = category === 'protein' ? tracking.proteinSlices
      : category === 'carb' ? tracking.carbSlices
      : category === 'veg' ? tracking.vegSlices
      : category === 'fruit' ? (tracking.fruitSlices || 0)
      : (tracking.fatSlices || 0);
    const newVal = Math.max(0, current + delta);

    const updates: Record<string, any> = { [sliceKey]: newVal, nutritionMode: 'spar' };

    // Cross-sync: also update gram totals
    if (category === 'protein') {
      updates.proteinConsumed = Math.max(0, tracking.proteinConsumed + (delta * 25));
    } else if (category === 'carb') {
      updates.carbsConsumed = Math.max(0, tracking.carbsConsumed + (delta * 30));
    }

    updateDailyTracking(dateKey, updates);

    if (delta > 0) {
      // Adding: create a new log entry
      const entry: FoodLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: `Quick add ${CATEGORY_CONFIG[category].shortLabel}`,
        timestamp: new Date().toISOString(),
        mode: 'spar',
        sliceType: category,
        sliceCount: delta,
      };
      setFoodHistory(prev => [...prev, entry]);
    } else if (delta < 0) {
      // Subtracting: remove the most recent entry for this category from the log
      setFoodHistory(prev => {
        // Find the last entry of this category
        const lastIndex = [...prev].reverse().findIndex(e => e.sliceType === category);
        if (lastIndex === -1) return prev;
        const actualIndex = prev.length - 1 - lastIndex;
        return [...prev.slice(0, actualIndex), ...prev.slice(actualIndex + 1)];
      });
    }
  }, [dateKey, tracking, updateDailyTracking, blockedCategories]);

  // Custom food handlers
  const handleAddCustomFood = () => {
    if (!customName) return;
    const categoryIcons: Record<SliceCategory, string> = {
      protein: '🥩',
      carb: '🍚',
      veg: '🥗',
      fruit: '🍎',
      fat: '🥜',
    };
    const newFood = {
      id: `spar-custom-${Date.now()}`,
      name: customName,
      serving: customServing || '1 serving',
      calories: parseInt(customCalories) || 0,
      category: customCategory,
      icon: categoryIcons[customCategory],
    };
    setCustomFoods(prev => [...prev, newFood]);
    setCustomName('');
    setCustomServing('');
    setCustomCalories('');
    setShowCustomFood(false);
  };

  const handleSaveMeal = () => {
    if (!mealName || mealItems.length === 0) return;
    const newMeal: SparMeal = {
      id: `spar-meal-${Date.now()}`,
      name: mealName,
      items: mealItems,
      totalProtein: mealItems.filter(i => i.category === 'protein').reduce((s, i) => s + i.slices, 0),
      totalCarb: mealItems.filter(i => i.category === 'carb').reduce((s, i) => s + i.slices, 0),
      totalVeg: mealItems.filter(i => i.category === 'veg').reduce((s, i) => s + i.slices, 0),
      totalFruit: mealItems.filter(i => i.category === 'fruit').reduce((s, i) => s + i.slices, 0),
      totalFat: mealItems.filter(i => i.category === 'fat').reduce((s, i) => s + i.slices, 0),
    };
    setCustomMeals(prev => [...prev, newMeal]);
    setMealName('');
    setMealItems([]);
    setShowCustomMeal(false);
  };

  // ─── Filtered food lists with recent foods at top ───

  const filterFoods = <T extends { name: string }>(foods: T[]): T[] => {
    if (!searchQuery) return foods;
    const q = searchQuery.toLowerCase();
    return foods.filter(f => f.name.toLowerCase().includes(q));
  };

  const activeFoods = useMemo(() => {
    const builtIn = foodOverride?.[activeCategory] ?? SPAR_FOODS[activeCategory as keyof typeof SPAR_FOODS] ?? [];
    const custom = customFoods.filter(f => f.category === activeCategory).map(f => ({
      name: f.name,
      serving: f.serving,
      calories: f.calories,
      icon: f.icon,
    } as SparFood));
    const allFoods = filterFoods([...builtIn, ...custom]);

    // Sort: recent foods first
    const recent = recentFoods[activeCategory] || [];
    if (recent.length === 0 || searchQuery) return allFoods;

    const recentSet = new Set(recent);
    const recentItems = allFoods.filter(f => recentSet.has(f.name));
    const otherItems = allFoods.filter(f => !recentSet.has(f.name));

    // Sort recent items by recency order
    recentItems.sort((a, b) => recent.indexOf(a.name) - recent.indexOf(b.name));

    return [...recentItems, ...otherItems];
  }, [activeCategory, customFoods, searchQuery, foodOverride, recentFoods]);

  const filteredMeals = useMemo(() => {
    if (!searchQuery) return customMeals;
    const q = searchQuery.toLowerCase();
    return customMeals.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.items.some(i => i.name.toLowerCase().includes(q))
    );
  }, [customMeals, searchQuery]);

  // ─── Progress calculations ───

  // Check if v2 mode (has fruit and fat targets)
  const isV2 = targets.isV2 || (targets.fruit > 0 || targets.fat > 0);

  const proteinDone = tracking.proteinSlices >= targets.protein;
  const carbDone = tracking.carbSlices >= targets.carb;
  const vegDone = tracking.vegSlices >= targets.veg;
  const fruitDone = (tracking.fruitSlices || 0) >= targets.fruit;
  const fatDone = (tracking.fatSlices || 0) >= targets.fat;

  // For v2, all 5 categories must be done; for v1, just the 3
  const allDone = isV2
    ? proteinDone && carbDone && vegDone && fruitDone && fatDone
    : proteinDone && carbDone && vegDone;

  const totalSlices = tracking.proteinSlices + tracking.carbSlices + tracking.vegSlices
    + (isV2 ? (tracking.fruitSlices || 0) + (tracking.fatSlices || 0) : 0);
  const totalTarget = targets.protein + targets.carb + targets.veg
    + (isV2 ? targets.fruit + targets.fat : 0);
  const overallProgress = totalTarget > 0 ? Math.min(100, Math.round((totalSlices / totalTarget) * 100)) : 0;

  // Category done map for tab indicators
  const categoryDone: Record<SliceCategory, boolean> = {
    protein: proteinDone,
    carb: carbDone,
    veg: vegDone,
    fruit: fruitDone,
    fat: fatDone,
  };

  // ─── Render ───

  const content = (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Salad className={cn("w-4 h-4", allDone ? "text-green-500" : "text-primary")} />
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{headerLabel || 'SPAR Nutrition'}</span>
          {/* Show macro protocol badge for Protocol 5 users */}
          {targets.macroProtocol && (
            <span className={cn(
              "text-[8px] font-bold px-1.5 py-0.5 rounded",
              targets.macroProtocol === 'performance' ? "bg-yellow-500/15 text-yellow-500" :
              targets.macroProtocol === 'build' ? "bg-green-500/15 text-green-500" :
              targets.macroProtocol === 'maintenance' ? "bg-blue-500/15 text-blue-500" :
              targets.macroProtocol === 'recomp' ? "bg-green-500/15 text-green-500" :
              "bg-orange-500/15 text-orange-500"
            )}>
              {SPAR_MACRO_PROTOCOLS[targets.macroProtocol as SparMacroProtocol]?.shortName}
            </span>
          )}
          {allDone && (
            <span className="text-[9px] font-bold bg-green-500/15 text-green-500 px-1.5 py-0.5 rounded">ALL DONE ✓</span>
          )}
        </div>
      </div>

      {/* ── Macro Progress Rings ── */}
      {!readOnly && (
        <div className={cn("flex items-center justify-center gap-3 py-2", isV2 ? "" : "")}>
          {([
            { cat: 'protein' as SliceCategory, consumed: tracking.proteinSlices, target: targets.protein, color: 'stroke-orange-500', bg: 'stroke-orange-500/20' },
            { cat: 'carb' as SliceCategory, consumed: tracking.carbSlices, target: targets.carb, color: 'stroke-amber-500', bg: 'stroke-amber-500/20' },
            { cat: 'veg' as SliceCategory, consumed: tracking.vegSlices, target: targets.veg, color: 'stroke-green-500', bg: 'stroke-green-500/20' },
            ...(isV2 ? [
              { cat: 'fruit' as SliceCategory, consumed: tracking.fruitSlices || 0, target: targets.fruit, color: 'stroke-pink-500', bg: 'stroke-pink-500/20' },
              { cat: 'fat' as SliceCategory, consumed: tracking.fatSlices || 0, target: targets.fat, color: 'stroke-yellow-600', bg: 'stroke-yellow-600/20' },
            ] : []),
          ]).filter(({ target }) => target > 0).map(({ cat, consumed, target, color, bg }) => {
            const config = CATEGORY_CONFIG[cat];
            const blocked = isCategoryBlocked(cat);
            const progress = blocked ? 0 : Math.min(100, (consumed / target) * 100);
            const done = !blocked && consumed >= target;
            const circumference = 2 * Math.PI * 18; // radius = 18
            const strokeDashoffset = circumference - (progress / 100) * circumference;
            // Build tooltip message for blocked categories
            const blockedReason = blocked
              ? restrictions?.warningDetail || `${config.label} is restricted today based on your protocol.`
              : null;

            const circleContent = (
              <div className={cn("flex flex-col items-center gap-0.5", blocked && "opacity-40")}>
                <div className="relative w-11 h-11">
                  <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
                    {/* Background circle */}
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      strokeWidth="4"
                      className={blocked ? "stroke-muted-foreground/20" : bg}
                    />
                    {/* Progress circle - hidden when blocked */}
                    {!blocked && (
                      <circle
                        cx="22"
                        cy="22"
                        r="18"
                        fill="none"
                        strokeWidth="4"
                        strokeLinecap="round"
                        className={done ? "stroke-green-500" : color}
                        style={{
                          strokeDasharray: circumference,
                          strokeDashoffset: strokeDashoffset,
                          transition: 'stroke-dashoffset 0.3s ease-out',
                        }}
                      />
                    )}
                  </svg>
                  {/* Center content - lock icon when blocked, otherwise count */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    {blocked ? (
                      <Lock className="w-4 h-4 text-muted-foreground/50" />
                    ) : (
                      <span className={cn(
                        "text-[10px] font-bold font-mono",
                        done ? "text-green-500" : "text-foreground"
                      )}>
                        {consumed}/{target}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <span className={cn(
                    "text-[8px] font-bold uppercase",
                    blocked ? "text-muted-foreground/50" : done ? "text-green-500" : config.color
                  )}>
                    {config.shortLabel}
                  </span>
                  {blocked && <Info className="w-2.5 h-2.5 text-muted-foreground/50" />}
                </div>
              </div>
            );

            // Wrap blocked categories in tooltip
            return blocked ? (
              <TooltipProvider key={cat} delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {circleContent}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-center bg-card border border-muted text-foreground">
                    <p className="font-bold text-orange-500 mb-1">{config.label} Restricted</p>
                    <p className="text-xs text-muted-foreground">{blockedReason}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <div key={cat}>{circleContent}</div>
            );
          })}
        </div>
      )}

      {/* Protocol restriction warning - removed to avoid duplication with FocusCard */}
      {/* Restriction messaging is now consolidated in the FocusCard "coach" section above */}

      {/* Water toast notification */}
      {waterToast && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-2.5 py-1.5 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <Droplets className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
          <p className="text-[10px] font-medium text-cyan-500">{waterToast}</p>
        </div>
      )}

      {/* ── Compact Progress Strip — tappable quick-add/subtract ── */}
      {!readOnly && (
        <div className={cn("grid gap-1.5", isV2 ? "grid-cols-5" : "grid-cols-3")}>
          {([
            { cat: 'protein' as SliceCategory, consumed: tracking.proteinSlices, target: targets.protein },
            { cat: 'carb' as SliceCategory, consumed: tracking.carbSlices, target: targets.carb },
            { cat: 'veg' as SliceCategory, consumed: tracking.vegSlices, target: targets.veg },
            ...(isV2 ? [
              { cat: 'fruit' as SliceCategory, consumed: tracking.fruitSlices || 0, target: targets.fruit },
              { cat: 'fat' as SliceCategory, consumed: tracking.fatSlices || 0, target: targets.fat },
            ] : []),
          ]).map(({ cat, consumed, target }) => {
            const config = CATEGORY_CONFIG[cat];
            const blocked = isCategoryBlocked(cat);
            const done = consumed >= target && target > 0;
            const isOver = consumed > target;
            if (blocked) {
              return (
                <div key={cat} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/10 opacity-30">
                  <span className="text-[9px] text-muted-foreground line-through">{config.shortLabel}</span>
                  <span className="text-[9px]">🚫</span>
                </div>
              );
            }
            if (target === 0) return null;
            return (
              <div
                key={cat}
                className={cn(
                  "flex-1 flex flex-col items-center rounded-lg border transition-all py-1.5",
                  done
                    ? "bg-green-500/10 border-green-500/30"
                    : `${config.bgColor} border-muted`
                )}
              >
                {/* Category label + count */}
                <div className="flex items-center gap-1 mb-1">
                  <config.icon className={cn("w-3 h-3", done ? "text-green-500" : config.color)} />
                  <span className={cn(
                    "text-[10px] font-mono font-bold",
                    isOver ? "text-amber-500" : done ? "text-green-500" : "text-foreground"
                  )}>
                    {consumed}<span className="text-muted-foreground font-normal">/{target}</span>
                  </span>
                </div>
                {/* +/- buttons - min 44px touch targets for mobile */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleQuickAdjust(cat, -1); }}
                    disabled={consumed === 0}
                    className={cn(
                      "w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-base font-bold transition-all active:scale-95",
                      consumed === 0
                        ? "bg-muted/30 text-muted-foreground/30 cursor-not-allowed"
                        : "bg-muted/50 text-foreground hover:bg-muted active:bg-muted/80"
                    )}
                  >
                    −
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleQuickAdjust(cat, 1); }}
                    className={cn(
                      "w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-base font-bold transition-all active:scale-95",
                      done
                        ? "bg-green-500/20 text-green-600 hover:bg-green-500/30"
                        : `${config.bgColor} ${config.color} hover:bg-opacity-20 active:bg-opacity-30`
                    )}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Read-only progress strip (no buttons) */}
      {readOnly && (
        <div className={cn("grid gap-1.5", isV2 ? "grid-cols-5" : "grid-cols-3")}>
          {([
            { cat: 'protein' as SliceCategory, consumed: tracking.proteinSlices, target: targets.protein },
            { cat: 'carb' as SliceCategory, consumed: tracking.carbSlices, target: targets.carb },
            { cat: 'veg' as SliceCategory, consumed: tracking.vegSlices, target: targets.veg },
            ...(isV2 ? [
              { cat: 'fruit' as SliceCategory, consumed: tracking.fruitSlices || 0, target: targets.fruit },
              { cat: 'fat' as SliceCategory, consumed: tracking.fatSlices || 0, target: targets.fat },
            ] : []),
          ]).map(({ cat, consumed, target }) => {
            const config = CATEGORY_CONFIG[cat];
            const blocked = isCategoryBlocked(cat);
            const done = consumed >= target && target > 0;
            const isOver = consumed > target;
            if (blocked || target === 0) return null;
            return (
              <div key={cat} className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg",
                done ? "bg-green-500/10" : config.bgColor
              )}>
                <config.icon className={cn("w-3.5 h-3.5", done ? "text-green-500" : config.color)} />
                <span className={cn(
                  "text-xs font-mono font-bold",
                  isOver ? "text-amber-500" : done ? "text-green-500" : "text-foreground"
                )}>
                  {consumed}<span className="text-muted-foreground font-normal">/{target}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Food Reference / Log Section ── */}
      {!readOnly && (
        <div className="space-y-3">
          {/* Category tabs with done indicators */}
          <div className={cn("grid gap-1", isV2 ? "grid-cols-5" : "grid-cols-3")}>
            {([
              'protein', 'carb', 'veg',
              ...(isV2 ? ['fruit', 'fat'] : [])
            ] as SliceCategory[]).map(cat => {
              const config = CATEGORY_CONFIG[cat];
              const isActive = activeCategory === cat;
              const blocked = isCategoryBlocked(cat);
              const done = categoryDone[cat];
              const blockedReason = blocked
                ? restrictions?.warningDetail || `${config.label} is restricted today based on your protocol.`
                : null;

              const buttonContent = (
                <button
                  onClick={() => { if (!blocked) { setActiveCategory(cat); } }}
                  className={cn(
                    "flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1",
                    blocked
                      ? "bg-muted/10 text-muted-foreground/30 line-through cursor-not-allowed"
                      : done
                        ? isActive
                          ? "bg-primary/15 text-primary ring-1 ring-primary"
                          : "bg-primary/10 text-primary"
                        : isActive
                          ? `${config.bgColor} ${config.color} ring-1 ring-current`
                          : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {done && !blocked && <Check className="w-3 h-3" />}
                  {blocked && <Lock className="w-3 h-3" />}
                  {config.shortLabel}
                </button>
              );

              return blocked ? (
                <TooltipProvider key={cat} delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {buttonContent}
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] bg-card border border-muted text-foreground">
                      <p className="font-bold text-orange-500">{restrictions?.warning || `No ${config.label}`}</p>
                      <p className="text-xs text-muted-foreground">{blockedReason}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <div key={cat}>{buttonContent}</div>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder={`Search ${CATEGORY_CONFIG[activeCategory].label.toLowerCase()} foods...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs bg-muted/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Recent foods label */}
          {!searchQuery && (recentFoods[activeCategory] || []).length > 0 && activeFoods.length > 0 && (
            <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground/60">Recent first</span>
          )}

          {/* Food grid — scrollable container */}
          <div className="max-h-[280px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
            {activeFoods.map((food, i) => (
              <SparFoodRow
                key={food.name + i}
                food={food}
                category={activeCategory}
                isJustAdded={lastAdded?.foodName === food.name && lastAdded?.category === activeCategory}
                onAdd={() => handleAddSlice(food, activeCategory)}
              />
            ))}

            {activeFoods.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                {searchQuery ? 'No foods match your search' : 'No foods available'}
              </p>
            )}
          </div>

          {/* Custom Meals Section */}
          {filteredMeals.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">My Meals</span>
              {filteredMeals.map(meal => {
                const isJustAdded = lastAdded?.foodName === meal.name;
                return (
                  <div key={meal.id} className="flex items-center gap-1">
                    <button
                      onClick={() => handleAddMeal(meal)}
                      className={cn(
                        "flex-1 flex items-center justify-between rounded-lg px-2.5 py-2 transition-all text-left",
                        isJustAdded
                          ? "bg-blue-500/30 ring-2 ring-blue-500"
                          : "bg-blue-500/5 hover:bg-blue-500/15 active:bg-blue-500/25"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isJustAdded ? (
                          <Check className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                        ) : (
                          <span className="text-sm shrink-0">🍽️</span>
                        )}
                        <span className="text-[11px] font-medium text-foreground truncate">{meal.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] shrink-0 ml-2">
                        {meal.totalProtein > 0 && <span className="text-orange-500 font-mono font-bold">{meal.totalProtein}P</span>}
                        {meal.totalCarb > 0 && <span className="text-amber-500 font-mono font-bold">{meal.totalCarb}C</span>}
                        {meal.totalVeg > 0 && <span className="text-green-500 font-mono font-bold">{meal.totalVeg}V</span>}
                        {(meal.totalFruit || 0) > 0 && <span className="text-pink-500 font-mono font-bold">{meal.totalFruit}Fr</span>}
                        {(meal.totalFat || 0) > 0 && <span className="text-yellow-600 font-mono font-bold">{meal.totalFat}Ft</span>}
                      </div>
                    </button>
                    <button
                      onClick={() => setCustomMeals(prev => prev.filter(m => m.id !== meal.id))}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons: Add Custom Food + Create Meal */}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowCustomFood(!showCustomFood); setShowCustomMeal(false); }}
              className="flex-1 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground border border-dashed border-muted rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="w-3 h-3" /> Custom Food
            </button>
            <button
              onClick={() => { setShowCustomMeal(!showCustomMeal); setShowCustomFood(false); }}
              className="flex-1 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground border border-dashed border-muted rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="w-3 h-3" /> Create Meal
            </button>
          </div>

          {/* Add Custom Food Form */}
          {showCustomFood && (
            <div className="p-3 rounded-lg bg-muted/20 border border-muted space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">New Custom Food</span>
              <Input
                placeholder="Food name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Serving (e.g. 1 palm)"
                  value={customServing}
                  onChange={(e) => setCustomServing(e.target.value)}
                  className="h-8 text-xs flex-1"
                />
                <Input
                  placeholder="Calories"
                  type="number"
                  value={customCalories}
                  onChange={(e) => setCustomCalories(e.target.value)}
                  className="h-8 text-xs w-20"
                />
              </div>
              <div className="flex gap-1.5">
                {(['protein', 'carb', 'veg', 'fruit', 'fat'] as SliceCategory[]).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCustomCategory(cat)}
                    className={cn(
                      "flex-1 py-1 rounded text-[10px] font-bold transition-all",
                      customCategory === cat
                        ? `${CATEGORY_CONFIG[cat].bgColor} ${CATEGORY_CONFIG[cat].color} ring-1 ring-current`
                        : "bg-muted/30 text-muted-foreground"
                    )}
                  >
                    {CATEGORY_CONFIG[cat].shortLabel}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddCustomFood} disabled={!customName} className="text-xs h-7 flex-1">
                  Save Food
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowCustomFood(false)} className="text-xs h-7">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Create Meal Form */}
          {showCustomMeal && (
            <div className="p-3 rounded-lg bg-muted/20 border border-muted space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">New Meal</span>
              <Input
                placeholder="Meal name (e.g. Post-Practice Plate)"
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                className="h-8 text-xs"
              />

              {/* Meal items */}
              {mealItems.length > 0 && (
                <div className="space-y-1">
                  {mealItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-2 py-1 bg-muted/30 rounded text-[10px]">
                      <span>{item.name}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn("font-mono font-bold", CATEGORY_CONFIG[item.category].color)}>
                          {item.slices} {CATEGORY_CONFIG[item.category].shortLabel}
                        </span>
                        <button onClick={() => setMealItems(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add item to meal */}
              <div className="flex gap-1.5">
                <Input
                  placeholder="Item name"
                  value={newMealItemName}
                  onChange={(e) => setNewMealItemName(e.target.value)}
                  className="h-7 text-xs flex-1"
                />
                <select
                  value={newMealItemCategory}
                  onChange={(e) => setNewMealItemCategory(e.target.value as SliceCategory)}
                  className="h-7 text-xs bg-muted/30 border border-muted rounded px-1"
                >
                  <option value="protein">Pro</option>
                  <option value="carb">Carb</option>
                  <option value="veg">Veg</option>
                  <option value="fruit">Fruit</option>
                  <option value="fat">Fat</option>
                </select>
                <Input
                  type="number"
                  value={newMealItemSlices}
                  onChange={(e) => setNewMealItemSlices(e.target.value)}
                  className="h-7 text-xs w-12"
                  min={1}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!newMealItemName) return;
                    setMealItems(prev => [...prev, {
                      name: newMealItemName,
                      category: newMealItemCategory,
                      slices: parseInt(newMealItemSlices) || 1,
                    }]);
                    setNewMealItemName('');
                    setNewMealItemSlices('1');
                  }}
                  className="h-7 text-xs px-2"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveMeal} disabled={!mealName || mealItems.length === 0} className="text-xs h-7 flex-1">
                  Save Meal
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowCustomMeal(false); setMealItems([]); }} className="text-xs h-7">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Food History Log */}
          <div className="space-y-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase">
                Today's Log ({foodHistory.length})
              </span>
              <ChevronDown className={cn("w-3 h-3 transition-transform", showHistory && "rotate-180")} />
            </button>

            {showHistory && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                {foodHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">No food logged yet today</p>
                ) : (
                  <>
                    {[...foodHistory].reverse().map((entry, i) => {
                      const cat = entry.sliceType || 'protein';
                      const config = CATEGORY_CONFIG[cat as SliceCategory];
                      return (
                        <div
                          key={entry.id}
                          className={cn(
                            "flex items-center justify-between px-2 py-1.5 rounded text-[10px]",
                            config?.bgColor || 'bg-muted/20'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={cn("font-bold shrink-0", config?.color || 'text-muted-foreground')}>
                              +{entry.sliceCount || 1} {config?.shortLabel || '?'}
                            </span>
                            <span className="text-muted-foreground truncate">{entry.name}</span>
                            {entry.liquidOz && (
                              <span className="text-[9px] font-mono font-bold text-cyan-500 shrink-0">+{entry.liquidOz}oz</span>
                            )}
                          </div>
                          <span className="text-muted-foreground/60 shrink-0 ml-2">
                            {format(new Date(entry.timestamp), 'h:mm a')}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Undo + Reset */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleUndo}
                    disabled={foodHistory.length === 0}
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-bold uppercase transition-colors",
                      foodHistory.length === 0
                        ? "text-muted-foreground/30"
                        : "text-primary hover:text-primary/80"
                    )}
                  >
                    <Undo2 className="w-3 h-3" />
                    Undo Last
                  </button>
                  <span className="text-muted-foreground/20">|</span>
                  {confirmingReset ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-destructive font-bold">Reset all?</span>
                      <button
                        onClick={handleReset}
                        className="text-[10px] font-bold text-destructive hover:text-destructive/80"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmingReset(false)}
                        className="text-[10px] font-bold text-muted-foreground"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingReset(true)}
                      disabled={foodHistory.length === 0}
                      className={cn(
                        "text-[10px] font-bold uppercase transition-colors",
                        foodHistory.length === 0
                          ? "text-muted-foreground/30"
                          : "text-muted-foreground hover:text-destructive"
                      )}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Calorie/Stats Summary */}
          <div className="space-y-2 pt-2 border-t border-muted/30">
            {/* Enhanced remaining targets guidance with food suggestions */}
            {totalSlices > 0 && !allDone && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 overflow-hidden">
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <Target className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1">
                    <span className="text-[11px] font-bold text-foreground">Still need: </span>
                    <span className="text-[11px] font-mono font-bold">
                      {[
                        tracking.proteinSlices < targets.protein && (
                          <span key="p" className="text-orange-500">{targets.protein - tracking.proteinSlices}P</span>
                        ),
                        tracking.carbSlices < targets.carb && (
                          <span key="c" className="text-amber-500">{targets.carb - tracking.carbSlices}C</span>
                        ),
                        tracking.vegSlices < targets.veg && (
                          <span key="v" className="text-green-500">{targets.veg - tracking.vegSlices}V</span>
                        ),
                        isV2 && (tracking.fruitSlices || 0) < targets.fruit && (
                          <span key="fr" className="text-pink-500">{targets.fruit - (tracking.fruitSlices || 0)}Fr</span>
                        ),
                        isV2 && (tracking.fatSlices || 0) < targets.fat && (
                          <span key="ft" className="text-yellow-600">{targets.fat - (tracking.fatSlices || 0)}Ft</span>
                        ),
                      ].filter(Boolean).reduce((acc: React.ReactNode[], item, i, arr) => {
                        if (i === 0) return [item];
                        return [...acc, <span key={`sep-${i}`} className="text-muted-foreground mx-0.5">/</span>, item];
                      }, [])}
                    </span>
                  </div>
                </div>
                {/* Quick suggestion based on what's most needed */}
                {(() => {
                  const needs = [
                    { cat: 'protein', need: targets.protein - tracking.proteinSlices, emoji: '🥩', suggestion: '1 palm of chicken or fish' },
                    { cat: 'carb', need: targets.carb - tracking.carbSlices, emoji: '🍚', suggestion: '1 fist of rice or potato' },
                    { cat: 'veg', need: targets.veg - tracking.vegSlices, emoji: '🥗', suggestion: '1 fist of veggies' },
                    ...(isV2 ? [
                      { cat: 'fruit', need: targets.fruit - (tracking.fruitSlices || 0), emoji: '🍎', suggestion: '1 apple or banana' },
                      { cat: 'fat', need: targets.fat - (tracking.fatSlices || 0), emoji: '🥜', suggestion: '1 thumb of nuts or oil' },
                    ] : []),
                  ].filter(n => n.need > 0).sort((a, b) => b.need - a.need);
                  const top = needs[0];
                  if (!top) return null;
                  return (
                    <div className="px-2.5 py-1.5 bg-muted/30 border-t border-primary/10 flex items-center gap-2">
                      <span className="text-sm">{top.emoji}</span>
                      <span className="text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">Try:</span> {top.suggestion}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Calorie breakdown with slice calorie values */}
            {!gramTargets && (
              <div className={cn("grid gap-1.5 text-center", isV2 ? "grid-cols-5" : "grid-cols-3")}>
                <div className="px-1 py-1.5 rounded bg-orange-500/5">
                  <div className="text-[10px] font-bold text-orange-500">{targets.protein}P</div>
                  <div className="text-[8px] text-muted-foreground">~{targets.protein * 125} cal</div>
                </div>
                <div className="px-1 py-1.5 rounded bg-amber-500/5">
                  <div className="text-[10px] font-bold text-amber-500">{targets.carb}C</div>
                  <div className="text-[8px] text-muted-foreground">~{targets.carb * 104} cal</div>
                </div>
                <div className="px-1 py-1.5 rounded bg-green-500/5">
                  <div className="text-[10px] font-bold text-green-500">{targets.veg}V</div>
                  <div className="text-[8px] text-muted-foreground">~{targets.veg * 32} cal</div>
                </div>
                {isV2 && (
                  <>
                    <div className="px-1 py-1.5 rounded bg-pink-500/5">
                      <div className="text-[10px] font-bold text-pink-500">{targets.fruit}Fr</div>
                      <div className="text-[8px] text-muted-foreground">~{targets.fruit * 100} cal</div>
                    </div>
                    <div className="px-1 py-1.5 rounded bg-yellow-600/5">
                      <div className="text-[10px] font-bold text-yellow-600">{targets.fat}Ft</div>
                      <div className="text-[8px] text-muted-foreground">~{targets.fat * 126} cal</div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Sugar Diet gram targets display */}
            {gramTargets && (
              <div className="text-[10px] text-muted-foreground/60">
                Target: {gramTargets.carbs.max}g carbs / {gramTargets.protein.max}g protein → {targets.protein}P / {targets.carb}C / {targets.veg}V slices
                {restrictions?.ratioLabel && <span className="ml-1 font-mono">({restrictions.ratioLabel})</span>}
              </div>
            )}

            {/* Expandable Your Stats section - only for Protocol 5 */}
            {targets.bmr && targets.tdee && (
              <YourStatsSection
                bmr={targets.bmr}
                tdee={targets.tdee}
                targetCalories={targets.totalCalories}
                activityLevel={targets.activityLevel}
                calorieAdjustment={targets.calorieAdjustment}
              />
            )}
          </div>

          {/* Why SPAR? */}
          <WhyExplanation title="portions not calories">
            <p className="mb-1">
              <strong>SPAR = Simple as Pie for Achievable Results.</strong> Instead of tracking every calorie, you track
              portions (slices):
            </p>
            <ul className="space-y-1 list-none">
              <li>🖐️ <strong>1 palm</strong> of protein ≈ 110 cal (4oz lean meat, scoop of whey)</li>
              <li>✊ <strong>1 fist</strong> of complex carbs ≈ 120 cal (½ cup rice, 1 potato)</li>
              <li>✊ <strong>1 fist</strong> of veggies/fruit ≈ 50 cal (broccoli, apple, salad)</li>
            </ul>
            <p className="mt-1.5">
              Your targets are calculated from your BMR × activity level, then split into slices.
              No calorie counting, no food scales — just eat clean and hit your numbers.
            </p>
          </WhyExplanation>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card className="border-muted overflow-hidden">
      <CardContent className="p-3">
        {content}
      </CardContent>
    </Card>
  );
}
