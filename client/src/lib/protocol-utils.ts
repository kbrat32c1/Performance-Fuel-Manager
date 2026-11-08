/**
 * protocol-utils.ts — Shared protocol recommendation logic, science explanations, and config
 * Extracted from protocol-wizard.tsx and onboarding.tsx to avoid duplication
 */

import type { Protocol } from '@/lib/store';
import { SAFETY_THRESHOLDS } from '@/lib/constants';
import { Flame, Zap, Trophy, Dumbbell, Salad } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PROTOCOL_SCIENCE — Explanations for each protocol's mechanism of action
// ═══════════════════════════════════════════════════════════════════════════════
export const PROTOCOL_SCIENCE: Record<Protocol, { summary: string; points: string[] }> = {
  '1': {
    summary: 'Uses fructose-dominant fueling to activate FGF21 (a fat-burning hormone) while sparing muscle glycogen.',
    points: [
      'Fructose is processed by the liver, not muscles — so your muscles stay fueled for practice',
      'Zero-protein windows trigger FGF21, which accelerates fat oxidation',
      'Water loading + sodium manipulation drops 3-5 lbs of water weight safely in the final days',
      'Run 2-4 weeks max, then transition to Rapid Cut or Maintain · Sugar System',
    ],
  },
  '2': {
    summary: 'Weekly cut protocol using water loading science to drop weight predictably each week.',
    points: [
      '3-day water load (5-3 days out) suppresses ADH hormone, increasing urine output',
      'Sharp water restriction (2-1 days out) exploits the delayed ADH response — your body keeps flushing water',
      'Sodium loading + restriction amplifies the water drop',
      'Structured macro phasing keeps energy high for practice while cutting weight',
    ],
  },
  '3': {
    summary: 'Maintenance protocol for wrestlers already at walk-around weight.',
    points: [
      'Balanced macros (40C/35P/25F) keep energy and recovery optimal',
      'No food restrictions — eat normal, train hard',
      'Water and sodium targets keep you competition-ready without active cutting',
      'Switch to Rapid Cut when you need to cut for a specific meet',
    ],
  },
  '4': {
    summary: 'Off-season muscle gain protocol with higher carbs and protein.',
    points: [
      'Higher calorie targets to support muscle growth',
      'Protein targets at 1.0-1.2 g/lb to maximize muscle protein synthesis',
      'No water manipulation — hydrate normally',
      'Track weight to ensure gains stay controlled and within your target class range',
    ],
  },
  '5': {
    summary: 'Simple as Pie for Achievable Results — count portions (slices), not calories.',
    points: [
      'Palm-sized protein = 1 slice (~110 cal). Fist-sized carb = 1 slice (~120 cal). Fist of veggies/fruit = 1 slice (~50 cal)',
      'Your daily targets are calculated from BMR × activity level — no calorie counting needed',
      'Focus on whole, clean foods — no competition cycling or sugar manipulation',
      'Great for everyday eating, off-season, or when 6+ days from competition',
    ],
  },
  '6': {
    summary: 'SPAR portion tracking combined with competition water loading and auto-adjusting calorie targets based on walk-around weight.',
    points: [
      'Same portion-based tracking as SPAR — palms, fists, and thumbs instead of counting grams',
      'Calorie targets auto-adjust based on how far you are from walk-around weight and days until weigh-in',
      'Full water loading + sodium manipulation protocol (same as Extreme/Rapid/Optimal Cut)',
      'Training phase gradually reduces portions as competition approaches, then refuels on competition day',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROTOCOL_CONFIG — Visual config for each protocol (label, description, icon, color)
// ═══════════════════════════════════════════════════════════════════════════════
export const PROTOCOL_CONFIG: Record<Protocol, {
  label: string;
  desc: string;
  /** Plain-language "pick this if…" line shown under the name in every picker. */
  pickIf: string;
  icon: typeof Flame;
  color: string;
}> = {
  '1': { label: 'Extreme Cut Phase', desc: 'Preseason fat-loss block when body fat is over 12%. Strict oversight required.', pickIf: "It's preseason, your body fat is over 12%, and you're well above walk-around weight. Only with your coach's OK.", icon: Flame, color: 'text-destructive' },
  '2': { label: 'Rapid Cut Phase', desc: '7%+ above class. Short-term glycogen + water manipulation.', pickIf: "You're 7%+ over your class (above walk-around weight) and need to come down.", icon: Zap, color: 'text-primary' },
  '3': { label: 'Maintain · Sugar System', desc: 'Within 6-7% of class. Glycogen management, performance protected.', pickIf: "You're within 7% of your class (at walk-around weight) and holding there for the season.", icon: Trophy, color: 'text-primary' },
  '4': { label: 'Gain Phase', desc: 'Off-season. Performance and strength focus.', pickIf: "You're under your class or it's the off-season, and you want to build strength.", icon: Dumbbell, color: 'text-primary' },
  '5': { label: 'SPAR Nutrition', desc: 'Clean eating — count portions, not calories', pickIf: "You're not making a weight. You want to eat well by counting palms and fists, not calories.", icon: Salad, color: 'text-green-500' },
  '6': { label: 'SPAR Competition', desc: 'Portion tracking + competition water loading & auto-adjusting targets', pickIf: "You're making a weight and want portion counting, with targets and a water plan that adjust as weigh-in gets closer.", icon: Salad, color: 'text-purple-500' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// getProtocolRecommendation — Weight-based protocol recommendation
// ═══════════════════════════════════════════════════════════════════════════════
export interface ProtocolRecommendationContext {
  /** Body fat %, if the athlete has entered it. */
  bodyFatPercent?: number | null;
  /** Next weigh-in; 4+ weeks away (or none set) counts as preseason. */
  weighInDate?: Date | string | null;
  now?: Date;
}

/** Preseason = no weigh-in coming up within PRESEASON_MIN_DAYS. */
export function isPreseason(weighInDate: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!weighInDate) return true;
  const wi = new Date(weighInDate);
  if (isNaN(wi.getTime())) return true;
  const days = Math.floor((wi.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  // A weigh-in date already in the past is likely stale mid-season, so not preseason.
  return days >= SAFETY_THRESHOLDS.PRESEASON_MIN_DAYS;
}

export function getProtocolRecommendation(
  currentWeight: number,
  targetWeightClass: number,
  context: ProtocolRecommendationContext = {},
): { protocol: Protocol; reason: string; warning?: string } {
  const walkAroundWeight = targetWeightClass * 1.07;
  const percentOver = ((currentWeight - targetWeightClass) / targetWeightClass) * 100;
  const lbsOverWalkAround = currentWeight - walkAroundWeight;
  const lbsOverTarget = currentWeight - targetWeightClass;
  const bodyFat = context.bodyFatPercent != null && context.bodyFatPercent > 0 ? context.bodyFatPercent : null;
  const preseason = isPreseason(context.weighInDate, context.now);

  // Moving UP in weight class
  if (currentWeight < targetWeightClass) {
    return {
      protocol: '4',
      reason: `You're ${Math.abs(lbsOverTarget).toFixed(1)} lbs under your target class. Gain Phase will help you gain muscle safely.`,
    };
  }

  // Preseason with body fat over the line: a fat-loss block, while there is time to lose fat.
  // Scale weight alone never triggers it — that's what Rapid Cut handles in-season.
  if (preseason && bodyFat !== null && bodyFat > SAFETY_THRESHOLDS.EXTREME_CUT_BODY_FAT && currentWeight > walkAroundWeight) {
    return {
      protocol: '1',
      reason: `Preseason at ${bodyFat.toFixed(1)}% body fat and ${percentOver.toFixed(1)}% over your class. Extreme Cut Phase brings body fat down while there's time.`,
      warning: 'Run 2-4 weeks max, then transition to Rapid Cut or Maintain · Sugar System.',
    };
  }

  // Over walk-around weight (7%+ over class) = cut to walk-around
  if (currentWeight > walkAroundWeight) {
    const askForBodyFat = preseason && bodyFat === null && percentOver > SAFETY_THRESHOLDS.EXTREME_CUT_TRIGGER;
    return {
      protocol: '2',
      reason: `You're ${lbsOverWalkAround.toFixed(1)} lbs above your walk-around weight (${walkAroundWeight.toFixed(1)} lbs). Rapid Cut Phase manages your weekly cut while preserving performance.`,
      ...(askForBodyFat
        ? { warning: `You're ${percentOver.toFixed(1)}% over your class. Add your body fat % in settings: over ${SAFETY_THRESHOLDS.EXTREME_CUT_BODY_FAT}% in preseason, a fat-loss phase may fit better.` }
        : {}),
    };
  }

  // At or under walk-around weight = maintain
  return {
    protocol: '3',
    reason: `You're at your walk-around weight. Maintain · Sugar System keeps you competition-ready while training hard.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// getWeightContext — Display-ready weight analysis for settings UI
// ═══════════════════════════════════════════════════════════════════════════════
export function getWeightContext(currentWeight: number, targetWeightClass: number) {
  const walkAroundWeight = targetWeightClass * 1.07;
  const percentOver = ((currentWeight - targetWeightClass) / targetWeightClass) * 100;
  const lbsOverWalkAround = currentWeight - walkAroundWeight;
  const lbsOverTarget = currentWeight - targetWeightClass;

  return {
    walkAroundWeight,
    percentOver,
    lbsOverWalkAround,
    lbsOverTarget,
  };
}
