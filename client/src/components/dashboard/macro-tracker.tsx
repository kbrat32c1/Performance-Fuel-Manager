import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Utensils, Plus, Pencil, Trash2, ChevronRight, HelpCircle, Apple, Wheat, Fish, AlertTriangle, Check } from "lucide-react";
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

export function MacroTracker({ macros, todaysFoods, foodLists, dayOfWeek, protocol }: MacroTrackerProps) {
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
  const [showFoodRef, setShowFoodRef] = useState(false);
  const [foodTab, setFoodTab] = useState<'fructose' | 'glucose' | 'protein' | 'zerofiber'>('fructose');

  // Track last added food for visual feedback
  const [lastAdded, setLastAdded] = useState<{ index: number; type: string; amount: number } | null>(null);
  const lastAddedTimeout = useRef<NodeJS.Timeout | null>(null);

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

  // Helper to add food with visual feedback
  const handleFoodAdd = (index: number, macroType: 'carbs' | 'protein', amount: number, tabType: string) => {
    if (macroType === 'carbs') {
      updateDailyTracking(dateKey, { carbsConsumed: tracking.carbsConsumed + amount });
    } else {
      updateDailyTracking(dateKey, { proteinConsumed: tracking.proteinConsumed + amount });
    }
    setLastAdded({ index, type: tabType, amount });
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
            <span className="text-sm font-bold text-primary">2</span>
          </div>
          <div className="flex-1">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-primary" />
                <h3 className="font-bold">Today's Fuel</h3>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
                {macros.ratio}
              </span>
            </div>

            {/* Circular Progress Indicators */}
            <div className="flex justify-around items-center py-4 bg-muted/20 rounded-xl mb-4">
              <div className="flex flex-col items-center">
                {isEditingCarbs ? (
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
                    <button
                      onClick={handleEditCarbs}
                      className="mt-1 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit carbs"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>

              <div className="h-16 w-px bg-muted/50" />

              <div className="flex flex-col items-center">
                {isEditingProtein ? (
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
                    <button
                      onClick={handleEditProtein}
                      className="mt-1 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit protein"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Quick Add Section */}
            <div className="space-y-3 mb-4">
              {/* Carbs Quick Add */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-primary font-bold w-14">CARBS</span>
                <div className="flex gap-1 flex-1">
                  {quickCarbAmounts.map(amount => (
                    <Button
                      key={amount}
                      variant="outline"
                      size="sm"
                      onClick={() => updateDailyTracking(dateKey, { carbsConsumed: tracking.carbsConsumed + amount })}
                      className="h-7 text-[10px] px-2 flex-1"
                    >
                      +{amount}g
                    </Button>
                  ))}
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      placeholder="g"
                      value={addCarbs}
                      onChange={(e) => setAddCarbs(e.target.value)}
                      className="h-7 w-14 text-[10px] font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Protein Quick Add */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-orange-500 font-bold w-14">PROTEIN</span>
                <div className="flex gap-1 flex-1">
                  {isProteinAllowed ? (
                    <>
                      {quickProteinAmounts.map(amount => (
                        <Button
                          key={amount}
                          variant="outline"
                          size="sm"
                          onClick={() => updateDailyTracking(dateKey, { proteinConsumed: tracking.proteinConsumed + amount })}
                          className="h-7 text-[10px] px-2 flex-1"
                        >
                          +{amount}g
                        </Button>
                      ))}
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          placeholder="g"
                          value={addProtein}
                          onChange={(e) => setAddProtein(e.target.value)}
                          className="h-7 w-14 text-[10px] font-mono"
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-[10px] text-destructive font-medium">No protein today - max fat burning</span>
                  )}
                </div>
              </div>

              {/* Add Custom Button */}
              {(addCarbs || addProtein) && (
                <Button
                  size="sm"
                  onClick={handleAddMacros}
                  className="w-full h-8"
                >
                  Add {addCarbs && `${addCarbs}g carbs`}{addCarbs && addProtein && ' + '}{addProtein && `${addProtein}g protein`}
                </Button>
              )}
            </div>

            {/* Reset Button */}
            {(tracking.carbsConsumed > 0 || tracking.proteinConsumed > 0) && (
              <button
                onClick={handleResetMacros}
                className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 mb-3"
              >
                <Trash2 className="w-3 h-3" />
                Reset macros to 0
              </button>
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

            {/* Food Reference Toggle */}
            <button
              onClick={() => setShowFoodRef(!showFoodRef)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between py-2 border-t border-muted">
                <span className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                  <Apple className="w-3 h-3" /> {showFoodRef ? 'Hide' : 'Show'} Food Reference
                </span>
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", showFoodRef && "rotate-90")} />
              </div>
            </button>

            {/* Food Reference Section */}
            {showFoodRef && (
              <div className="space-y-3 pt-2">
                {/* Sticky Summary Bar - Shows current totals while scrolling */}
                <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border border-muted rounded-lg p-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-xs font-mono font-bold">{tracking.carbsConsumed}g</span>
                      <span className="text-[10px] text-muted-foreground">carbs</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      <span className="text-xs font-mono font-bold">{tracking.proteinConsumed}g</span>
                      <span className="text-[10px] text-muted-foreground">protein</span>
                    </div>
                  </div>
                  {lastAdded && (
                    <div className="flex items-center gap-1 text-green-500 animate-in fade-in slide-in-from-right-2 duration-200">
                      <Check className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold">+{lastAdded.amount}g</span>
                    </div>
                  )}
                </div>

                <p className="text-[9px] text-muted-foreground text-center">Tap a food to quick-add its macros</p>

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
                    {foodLists.highFructose.map((food, i) => {
                      const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'fructose';
                      return (
                        <button
                          key={i}
                          onClick={() => handleFoodAdd(i, 'carbs', food.carbs, 'fructose')}
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
                    {foodLists.highGlucose.map((food, i) => {
                      const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'glucose';
                      return (
                        <button
                          key={i}
                          onClick={() => handleFoodAdd(i, 'carbs', food.carbs, 'glucose')}
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
                    {foodLists.zeroFiber.map((food, i) => {
                      const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'zerofiber';
                      return (
                        <button
                          key={i}
                          onClick={() => handleFoodAdd(i, 'carbs', food.carbs, 'zerofiber')}
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
                    {todaysFoods.protein.map((item, i) => {
                      const isJustAdded = lastAdded?.index === i && lastAdded?.type === 'protein';
                      return (
                        <button
                          key={i}
                          onClick={() => handleFoodAdd(i, 'protein', item.protein, 'protein')}
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
