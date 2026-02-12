import { getPhaseForDaysUntil } from "./constants";

/**
 * Phase color styles — single source of truth for all phase-based UI coloring.
 *
 * text      – Tailwind text color class
 * bg        – Solid background (badges, dots, bars)
 * bgSubtle  – Very faint background (/5 opacity — card fills)
 * bgLight   – Light background (/10 opacity — row highlights, pills)
 * bgMedium  – Medium background (/20 opacity — pill backgrounds)
 * border    – Border class (/50 opacity)
 * ring      – Ring class for calendar today highlight
 * bgBar     – Faded bar color (/40 — chart bars)
 */
export interface PhaseStyle {
  text: string;
  bg: string;
  bgSubtle: string;
  bgLight: string;
  bgMedium: string;
  border: string;
  ring: string;
  bgBar: string;
}

export const PHASE_STYLES: Record<string, PhaseStyle> = {
  Load: {
    text: "text-primary",
    bg: "bg-primary",
    bgSubtle: "bg-primary/5",
    bgLight: "bg-primary/10",
    bgMedium: "bg-primary/20",
    border: "border-primary/50",
    ring: "ring-primary",
    bgBar: "bg-primary/40",
  },
  Prep: {
    text: "text-violet-400",
    bg: "bg-violet-400",
    bgSubtle: "bg-violet-400/5",
    bgLight: "bg-violet-400/10",
    bgMedium: "bg-violet-400/20",
    border: "border-violet-400/50",
    ring: "ring-violet-400",
    bgBar: "bg-violet-400/40",
  },
  Cut: {
    text: "text-rose-500",
    bg: "bg-rose-500",
    bgSubtle: "bg-rose-500/5",
    bgLight: "bg-rose-500/10",
    bgMedium: "bg-rose-500/20",
    border: "border-rose-500/50",
    ring: "ring-rose-500",
    bgBar: "bg-rose-500/40",
  },
  Compete: {
    text: "text-yellow-500",
    bg: "bg-yellow-500",
    bgSubtle: "bg-yellow-500/5",
    bgLight: "bg-yellow-500/10",
    bgMedium: "bg-yellow-500/20",
    border: "border-yellow-500/50",
    ring: "ring-yellow-500",
    bgBar: "bg-yellow-500/40",
  },
  Recover: {
    text: "text-cyan-500",
    bg: "bg-cyan-500",
    bgSubtle: "bg-cyan-500/5",
    bgLight: "bg-cyan-500/10",
    bgMedium: "bg-cyan-500/20",
    border: "border-cyan-500/50",
    ring: "ring-cyan-500",
    bgBar: "bg-cyan-500/40",
  },
  Train: {
    text: "text-green-500",
    bg: "bg-green-500",
    bgSubtle: "bg-green-500/5",
    bgLight: "bg-green-500/10",
    bgMedium: "bg-green-500/20",
    border: "border-green-500/50",
    ring: "ring-green-500",
    bgBar: "bg-green-500/40",
  },
  Maintain: {
    text: "text-blue-500",
    bg: "bg-blue-500",
    bgSubtle: "bg-blue-500/5",
    bgLight: "bg-blue-500/10",
    bgMedium: "bg-blue-500/20",
    border: "border-blue-500/50",
    ring: "ring-blue-500",
    bgBar: "bg-blue-500/40",
  },
};

const DEFAULT_PHASE = PHASE_STYLES.Load;

/** Get phase style by phase name (Train, Load, Cut, Compete, Recover) */
export function getPhaseStyle(phase: string): PhaseStyle {
  return PHASE_STYLES[phase] || DEFAULT_PHASE;
}

/** Get phase style for a given days-until-weigh-in value */
export function getPhaseStyleForDaysUntil(daysUntil: number): { phase: string; style: PhaseStyle } {
  const phase = getPhaseForDaysUntil(daysUntil);
  return { phase, style: getPhaseStyle(phase) };
}
