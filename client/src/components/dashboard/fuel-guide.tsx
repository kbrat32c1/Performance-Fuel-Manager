import { useState, useCallback } from "react";
import { Plus, Check, ChevronDown, ChevronRight, Ban, Clock, Pill } from "lucide-react";
import { cn } from "@/lib/utils";
import { type FuelGuideResult, type SugarCarbFood, type SugarProteinFood, type TournamentFood, type RecoveryFood, SUGAR_FOODS } from "@/lib/food-data";

interface FuelGuideProps {
  guide: FuelGuideResult;
  phase: { name: string; emoji: string; color: string; bgColor: string };
  macros: { carbs: { max: number }; protein: { max: number }; ratio: string };
  daysUntilWeighIn: number;
  onLogFood: (food: { name: string; carbs?: number; protein?: number; oz?: number }, category: 'carb' | 'protein') => void;
}

// Carb type labels for badges
const CARB_LABELS: Record<string, { label: string; color: string }> = {
  fructose: { label: 'FRUCTOSE', color: 'bg-orange-500/20 text-orange-400' },
  glucose: { label: 'GLUCOSE', color: 'bg-blue-500/20 text-blue-400' },
  mixed: { label: 'MIXED', color: 'bg-purple-500/20 text-purple-400' },
  any: { label: 'ALL CARBS', color: 'bg-green-500/20 text-green-400' },
};

const PROTEIN_LABELS: Record<string, { label: string; color: string }> = {
  blocked: { label: 'NO PROTEIN', color: 'bg-red-500/20 text-red-400' },
  'collagen-only': { label: 'COLLAGEN ONLY', color: 'bg-amber-500/20 text-amber-400' },
  'collagen+seafood': { label: 'COLLAGEN + SEAFOOD', color: 'bg-cyan-500/20 text-cyan-400' },
  full: { label: 'FULL PROTEIN', color: 'bg-green-500/20 text-green-400' },
  recovery: { label: 'RECOVERY', color: 'bg-green-500/20 text-green-400' },
};

export function FuelGuide({ guide, phase, macros, daysUntilWeighIn, onLogFood }: FuelGuideProps) {
  const [flashedFood, setFlashedFood] = useState<string | null>(null);

  // Avoid section collapse state from localStorage
  const [avoidCollapsed, setAvoidCollapsed] = useState(() => {
    try { return localStorage.getItem('fuel-guide-avoid-collapsed') === 'true'; } catch { return false; }
  });

  const toggleAvoid = useCallback(() => {
    setAvoidCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('fuel-guide-avoid-collapsed', String(next)); } catch {}
      return next;
    });
  }, []);

  const handleLog = useCallback((food: { name: string; carbs?: number; protein?: number; oz?: number }, category: 'carb' | 'protein') => {
    onLogFood(food, category);
    setFlashedFood(food.name);
    setTimeout(() => setFlashedFood(null), 1200);
  }, [onLogFood]);

  const carbInfo = CARB_LABELS[guide.carbType] || CARB_LABELS.mixed;
  const proteinInfo = PROTEIN_LABELS[guide.proteinStatus] || PROTEIN_LABELS.full;

  // Select top foods for display (most portable/common)
  const morningCarbs = guide.tournamentFoods
    ? [] // tournament day uses timing windows instead
    : guide.recoveryFoods
      ? guide.recoveryFoods.slice(0, 5)
      : guide.eatCarbs.slice(0, 5);

  const eveningCarbs = guide.tournamentFoods
    ? []
    : guide.recoveryFoods
      ? guide.recoveryFoods.slice(5, 10)
      : guide.eatCarbs.slice(5, 10);

  const eveningProteins = guide.eatProtein.slice(0, 4);

  // Tournament timing groups
  const tournamentGroups = guide.tournamentFoods ? groupByTiming(guide.tournamentFoods) : null;

  return (
    <div className="space-y-3">
      {/* ── Phase Hero + Badges ── */}
      <div className={cn("rounded-lg border p-3", phase.bgColor)}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{phase.emoji}</span>
          <span className={cn("text-sm font-black uppercase tracking-wide", phase.color)}>
            {phase.name}
          </span>
          {daysUntilWeighIn >= 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs font-mono text-muted-foreground">
              <Clock className="w-3 h-3" />
              {daysUntilWeighIn === 0 ? 'TODAY' : `${daysUntilWeighIn}d`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", carbInfo.color)}>
            {carbInfo.label}
          </span>
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", proteinInfo.color)}>
            {proteinInfo.label}
          </span>
          {macros.carbs.max > 0 && (
            <span className="text-[9px] font-mono text-muted-foreground/70 ml-auto">
              {macros.carbs.max}g carb{macros.protein.max > 0 ? ` · ${macros.protein.max}g pro` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Tournament Day: Timing Windows ── */}
      {tournamentGroups && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">
            Between Matches
          </h4>
          {tournamentGroups.map(group => (
            <div key={group.timing} className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Clock className="w-3 h-3 text-yellow-500" />
                <span className="text-[10px] font-bold text-yellow-500 uppercase">{group.timing}</span>
              </div>
              {group.foods.map(food => (
                <FoodRow
                  key={food.name}
                  name={food.name}
                  serving={food.serving}
                  grams={food.carbs}
                  gramLabel="carb"
                  isFlashed={flashedFood === food.name}
                  onLog={() => handleLog({ name: food.name, carbs: food.carbs }, 'carb')}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Recovery Day: Eat Freely ── */}
      {guide.recoveryFoods && !tournamentGroups && (
        <div className="space-y-2">
          <MealSection
            emoji="🌅"
            label="Recovery Foods"
            tip="All foods allowed — rebuild everything"
            foods={guide.recoveryFoods.slice(0, 6).map(f => ({
              name: f.name,
              serving: f.serving,
              grams: f.carbs,
              gramLabel: 'carb',
            }))}
            flashedFood={flashedFood}
            onLog={(food) => handleLog({ name: food.name, carbs: food.grams }, 'carb')}
          />
          {eveningProteins.length > 0 && (
            <MealSection
              emoji="🥩"
              label="Protein Recovery"
              tip="Full protein — all sources allowed"
              foods={eveningProteins.map(f => ({
                name: f.name,
                serving: f.serving,
                grams: f.protein,
                gramLabel: 'pro',
              }))}
              flashedFood={flashedFood}
              onLog={(food) => handleLog({ name: food.name, protein: food.grams }, 'protein')}
            />
          )}
        </div>
      )}

      {/* ── Normal Days: Morning / Evening Sections ── */}
      {!tournamentGroups && !guide.recoveryFoods && (
        <div className="space-y-2">
          {/* Morning */}
          <MealSection
            emoji="🌅"
            label="Morning"
            tip={guide.mealGuide.morning}
            foods={morningCarbs.map(f => ({
              name: f.name,
              serving: f.serving,
              grams: (f as any).carbs || 0,
              gramLabel: 'carb',
              oz: (f as any).oz as number | undefined,
            }))}
            flashedFood={flashedFood}
            onLog={(food) => handleLog({ name: food.name, carbs: food.grams, oz: food.oz }, 'carb')}
          />

          {/* Evening */}
          <MealSection
            emoji="🌙"
            label="Evening"
            tip={guide.mealGuide.evening}
            foods={[
              ...eveningCarbs.map(f => ({
                name: f.name,
                serving: f.serving,
                grams: (f as any).carbs || 0,
                gramLabel: 'carb' as const,
                oz: (f as any).oz as number | undefined,
              })),
              ...eveningProteins.map(f => ({
                name: f.name,
                serving: f.serving,
                grams: f.protein,
                gramLabel: 'pro' as const,
              })),
            ]}
            flashedFood={flashedFood}
            onLog={(food) => {
              if (food.gramLabel === 'pro') {
                handleLog({ name: food.name, protein: food.grams }, 'protein');
              } else {
                handleLog({ name: food.name, carbs: food.grams, oz: food.oz }, 'carb');
              }
            }}
          />
        </div>
      )}

      {/* ── Avoid Today ── */}
      {guide.avoidFoods.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg overflow-hidden">
          <button
            onClick={toggleAvoid}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-red-500/10 transition-colors"
          >
            {avoidCollapsed ? (
              <ChevronRight className="w-3 h-3 text-red-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-red-400" />
            )}
            <Ban className="w-3 h-3 text-red-400" />
            <span className="text-[10px] font-bold uppercase text-red-400 tracking-wide">
              Avoid Today
            </span>
            <span className="text-[9px] text-red-400/60 ml-auto">
              {guide.avoidSummary}
            </span>
          </button>
          {!avoidCollapsed && (
            <div className="px-3 pb-2 space-y-1">
              {guide.avoidFoods.map(food => (
                <div key={food.name} className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px]">🚫</span>
                  <span className="text-[11px] text-red-300/80">{food.name.replace(/\s*\(.*?\)\s*$/, '')}</span>
                  <span className="text-[9px] text-red-400/50 ml-auto">{food.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Supplements ── */}
      <div className="flex items-center gap-1.5 px-1">
        <Pill className="w-3 h-3 text-muted-foreground/50" />
        <span className="text-[9px] text-muted-foreground/60">
          {SUGAR_FOODS.supplements.slice(0, 4).map(s => s.name).join(' · ')}
        </span>
      </div>
    </div>
  );
}

// ── Sub-components ──

interface MealFoodItem {
  name: string;
  serving: string;
  grams: number;
  gramLabel: string;
  oz?: number;
}

function MealSection({
  emoji,
  label,
  tip,
  foods,
  flashedFood,
  onLog,
}: {
  emoji: string;
  label: string;
  tip: string;
  foods: MealFoodItem[];
  flashedFood: string | null;
  onLog: (food: MealFoodItem) => void;
}) {
  if (foods.length === 0) return null;
  return (
    <div className="bg-muted/10 border border-muted/30 rounded-lg p-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-sm">{emoji}</span>
        <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">{label}</span>
      </div>
      <p className="text-[9px] text-muted-foreground/70 mb-2 pl-6">{tip}</p>
      {foods.map(food => (
        <FoodRow
          key={food.name}
          name={food.name}
          serving={food.serving}
          grams={food.grams}
          gramLabel={food.gramLabel}
          isFlashed={flashedFood === food.name}
          onLog={() => onLog(food)}
        />
      ))}
    </div>
  );
}

function FoodRow({
  name,
  serving,
  grams,
  gramLabel,
  isFlashed,
  onLog,
}: {
  name: string;
  serving: string;
  grams: number;
  gramLabel: string;
  isFlashed: boolean;
  onLog: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1 pl-6 pr-1 group">
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-medium text-foreground truncate block">{name}</span>
        <span className="text-[9px] text-muted-foreground/60">{serving}</span>
      </div>
      <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">
        {grams}g {gramLabel}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onLog(); }}
        className={cn(
          "w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-all active:scale-90",
          isFlashed
            ? "bg-green-500/30 text-green-400"
            : "bg-muted/40 text-muted-foreground hover:bg-primary/20 hover:text-primary"
        )}
      >
        {isFlashed ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// Group tournament foods by timing
function groupByTiming(foods: TournamentFood[]): Array<{ timing: string; foods: TournamentFood[] }> {
  const groups: Record<string, TournamentFood[]> = {};
  const order: string[] = [];
  for (let i = 0; i < foods.length; i++) {
    const t = foods[i].timing || 'Other';
    if (!groups[t]) {
      groups[t] = [];
      order.push(t);
    }
    groups[t].push(foods[i]);
  }
  return order.map(timing => ({ timing, foods: groups[timing] }));
}
