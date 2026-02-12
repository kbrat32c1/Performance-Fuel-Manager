/**
 * Reports Page — FatSecret-style weekly nutrition reports.
 * Tabs adapt to nutrition mode:
 *   SPAR  → SLICES | CALORIES | HYDRATION
 *   Sugar → CALORIES | MACROS | HYDRATION
 */

import { useState, useMemo } from "react";
import { MobileLayout } from "@/components/mobile-layout";
import { useStore, type MealSection, inferMealSection } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  format, startOfWeek, endOfWeek, addWeeks, eachDayOfInterval, isSameDay,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, BarChart3, Droplets, Flame, Utensils,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from "recharts";

/* ── calorie constants per slice (from spar-calculator-v2.ts L115-121) ── */
const SLICE_CAL: Record<string, number> = {
  protein: 125, carb: 104, veg: 32, fruit: 100, fat: 126,
};

/* ── category colors ── */
const CAT_COLORS: Record<string, string> = {
  protein: "#f97316", carb: "#f59e0b", veg: "#22c55e", fruit: "#ec4899", fat: "#eab308",
};

const MEAL_COLORS: Record<MealSection, string> = {
  breakfast: "#eab308", lunch: "#3b82f6", dinner: "#f97316", snacks: "#8b5cf6",
};

/* ── types ── */
type ReportTab = "calories" | "slices" | "macros" | "hydration";

/* ── helpers ── */
function estimateEntryCal(entry: { mode: string; sliceType?: string; sliceCount?: number; amount?: number }) {
  if (entry.mode === "spar") {
    return (SLICE_CAL[entry.sliceType || "protein"] || 100) * (entry.sliceCount || 1);
  }
  return (entry.amount || 0) * 4; // grams × 4 cal/g (approx)
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                        */
/* ════════════════════════════════════════════════════════════════════════ */

export default function Reports() {
  const {
    profile, isLoading, getDailyTracking, getMacroTargets, getSliceTargets,
    getHydrationTarget, getNutritionMode,
  } = useStore();

  const nutritionMode = getNutritionMode();
  const isSparMode = nutritionMode === "spar";
  const macroTargets = getMacroTargets();
  const sliceTargets = isSparMode ? getSliceTargets() : null;
  const hydrationTarget = getHydrationTarget();

  const today = profile?.simulatedDate || new Date();

  /* ── state ── */
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeTab, setActiveTab] = useState<ReportTab>(() =>
    isSparMode ? "slices" : "calories",
  );

  /* ── week boundaries ── */
  const weekStart = startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  /* ── core data ── */
  const weekData = useMemo(() =>
    weekDays.map((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const tracking = getDailyTracking(dateKey);
      const foodLog = tracking.foodLog || [];
      const proteinSlices = tracking.proteinSlices || 0;
      const carbSlices = tracking.carbSlices || 0;
      const vegSlices = tracking.vegSlices || 0;
      const fruitSlices = tracking.fruitSlices || 0;
      const fatSlices = tracking.fatSlices || 0;

      const estimatedCalories = isSparMode
        ? proteinSlices * SLICE_CAL.protein + carbSlices * SLICE_CAL.carb +
          vegSlices * SLICE_CAL.veg + fruitSlices * SLICE_CAL.fruit + fatSlices * SLICE_CAL.fat
        : (tracking.carbsConsumed || 0) * 4 + (tracking.proteinConsumed || 0) * 4;

      return {
        day,
        dateKey,
        dayLabel: format(day, "EEE"),
        dayNum: format(day, "d"),
        isToday: isSameDay(day, today),
        isFuture: day > today,
        tracking,
        foodLog,
        waterOz: tracking.waterConsumed || 0,
        carbsG: tracking.carbsConsumed || 0,
        proteinG: tracking.proteinConsumed || 0,
        proteinSlices, carbSlices, vegSlices, fruitSlices, fatSlices,
        totalSlices: proteinSlices + carbSlices + vegSlices + fruitSlices + fatSlices,
        estimatedCalories,
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekStart.toISOString(), today.toString(), isSparMode],
  );

  /* ── tab config ── */
  const tabs: { key: ReportTab; label: string }[] = isSparMode
    ? [{ key: "slices", label: "Slices" }, { key: "calories", label: "Calories" }, { key: "hydration", label: "Hydration" }]
    : [{ key: "calories", label: "Calories" }, { key: "macros", label: "Macros" }, { key: "hydration", label: "Hydration" }];

  /* ── period label ── */
  const periodLabel = weekOffset === 0
    ? "This Week"
    : weekOffset === -1
      ? "Last Week"
      : `Week of ${format(weekStart, "MMM d")}`;

  /* ── loading skeleton ── */
  if (isLoading) {
    return (
      <MobileLayout showNav>
        <div className="space-y-4 animate-in fade-in duration-300">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="flex gap-1.5">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 flex-1 rounded-lg" />
          </div>
          <Skeleton className="h-52 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </MobileLayout>
    );
  }

  /* ── calorie goal ── */
  const calorieGoal = sliceTargets?.totalCalories ||
    (macroTargets.carbs.max * 4 + macroTargets.protein.max * 4);

  return (
    <MobileLayout showNav>
      {/* Header */}
      <div className="mb-1">
        <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
          Nutrition
        </p>
        <h1 className="text-2xl font-heading font-bold uppercase italic tracking-tight">
          Reports
        </h1>
      </div>

      {/* ── Time Period Selector ── */}
      <div className="flex items-center justify-between mb-4 bg-card border border-border rounded-lg px-2 py-2">
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => setWeekOffset((o) => o - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">
          {periodLabel}
          <span className="block text-[10px] text-muted-foreground font-normal text-center">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d")}
          </span>
        </span>
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          disabled={weekOffset >= 0}
          onClick={() => setWeekOffset((o) => o + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex gap-1 mb-5 bg-muted/30 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex-1 text-xs font-bold uppercase tracking-wider py-2 rounded-md transition-all",
              activeTab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="space-y-4 animate-in fade-in duration-300">
        {activeTab === "calories" && (
          <CaloriesTab weekData={weekData} calorieGoal={calorieGoal} isSparMode={isSparMode} />
        )}
        {activeTab === "slices" && sliceTargets && (
          <SlicesTab weekData={weekData} sliceTargets={sliceTargets} />
        )}
        {activeTab === "macros" && (
          <MacrosTab weekData={weekData} macroTargets={macroTargets} />
        )}
        {activeTab === "hydration" && (
          <HydrationTab weekData={weekData} targetOz={hydrationTarget.targetOz} />
        )}
      </div>
    </MobileLayout>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  SHARED                                                                */
/* ════════════════════════════════════════════════════════════════════════ */

type DayData = ReturnType<typeof useDummyWeekData>[number];
// We define the shape inline via the weekData prop type below.

function EmptyState() {
  return (
    <Card className="border-dashed border-muted bg-primary/5">
      <CardContent className="p-6 text-center">
        <BarChart3 className="w-10 h-10 mx-auto mb-3 text-primary/40" />
        <p className="font-bold text-sm mb-1">No Data This Week</p>
        <p className="text-xs text-muted-foreground">
          Start logging food to see your reports here
        </p>
      </CardContent>
    </Card>
  );
}
// dummy helper type – never called, just for inference
function useDummyWeekData() { return [] as any[]; }

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--popover))",
    borderColor: "hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
    color: "hsl(var(--popover-foreground))",
  },
  cursor: { fill: "hsl(var(--muted) / 0.2)" },
};

/* ════════════════════════════════════════════════════════════════════════ */
/*  CALORIES TAB                                                          */
/* ════════════════════════════════════════════════════════════════════════ */

function CaloriesTab({ weekData, calorieGoal, isSparMode }: {
  weekData: any[]; calorieGoal: number; isSparMode: boolean;
}) {
  const daysWithData = weekData.filter((d) => !d.isFuture && d.estimatedCalories > 0);
  const totalCalories = daysWithData.reduce((s: number, d: any) => s + d.estimatedCalories, 0);
  const dailyAvg = daysWithData.length > 0 ? Math.round(totalCalories / daysWithData.length) : 0;

  const chartData = weekData.map((d: any) => ({
    name: `${d.dayLabel.substring(0, 2)} ${d.dayNum}`,
    calories: d.isFuture ? 0 : d.estimatedCalories,
    isToday: d.isToday,
  }));

  /* Meal breakdown from foodLog */
  const mealBreakdown = useMemo(() => {
    const totals: Record<MealSection, number> = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
    let grandTotal = 0;
    for (const day of weekData) {
      if (day.isFuture) continue;
      for (const entry of day.foodLog) {
        const section: MealSection = entry.mealSection || inferMealSection(entry.timestamp);
        const cal = estimateEntryCal(entry);
        totals[section] += cal;
        grandTotal += cal;
      }
    }
    return { totals, grandTotal };
  }, [weekData]);

  /* Foods eaten aggregation */
  const foodsEaten = useMemo(() => {
    const map = new Map<string, { name: string; count: number; totalCal: number }>();
    for (const day of weekData) {
      if (day.isFuture) continue;
      for (const entry of day.foodLog) {
        const key = entry.name?.toLowerCase() || "unknown";
        const existing = map.get(key) || { name: entry.name || "Unknown", count: 0, totalCal: 0 };
        existing.count += 1;
        existing.totalCal += estimateEntryCal(entry);
        map.set(key, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCal - a.totalCal);
  }, [weekData]);

  const [showAllFoods, setShowAllFoods] = useState(false);
  const displayedFoods = showAllFoods ? foodsEaten : foodsEaten.slice(0, 8);

  if (daysWithData.length === 0) return <EmptyState />;

  return (
    <>
      {/* Bar chart */}
      <Card className="border-muted">
        <CardContent className="p-3 pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Calories</p>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-2xl font-mono font-bold">{totalCalories.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">Daily Average: {dailyAvg}</span>
            <span className="text-xs text-muted-foreground ml-auto">Goal: {calorieGoal.toLocaleString()}</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" opacity={0.3} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v.toLocaleString()} kcal`, "Calories"]} />
              <ReferenceLine y={calorieGoal} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 4" strokeWidth={1.5} />
              <Bar dataKey="calories" radius={[4, 4, 0, 0]} maxBarSize={28}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.isToday ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.55)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Meal breakdown */}
      {mealBreakdown.grandTotal > 0 && (
        <Card className="border-muted">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Meal Breakdown</p>
            {(["breakfast", "lunch", "dinner", "snacks"] as MealSection[]).map((meal) => {
              const cal = Math.round(mealBreakdown.totals[meal]);
              const pct = mealBreakdown.grandTotal > 0
                ? Math.round((mealBreakdown.totals[meal] / mealBreakdown.grandTotal) * 100) : 0;
              return (
                <div key={meal} className="flex items-center gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: MEAL_COLORS[meal] }}
                  />
                  <span className="text-sm capitalize flex-1">{meal}</span>
                  <span className="text-xs text-muted-foreground w-12 text-right">({pct}%)</span>
                  <span className="text-xs font-mono w-16 text-right">{cal > 0 ? cal.toLocaleString() : "-"}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Foods eaten */}
      {foodsEaten.length > 0 && (
        <Card className="border-muted">
          <CardContent className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Foods Eaten</p>
            <div className="flex items-center text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border pb-1.5 mb-2">
              <span className="flex-1">Food</span>
              <span className="w-14 text-center">Times</span>
              <span className="w-16 text-right">Cals</span>
            </div>
            {displayedFoods.map((f, i) => (
              <div key={i} className="flex items-center py-1.5 border-b border-border/50 last:border-0">
                <span className="flex-1 text-sm truncate pr-2">{f.name}</span>
                <span className="w-14 text-center text-xs text-muted-foreground">{f.count}</span>
                <span className="w-16 text-right text-xs font-mono">{Math.round(f.totalCal).toLocaleString()}</span>
              </div>
            ))}
            <div className="flex items-center pt-2 font-bold border-t border-border mt-1">
              <span className="flex-1 text-sm">Total</span>
              <span className="w-14 text-center text-xs">{foodsEaten.reduce((s, f) => s + f.count, 0)}</span>
              <span className="w-16 text-right text-xs font-mono">
                {Math.round(foodsEaten.reduce((s, f) => s + f.totalCal, 0)).toLocaleString()}
              </span>
            </div>
            {foodsEaten.length > 8 && (
              <button
                onClick={() => setShowAllFoods(!showAllFoods)}
                className="text-xs text-primary mt-2 w-full text-center"
              >
                {showAllFoods ? "Show less" : `Show all ${foodsEaten.length} foods`}
              </button>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  SLICES TAB                                                            */
/* ════════════════════════════════════════════════════════════════════════ */

function SlicesTab({ weekData, sliceTargets }: {
  weekData: any[];
  sliceTargets: { protein: number; carb: number; veg: number; fruit: number; fat: number; totalCalories: number };
}) {
  const daysWithData = weekData.filter((d: any) => !d.isFuture && d.totalSlices > 0);
  const dailyTarget = sliceTargets.protein + sliceTargets.carb + sliceTargets.veg +
    sliceTargets.fruit + sliceTargets.fat;

  const chartData = weekData.map((d: any) => ({
    name: `${d.dayLabel.substring(0, 2)} ${d.dayNum}`,
    protein: d.isFuture ? 0 : d.proteinSlices,
    carb: d.isFuture ? 0 : d.carbSlices,
    veg: d.isFuture ? 0 : d.vegSlices,
    fruit: d.isFuture ? 0 : d.fruitSlices,
    fat: d.isFuture ? 0 : d.fatSlices,
  }));

  /* Weekly totals per category */
  const catTotals = useMemo(() => {
    const cats = ["protein", "carb", "veg", "fruit", "fat"] as const;
    return cats.map((c) => {
      const consumed = daysWithData.reduce((s: number, d: any) => s + (d[`${c}Slices`] || 0), 0);
      const target = (sliceTargets as any)[c] * 7;
      const pct = target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0;
      return { category: c, consumed, target, pct };
    });
  }, [daysWithData, sliceTargets]);

  if (daysWithData.length === 0) return <EmptyState />;

  return (
    <>
      {/* Stacked bar chart */}
      <Card className="border-muted">
        <CardContent className="p-3 pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Daily Slices</p>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-2xl font-mono font-bold">
              {daysWithData.reduce((s: number, d: any) => s + d.totalSlices, 0)}
            </span>
            <span className="text-xs text-muted-foreground">total this week</span>
            <span className="text-xs text-muted-foreground ml-auto">Target: {dailyTarget}/day</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" opacity={0.3} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <ReferenceLine y={dailyTarget} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 4" strokeWidth={1.5} />
              <Bar dataKey="protein" stackId="a" fill={CAT_COLORS.protein} />
              <Bar dataKey="carb" stackId="a" fill={CAT_COLORS.carb} />
              <Bar dataKey="veg" stackId="a" fill={CAT_COLORS.veg} />
              <Bar dataKey="fruit" stackId="a" fill={CAT_COLORS.fruit} />
              <Bar dataKey="fat" stackId="a" fill={CAT_COLORS.fat} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
            {(["protein", "carb", "veg", "fruit", "fat"] as const).map((c) => (
              <div key={c} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: CAT_COLORS[c] }} />
                <span className="text-[10px] text-muted-foreground capitalize">{c}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Category breakdown */}
      <Card className="border-muted">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Weekly Breakdown</p>
          {catTotals.map((c) => (
            <div key={c.category}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm capitalize font-medium">{c.category}</span>
                <span className="text-xs text-muted-foreground">{c.consumed}/{c.target} ({c.pct}%)</span>
              </div>
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, c.pct)}%`,
                    backgroundColor: CAT_COLORS[c.category],
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  MACROS TAB                                                            */
/* ════════════════════════════════════════════════════════════════════════ */

function MacrosTab({ weekData, macroTargets }: {
  weekData: any[];
  macroTargets: { carbs: { min: number; max: number }; protein: { min: number; max: number }; ratio: string };
}) {
  const daysWithData = weekData.filter((d: any) => !d.isFuture && (d.carbsG > 0 || d.proteinG > 0));
  const totalCarbs = daysWithData.reduce((s: number, d: any) => s + d.carbsG, 0);
  const totalProtein = daysWithData.reduce((s: number, d: any) => s + d.proteinG, 0);
  const avgCarbs = daysWithData.length > 0 ? Math.round(totalCarbs / daysWithData.length) : 0;
  const avgProtein = daysWithData.length > 0 ? Math.round(totalProtein / daysWithData.length) : 0;

  const carbTarget = Math.round((macroTargets.carbs.min + macroTargets.carbs.max) / 2);
  const proteinTarget = Math.round((macroTargets.protein.min + macroTargets.protein.max) / 2);

  const chartData = weekData.map((d: any) => ({
    name: `${d.dayLabel.substring(0, 2)} ${d.dayNum}`,
    carbs: d.isFuture ? 0 : d.carbsG,
    protein: d.isFuture ? 0 : d.proteinG,
  }));

  if (daysWithData.length === 0) return <EmptyState />;

  return (
    <>
      {/* Grouped bar chart */}
      <Card className="border-muted">
        <CardContent className="p-3 pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Daily Macros (g)</p>
          <div className="flex items-baseline gap-4 mb-3">
            <div>
              <span className="text-lg font-mono font-bold" style={{ color: "hsl(var(--primary))" }}>{avgCarbs}g</span>
              <span className="text-[10px] text-muted-foreground ml-1">avg carbs</span>
            </div>
            <div>
              <span className="text-lg font-mono font-bold text-orange-500">{avgProtein}g</span>
              <span className="text-[10px] text-muted-foreground ml-1">avg protein</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" opacity={0.3} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} unit="g" />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, name: string) => [`${v}g`, name === "carbs" ? "Carbs" : "Protein"]} />
              {carbTarget > 0 && (
                <ReferenceLine y={carbTarget} stroke="hsl(var(--primary) / 0.5)" strokeDasharray="4 4" strokeWidth={1} />
              )}
              {proteinTarget > 0 && (
                <ReferenceLine y={proteinTarget} stroke="#f9731680" strokeDasharray="4 4" strokeWidth={1} />
              )}
              <Bar dataKey="carbs" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar dataKey="protein" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-primary" />
              <span className="text-[10px] text-muted-foreground">Carbs ({macroTargets.carbs.min}–{macroTargets.carbs.max}g)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
              <span className="text-[10px] text-muted-foreground">Protein ({macroTargets.protein.min}–{macroTargets.protein.max}g)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Weekly Summary</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total Carbs</p>
              <p className="text-lg font-mono font-bold">{Math.round(totalCarbs)}g</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total Protein</p>
              <p className="text-lg font-mono font-bold">{Math.round(totalProtein)}g</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Ratio</p>
              <p className="text-sm font-medium">{macroTargets.ratio}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Days Logged</p>
              <p className="text-lg font-mono font-bold">{daysWithData.length}/7</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  HYDRATION TAB                                                         */
/* ════════════════════════════════════════════════════════════════════════ */

function HydrationTab({ weekData, targetOz }: { weekData: any[]; targetOz: number }) {
  const daysWithData = weekData.filter((d: any) => !d.isFuture && d.waterOz > 0);
  const totalOz = daysWithData.reduce((s: number, d: any) => s + d.waterOz, 0);
  const dailyAvg = daysWithData.length > 0 ? Math.round(totalOz / daysWithData.length) : 0;
  const daysHit = daysWithData.filter((d: any) => d.waterOz >= targetOz).length;

  const chartData = weekData.map((d: any) => ({
    name: `${d.dayLabel.substring(0, 2)} ${d.dayNum}`,
    water: d.isFuture ? 0 : d.waterOz,
    isToday: d.isToday,
    hitTarget: d.waterOz >= targetOz,
  }));

  if (daysWithData.length === 0) return <EmptyState />;

  return (
    <>
      {/* Bar chart */}
      <Card className="border-muted">
        <CardContent className="p-3 pt-4">
          <div className="flex items-center gap-2 mb-1">
            <Droplets className="w-4 h-4 text-cyan-500" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hydration</p>
          </div>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-2xl font-mono font-bold">{totalOz}</span>
            <span className="text-xs text-muted-foreground">oz total</span>
            <span className="text-xs text-muted-foreground ml-auto">Target: {targetOz} oz/day</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" opacity={0.3} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} unit=" oz" />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v} oz`, "Water"]} />
              <ReferenceLine y={targetOz} stroke="#06b6d4" strokeDasharray="6 4" strokeWidth={1.5} />
              <Bar dataKey="water" radius={[4, 4, 0, 0]} maxBarSize={28}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.isToday ? "#06b6d4"
                        : entry.hitTarget ? "#06b6d4b3"
                          : entry.water > 0 ? "#06b6d466"
                            : "hsl(var(--muted) / 0.3)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Weekly Summary</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total</p>
              <p className="text-lg font-mono font-bold">{totalOz} oz</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Daily Average</p>
              <p className="text-lg font-mono font-bold">{dailyAvg} oz</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Days Hit Target</p>
              <p className="text-lg font-mono font-bold text-cyan-500">{daysHit}/7</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Target</p>
              <p className="text-lg font-mono font-bold">{targetOz} oz</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
