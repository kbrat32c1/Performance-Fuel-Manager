/**
 * spar-competition-adjuster.ts — Dynamic calorie adjustment for Protocol 6 (SPAR Competition)
 *
 * Calculates how much to adjust the SPAR TDEE based on:
 *   1. How far above walk-around weight the athlete is
 *   2. How many days until weigh-in
 *
 * Training phase deficit scales by lbs over walk-around (3,500 cal ≈ 1 lb):
 *   Formula: -150 cal × lbs over walk-around (floored at -250, capped at -750)
 *   At/below walk-around → 0 (maintain)
 *
 * | Period          | At/below walk-around | Scaling                        | Cap   |
 * |-----------------|---------------------|--------------------------------|-------|
 * | Training (7+d)  | 0 (maintain)        | -150/lb over (min -250)        | -750  |
 * | Water Load (3-5)| -250                | -150/lb over (min -250)        | -750  |
 * | Water Cut (1-2) | -500 fixed          | -500 fixed                     | -500  |
 * | Competition (0) | +250 (refuel)       | +250 fixed                     | +250  |
 * | Recovery (-1)   | +500 (full refeed)  | +500 fixed                     | +500  |
 */

import type { Goal, GoalIntensity } from './spar-calculator-v2';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompetitionAdjustmentInput {
  currentWeight: number;
  targetWeightClass: number;
  daysUntilWeighIn: number;
}

export interface CompetitionAdjustmentResult {
  /** Exact calorie adjustment to pass as calorieOverride to SPAR calculator */
  calorieAdjustment: number;
  /** Mapped SPAR goal for protocol config lookup */
  sparGoal: Goal;
  /** Mapped intensity for protocol config lookup */
  goalIntensity: GoalIntensity;
  /** Human-readable reason for the UI */
  reason: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WALK_AROUND_MULTIPLIER = 1.07;
const CAL_PER_LB_OVER = 150;
const MIN_DEFICIT = -250;
const MAX_DEFICIT = -750;
const WATER_CUT_DEFICIT = -500;
const COMPETITION_SURPLUS = 250;
const RECOVERY_SURPLUS = 500;

// ─── Main Function ────────────────────────────────────────────────────────────

export function getCompetitionCalorieAdjustment(
  input: CompetitionAdjustmentInput
): CompetitionAdjustmentResult {
  const { currentWeight, targetWeightClass, daysUntilWeighIn } = input;
  const walkAroundWeight = targetWeightClass * WALK_AROUND_MULTIPLIER;
  const lbsOverWalkAround = currentWeight - walkAroundWeight;
  const isOverWalkAround = lbsOverWalkAround > 0;

  // ── Recovery (post-competition) ──────────────────────────────────────
  if (daysUntilWeighIn < 0) {
    return {
      calorieAdjustment: RECOVERY_SURPLUS,
      sparGoal: 'gain',
      goalIntensity: 'aggressive',
      reason: 'Recovery — full refeed to restore glycogen and energy',
    };
  }

  // ── Competition Day ──────────────────────────────────────────────────
  if (daysUntilWeighIn === 0) {
    return {
      calorieAdjustment: COMPETITION_SURPLUS,
      sparGoal: 'gain',
      goalIntensity: 'lean',
      reason: 'Competition day — refuel for performance',
    };
  }

  // ── Water Cut (1-2 days out) ─────────────────────────────────────────
  if (daysUntilWeighIn <= 2) {
    return {
      calorieAdjustment: WATER_CUT_DEFICIT,
      sparGoal: 'lose',
      goalIntensity: 'aggressive',
      reason: 'Water cut — minimal portions, restrict water',
    };
  }

  // ── Water Load (3-5 days out) ────────────────────────────────────────
  if (daysUntilWeighIn <= 5) {
    if (!isOverWalkAround) {
      // At walk-around but still in water load phase — light deficit
      return {
        calorieAdjustment: MIN_DEFICIT,
        sparGoal: 'lose',
        goalIntensity: 'lean',
        reason: 'Water load — balanced portions, peak hydration',
      };
    }

    // Over walk-around during water load — scale by lbs over
    const scaledDeficit = Math.round(lbsOverWalkAround * CAL_PER_LB_OVER) * -1;
    const clampedDeficit = Math.max(MAX_DEFICIT, Math.min(MIN_DEFICIT, scaledDeficit));

    return {
      calorieAdjustment: clampedDeficit,
      sparGoal: 'lose',
      goalIntensity: clampedDeficit <= -500 ? 'aggressive' : 'lean',
      reason: `Water load — ${lbsOverWalkAround.toFixed(1)} lbs over walk-around`,
    };
  }

  // ── Training Phase (6+ days out) ─────────────────────────────────────
  if (!isOverWalkAround) {
    // At or below walk-around — maintain
    return {
      calorieAdjustment: 0,
      sparGoal: 'maintain',
      goalIntensity: 'lean',
      reason: 'Training — at walk-around weight, maintaining',
    };
  }

  // Over walk-around during training — scale deficit by lbs over
  const scaledDeficit = Math.round(lbsOverWalkAround * CAL_PER_LB_OVER) * -1;
  const clampedDeficit = Math.max(MAX_DEFICIT, Math.min(MIN_DEFICIT, scaledDeficit));

  return {
    calorieAdjustment: clampedDeficit,
    sparGoal: 'lose',
    goalIntensity: clampedDeficit <= -500 ? 'aggressive' : 'lean',
    reason: `Training — ${lbsOverWalkAround.toFixed(1)} lbs over walk-around (${Math.abs(clampedDeficit)} cal deficit)`,
  };
}
