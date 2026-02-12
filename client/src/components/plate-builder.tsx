import { useState, useMemo, useCallback } from "react";
import { X, UtensilsCrossed, Plus, Minus, Check, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPAR_FOODS, type SparFood } from "@/lib/food-data";

type SliceCategory = 'protein' | 'carb' | 'veg' | 'fruit' | 'fat';

export interface PlateItem {
  name: string;
  category: SliceCategory;
  quantity: number; // slice count for SPAR, grams for macro
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  icon?: string;
}

interface PlateBuilderProps {
  open: boolean;
  onClose: () => void;
  onLogPlate: (items: PlateItem[]) => void;
  mode: 'spar' | 'sugar';
  /** Whether SPAR v2 mode (all 5 categories). When false, only protein/carb. */
  isV2?: boolean;
}

const CATEGORIES: { key: SliceCategory; label: string; shortLabel: string; color: string; bg: string }[] = [
  { key: 'protein', label: 'Protein', shortLabel: 'Pro', color: 'text-orange-500', bg: 'bg-orange-500' },
  { key: 'carb', label: 'Carbs', shortLabel: 'Carb', color: 'text-amber-500', bg: 'bg-amber-500' },
  { key: 'veg', label: 'Veggies', shortLabel: 'Veg', color: 'text-green-500', bg: 'bg-green-500' },
  { key: 'fruit', label: 'Fruit', shortLabel: 'Fruit', color: 'text-pink-500', bg: 'bg-pink-500' },
  { key: 'fat', label: 'Fats', shortLabel: 'Fat', color: 'text-yellow-600', bg: 'bg-yellow-600' },
];

export function PlateBuilder({ open, onClose, onLogPlate, mode, isV2 = true }: PlateBuilderProps) {
  const [activeCategory, setActiveCategory] = useState<SliceCategory>('protein');
  const [plate, setPlate] = useState<PlateItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter categories based on protocol (v2 = all 5, non-v2 = protein + carb only)
  const visibleCategories = useMemo(() => {
    if (isV2) return CATEGORIES;
    return CATEGORIES.filter(c => c.key === 'protein' || c.key === 'carb');
  }, [isV2]);

  // Get foods for active category
  const categoryFoods = useMemo(() => {
    const foods = SPAR_FOODS[activeCategory as keyof typeof SPAR_FOODS] || [];
    if (!searchQuery) return foods;
    const q = searchQuery.toLowerCase();
    return foods.filter((f: SparFood) => f.name.toLowerCase().includes(q));
  }, [activeCategory, searchQuery]);

  // Add food to plate
  const addToPlate = useCallback((food: SparFood) => {
    setPlate(prev => {
      const existing = prev.find(p => p.name === food.name && p.category === activeCategory);
      if (existing) {
        return prev.map(p =>
          p.name === food.name && p.category === activeCategory
            ? { ...p, quantity: p.quantity + 1 }
            : p
        );
      }
      return [...prev, {
        name: food.name,
        category: activeCategory,
        quantity: 1,
        calories: food.calories || 0,
        protein: food.protein || 0,
        carbs: food.carbs || 0,
        fat: 0,
        icon: food.icon,
      }];
    });
  }, [activeCategory]);

  // Adjust quantity
  const adjustQuantity = useCallback((name: string, category: SliceCategory, delta: number) => {
    setPlate(prev => {
      const item = prev.find(p => p.name === name && p.category === category);
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter(p => !(p.name === name && p.category === category));
      return prev.map(p =>
        p.name === name && p.category === category ? { ...p, quantity: newQty } : p
      );
    });
  }, []);

  // Remove from plate
  const removeFromPlate = useCallback((name: string, category: SliceCategory) => {
    setPlate(prev => prev.filter(p => !(p.name === name && p.category === category)));
  }, []);

  // Plate totals
  const totals = useMemo(() => {
    return plate.reduce((acc, item) => ({
      slices: acc.slices + item.quantity,
      calories: acc.calories + (item.calories * item.quantity),
      protein: acc.protein + (item.protein * item.quantity),
      carbs: acc.carbs + (item.carbs * item.quantity),
      fat: acc.fat + (item.fat * item.quantity),
    }), { slices: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [plate]);

  // Category counts on plate
  const categoryCounts = useMemo(() => {
    const counts: Record<SliceCategory, number> = { protein: 0, carb: 0, veg: 0, fruit: 0, fat: 0 };
    plate.forEach(item => { counts[item.category] += item.quantity; });
    return counts;
  }, [plate]);

  const handleLogPlate = () => {
    if (plate.length === 0) return;
    onLogPlate(plate);
    setPlate([]);
    setSearchQuery('');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header — with safe-area padding for iOS notch */}
      <div className="flex items-center justify-between p-4 border-b border-muted" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Build a Plate</span>
          {plate.length > 0 && (
            <span className="text-[9px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
              {totals.slices} items
            </span>
          )}
        </div>
        <button
          onClick={() => { setPlate([]); setSearchQuery(''); onClose(); }}
          className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category chips */}
      <div className="flex gap-1.5 p-3 pb-0 overflow-x-auto">
        {visibleCategories.map(cat => {
          const isActive = activeCategory === cat.key;
          const count = categoryCounts[cat.key];
          return (
            <button
              key={cat.key}
              onClick={() => { setActiveCategory(cat.key); setSearchQuery(''); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0",
                isActive
                  ? `${cat.bg}/20 ${cat.color} ring-1 ring-current`
                  : "bg-muted/30 text-muted-foreground"
              )}
            >
              {cat.shortLabel}
              {count > 0 && (
                <span className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                  isActive ? "bg-white/20" : "bg-primary/15 text-primary"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="px-3 pt-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            placeholder={`Search ${CATEGORIES.find(c => c.key === activeCategory)?.label || ''}...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-8 pr-8 text-xs bg-muted/20 rounded-lg border border-muted"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Food grid */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {categoryFoods.map((food: SparFood, i: number) => {
          const onPlate = plate.find(p => p.name === food.name && p.category === activeCategory);
          const catConfig = CATEGORIES.find(c => c.key === activeCategory)!;

          return (
            <button
              key={food.name + i}
              onClick={() => addToPlate(food)}
              className={cn(
                "w-full flex items-center justify-between rounded-lg px-3 py-2.5 transition-all text-left",
                onPlate
                  ? `${catConfig.bg}/20 ring-1 ring-current ${catConfig.color}`
                  : `${catConfig.bg}/5 hover:${catConfig.bg}/15 active:${catConfig.bg}/25`
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-sm shrink-0">{food.icon}</span>
                <span className="text-[11px] font-medium text-foreground truncate">{food.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-[9px] text-muted-foreground">{food.serving}</span>
                {onPlate ? (
                  <span className={cn("text-[10px] font-bold font-mono", catConfig.color)}>×{onPlate.quantity}</span>
                ) : (
                  <Plus className={cn("w-3.5 h-3.5", catConfig.color)} />
                )}
              </div>
            </button>
          );
        })}

        {categoryFoods.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            {searchQuery ? 'No foods match your search' : 'No foods in this category'}
          </p>
        )}
      </div>

      {/* Plate summary (sticky bottom) */}
      {plate.length > 0 && (
        <div className="border-t border-muted bg-card p-4 space-y-3">
          {/* Plate items */}
          <div className="flex flex-wrap gap-1.5">
            {plate.map(item => {
              const catConfig = CATEGORIES.find(c => c.key === item.category)!;
              return (
                <div
                  key={`${item.name}-${item.category}`}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 rounded-full text-[10px] font-medium border",
                    `${catConfig.bg}/10 ${catConfig.color} border-current/20`
                  )}
                >
                  {item.icon && <span className="text-xs">{item.icon}</span>}
                  <span className="max-w-[80px] truncate">{item.name}</span>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-0.5 ml-1">
                    <button
                      onClick={() => adjustQuantity(item.name, item.category, -1)}
                      className="w-5 h-5 rounded-full bg-muted/40 flex items-center justify-center active:scale-90"
                    >
                      <Minus className="w-2.5 h-2.5" />
                    </button>
                    <span className="font-bold font-mono min-w-[14px] text-center">{item.quantity}</span>
                    <button
                      onClick={() => adjustQuantity(item.name, item.category, 1)}
                      className="w-5 h-5 rounded-full bg-muted/40 flex items-center justify-center active:scale-90"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => removeFromPlate(item.name, item.category)}
                    className="w-4 h-4 rounded-full flex items-center justify-center ml-0.5 hover:bg-red-500/20"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Totals row */}
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-orange-500 font-bold">{categoryCounts.protein}P</span>
              <span className="text-amber-500 font-bold">{categoryCounts.carb}C</span>
              <span className="text-green-500 font-bold">{categoryCounts.veg}V</span>
              <span className="text-pink-500 font-bold">{categoryCounts.fruit}Fr</span>
              <span className="text-yellow-600 font-bold">{categoryCounts.fat}Ft</span>
            </div>
            <span className="text-muted-foreground">{totals.slices} total slices</span>
          </div>

          {/* Log button */}
          <button
            onClick={handleLogPlate}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Check className="w-4 h-4" />
            Log Plate ({plate.length} food{plate.length !== 1 ? 's' : ''})
          </button>
        </div>
      )}
    </div>
  );
}
