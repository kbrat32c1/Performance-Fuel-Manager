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
      'Run 2-4 weeks max, then transition to Rapid Cut or Optimal Cut',
    ],
  },
  '2': {
    summary: 'Weekly cut protocol using water loading science to drop weight predictably each week.',
    points: [
      '3-day water load (Mon-Wed) suppresses ADH hormone, increasing urine output',
      'Sharp water restriction (Thu-Fri) exploits the delayed ADH response — your body keeps flushing water',
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
  icon: typeof Flame;
  color: string;
}> = {
  '1': { label: 'Extreme Cut Phase', desc: '12%+ above class. Multi-day depletion, strict oversight required.', icon: Flame, color: 'text-destructive' },
  '2': { label: 'Rapid Cut Phase', desc: '7-12% above class. Short-term glycogen + water manipulation.', icon: Zap, color: 'text-primary' },
  '3': { label: 'Optimal Cut Phase', desc: 'Within 6-7% of class. Glycogen management, performance protected.', icon: Trophy, color: 'text-primary' },
  '4': { label: 'Gain Phase', desc: 'Off-season. Performance and strength focus.', icon: Dumbbell, color: 'text-primary' },
  '5': { label: 'SPAR Nutrition', desc: 'Clean eating — count portions, not calories', icon: Salad, color: 'text-green-500' },
  '6': { label: 'SPAR Competition', desc: 'Portion tracking + competition water loading & auto-adjusting targets', icon: Salad, color: 'text-purple-500' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// getProtocolRecommendation — Weight-based protocol recommendation
// ═══════════════════════════════════════════════════════════════════════════════
export function getProtocolRecommendation(
  currentWeight: number,
  targetWeightClass: number
): { protocol: Protocol; reason: string; warning?: string } {
  const walkAroundWeight = targetWeightClass * 1.07;
  const percentOver = ((currentWeight - targetWeightClass) / targetWeightClass) * 100;
  const lbsOverWalkAround = currentWeight - walkAroundWeight;
  const lbsOverTarget = currentWeight - targetWeightClass;

  // Moving UP in weight class
  if (currentWeight < targetWeightClass) {
    return {
      protocol: '4',
      reason: `You're ${Math.abs(lbsOverTarget).toFixed(1)} lbs under your target class. Gain Phase will help you gain muscle safely.`,
    };
  }

  // More than 12% over = need aggressive fat loss first
  if (percentOver > SAFETY_THRESHOLDS.EXTREME_CUT_TRIGGER) {
    return {
      protocol: '1',
      reason: `You're ${percentOver.toFixed(1)}% over your competition weight (${lbsOverWalkAround.toFixed(1)} lbs above walk-around). Extreme Cut Phase will burn fat without sacrificing performance.`,
      warning: 'Run 2-4 weeks max, then transition to Rapid Cut or Optimal Cut.',
    };
  }

  // Over walk-around weight but within threshold = need to cut to walk-around
  if (currentWeight > walkAroundWeight) {
    return {
      protocol: '2',
      reason: `You're ${lbsOverWalkAround.toFixed(1)} lbs above your walk-around weight (${walkAroundWeight.toFixed(1)} lbs). Rapid Cut Phase manages your weekly cut while preserving performance.`,
    };
  }

  // At or under walk-around weight = maintain
  return {
    protocol: '3',
    reason: `You're at your walk-around weight. Optimal Cut Phase keeps you competition-ready while training hard.`,
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
