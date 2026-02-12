import { useState, useEffect, useMemo, useRef } from "react";
import { X, Loader2, Camera, Check, AlertTriangle, Pencil, Plus, Minus, Trash2, Ban } from "lucide-react";
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

export function FoodPhotoReview({ open, imageDataUrl, onClose, onLogFoods, mode, blockedCategories = [], isV2 = true }: FoodPhotoReviewProps) {
  const [state, setState] = useState<'analyzing' | 'review' | 'error'>('analyzing');
  const [foods, setFoods] = useState<PhotoFood[]>([]);
  const [confidence, setConfidence] = useState<string>('medium');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
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
    setFoods([]);
    setErrorMsg('');

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

        // For non-v2 (Sugar Diet protocols 1-4): remap veg/fruit/fat → carb
        // Sugar Diet only tracks protein and carbs
        let processedFoods = data.foods;
        if (!isV2) {
          processedFoods = data.foods.map((f: PhotoFood) => ({
            ...f,
            sparCategory: (f.sparCategory === 'veg' || f.sparCategory === 'fruit' || f.sparCategory === 'fat')
              ? 'carb' as const
              : f.sparCategory,
          }));
        }
        setFoods(processedFoods);
        const conf = data.confidence || 'medium';
        setConfidence(conf);
        setState('review');
        // Auto-expand edit panel for first item when confidence isn't high
        if (conf !== 'high' && processedFoods.length > 0) {
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

  // Computed totals
  const totals = useMemo(() => {
    return foods.reduce((acc, f) => ({
      calories: acc.calories + f.calories,
      protein: acc.protein + f.protein,
      carbs: acc.carbs + f.carbs,
      fat: acc.fat + f.fat,
      slices: acc.slices + f.sliceCount,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, slices: 0 });
  }, [foods]);

  const updateFood = (idx: number, updates: Partial<PhotoFood>) => {
    setFoods(prev => prev.map((f, i) => i === idx ? { ...f, ...updates } : f));
  };

  const removeFood = (idx: number) => {
    setFoods(prev => prev.filter((_, i) => i !== idx));
    setEditingIdx(null);
  };

  const adjustSlices = (idx: number, delta: number) => {
    const current = foods[idx].sliceCount;
    const next = Math.max(0.5, Math.min(10, current + delta));
    updateFood(idx, { sliceCount: next });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Header — with safe-area padding for iOS notch */}
      <div className="flex items-center justify-between p-4 border-b border-muted" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">
            {state === 'analyzing' ? 'Analyzing...' : state === 'error' ? 'Analysis Failed' : `${foods.length} Food${foods.length !== 1 ? 's' : ''} Found`}
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
              <p className="text-xs text-muted-foreground mt-1">AI is analyzing your photo</p>
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

        {/* Review state */}
        {state === 'review' && (
          <div className="p-4 space-y-3">
            {(confidence === 'low' || confidence === 'medium') && (
              <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <Pencil className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-500">
                  {confidence === 'low'
                    ? 'Low confidence — please review carefully and adjust as needed.'
                    : 'AI may have misidentified foods. Tap any food name to correct it.'}
                </p>
              </div>
            )}

            {/* Food items */}
            {foods.map((food, idx) => {
              const color = SPAR_COLORS[food.sparCategory] || SPAR_COLORS.carb;
              const isEditing = editingIdx === idx;
              const isBlocked = blockedCategories.includes(food.sparCategory);
              const isOffProtocol = !isV2 && !checkSugarDietFood(food.name).isOnProtocol;

              return (
                <div key={idx} className={cn(
                  "rounded-lg border overflow-hidden transition-all",
                  isOffProtocol ? "border-red-500/50 bg-red-500/5" :
                  isBlocked ? "border-amber-500/50 bg-amber-500/5" :
                  isEditing ? "border-primary/50 bg-primary/5" : "border-muted bg-card"
                )}>
                  {/* Restriction warning */}
                  {isBlocked && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="text-[9px] text-amber-500 font-bold">Not recommended for today's protocol</span>
                    </div>
                  )}
                  {/* Off-protocol warning (Sugar Diet) */}
                  {isOffProtocol && !isBlocked && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20">
                      <Ban className="w-3 h-3 text-red-400 shrink-0" />
                      <span className="text-[9px] text-red-400 font-bold">Not in Sugar Diet — this food is off-protocol</span>
                    </div>
                  )}
                  {/* Main row */}
                  <div className="flex items-center gap-3 p-3">
                    {/* Category badge */}
                    <div className={cn(
                      "px-2 py-1 rounded-md text-[9px] font-bold uppercase shrink-0",
                      isBlocked ? "bg-amber-500/15 text-amber-500" : cn(color.bg, color.text)
                    )}>
                      {isBlocked ? `⚠️ ${color.label}` : color.label}
                    </div>

                    {/* Name + macros — name is tappable to edit */}
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setEditingIdx(isEditing ? null : idx)}
                        className={cn(
                          "text-[11px] font-medium truncate text-left w-full border-b border-dotted border-muted-foreground/30 hover:border-primary/50 transition-colors cursor-pointer",
                          isBlocked && "text-amber-500/80"
                        )}
                      >
                        {food.name}
                      </button>
                      <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                        <span>{food.estimatedGrams}g</span>
                        <span>·</span>
                        <span>{food.calories} cal</span>
                        <span>·</span>
                        <span className="text-orange-500 font-mono">{food.protein}p</span>
                        <span className="text-amber-500 font-mono">{food.carbs}c</span>
                        <span className="text-yellow-500 font-mono">{food.fat}f</span>
                      </div>
                    </div>

                    {/* Slice controls */}
                    {mode === 'spar' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => adjustSlices(idx, -0.5)}
                          className="w-7 h-7 rounded bg-muted/50 flex items-center justify-center active:scale-90"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className={cn("text-sm font-bold font-mono min-w-[28px] text-center", color.text)}>
                          {food.sliceCount}
                        </span>
                        <button
                          onClick={() => adjustSlices(idx, 0.5)}
                          className="w-7 h-7 rounded bg-muted/50 flex items-center justify-center active:scale-90"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* Edit/Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditingIdx(isEditing ? null : idx)}
                        className={cn(
                          "h-7 px-2 rounded flex items-center justify-center gap-1 active:scale-90 text-[9px] font-bold transition-colors",
                          isEditing ? "bg-primary/15 text-primary" : "bg-muted/50 text-primary hover:bg-primary/10"
                        )}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => removeFood(idx)}
                        className="w-7 h-7 rounded bg-red-500/10 flex items-center justify-center active:scale-90 text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Edit panel */}
                  {isEditing && (
                    <div className="px-3 pb-3 space-y-2 border-t border-muted/50 pt-2 animate-in slide-in-from-top-1 duration-150">
                      {/* Name */}
                      <div>
                        <label className="text-[9px] text-muted-foreground uppercase font-bold">Name</label>
                        <input
                          type="text"
                          value={food.name}
                          onChange={e => updateFood(idx, { name: e.target.value })}
                          className="w-full h-8 px-2 text-xs bg-muted/30 rounded border border-muted"
                        />
                      </div>

                      {/* Macros grid */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { key: 'calories', label: 'Cal', color: '' },
                          { key: 'protein', label: 'Pro', color: 'text-orange-500' },
                          { key: 'carbs', label: 'Carb', color: 'text-amber-500' },
                          { key: 'fat', label: 'Fat', color: 'text-yellow-500' },
                        ].map(({ key, label, color: c }) => (
                          <div key={key}>
                            <label className={cn("text-[8px] uppercase font-bold", c || 'text-muted-foreground')}>{label}</label>
                            <input
                              type="number"
                              value={(food as any)[key]}
                              onChange={e => updateFood(idx, { [key]: Math.max(0, parseInt(e.target.value) || 0) })}
                              className="w-full h-7 px-1.5 text-xs text-center bg-muted/30 rounded border border-muted font-mono"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Category selector */}
                      <div>
                        <label className="text-[9px] text-muted-foreground uppercase font-bold">Category</label>
                        <div className="flex gap-1 mt-0.5">
                          {(['protein', 'carb', ...(isV2 ? ['veg', 'fruit', 'fat'] : [])] as Array<'protein' | 'carb' | 'veg' | 'fruit' | 'fat'>).map(cat => {
                            const cc = SPAR_COLORS[cat];
                            return (
                              <button
                                key={cat}
                                onClick={() => updateFood(idx, { sparCategory: cat })}
                                className={cn(
                                  "flex-1 py-1.5 rounded text-[9px] font-bold transition-all",
                                  food.sparCategory === cat
                                    ? `${cc.bg} ${cc.text} ring-1 ring-current`
                                    : "bg-muted/30 text-muted-foreground"
                                )}
                              >
                                {cc.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {foods.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                All foods removed. Close and try again.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar with totals + log button */}
      {state === 'review' && foods.length > 0 && (
        <div className="shrink-0 border-t border-muted bg-card p-4 space-y-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {/* Totals */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground font-medium">{foods.length} items</span>
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

          {/* Restriction warning for blocked items */}
          {blockedCategories.length > 0 && foods.some(f => blockedCategories.includes(f.sparCategory)) && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-[10px] text-amber-500">
                {foods.filter(f => blockedCategories.includes(f.sparCategory)).length} item{foods.filter(f => blockedCategories.includes(f.sparCategory)).length !== 1 ? 's' : ''} not recommended for today's protocol. You can still log them.
              </p>
            </div>
          )}

          {/* Off-protocol warning for Sugar Diet */}
          {!isV2 && foods.some(f => !checkSugarDietFood(f.name).isOnProtocol) && (
            <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
              <Ban className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-[10px] text-red-400">
                {foods.filter(f => !checkSugarDietFood(f.name).isOnProtocol).length} food{foods.filter(f => !checkSugarDietFood(f.name).isOnProtocol).length !== 1 ? 's' : ''} not in the Sugar Diet protocol. You can still log them but they may slow your cut.
              </p>
            </div>
          )}

          {/* Log button */}
          <button
            onClick={() => onLogFoods(foods)}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Check className="w-4 h-4" />
            Log {foods.length} Food{foods.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
