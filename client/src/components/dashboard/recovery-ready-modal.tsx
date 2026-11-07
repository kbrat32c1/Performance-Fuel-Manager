/**
 * Recovery Ready Modal
 *
 * WHOOP-style full-screen overlay that appears when the morning sync
 * detects ≥3h sleep and advances the health day. Shows the athlete's
 * recovery score with a color-coded ring and recommendation.
 *
 * Auto-dismisses after 8 seconds or on tap/button.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface RecoveryReadyModalProps {
  score: number;
  onDismiss: () => void;
}

export function RecoveryReadyModal({ score, onDismiss }: RecoveryReadyModalProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timerRef.current);
  }, [onDismiss]);

  const scoreColor = getColor(score);
  const scoreGlow = getGlow(score);
  const label = getLabel(score);
  const recommendation = getRecommendation(score);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-500"
      onClick={onDismiss}
    >
      {/* Close button */}
      <button
        aria-label="Close"
        className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors p-2 after:absolute after:-inset-1"
        onClick={onDismiss}
      >
        <X className="w-5 h-5" aria-hidden="true" />
      </button>

      {/* Title */}
      <div className="text-white/50 text-xs font-bold uppercase tracking-[0.2em] mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        Recovery Ready
      </div>

      {/* Score Ring */}
      <div className="animate-in fade-in zoom-in-90 duration-700 delay-200 mb-4">
        <ScoreRingLarge score={score} />
      </div>

      {/* Label */}
      <div className={cn("text-lg font-bold mb-2 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-300", scoreColor)}>
        {label}
      </div>

      {/* Recommendation */}
      <div className="text-white/60 text-sm text-center max-w-[260px] leading-relaxed animate-in fade-in slide-in-from-bottom-3 duration-500 delay-500">
        {recommendation}
      </div>

      {/* Dismiss hint */}
      <div className="absolute bottom-10 text-white/20 text-xs uppercase tracking-wider animate-in fade-in duration-700 delay-700">
        tap anywhere to dismiss
      </div>
    </div>
  );
}

/** Large circular score ring for the modal */
function ScoreRingLarge({ score }: { score: number }) {
  const size = 140;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = getStrokeColor(score);
  const glow = getGlow(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Animated score ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 8px ${glow})` }}
        />
      </svg>
      {/* Center score */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-4xl font-bold leading-none", getColor(score))}>
          {Math.round(score)}
        </span>
        <span className="text-white/30 text-xs mt-1">/ 100</span>
      </div>
    </div>
  );
}

// ── Helpers ──

function getColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function getStrokeColor(score: number): string {
  if (score >= 80) return "hsl(var(--chart-5))";
  if (score >= 60) return "hsl(var(--chart-3))";
  if (score >= 40) return "hsl(var(--chart-3))";
  return "hsl(var(--chart-4))";
}

function getGlow(score: number): string {
  if (score >= 80) return "rgba(74,222,128,0.4)";
  if (score >= 60) return "rgba(250,204,21,0.4)";
  if (score >= 40) return "rgba(251,146,60,0.4)";
  return "rgba(248,113,113,0.4)";
}

function getLabel(score: number): string {
  if (score >= 80) return "Excellent Recovery";
  if (score >= 65) return "Good Recovery";
  if (score >= 45) return "Moderate Recovery";
  if (score >= 30) return "Low Recovery";
  return "Poor Recovery";
}

function getRecommendation(score: number): string {
  if (score >= 80) return "Your body is primed. Push hard today — you've earned it.";
  if (score >= 65) return "Solid recovery. You're good for a normal training load.";
  if (score >= 45) return "Moderate recovery. Consider a lighter session or active recovery.";
  if (score >= 30) return "Your body needs more rest. Keep today easy.";
  return "Recovery is low. Prioritize sleep, hydration, and rest today.";
}
