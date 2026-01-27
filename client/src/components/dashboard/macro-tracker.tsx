import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Utensils, Plus, Pencil, Trash2, ChevronRight, HelpCircle, Apple, Wheat, Fish, AlertTriangle, Check, Undo2, History, ChevronDown, Search, X, Star } from "lucide-react";

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
import { format, getDay } from "date-fns";
import { useStore } from "@/lib/store";

interface MacroTrackerProps {
  macros: {
    carbs: { min: number; max: number };
    protein: { min: number; max: number };
    ratio: string;
    note: string;
  };
  todaysFoods: {
    carbs: Array<{ name: string; ratio: string; serving: string; carbs: number; note?: string }>;
    protein: Array<{ name: string; serving: string; protein: number; note?: string; timing?: string }>;
    avoid: Array<{ name: string; reason: string }>;
    carbsLabel: string;
    proteinLabel: string;
  };
  foodLists: ReturnType<ReturnType<typeof useStore>['getFoodLists']>;
  dayOfWeek: number;
  protocol: string;
  readOnly?: boolean;
}

// Circular Progress Component
function CircularProgress({
  value,
  max,
  color,
  size = 60,
  label,
  consumed
}: {
  value: number;
  max: number;
  color: string;
  size?: number;
  label: string;
  consumed: number;
}) {
  const progress = max > 0 ? Math.min(100, (value / max) * 100) : 0;
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
            stroke={progress >= 100 ? "hsl(var(--chart-2))" : color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-sm font-bold font-mono", progress >= 100 ? "text-green-500" : "")}>
            {consumed}g
          </span>
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

// Food Category Tab
function FoodTab({
  active,
  onClick,
  label,
  shortLabel,
  icon: Icon,
  color
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  shortLabel?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap shrink-0",
        active
          ? `${color} text-white`
          : "bg-muted/50 text-muted-foreground hover:bg-muted active:bg-muted/80"
      )}
    >
      <Icon className="w-3 h-3" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel || label}</span>
    </button>
  );
}

export function MacroTracker({ macros, todaysFoods, foodLists, dayOfWeek, protocol, readOnly = false }: MacroTrackerProps) {
  const { getDailyTracking, updateDailyTracking, profile } = useStore();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);

  const [addCarbs, setAddCarbs] = useState('');
  const [addProtein, setAddProtein] = useState('');
  const [isEditingCarbs, setIsEditingCarbs] = useState(false);
  const [isEditingProtein, setIsEditingProtein] = useState(false);
  const [editCarbsValue, setEditCarbsValue] = useState('');
  const [editProteinValue, setEditProteinValue] = useState('');
  const [showFoodRef, setShowFoodRef] = useState(true); // Default to open for discoverability
  const [foodTab, setFoodTab] = useState<'fructose' | 'glucose' | 'protein' | 'zerofiber' | 'custom'>('fructose');
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
        } catch {
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

  // Track last added food for visual feedback
  const [lastAdded, setLastAdded] = useState<{ index: number; type: string; amount: number } | null>(null);
  const lastAddedTimeout = useRef<NodeJS.Timeout | null>(null);

  // Food history log for undo functionality - persisted to localStorage per day
  const foodHistoryKey = `pwm-food-history-${dateKey}`;
  const [foodHistory, setFoodHistory] = useState<FoodLogEntry[]>(() => {
    // Load from localStorage on initial render
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(foodHistoryKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Restore Date objects from ISO strings
          return parsed.map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp)
          }));
        } catch {
          return [];
        }
      }
    }
    return [];
  });
  const [showHistory, setShowHistory] = useState(false);

  // Persist food history to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(foodHistoryKey, JSON.stringify(foodHistory));
    }
  }, [foodHistory, foodHistoryKey]);

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
    const updates: { carbsConsumed?: number; proteinConsumed?: number; waterConsumed?: number } = {};

    if (macroType === 'carbs') {
      updates.carbsConsumed = tracking.carbsConsumed + amount;
    } else {
      updates.proteinConsumed = tracking.proteinConsumed + amount;
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
    const updates: { carbsConsumed?: number; proteinConsumed?: number; waterConsumed?: number } = {};

    // Subtract the amount from tracking
    if (lastEntry.macroType === 'carbs') {
      updates.carbsConsumed = Math.max(0, tracking.carbsConsumed - lastEntry.amount);
    } else {
      updates.proteinConsumed = Math.max(0, tracking.proteinConsumed - lastEntry.amount);
    }

    // Also undo water if it was a liquid
    if (lastEntry.liquidOz && lastEntry.liquidOz > 0) {
      updates.waterConsumed = Math.max(0, tracking.waterConsumed - lastEntry.liquidOz);
    }

    updateDailyTracking(dateKey, updates);

    // Remove from history
    setFoodHistory(prev => prev.slice(0, -1));
  };

  const carbProgress = macros.carbs.max > 0 ? Math.min(100, (tracking.carbsConsumed / macros.carbs.max) * 100) : 0;
  const proteinProgress = macros.protein.max > 0 ? Math.min(100, (tracking.proteinConsumed / macros.protein.max) * 100) : 0;

  // Quick add amounts
  const quickCarbAmounts = [25, 50, 75];
  const quickProteinAmounts = [15, 25, 30];

  const handleAddMacros = () => {
    const newCarbs = addCarbs ? tracking.carbsConsumed + parseInt(addCarbs) : tracking.carbsConsumed;
    const newProtein = addProtein ? tracking.proteinConsumed + parseInt(addProtein) : tracking.proteinConsumed;
    updateDailyTracking(dateKey, { carbsConsumed: newCarbs, proteinConsumed: newProtein });
    setAddCarbs('');
    setAddProtein('');
  };

  const handleEditCarbs = () => {
    setEditCarbsValue(tracking.carbsConsumed.toString());
    setIsEditingCarbs(true);
  };

  const handleSaveCarbs = () => {
    updateDailyTracking(dateKey, { carbsConsumed: parseInt(editCarbsValue) || 0 });
    setIsEditingCarbs(false);
    setEditCarbsValue('');
  };

  const handleEditProtein = () => {
    setEditProteinValue(tracking.proteinConsumed.toString());
    setIsEditingProtein(true);
  };

  const handleSaveProtein = () => {
    updateDailyTracking(dateKey, { proteinConsumed: parseInt(editProteinValue) || 0 });
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
  };

  // Determine if we're in fructose or glucose phase
  const isFructosePhase = dayOfWeek >= 1 && dayOfWeek <= 3;
  const isGlucosePhase = dayOfWeek >= 4 && dayOfWeek <= 5;
  const isZeroFiberPhase = dayOfWeek === 4 || dayOfWeek === 5; // Thu/Fri - critical for weigh-in
  const isProteinAllowed = todaysFoods.protein.length > 0;

  // Get protein status info
  const getProteinStatus = () => {
    if (protocol === '3' || protocol === '4') {
      return { allowed: true, message: todaysFoods.proteinLabel, color: "text-primary", bgColor: "bg-primary/10 border-primary/30" };
    }
    if (dayOfWeek === 1 || dayOfWeek === 2) {
      return { allowed: false, message: "NO PROTEIN TODAY", color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/30" };
    }
    if (dayOfWeek === 3) {
      return { allowed: true, message: "COLLAGEN ONLY (Dinner)", color: "text-orange-500", bgColor: "bg-orange-500/10 border-orange-500/30" };
    }
    if (dayOfWeek === 6) {
      return { allowed: true, message: "PROTEIN AFTER WEIGH-IN", color: "text-yellow-500", bgColor: "bg-yellow-500/10 border-yellow-500/30" };
    }
    return { allowed: true, message: todaysFoods.proteinLabel, color: "text-primary", bgColor: "bg-primary/10 border-primary/30" };
  };

  const proteinStatus = getProteinStatus();

  return (
    <Card className="border-muted">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Utensils className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Food & Macros</h3>
              <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
                {macros.ratio}
              </span>
            </div>

            {/* Progress + Log Food CTA */}
            <div className="bg-muted/20 rounded-xl p-4 mb-4">
              {/* Circular Progress Indicators */}
              <div className="flex justify-around items-center">
                <div className="flex flex-col items-center">
                  {!readOnly && isEditingCarbs ? (
                    <div className="flex flex-col items-center gap-2">
                      <Input
                        type="number"
                        value={editCarbsValue}
                        onChange={(e) => setEditCarbsValue(e.target.value)}
                        className="h-8 w-20 text-center text-sm font-mono"
                        autoFocus
                      />
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={handleSaveCarbs} className="h-6 px-2 text-[10px]">Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditingCarbs(false)} className="h-6 px-2 text-[10px]">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <CircularProgress
                        value={tracking.carbsConsumed}
                        max={macros.carbs.max}
                        color="hsl(var(--primary))"
                        consumed={tracking.carbsConsumed}
                        label="Carbs"
                      />
                      {!readOnly && (
                        <button
                          onClick={handleEditCarbs}
                          className="mt-1 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit carbs"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="h-16 w-px bg-muted/50" />

                <div className="flex flex-col items-center">
                  {!readOnly && isEditingProtein ? (
                    <div className="flex flex-col items-center gap-2">
                      <Input
                        type="number"
                        value={editProteinValue}
                        onChange={(e) => setEditProteinValue(e.target.value)}
                        className="h-8 w-20 text-center text-sm font-mono"
                        autoFocus
                      />
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={handleSaveProtein} className="h-6 px-2 text-[10px]">Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditingProtein(false)} className="h-6 px-2 text-[10px]">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <CircularProgress
                        value={tracking.proteinConsumed}
                        max={macros.protein.max}
                        color="hsl(24, 95%, 53%)"
                        consumed={tracking.proteinConsumed}
                        label="Protein"
                      />
                      {!readOnly && (
                        <button
                          onClick={handleEditProtein}
                          className="mt-1 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit protein"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Log Food CTA - Prominent button when food list is collapsed */}
              {!readOnly && !showFoodRef && (
                <Button
                  onClick={() => setShowFoodRef(true)}
                  className="w-full mt-4 h-10 bg-primary/90 hover:bg-primary"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Log Food
                </Button>
              )}

              {/* Reset Button - smaller, less prominent */}
              {!readOnly && (tracking.carbsConsumed > 0 || tracking.proteinConsumed > 0) && (
                <div className="flex justify-center mt-3">
                  <button
                    onClick={handleResetMacros}
                    className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Reset to 0
                  </button>
                </div>
              )}
            </div>

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
              {dayOfWeek >= 1 && dayOfWeek <= 3 && (
                <WhyExplanation title="fructose heavy">
                  <strong>Fructose burns fat better.</strong> Unlike glucose, fructose is processed by the liver and doesn't spike
                  insulin as much. This keeps your body in a fat-burning state while still providing energy for training.
                </WhyExplanation>
              )}
              {dayOfWeek >= 4 && dayOfWeek <= 5 && (
                <WhyExplanation title="switch to glucose">
                  <strong>Glucose for quick energy.</strong> As you approach competition, we shift from fructose to glucose-based
                  carbs (rice, potatoes). Glucose goes straight to muscle glycogen for explosive energy without fiber.
                </WhyExplanation>
              )}
              {(dayOfWeek === 1 || dayOfWeek === 2) && protocol !== '3' && protocol !== '4' && (
                <WhyExplanation title="no protein">
                  <strong>Protein blocks fat burning.</strong> During the metabolic phase, protein triggers insulin and mTOR
                  pathways that shut down fat oxidation. Keeping protein minimal lets you burn more actual body fat.
                </WhyExplanation>
              )}
            </div>

            {/* Food Log Section Header */}
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

                {/* Food History - Show at top when there are logged items */}
                {foodHistory.length > 0 && (
                  <div className="bg-muted/30 rounded-lg p-2.5 border border-muted/50">
                    <div className="flex items-center justify-between mb-2">
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
                      <div className="space-y-1 max-h-[150px] overflow-y-auto">
                        {[...foodHistory].reverse().map((entry) => (
                          <div
                            key={entry.id}
                            className={cn(
                              "flex items-center justify-between px-2 py-1.5 rounded text-[10px]",
                              entry.macroType === 'carbs'
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
                                entry.macroType === 'carbs'
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
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Search Bar */}
                <div className="relative mb-2">
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

                {/* Food Category Tabs - Scrollable on mobile */}
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                  <FoodTab
                    active={foodTab === 'fructose'}
                    onClick={() => setFoodTab('fructose')}
                    label="Fructose"
                    shortLabel="Fruit"
                    icon={Apple}
                    color="bg-green-500"
                  />
                  <FoodTab
                    active={foodTab === 'glucose'}
                    onClick={() => setFoodTab('glucose')}
                    label="Glucose/Starch"
                    shortLabel="Starch"
                    icon={Wheat}
                    color="bg-amber-500"
                  />
                  {isZeroFiberPhase && (
                    <FoodTab
                      active={foodTab === 'zerofiber'}
                      onClick={() => setFoodTab('zerofiber')}
                      label="Zero Fiber"
                      shortLabel="0 Fiber"
                      icon={AlertTriangle}
                      color="bg-red-500"
                    />
                  )}
                  {isProteinAllowed && (
                    <FoodTab
                      active={foodTab === 'protein'}
                      onClick={() => setFoodTab('protein')}
                      label="Protein"
                      icon={Fish}
                      color="bg-orange-500"
                    />
                  )}
                  <FoodTab
                    active={foodTab === 'custom'}
                    onClick={() => setFoodTab('custom')}
                    label="My Foods"
                    shortLabel="Custom"
                    icon={Star}
                    color="bg-purple-500"
                  />
                </div>

                {/* Fructose Foods */}
                {foodTab === 'fructose' && (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    <div className="flex items-center gap-2 mb-2">
                      <Apple className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-[10px] text-green-500 uppercase font-bold">Fructose Sources</span>
                      {isFructosePhase && (
                        <span className="text-[8px] bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded font-bold">RECOMMENDED TODAY</span>
                      )}
                    </div>
                    {filteredFructose.length === 0 && searchQuery && (
                      <p className="text-xs text-muted-foreground text-center py-2">No foods match "{searchQuery}"</p>
                    )}
                    {filteredFructose.map((food, i) => {
                      const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'fructose';
                      const foodOz = (food as any).oz as number | undefined;
                      return (
                        <button
                          key={i}
                          onClick={() => handleFoodAdd(i, 'carbs', food.carbs, 'fructose', food.name, foodOz)}
                          className={cn(
                            "w-full flex items-center justify-between rounded px-2 py-2 transition-all text-left",
                            isJustAdded
                              ? "bg-green-500/30 ring-2 ring-green-500"
                              : "bg-green-500/5 hover:bg-green-500/15 active:bg-green-500/25"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {isJustAdded ? (
                              <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            ) : (
                              <Plus className="w-3 h-3 text-green-500 shrink-0" />
                            )}
                            <span className="text-[11px] font-medium text-foreground truncate">{food.name}</span>
                            {foodOz && <span className="text-[9px] text-cyan-500 font-bold">+{foodOz}oz</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                            <span className="text-muted-foreground hidden sm:inline">{food.serving}</span>
                            <span className="font-mono font-bold text-green-500">+{food.carbs}g</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Glucose/Starch Foods */}
                {foodTab === 'glucose' && (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    <div className="flex items-center gap-2 mb-2">
                      <Wheat className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-[10px] text-amber-500 uppercase font-bold">Glucose/Starch Sources</span>
                      {isGlucosePhase && (
                        <span className="text-[8px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded font-bold">RECOMMENDED TODAY</span>
                      )}
                    </div>
                    {filteredGlucose.length === 0 && searchQuery && (
                      <p className="text-xs text-muted-foreground text-center py-2">No foods match "{searchQuery}"</p>
                    )}
                    {filteredGlucose.map((food, i) => {
                      const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'glucose';
                      const foodOz = (food as any).oz as number | undefined;
                      return (
                        <button
                          key={i}
                          onClick={() => handleFoodAdd(i, 'carbs', food.carbs, 'glucose', food.name, foodOz)}
                          className={cn(
                            "w-full flex items-center justify-between rounded px-2 py-2 transition-all text-left",
                            isJustAdded
                              ? "bg-amber-500/30 ring-2 ring-amber-500"
                              : "bg-amber-500/5 hover:bg-amber-500/15 active:bg-amber-500/25"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {isJustAdded ? (
                              <Check className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            ) : (
                              <Plus className="w-3 h-3 text-amber-500 shrink-0" />
                            )}
                            <span className="text-[11px] font-medium text-foreground truncate">{food.name}</span>
                            {foodOz && <span className="text-[9px] text-cyan-500 font-bold">+{foodOz}oz</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                            <span className="text-muted-foreground hidden sm:inline">{food.serving}</span>
                            <span className="font-mono font-bold text-amber-500">+{food.carbs}g</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Zero Fiber Foods - Critical for Thu/Fri */}
                {foodTab === 'zerofiber' && isZeroFiberPhase && (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-[10px] text-red-500 uppercase font-bold">Zero Fiber Only</span>
                      <span className="text-[8px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded font-bold animate-pulse">CRITICAL FOR WEIGH-IN</span>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 mb-2">
                      <p className="text-[10px] text-red-400">
                        <strong>Fiber = gut weight.</strong> Any fiber Thu/Fri stays in your system through weigh-in.
                        Stick to these zero-fiber options only.
                      </p>
                    </div>
                    {filteredZeroFiber.length === 0 && searchQuery && (
                      <p className="text-xs text-muted-foreground text-center py-2">No foods match "{searchQuery}"</p>
                    )}
                    {filteredZeroFiber.map((food, i) => {
                      const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'zerofiber';
                      const foodOz = (food as any).oz as number | undefined;
                      return (
                        <button
                          key={i}
                          onClick={() => handleFoodAdd(i, 'carbs', food.carbs, 'zerofiber', food.name, foodOz)}
                          className={cn(
                            "w-full flex items-center justify-between rounded px-2 py-2 transition-all text-left",
                            isJustAdded
                              ? "bg-red-500/30 ring-2 ring-red-500"
                              : "bg-red-500/5 hover:bg-red-500/15 active:bg-red-500/25"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {isJustAdded ? (
                              <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            ) : (
                              <Plus className="w-3 h-3 text-red-500 shrink-0" />
                            )}
                            <span className="text-[11px] font-medium text-foreground truncate">{food.name}</span>
                            {foodOz && <span className="text-[9px] text-cyan-500 font-bold">+{foodOz}oz</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                            <span className="text-muted-foreground hidden sm:inline">{food.serving}</span>
                            <span className="font-mono font-bold text-red-500">+{food.carbs}g</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Protein Sources */}
                {foodTab === 'protein' && isProteinAllowed && (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    <div className="flex items-center gap-2 mb-2">
                      <Fish className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[10px] text-orange-500 uppercase font-bold">Protein Sources</span>
                    </div>
                    {filteredProtein.length === 0 && searchQuery && (
                      <p className="text-xs text-muted-foreground text-center py-2">No foods match "{searchQuery}"</p>
                    )}
                    {filteredProtein.map((item, i) => {
                      const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'protein';
                      return (
                        <button
                          key={i}
                          onClick={() => handleFoodAdd(i, 'protein', item.protein, 'protein', item.name)}
                          className={cn(
                            "w-full flex items-center justify-between rounded px-2 py-2 transition-all text-left",
                            isJustAdded
                              ? "bg-orange-500/30 ring-2 ring-orange-500"
                              : "bg-orange-500/5 hover:bg-orange-500/15 active:bg-orange-500/25"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {isJustAdded ? (
                              <Check className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            ) : (
                              <Plus className="w-3 h-3 text-orange-500 shrink-0" />
                            )}
                            <span className="text-[11px] font-medium text-foreground truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                            <span className="text-muted-foreground hidden sm:inline">{item.serving}</span>
                            <span className="font-mono font-bold text-orange-500">+{item.protein}g</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Custom Foods */}
                {foodTab === 'custom' && (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
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
                              className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
