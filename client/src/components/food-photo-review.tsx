import { useState, useEffect, useMemo, useRef } from "react";
import { X, Loader2, Camera, Check, AlertTriangle, Pencil, Plus, Minus, Trash2, Ban, ChevronDown, ArrowLeftRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkSugarDietFood } from "@/lib/food-data";

export interface PhotoFood {
  name: string;
  estimatedGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sparCategory: 'protein' | 'carb' | 'veg' | 'fruit' | 'fat';
  sliceCount: number;
}

// ─── FatSecret-matched food types (mirrors server MatchedFood) ──────────────

export interface FatSecretServing {
  id: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  metricAmount: number | null;
  metricUnit: string;
  isDefault: boolean;
}

export interface FatSecretFood {
  id: string;
  name: string;
  brand: string;
  type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize: number | null;
  servingSizeUnit: string;
  servingSizeLabel: string;
  sparCategory: string | null;
  servings: FatSecretServing[];
}

export interface MatchedFood {
  originalName: string;
  quantity: string;
  estimatedGrams: number;
  fsMatch: FatSecretFood | null;
  selectedServing: FatSecretServing | null;
  servingQty: number;
  alternatives: FatSecretFood[];
  aiFallback: {
    name: string;
    estimatedGrams: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sparCategory: string;
    sliceCount: number;
  } | null;
  matchConfidence: 'exact' | 'close' | 'fuzzy' | 'none';
}

/** Convert a MatchedFood (with its current serving selection) to PhotoFood for logging. */
export function matchedFoodToPhotoFood(mf: MatchedFood, servingOverride?: FatSecretServing, qtyOverride?: number): PhotoFood {
  // If no FatSecret match, use AI fallback
  if (!mf.fsMatch || !mf.selectedServing) {
    const fb = mf.aiFallback;
    if (!fb) {
      return {
        name: mf.originalName, estimatedGrams: mf.estimatedGrams,
        calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
        sparCategory: 'carb', sliceCount: 0,
      };
    }
    return {
      name: fb.name, estimatedGrams: fb.estimatedGrams,
      calories: fb.calories, protein: fb.protein, carbs: fb.carbs,
      fat: fb.fat, fiber: fb.fiber,
      sparCategory: (fb.sparCategory as PhotoFood['sparCategory']) || 'carb',
      sliceCount: fb.sliceCount,
    };
  }

  const serving = servingOverride || mf.selectedServing;
  const qty = qtyOverride ?? mf.servingQty;

  const calories = Math.round(serving.calories * qty);
  const protein = Math.round(serving.protein * qty);
  const carbs = Math.round(serving.carbs * qty);
  const fat = Math.round(serving.fat * qty);
  const fiber = Math.round(serving.fiber * qty);
  const sparCategory = (mf.fsMatch.sparCategory as PhotoFood['sparCategory']) || 'carb';
  const estimatedGrams = serving.metricAmount ? Math.round(serving.metricAmount * qty) : mf.estimatedGrams;

  // Compute slice count based on category
  // Negligible = virtually zero nutrition (black coffee, water, tea, diet drinks)
  const isNegligible = calories < 15 && protein < 2 && carbs < 3 && fat < 2;
  let sliceCount = 0;
  if (!isNegligible) {
    if (sparCategory === 'protein') sliceCount = protein >= 5 ? Math.max(1, Math.round(protein / 25)) : 0;
    else if (sparCategory === 'carb') sliceCount = carbs >= 5 ? Math.max(1, Math.round(carbs / 26)) : 0;
    else if (sparCategory === 'veg') sliceCount = estimatedGrams >= 30 ? Math.max(1, Math.round(estimatedGrams / 80)) : 0;
    else if (sparCategory === 'fruit') sliceCount = 1;
    else if (sparCategory === 'fat') sliceCount = fat >= 5 ? Math.max(1, Math.round(fat / 14)) : 0;
    else sliceCount = calories >= 30 ? 1 : 0;
  }

  return {
    name: mf.fsMatch.name + (mf.fsMatch.brand ? ` (${mf.fsMatch.brand})` : ''),
    estimatedGrams, calories, protein, carbs, fat, fiber,
    sparCategory, sliceCount,
  };
}

interface FoodPhotoReviewProps {
  open: boolean;
  imageDataUrl: string | null;
  onClose: () => void;
  onLogFoods: (foods: PhotoFood[]) => void;
  mode: 'spar' | 'sugar';
  /** Categories that the current protocol restricts (e.g., no protein on fructose days) */
  blockedCategories?: string[];
  /** Whether SPAR v2 mode is active (all 5 categories). When false, only protein/carb. */
  isV2?: boolean;
}

const SPAR_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  protein: { bg: 'bg-orange-500/15', text: 'text-orange-500', label: 'Pro' },
  carb: { bg: 'bg-amber-500/15', text: 'text-amber-500', label: 'Carb' },
  veg: { bg: 'bg-green-500/15', text: 'text-green-500', label: 'Veg' },
  fruit: { bg: 'bg-pink-500/15', text: 'text-pink-500', label: 'Fruit' },
  fat: { bg: 'bg-yellow-600/15', text: 'text-yellow-600', label: 'Fat' },
};

const CONFIDENCE_DOTS: Record<string, string> = {
  exact: 'bg-green-500',
  close: 'bg-yellow-500',
  fuzzy: 'bg-orange-500',
  none: 'bg-red-500',
};

export function FoodPhotoReview({ open, imageDataUrl, onClose, onLogFoods, mode, blockedCategories = [], isV2 = true }: FoodPhotoReviewProps) {
  const [state, setState] = useState<'analyzing' | 'review' | 'error'>('analyzing');
  const [matchedFoods, setMatchedFoods] = useState<MatchedFood[]>([]);
  // Per-food overrides: serving index, qty, removed
  const [servingSelections, setServingSelections] = useState<Map<number, { servingIdx: number; qty: number }>>(new Map());
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [confidence, setConfidence] = useState<string>('medium');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAltsIdx, setShowAltsIdx] = useState<number | null>(null);
  const isMountedRef = useRef(true);

  // Track mount state to prevent setState on unmounted component
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Analyze image when opened
  useEffect(() => {
    if (!open || !imageDataUrl) return;

    setState('analyzing');
    setMatchedFoods([]);
    setServingSelections(new Map());
    setRemovedIndices(new Set());
    setErrorMsg('');
    setEditingIdx(null);
    setShowAltsIdx(null);

    let cancelled = false;

    const analyze = async () => {
      try {
        const res = await fetch('/api/foods/photo-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageDataUrl }),
        });

        if (cancelled || !isMountedRef.current) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Server error ${res.status}`);
        }

        const data = await res.json();

        if (cancelled || !isMountedRef.current) return;

        if (!data.foods || data.foods.length === 0) {
          setErrorMsg(data.error || 'No food detected in the photo. Try taking a clearer picture.');
          setState('error');
          return;
        }

        setMatchedFoods(data.foods);
        const conf = data.confidence || 'medium';
        setConfidence(conf);
        setState('review');
        if (conf !== 'high' && data.foods.length > 0) {
          setEditingIdx(0);
        }
      } catch (err: any) {
        if (cancelled || !isMountedRef.current) return;
        console.error('Photo analysis error:', err);
        setErrorMsg(err.message || 'Failed to analyze photo. Please try again.');
        setState('error');
      }
    };

    analyze();

    return () => { cancelled = true; };
  }, [open, imageDataUrl]);

  // Get effective serving and qty for a food (with overrides)
  const getEffectiveServing = (idx: number) => {
    const mf = matchedFoods[idx];
    const override = servingSelections.get(idx);
    if (!mf.fsMatch) return { serving: null, qty: 1 };
    const servingIdx = override?.servingIdx ?? mf.fsMatch.servings.findIndex(s => s.id === mf.selectedServing?.id);
    const serving = mf.fsMatch.servings[servingIdx >= 0 ? servingIdx : 0] || mf.selectedServing;
    const qty = override?.qty ?? mf.servingQty;
    return { serving, qty };
  };

  // Convert all active MatchedFoods to PhotoFoods for logging
  const getPhotoFoods = (): PhotoFood[] => {
    return matchedFoods
      .filter((_, i) => !removedIndices.has(i))
      .map((mf, _originalIdx) => {
        const realIdx = matchedFoods.indexOf(mf);
        const { serving, qty } = getEffectiveServing(realIdx);
        return matchedFoodToPhotoFood(mf, serving || undefined, qty);
      })
      .map(f => {
        // For non-v2: remap veg/fruit/fat → carb
        if (!isV2 && ['veg', 'fruit', 'fat'].includes(f.sparCategory)) {
          return { ...f, sparCategory: 'carb' as const };
        }
        return f;
      });
  };

  // Computed totals from effective serving selections
  const totals = useMemo(() => {
    const photoFoods = matchedFoods
      .filter((_, i) => !removedIndices.has(i))
      .map((mf) => {
        const realIdx = matchedFoods.indexOf(mf);
        const { serving, qty } = getEffectiveServing(realIdx);
        return matchedFoodToPhotoFood(mf, serving || undefined, qty);
      });
    return photoFoods.reduce((acc, f) => ({
      calories: acc.calories + f.calories,
      protein: acc.protein + f.protein,
      carbs: acc.carbs + f.carbs,
      fat: acc.fat + f.fat,
      slices: acc.slices + f.sliceCount,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, slices: 0 });
  }, [matchedFoods, servingSelections, removedIndices]);

  const removeFood = (idx: number) => {
    setRemovedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const updateServingQty = (idx: number, delta: number) => {
    setServingSelections(prev => {
      const next = new Map(prev);
      const existing = next.get(idx);
      const mf = matchedFoods[idx];
      const currentQty = existing?.qty ?? mf.servingQty;
      const newQty = Math.max(0.5, Math.min(20, currentQty + delta));
      const servingIdx = existing?.servingIdx ?? (mf.fsMatch?.servings.findIndex(s => s.id === mf.selectedServing?.id) ?? 0);
      next.set(idx, { servingIdx: Math.max(0, servingIdx), qty: newQty });
      return next;
    });
  };

  const selectServing = (foodIdx: number, servingIdx: number) => {
    setServingSelections(prev => {
      const next = new Map(prev);
      const existing = next.get(foodIdx);
      next.set(foodIdx, { servingIdx, qty: existing?.qty ?? matchedFoods[foodIdx].servingQty });
      return next;
    });
  };

  const swapMatch = (foodIdx: number, altFood: FatSecretFood) => {
    setMatchedFoods(prev => prev.map((mf, i) => {
      if (i !== foodIdx) return mf;
      const defaultServing = altFood.servings.find(s => s.isDefault) || altFood.servings[0];
      // Recompute serving qty for target grams
      let bestServing = defaultServing;
      let bestQty = 1;
      if (mf.estimatedGrams > 0 && defaultServing?.metricAmount) {
        bestQty = Math.max(0.5, Math.round((mf.estimatedGrams / defaultServing.metricAmount) * 2) / 2);
      }
      return {
        ...mf,
        fsMatch: altFood,
        selectedServing: bestServing,
        servingQty: bestQty,
        alternatives: [mf.fsMatch!, ...mf.alternatives.filter(a => a.id !== altFood.id)].filter(Boolean),
        aiFallback: null,
        matchConfidence: 'close' as const,
      };
    }));
    // Clear serving override since we reset selection
    setServingSelections(prev => {
      const next = new Map(prev);
      next.delete(foodIdx);
      return next;
    });
    setShowAltsIdx(null);
  };

  if (!open) return null;

  const activeCount = matchedFoods.filter((_, i) => !removedIndices.has(i)).length;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Header — with safe-area padding for iOS notch */}
      <div className="flex items-center justify-between p-4 border-b border-muted" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">
            {state === 'analyzing' ? 'Analyzing...' : state === 'error' ? 'Analysis Failed' : `${matchedFoods.length} Food${matchedFoods.length !== 1 ? 's' : ''} Found`}
          </span>
          {state === 'review' && confidence && (
            <span className={cn(
              "text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase",
              confidence === 'high' ? "bg-green-500/15 text-green-500" :
              confidence === 'medium' ? "bg-amber-500/15 text-amber-500" :
              "bg-red-500/15 text-red-500"
            )}>
              {confidence}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 active:scale-95 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
        {/* Thumbnail preview — kept small so food list has room */}
        {imageDataUrl && (
          <div className="px-4 pt-3">
            <img
              src={imageDataUrl}
              alt="Food photo"
              className="w-full max-h-24 object-cover rounded-lg border border-muted"
            />
          </div>
        )}

        {/* Analyzing state */}
        {state === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <Camera className="w-5 h-5 text-primary/60 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Identifying foods...</p>
              <p className="text-xs text-muted-foreground mt-1">Looking up nutrition from FatSecret database</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6">
            <AlertTriangle className="w-10 h-10 text-amber-500" />
            <p className="text-sm text-center text-muted-foreground">{errorMsg}</p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Review state — FatSecret-aware */}
        {state === 'review' && (
          <div className="p-4 space-y-3">
            {matchedFoods.some(mf => mf.matchConfidence === 'none') && (
              <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <Info className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-500">
                  Some foods couldn't be matched in the database — using AI estimates for those.
                </p>
              </div>
            )}

            {/* Food items */}
            {matchedFoods.map((mf, idx) => {
              const isRemoved = removedIndices.has(idx);
              const isEditing = editingIdx === idx;
              const { serving, qty } = getEffectiveServing(idx);
              const photoFood = matchedFoodToPhotoFood(mf, serving || undefined, qty);
              const color = SPAR_COLORS[photoFood.sparCategory] || SPAR_COLORS.carb;
              const isBlocked = blockedCategories.includes(photoFood.sparCategory);
              const isOffProtocol = !isV2 && !checkSugarDietFood(photoFood.name).isOnProtocol;
              const isFallback = !mf.fsMatch;
              const confDot = CONFIDENCE_DOTS[mf.matchConfidence] || CONFIDENCE_DOTS.none;

              if (isRemoved) {
                return (
                  <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-muted/30 bg-muted/5 opacity-40">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium line-through truncate">{mf.originalName}</p>
                    </div>
                    <button
                      onClick={() => removeFood(idx)}
                      className="text-[9px] font-bold text-primary px-2 py-1 rounded bg-primary/10"
                    >
                      Undo
                    </button>
                  </div>
                );
              }

              return (
                <div key={idx} className={cn(
                  "rounded-lg border overflow-hidden transition-all",
                  isOffProtocol ? "border-red-500/50 bg-red-500/5" :
                  isBlocked ? "border-amber-500/50 bg-amber-500/5" :
                  isFallback ? "border-amber-500/30 bg-amber-500/5" :
                  isEditing ? "border-primary/50 bg-primary/5" : "border-muted bg-card"
                )}>
                  {/* Restriction warnings */}
                  {isBlocked && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="text-[9px] text-amber-500 font-bold">Not recommended for today's protocol</span>
                    </div>
                  )}
                  {isOffProtocol && !isBlocked && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20">
                      <Ban className="w-3 h-3 text-red-400 shrink-0" />
                      <span className="text-[9px] text-red-400 font-bold">Not in Sugar Diet — off-protocol</span>
                    </div>
                  )}
                  {isFallback && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="text-[9px] text-amber-500 font-bold">No database match — AI estimate</span>
                    </div>
                  )}

                  {/* Main row */}
                  <div className="flex items-center gap-3 p-3">
                    {/* Category badge + match confidence dot */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className={cn(
                        "px-2 py-1 rounded-md text-[9px] font-bold uppercase",
                        isBlocked ? "bg-amber-500/15 text-amber-500" : cn(color.bg, color.text)
                      )}>
                        {color.label}
                      </div>
                      <div className={cn("w-1.5 h-1.5 rounded-full", confDot)} title={mf.matchConfidence} />
                    </div>

                    {/* Name + serving info + macros */}
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setEditingIdx(isEditing ? null : idx)}
                        className="text-[11px] font-medium truncate text-left w-full hover:text-primary transition-colors cursor-pointer"
                      >
                        {mf.fsMatch ? mf.fsMatch.name : mf.originalName}
                        {mf.fsMatch?.brand && <span className="text-muted-foreground/60 font-normal"> ({mf.fsMatch.brand})</span>}
                      </button>
                      {/* Serving description */}
                      {serving && (
                        <p className="text-[9px] text-primary/70 font-medium mt-0.5">
                          {qty !== 1 ? `${qty} × ` : ''}{serving.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                        <span>{photoFood.calories} cal</span>
                        <span>·</span>
                        <span className="text-orange-500 font-mono">{photoFood.protein}p</span>
                        <span className="text-amber-500 font-mono">{photoFood.carbs}c</span>
                        <span className="text-yellow-500 font-mono">{photoFood.fat}f</span>
                      </div>
                    </div>

                    {/* Qty controls */}
                    {mf.fsMatch && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => updateServingQty(idx, -0.5)}
                          className="w-7 h-7 rounded bg-muted/50 flex items-center justify-center active:scale-90"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className={cn("text-sm font-bold font-mono min-w-[28px] text-center", color.text)}>
                          {qty}
                        </span>
                        <button
                          onClick={() => updateServingQty(idx, 0.5)}
                          className="w-7 h-7 rounded bg-muted/50 flex items-center justify-center active:scale-90"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => removeFood(idx)}
                      className="w-7 h-7 rounded bg-red-500/10 flex items-center justify-center active:scale-90 text-red-500 shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Edit panel — serving picker + alternatives */}
                  {isEditing && mf.fsMatch && (
                    <div className="px-3 pb-3 space-y-2 border-t border-muted/50 pt-2 animate-in slide-in-from-top-1 duration-150">
                      {/* Serving size dropdown */}
                      <div>
                        <label className="text-[9px] text-muted-foreground uppercase font-bold">Serving Size</label>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {mf.fsMatch.servings.map((s, si) => {
                            const override = servingSelections.get(idx);
                            const currentSi = override?.servingIdx ?? mf.fsMatch!.servings.findIndex(sv => sv.id === mf.selectedServing?.id);
                            const isActive = si === (currentSi >= 0 ? currentSi : 0);
                            return (
                              <button
                                key={s.id}
                                onClick={() => selectServing(idx, si)}
                                className={cn(
                                  "px-2 py-1 rounded text-[9px] font-medium transition-all",
                                  isActive
                                    ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                                )}
                              >
                                {s.description}
                                {s.metricAmount ? ` (${s.metricAmount}${s.metricUnit})` : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Swap match — show alternatives */}
                      {mf.alternatives.length > 0 && (
                        <div>
                          <button
                            onClick={() => setShowAltsIdx(showAltsIdx === idx ? null : idx)}
                            className="flex items-center gap-1 text-[9px] font-bold text-primary/70 hover:text-primary"
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                            Swap match ({mf.alternatives.length} alternatives)
                            <ChevronDown className={cn("w-3 h-3 transition-transform", showAltsIdx === idx && "rotate-180")} />
                          </button>
                          {showAltsIdx === idx && (
                            <div className="mt-1 space-y-1">
                              {mf.alternatives.map(alt => (
                                <button
                                  key={alt.id}
                                  onClick={() => swapMatch(idx, alt)}
                                  className="w-full text-left px-2 py-1.5 rounded bg-muted/20 hover:bg-primary/10 transition-colors"
                                >
                                  <p className="text-[10px] font-medium truncate">
                                    {alt.name}
                                    {alt.brand && <span className="text-muted-foreground/60 font-normal"> ({alt.brand})</span>}
                                  </p>
                                  <p className="text-[9px] text-muted-foreground">
                                    {alt.calories} cal · {alt.protein}p {alt.carbs}c {alt.fat}f
                                  </p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {activeCount === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                All foods removed. Close and try again.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar with totals + log button */}
      {state === 'review' && activeCount > 0 && (
        <div className="shrink-0 border-t border-muted bg-card p-4 space-y-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {/* Totals */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground font-medium">{activeCount} items</span>
              {mode === 'spar' && (
                <span className="font-mono font-bold text-primary">{totals.slices} slices</span>
              )}
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px]">
              <span>{totals.calories} cal</span>
              <span className="text-orange-500 font-bold">{totals.protein}p</span>
              <span className="text-amber-500 font-bold">{totals.carbs}c</span>
              <span className="text-yellow-500 font-bold">{totals.fat}f</span>
            </div>
          </div>

          {/* Log button */}
          <button
            onClick={() => onLogFoods(getPhotoFoods())}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Check className="w-4 h-4" />
            Log {activeCount} Food{activeCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
