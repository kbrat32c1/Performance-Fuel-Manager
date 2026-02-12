// ─── Shared phase helpers for FGF21 protocol system ───
// Used by both fuel-card.tsx (dashboard) and fuel.tsx (fuel page)

export const PROTOCOL_NAMES: Record<string, string> = {
  '1': 'Extreme Cut',
  '2': 'Rapid Cut',
  '3': 'Optimal Cut',
  '4': 'Gain',
  '5': 'SPAR Nutrition',
  '6': 'SPAR Competition',
};

export interface PhaseInfo {
  phase: string;
  emoji: string;
  color: string;
  bgColor: string;
  foodTip: string;
}

/** Get the FGF21 phase name based on protocol and days until weigh-in */
export function getProtocolPhase(protocol: string, daysUntilWeighIn: number, _ratio?: string): PhaseInfo {
  // Recovery
  if (daysUntilWeighIn < 0) {
    return { phase: 'RECOVERY', emoji: '🟢', color: 'text-green-500', bgColor: 'bg-green-500/10 border-green-500/30', foodTip: 'Eat everything — full recovery refeed' };
  }
  // Competition day
  if (daysUntilWeighIn === 0) {
    return { phase: 'COMPETITION DAY', emoji: '🏆', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10 border-yellow-500/30', foodTip: 'Post-weigh-in refuel. Fast carbs between matches.' };
  }

  if (protocol === '1') {
    if (daysUntilWeighIn === 1) return { phase: 'PERFORMANCE PREP', emoji: '⚡', color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30', foodTip: 'Fructose + evening protein only' };
    if (daysUntilWeighIn <= 5) return { phase: 'MAX FAT BURN', emoji: '🔥', color: 'text-red-500', bgColor: 'bg-red-500/10 border-red-500/30', foodTip: 'Fructose only — zero protein for FGF21 activation' };
    return { phase: 'EXTREME CUT', emoji: '🔥', color: 'text-red-500', bgColor: 'bg-red-500/10 border-red-500/30', foodTip: 'Moderate protein + fructose carbs' };
  }
  if (protocol === '2') {
    if (daysUntilWeighIn <= 2) return { phase: 'PERFORMANCE', emoji: '⚡', color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30', foodTip: 'Switch to glucose/starch. Collagen + seafood protein.' };
    if (daysUntilWeighIn === 3) return { phase: 'CUT → PERFORMANCE', emoji: '🔶', color: 'text-orange-500', bgColor: 'bg-orange-500/10 border-orange-500/30', foodTip: 'Fructose heavy — collagen + leucine at dinner' };
    if (daysUntilWeighIn <= 5) return { phase: 'CUT', emoji: '🔥', color: 'text-red-500', bgColor: 'bg-red-500/10 border-red-500/30', foodTip: 'Fructose only — zero protein for maximum fat loss' };
    return { phase: 'RAPID CUT', emoji: '⚡', color: 'text-primary', bgColor: 'bg-primary/10 border-primary/30', foodTip: 'Moderate protein + fructose carbs' };
  }
  if (protocol === '3') {
    if (daysUntilWeighIn <= 2) return { phase: 'PERFORMANCE', emoji: '⚡', color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30', foodTip: 'Glucose emphasis — full protein for performance' };
    if (daysUntilWeighIn <= 4) return { phase: 'MIXED', emoji: '🔶', color: 'text-orange-500', bgColor: 'bg-orange-500/10 border-orange-500/30', foodTip: 'Mixed fructose/glucose — moderate protein' };
    if (daysUntilWeighIn === 5) return { phase: 'FGF21 ACTIVATION', emoji: '🔥', color: 'text-red-500', bgColor: 'bg-red-500/10 border-red-500/30', foodTip: 'Fructose heavy — brief FGF21 activation' };
    return { phase: 'OPTIMAL CUT', emoji: '🏆', color: 'text-primary', bgColor: 'bg-primary/10 border-primary/30', foodTip: 'Full protein + balanced carbs' };
  }
  if (protocol === '4') {
    if (daysUntilWeighIn <= 4) return { phase: 'GLUCOSE EMPHASIS', emoji: '⚡', color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30', foodTip: 'Glucose/starch carbs — high protein for growth' };
    if (daysUntilWeighIn === 5) return { phase: 'BALANCED', emoji: '🔶', color: 'text-orange-500', bgColor: 'bg-orange-500/10 border-orange-500/30', foodTip: 'Balanced carbs — moderate protein' };
    return { phase: 'GAIN', emoji: '💪', color: 'text-green-500', bgColor: 'bg-green-500/10 border-green-500/30', foodTip: 'Off-season building — high protein, high carbs' };
  }
  // Protocol 6 (SPAR Competition)
  if (protocol === '6') {
    if (daysUntilWeighIn <= 2) return { phase: 'WATER CUT', emoji: '💧', color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30', foodTip: 'Light portions, restrict water' };
    if (daysUntilWeighIn <= 5) return { phase: 'WATER LOAD', emoji: '🌊', color: 'text-cyan-500', bgColor: 'bg-cyan-500/10 border-cyan-500/30', foodTip: 'Balanced portions, peak hydration' };
    return { phase: 'TRAINING', emoji: '💪', color: 'text-purple-500', bgColor: 'bg-purple-500/10 border-purple-500/30', foodTip: 'SPAR portions, auto-adjusting for walk-around' };
  }
  // Protocol 5 (SPAR General)
  return { phase: 'BALANCED', emoji: '🥗', color: 'text-primary', bgColor: 'bg-primary/10 border-primary/30', foodTip: 'All macros — hit your portion targets' };
}

/** Phase-colored left border for Kanban-style card identity */
export function getPhaseBorderColor(protocol: string, daysUntilWeighIn: number): string {
  if (daysUntilWeighIn < 0) return 'border-l-green-500/60';
  if (daysUntilWeighIn === 0) return 'border-l-yellow-500/60';
  if (protocol === '1') {
    if (daysUntilWeighIn === 1) return 'border-l-blue-500/60';
    if (daysUntilWeighIn <= 5) return 'border-l-red-500/60';
    return 'border-l-blue-400/60';
  }
  if (protocol === '2') {
    if (daysUntilWeighIn <= 2) return 'border-l-blue-500/60';
    if (daysUntilWeighIn === 3) return 'border-l-orange-500/60';
    if (daysUntilWeighIn <= 5) return 'border-l-red-500/60';
    return 'border-l-blue-400/60';
  }
  if (protocol === '3') {
    if (daysUntilWeighIn <= 2) return 'border-l-blue-500/60';
    if (daysUntilWeighIn <= 4) return 'border-l-orange-500/60';
    if (daysUntilWeighIn === 5) return 'border-l-red-500/60';
    return 'border-l-blue-400/60';
  }
  if (protocol === '4') {
    if (daysUntilWeighIn <= 4) return 'border-l-blue-500/60';
    if (daysUntilWeighIn === 5) return 'border-l-orange-500/60';
    return 'border-l-green-500/60';
  }
  if (protocol === '6') {
    if (daysUntilWeighIn <= 2) return 'border-l-blue-500/60';
    if (daysUntilWeighIn <= 5) return 'border-l-cyan-500/60';
    return 'border-l-purple-500/60';
  }
  return '';
}

// Carb type labels
export const CARB_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  fructose: { label: 'FRUCTOSE', color: 'text-orange-400', bg: 'bg-orange-500/15' },
  glucose: { label: 'GLUCOSE', color: 'text-blue-400', bg: 'bg-blue-500/15' },
  mixed: { label: 'MIXED', color: 'text-purple-400', bg: 'bg-purple-500/15' },
  any: { label: 'ALL CARBS', color: 'text-green-400', bg: 'bg-green-500/15' },
};

export const PROTEIN_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  blocked: { label: 'NO PROTEIN', color: 'text-red-400', bg: 'bg-red-500/15' },
  'collagen-only': { label: 'COLLAGEN ONLY', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  'collagen+seafood': { label: 'COLLAGEN + SEAFOOD', color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
  full: { label: 'FULL PROTEIN', color: 'text-green-400', bg: 'bg-green-500/15' },
  recovery: { label: 'RECOVERY', color: 'text-green-400', bg: 'bg-green-500/15' },
};
