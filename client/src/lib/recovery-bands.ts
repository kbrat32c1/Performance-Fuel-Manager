/**
 * What a recovery score means, by who calculated it.
 *
 * WHOOP's own scores use WHOOP's ranges, so they match the WHOOP app. SPAR's calculated
 * scores (V5 band, Apple Health) are a different number and keep SPAR's ranges.
 */
export type RecoverySource = 'whoop' | 'spar';
export type RecoveryBand = 'green' | 'yellow' | 'orange' | 'red';

export function recoveryBand(score: number, source: RecoverySource): RecoveryBand {
  if (source === 'whoop') {
    if (score >= 67) return 'green';
    return score >= 34 ? 'yellow' : 'red';
  }
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  return score >= 40 ? 'orange' : 'red';
}

const TEXT: Record<RecoveryBand, string> = {
  green: 'text-green-500', yellow: 'text-yellow-500', orange: 'text-orange-500', red: 'text-red-500',
};
const TINT: Record<RecoveryBand, string> = {
  green: 'bg-green-500/[0.03]', yellow: 'bg-yellow-500/[0.03]', orange: 'bg-orange-500/[0.03]', red: 'bg-red-500/[0.03]',
};
const DOT: Record<RecoveryBand, string> = {
  green: 'bg-green-500', yellow: 'bg-yellow-500', orange: 'bg-orange-500', red: 'bg-red-500',
};

export const recoveryTextClass = (score: number, source: RecoverySource) => TEXT[recoveryBand(score, source)];
export const recoveryTintClass = (score: number, source: RecoverySource) => TINT[recoveryBand(score, source)];
export const recoveryDotClass = (score: number, source: RecoverySource) => DOT[recoveryBand(score, source)];

export function recoveryLabel(score: number, source: RecoverySource): string {
  if (source === 'whoop') {
    const band = recoveryBand(score, 'whoop');
    return `${band.charAt(0).toUpperCase()}${band.slice(1)} recovery`;
  }
  if (score >= 80) return 'Excellent Recovery';
  if (score >= 65) return 'Good Recovery';
  if (score >= 45) return 'Moderate Recovery';
  return score >= 30 ? 'Low Recovery' : 'Poor Recovery';
}

const WHOOP_ADVICE: Record<Exclude<RecoveryBand, 'orange'>, string> = {
  green: 'In the green on WHOOP. Follow your plan.',
  yellow: 'In the yellow on WHOOP. Follow your plan and pay attention to how you feel.',
  red: 'In the red on WHOOP. Follow your plan, and talk to your coach if you feel run down.',
};

export function whoopRecoveryAdvice(score: number): string {
  return WHOOP_ADVICE[recoveryBand(score, 'whoop') as Exclude<RecoveryBand, 'orange'>];
}

export const WHOOP_RECOVERY_RANGES = [
  { label: '67–100', color: 'bg-green-500', description: 'Green' },
  { label: '34–66', color: 'bg-yellow-500', description: 'Yellow' },
  { label: '0–33', color: 'bg-red-500', description: 'Red' },
];
