/**
 * VoiceFoodLogger — Speech-to-food logging component.
 * Uses Web Speech API to capture spoken food descriptions,
 * sends transcript to AI for parsing, looks up FatSecret nutrition.
 * Falls back to text input when Speech API is unavailable.
 * Shows parsed results with serving pickers for review before confirming.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { authHeaders } from "@/lib/auth-headers";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Loader2, X, Send, Keyboard, Check, Trash2, RotateCcw, Minus, Plus, ChevronDown, ArrowLeftRight, AlertTriangle } from "lucide-react";
import { type PhotoFood, type MatchedFood, type FatSecretFood, type FatSecretServing, matchedFoodToPhotoFood } from "@/components/food-photo-review";
import { hapticTap, hapticSuccess, hapticWarning } from "@/lib/haptics";

interface VoiceFoodLoggerProps {
  onFoodsReady: (foods: PhotoFood[], confidence: string) => void;
  onClose: () => void;
}

// Check if Speech API is available
const hasSpeechAPI = typeof window !== 'undefined' && (
  'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
);

type Step = 'input' | 'review';

const CONFIDENCE_DOTS: Record<string, string> = {
  exact: 'bg-green-500',
  close: 'bg-yellow-500',
  fuzzy: 'bg-orange-500',
  none: 'bg-red-500',
};

const SPAR_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  protein: { bg: 'bg-orange-500/15', text: 'text-orange-500', label: 'Pro' },
  carb: { bg: 'bg-amber-500/15', text: 'text-amber-500', label: 'Carb' },
  veg: { bg: 'bg-green-500/15', text: 'text-green-500', label: 'Veg' },
  fruit: { bg: 'bg-pink-500/15', text: 'text-pink-500', label: 'Fruit' },
  fat: { bg: 'bg-yellow-600/15', text: 'text-yellow-600', label: 'Fat' },
};

export function VoiceFoodLogger({ onFoodsReady, onClose }: VoiceFoodLoggerProps) {
  const [step, setStep] = useState<Step>('input');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textMode, setTextMode] = useState(!hasSpeechAPI);
  const [matchedFoods, setMatchedFoods] = useState<MatchedFood[]>([]);
  const [confidence, setConfidence] = useState('medium');
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [servingSelections, setServingSelections] = useState<Map<number, { servingIdx: number; qty: number }>>(new Map());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAltsIdx, setShowAltsIdx] = useState<number | null>(null);
  const [listenSeconds, setListenSeconds] = useState(0);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const listenIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const submittingRef = useRef(false);

  // Get effective serving and qty for a food (with overrides)
  const getEffectiveServing = useCallback((idx: number): { serving: FatSecretServing | null; qty: number } => {
    const mf = matchedFoods[idx];
    if (!mf?.fsMatch) return { serving: null, qty: 1 };
    const override = servingSelections.get(idx);
    const servingIdx = override?.servingIdx ?? mf.fsMatch.servings.findIndex(s => s.id === mf.selectedServing?.id);
    const serving = mf.fsMatch.servings[servingIdx >= 0 ? servingIdx : 0] || mf.selectedServing;
    const qty = override?.qty ?? mf.servingQty;
    return { serving, qty };
  }, [matchedFoods, servingSelections]);

  // ─── Send transcript to AI for parsing ───
  const handleSubmit = useCallback(async () => {
    const submitText = transcript.trim();
    if (!submitText || submittingRef.current) return;

    submittingRef.current = true;
    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/foods/voice-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ transcript: submitText }),
      });

      // Check content-type to avoid parsing HTML as JSON
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Server error — please try again');
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to parse food');
      }

      const data = await response.json();
      if (data.foods && data.foods.length > 0) {
        setMatchedFoods(data.foods);
        setConfidence(data.confidence || 'medium');
        setRemovedIndices(new Set());
        setServingSelections(new Map());
        setEditingIdx(null);
        setShowAltsIdx(null);
        setStep('review');
        hapticSuccess();
      } else {
        setError('Could not identify any foods. Try again with more detail.');
        hapticWarning();
      }
    } catch (err: any) {
      console.error('Voice parse error:', err);
      setError(err.message || 'Failed to process food description');
      hapticWarning();
    } finally {
      setIsProcessing(false);
      submittingRef.current = false;
    }
  }, [transcript]);

  // ─── Confirm and log foods ───
  const handleConfirm = useCallback(() => {
    const photoFoods = matchedFoods
      .filter((_, i) => !removedIndices.has(i))
      .map((mf) => {
        const realIdx = matchedFoods.indexOf(mf);
        const { serving, qty } = getEffectiveServing(realIdx);
        return matchedFoodToPhotoFood(mf, serving || undefined, qty);
      });
    if (photoFoods.length > 0) {
      onFoodsReady(photoFoods, confidence);
    }
  }, [matchedFoods, removedIndices, servingSelections, confidence, onFoodsReady, getEffectiveServing]);

  // ─── Toggle remove food from results ───
  const toggleRemove = useCallback((index: number) => {
    hapticTap();
    setRemovedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }, []);

  // ─── Serving qty adjustment ───
  const updateServingQty = useCallback((idx: number, delta: number) => {
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
  }, [matchedFoods]);

  // ─── Select a serving size ───
  const selectServing = useCallback((foodIdx: number, servingIdx: number) => {
    setServingSelections(prev => {
      const next = new Map(prev);
      const existing = next.get(foodIdx);
      next.set(foodIdx, { servingIdx, qty: existing?.qty ?? matchedFoods[foodIdx].servingQty });
      return next;
    });
  }, [matchedFoods]);

  // ─── Swap to an alternative match ───
  const swapMatch = useCallback((foodIdx: number, altFood: FatSecretFood) => {
    setMatchedFoods(prev => prev.map((mf, i) => {
      if (i !== foodIdx) return mf;
      const defaultServing = altFood.servings.find(s => s.isDefault) || altFood.servings[0];
      let bestQty = 1;
      if (mf.estimatedGrams > 0 && defaultServing?.metricAmount) {
        bestQty = Math.max(0.5, Math.round((mf.estimatedGrams / defaultServing.metricAmount) * 2) / 2);
      }
      return {
        ...mf,
        fsMatch: altFood,
        selectedServing: defaultServing,
        servingQty: bestQty,
        alternatives: [mf.fsMatch!, ...mf.alternatives.filter(a => a.id !== altFood.id)].filter(Boolean),
        aiFallback: null,
        matchConfidence: 'close' as const,
      };
    }));
    setServingSelections(prev => {
      const next = new Map(prev);
      next.delete(foodIdx);
      return next;
    });
    setShowAltsIdx(null);
  }, []);

  // ─── Go back to input step ───
  const handleRetry = useCallback(() => {
    submittingRef.current = false;
    setStep('input');
    setMatchedFoods([]);
    setRemovedIndices(new Set());
    setServingSelections(new Map());
    setEditingIdx(null);
    setShowAltsIdx(null);
    setError(null);
  }, []);

  // ─── Speech Recognition Setup ───
  const startListening = useCallback(() => {
    if (!hasSpeechAPI) {
      setTextMode(true);
      return;
    }

    setError(null);
    setTranscript('');
    setInterimTranscript('');
    setListenSeconds(0);
    hapticTap();

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      // Start counting seconds
      listenIntervalRef.current = setInterval(() => {
        setListenSeconds(prev => prev + 1);
      }, 1000);
    };

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalText) {
        setTranscript(finalText);
        setInterimTranscript('');
      } else {
        setInterimTranscript(interimText);
      }

      // Reset silence timer
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop();
      }, 5000); // 5 seconds of silence
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access or type your food below.');
        setTextMode(true);
      } else if (event.error === 'no-speech') {
        setError('No speech detected. Try again or type below.');
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
      hapticWarning();
    };

    recognition.onend = () => {
      setIsListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (listenIntervalRef.current) clearInterval(listenIntervalRef.current);
      hapticTap();
    };

    recognitionRef.current = recognition;
    recognition.start();

    // Max recording time: 30 seconds
    setTimeout(() => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    }, 30000);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsListening(false);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (listenIntervalRef.current) clearInterval(listenIntervalRef.current);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (listenIntervalRef.current) clearInterval(listenIntervalRef.current);
    };
  }, []);

  // Handle keyboard submit in text mode
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // ─── Review Step ───
  if (step === 'review') {
    const activeFoods = matchedFoods.filter((_, i) => !removedIndices.has(i));
    return (
      <div className="space-y-4 p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide">Review Foods</h3>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 active:scale-95 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* What was said */}
        <div className="bg-muted/15 rounded-lg px-3 py-2">
          <p className="text-[10px] text-muted-foreground/60 uppercase font-bold mb-0.5">You said:</p>
          <p className="text-[12px] text-muted-foreground italic">"{transcript}"</p>
        </div>

        {/* AI fallback notice */}
        {matchedFoods.some(mf => mf.matchConfidence === 'none') && (
          <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-[10px] text-amber-500">
              Some foods couldn't be matched in the database — using AI estimates.
            </p>
          </div>
        )}

        {/* Parsed food items */}
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground/60 uppercase font-bold tracking-wide">
            Found {matchedFoods.length} food{matchedFoods.length > 1 ? 's' : ''}
          </p>
          {matchedFoods.map((mf, idx) => {
            const isRemoved = removedIndices.has(idx);
            const isEditing = editingIdx === idx;
            const { serving, qty } = getEffectiveServing(idx);
            const photoFood = matchedFoodToPhotoFood(mf, serving || undefined, qty);
            const color = SPAR_COLORS[photoFood.sparCategory] || SPAR_COLORS.carb;
            const confDot = CONFIDENCE_DOTS[mf.matchConfidence] || CONFIDENCE_DOTS.none;
            const isFallback = !mf.fsMatch;

            if (isRemoved) {
              return (
                <div
                  key={`${mf.originalName}-${idx}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl border border-muted/20 bg-muted/5 opacity-40"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium line-through truncate">{mf.originalName}</p>
                  </div>
                  <button
                    onClick={() => toggleRemove(idx)}
                    className="text-[9px] font-bold text-primary px-2 py-1 rounded bg-primary/10"
                  >
                    Undo
                  </button>
                </div>
              );
            }

            return (
              <div
                key={`${mf.originalName}-${idx}`}
                className={cn(
                  "rounded-xl border overflow-hidden transition-all",
                  isFallback ? "border-amber-500/30 bg-amber-500/5" :
                  isEditing ? "border-primary/40 bg-primary/5" : "border-primary/20 bg-primary/5"
                )}
              >
                {/* Fallback warning */}
                {isFallback && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border-b border-amber-500/20">
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[9px] text-amber-500 font-bold">No database match — AI estimate</span>
                  </div>
                )}

                {/* Main row */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {/* Category badge + confidence dot */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={cn("px-1.5 py-0.5 rounded text-[8px] font-bold uppercase", color.bg, color.text)}>
                      {color.label}
                    </div>
                    <div className={cn("w-1.5 h-1.5 rounded-full", confDot)} />
                  </div>

                  {/* Name + serving + macros */}
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => setEditingIdx(isEditing ? null : idx)}
                      className="text-[12px] font-medium truncate text-left w-full hover:text-primary transition-colors"
                    >
                      {mf.fsMatch ? mf.fsMatch.name : mf.originalName}
                      {mf.fsMatch?.brand && <span className="text-muted-foreground/60 font-normal text-[10px]"> ({mf.fsMatch.brand})</span>}
                    </button>
                    {/* Serving description */}
                    {serving && (
                      <p className="text-[9px] text-primary/70 font-medium">
                        {qty !== 1 ? `${qty} × ` : ''}{serving.description}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60">
                      {photoFood.calories} cal · {photoFood.protein}P {photoFood.carbs}C {photoFood.fat}F
                    </p>
                    {photoFood.sparCategory && (
                      <span className="text-[9px] font-bold uppercase text-primary/70">
                        {photoFood.sparCategory} · {photoFood.sliceCount > 0 ? `${photoFood.sliceCount} slice${photoFood.sliceCount > 1 ? 's' : ''}` : 'tracked'}
                      </span>
                    )}
                  </div>

                  {/* Qty controls (only for FatSecret matches) */}
                  {mf.fsMatch && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => updateServingQty(idx, -0.5)}
                        className="w-7 h-7 rounded bg-muted/50 flex items-center justify-center active:scale-90"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className={cn("text-sm font-bold font-mono min-w-[24px] text-center", color.text)}>
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
                    onClick={() => toggleRemove(idx)}
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expanded edit panel */}
                {isEditing && mf.fsMatch && (
                  <div className="px-3 pb-3 space-y-2 border-t border-muted/50 pt-2 animate-in slide-in-from-top-1 duration-150">
                    {/* Serving size selector */}
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

                    {/* Alternative matches */}
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
        </div>

        {/* Confidence indicator */}
        <div className="flex items-center justify-center gap-1.5">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            confidence === 'high' ? "bg-green-500" : confidence === 'medium' ? "bg-yellow-500" : "bg-red-500"
          )} />
          <span className="text-[9px] text-muted-foreground/50 uppercase font-bold">
            {confidence} confidence
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleRetry}
            className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-lg bg-muted/30 text-muted-foreground text-[11px] font-bold active:scale-[0.98] transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try Again
          </button>
          <button
            onClick={handleConfirm}
            disabled={activeFoods.length === 0}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-bold transition-all",
              activeFoods.length > 0
                ? "bg-primary text-white active:scale-[0.98]"
                : "bg-muted/30 text-muted-foreground/50"
            )}
          >
            <Check className="w-3.5 h-3.5" />
            Log {activeFoods.length} Food{activeFoods.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    );
  }

  // ─── Input Step ───
  return (
    <div className="space-y-4 p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide">
          {textMode ? 'Type Your Food' : 'Voice Log'}
        </h3>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 active:scale-95 transition-all">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Mic button with pulsing rings (speech mode) */}
      {!textMode && (
        <div className="flex flex-col items-center gap-3 py-4">
          {/* Recording indicator banner */}
          {isListening && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 mb-1">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] font-bold text-red-500 uppercase tracking-wider">
                Recording · {listenSeconds}s
              </span>
            </div>
          )}

          {/* Mic button with animated rings */}
          <div className="relative flex items-center justify-center">
            {/* Outer pulsing rings when listening */}
            {isListening && (
              <>
                <div className="absolute w-28 h-28 rounded-full border-2 border-red-400/40 animate-ping" style={{ animationDuration: '1.5s' }} />
                <div className="absolute w-24 h-24 rounded-full border-2 border-red-400/30 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
              </>
            )}
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isProcessing}
              className={cn(
                "relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all",
                isListening
                  ? "bg-red-500 text-white shadow-xl shadow-red-500/40 scale-110"
                  : isProcessing
                  ? "bg-primary/30 text-primary/50"
                  : "bg-primary/10 text-primary hover:bg-primary/20 active:scale-95"
              )}
            >
              {isProcessing ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : isListening ? (
                <MicOff className="w-8 h-8" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </button>
          </div>
          <p className={cn(
            "text-[12px] text-center font-medium",
            isListening ? "text-red-500" : "text-muted-foreground"
          )}>
            {isProcessing
              ? 'Looking up nutrition...'
              : isListening
              ? 'Listening — say what you ate'
              : 'Tap microphone to start'}
          </p>
        </div>
      )}

      {/* Editable transcript — always visible so user can type or edit */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase">
          {textMode
            ? 'Describe what you ate (e.g., "2 eggs, toast with butter, glass of OJ")'
            : transcript
            ? 'Edit if needed, then tap Identify Foods'
            : isListening
            ? 'Your words will appear here...'
            : 'Speak or type what you ate'}
        </p>
        <textarea
          value={transcript || interimTranscript}
          onChange={(e) => {
            setTranscript(e.target.value);
            setInterimTranscript('');
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (isListening) stopListening(); }}
          placeholder="I ate..."
          rows={3}
          className={cn(
            "w-full rounded-lg border p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary transition-all",
            isListening
              ? "bg-red-50 dark:bg-red-500/5 border-red-300 dark:border-red-500/30"
              : "bg-muted/30 border-muted"
          )}
          autoFocus={textMode}
          readOnly={isListening}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {!textMode && (
          <button
            onClick={() => { setTextMode(true); stopListening(); }}
            className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-lg bg-muted/30 text-muted-foreground text-[11px] font-bold"
          >
            <Keyboard className="w-3.5 h-3.5" />
            Type Instead
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!transcript.trim() || isProcessing || isListening}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-bold transition-all",
            transcript.trim() && !isProcessing && !isListening
              ? "bg-primary text-white active:scale-[0.98]"
              : "bg-muted/30 text-muted-foreground/50"
          )}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Looking up...
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              Identify Foods
            </>
          )}
        </button>
      </div>

      {/* Hint */}
      {!transcript && !interimTranscript && !isListening && (
        <p className="text-[9px] text-muted-foreground/40 text-center leading-relaxed">
          Try: "I had a chicken breast with rice and steamed broccoli" or "2 scrambled eggs and a banana"
        </p>
      )}
    </div>
  );
}
