/**
 * VoiceFoodLogger — Speech-to-food logging component.
 * Uses Web Speech API to capture spoken food descriptions,
 * sends transcript to AI for parsing into food entries.
 * Falls back to text input when Speech API is unavailable.
 * Shows parsed results for review before confirming.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Loader2, X, Send, Keyboard, Check, Trash2, RotateCcw } from "lucide-react";
import { type PhotoFood } from "@/components/food-photo-review";

interface VoiceFoodLoggerProps {
  onFoodsReady: (foods: PhotoFood[], confidence: string) => void;
  onClose: () => void;
}

// Check if Speech API is available
const hasSpeechAPI = typeof window !== 'undefined' && (
  'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
);

type Step = 'input' | 'review';

export function VoiceFoodLogger({ onFoodsReady, onClose }: VoiceFoodLoggerProps) {
  const [step, setStep] = useState<Step>('input');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textMode, setTextMode] = useState(!hasSpeechAPI);
  const [parsedFoods, setParsedFoods] = useState<PhotoFood[]>([]);
  const [confidence, setConfidence] = useState('medium');
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const submittingRef = useRef(false);

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
        headers: { 'Content-Type': 'application/json' },
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
        setParsedFoods(data.foods);
        setConfidence(data.confidence || 'medium');
        setRemovedIndices(new Set());
        setStep('review');
      } else {
        setError('Could not identify any foods. Try again with more detail.');
      }
    } catch (err: any) {
      console.error('Voice parse error:', err);
      setError(err.message || 'Failed to process food description');
    } finally {
      setIsProcessing(false);
      submittingRef.current = false;
    }
  }, [transcript]);

  // ─── Confirm and log foods ───
  const handleConfirm = useCallback(() => {
    const foodsToLog = parsedFoods.filter((_, i) => !removedIndices.has(i));
    if (foodsToLog.length > 0) {
      onFoodsReady(foodsToLog, confidence);
    }
  }, [parsedFoods, removedIndices, confidence, onFoodsReady]);

  // ─── Toggle remove food from results ───
  const toggleRemove = useCallback((index: number) => {
    setRemovedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // ─── Go back to input step ───
  const handleRetry = useCallback(() => {
    submittingRef.current = false;
    setStep('input');
    setParsedFoods([]);
    setRemovedIndices(new Set());
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

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
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
    };

    recognition.onend = () => {
      setIsListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
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
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
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
    const activeFoods = parsedFoods.filter((_, i) => !removedIndices.has(i));
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

        {/* Parsed food items */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground/60 uppercase font-bold tracking-wide">
            Found {parsedFoods.length} food{parsedFoods.length > 1 ? 's' : ''}
          </p>
          {parsedFoods.map((food, i) => {
            const isRemoved = removedIndices.has(i);
            return (
              <div
                key={`${food.name}-${i}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all",
                  isRemoved
                    ? "opacity-40 border-muted/20 bg-muted/5"
                    : "border-primary/20 bg-primary/5"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[12px] font-medium", isRemoved && "line-through")}>{food.name}</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {food.estimatedGrams ? `~${food.estimatedGrams}g · ` : ''}
                    {Math.round(food.calories || 0)} cal · {Math.round(food.carbs || 0)}C {Math.round(food.protein || 0)}P {Math.round(food.fat || 0)}F
                  </p>
                  {food.sparCategory && (
                    <span className="text-[9px] font-bold uppercase text-primary/70">
                      {food.sparCategory} · {food.sliceCount || 1} slice{(food.sliceCount || 1) > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => toggleRemove(i)}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all",
                    isRemoved ? "bg-muted/20 text-muted-foreground" : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                  )}
                >
                  {isRemoved ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
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

      {/* Mic button (speech mode) */}
      {!textMode && (
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={isProcessing}
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center transition-all",
              isListening
                ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
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
          <p className="text-[11px] text-muted-foreground text-center">
            {isProcessing ? 'Identifying foods...' : isListening ? 'Listening... tap to stop' : 'Tap to start speaking'}
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
            ? 'Listening...'
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
          className="w-full rounded-lg bg-muted/30 border border-muted p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
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
              Analyzing...
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
      {!transcript && !interimTranscript && (
        <p className="text-[9px] text-muted-foreground/40 text-center leading-relaxed">
          Try: "I had a chicken breast with rice and steamed broccoli" or "2 scrambled eggs and a banana"
        </p>
      )}
    </div>
  );
}
