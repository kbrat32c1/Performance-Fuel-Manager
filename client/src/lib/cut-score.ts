/**
 * Cut Score (0-100) — "Are you tracking to make weight and perform well?"
 *
 * Three pillars with dynamic weighting based on available data:
 *
 *   WEIGHT    (60-80%)  — Are you tracking to make weight?
 *   RECOVERY  (10-30%)  — Will you feel good and perform when you get there?
 *   PROTOCOL  (0-20%)   — Are you following the nutrition/water plan?
 *
 * Each pillar supports tiered data inputs:
 *
 *   WEIGHT:    Basic (scale) → Premium (smart scale with body comp)
 *   RECOVERY:  Basic (sleep hrs + drift) → Enhanced (bed/wake, feel rating) → Premium (HRV, RHR, sleep stages)
 *   PROTOCOL:  Basic (food servings + water) → Enhanced (food types, timing, phase compliance) → Premium (macros, integrations)
 *
 * Dynamic weights: pillars with no data are excluded and their weight is
 * redistributed to pillars that have data. The score works with just
 * scale weight (Weight pillar only) and gets richer with more data.
 *
 * This is a DURING THE WEEK tool. Not used on weigh-in day.
 */

// ═══ TYPES ═══

export interface CutScoreInput {
  // ── Weight pillar ──
  projectedSaturday: number | null;   // projected weigh-in weight
  targetWeight: number;                // what they need to hit
  currentWeight: number | null;        // most recent weight
  grossDailyLoss: number | null;       // total daily loss capacity (drift + practice)
  daysRemaining: number;               // days until weigh-in

  // ── Recovery pillar ──
  // Basic tier
  recentSleepHours: number[];          // newest first, up to 5 nights
  avgOvernightDrift: number | null;    // lbs lost overnight (EMA)
  // Enhanced tier (optional)
  bedTime?: string | null;             // "HH:MM" — future
  wakeTime?: string | null;            // "HH:MM" — future
  feelRating?: number | null;          // 1-5 subjective — future
  // Premium tier (optional — manual entry or wearable)
  hrv?: number | null;                 // heart rate variability — future
  restingHeartRate?: number | null;    // RHR — future
  sleepScore?: number | null;          // wearable sleep quality 0-100 — future
  strainScore?: number | null;         // wearable training strain — future
  recoveryScore?: number | null;       // wearable recovery % — future

  // ── Protocol pillar ──
  // Basic tier
  foodServingsLogged: number;          // total food servings logged today
  foodServingsTarget: number;          // total food servings target today
  waterConsumedOz: number;             // water consumed today in oz
  waterTargetOz: number;               // water target today in oz
  // Enhanced tier (optional)
  correctFoodTypes?: boolean | null;   // are they eating fructose/glucose on the right day — future
  mealTimingScore?: number | null;     // 0-100 meal timing compliance — future
  // Premium tier (optional)
  macroComplianceScore?: number | null; // 0-100 macro accuracy — future
}

export interface PillarScore {
  raw: number;       // 0-100 before weighting
  weighted: number;  // after applying dynamic weight
  weight: number;    // the dynamic weight used (0-1)
  hasData: boolean;  // whether this pillar has enough data to contribute
  tier: 'none' | 'basic' | 'enhanced' | 'premium';
}

export interface CutScoreResult {
  score: number;           // 0-100 final
  label: string;           // "On Track", "Needs Work", etc.
  zone: 'green' | 'yellow' | 'red';
  rationale: string;       // What's driving the score
  pillars: {
    weight: PillarScore;
    recovery: PillarScore;
    protocol: PillarScore;
  };
}

// ═══ DATA TIER DETECTION ═══

function getRecoveryTier(input: CutScoreInput): 'none' | 'basic' | 'enhanced' | 'premium' {
  // Premium: any wearable data present
  if (input.hrv != null || input.restingHeartRate != null || input.sleepScore != null || input.recoveryScore != null) {
    return 'premium';
  }
  // Enhanced: bed/wake times or feel rating
  if (input.bedTime != null || input.wakeTime != null || input.feelRating != null) {
    return 'enhanced';
  }
  // Basic: sleep hours or overnight drift
  if (input.recentSleepHours.length > 0 || input.avgOvernightDrift !== null) {
    return 'basic';
  }
  return 'none';
}

function getProtocolTier(input: CutScoreInput): 'none' | 'basic' | 'enhanced' | 'premium' {
  // Premium: macro tracking
  if (input.macroComplianceScore != null) {
    return 'premium';
  }
  // Enhanced: food type or timing compliance
  if (input.correctFoodTypes != null || input.mealTimingScore != null) {
    return 'enhanced';
  }
  // Basic: any food or water logged
  if (input.foodServingsLogged > 0 || input.waterConsumedOz > 0) {
    return 'basic';
  }
  return 'none';
}

// ═══ DYNAMIC WEIGHTS ═══

interface DynamicWeights {
  weight: number;
  recovery: number;
  protocol: number;
}

/**
 * Compute dynamic pillar weights based on what data is available.
 * Weight pillar always has data (we need at least a scale reading for a score).
 * Recovery and Protocol redistribute their weight to Weight if they have no data.
 */
function getDynamicWeights(recoveryTier: string, protocolTier: string): DynamicWeights {
  const hasRecovery = recoveryTier !== 'none';
  const hasProtocol = protocolTier !== 'none';

  if (hasRecovery && hasProtocol) {
    // All three pillars active
    return { weight: 0.60, recovery: 0.25, protocol: 0.15 };
  } else if (hasRecovery && !hasProtocol) {
    // Weight + Recovery only
    return { weight: 0.75, recovery: 0.25, protocol: 0 };
  } else if (!hasRecovery && hasProtocol) {
    // Weight + Protocol only
    return { weight: 0.80, recovery: 0, protocol: 0.20 };
  } else {
    // Weight only
    return { weight: 1.0, recovery: 0, protocol: 0 };
  }
}

// ═══ PILLAR COMPUTATIONS ═══

/**
 * WEIGHT PILLAR (0-100): Are you tracking to make weight?
 *
 * Projected to make it       → 100
 * Small gap (< 1 lb over)    → 70-90
 * Medium gap (1-3 lbs over)  → 40-60
 * Large gap (3+ lbs over)    → 10-30
 *
 * Based on projection gap — the simple, concrete number that tells
 * a wrestling parent exactly where their kid stands.
 *
 * TRAINING PHASE (6+ days out): The projection is unreliable with
 * minimal data. Being 10 lbs over target is EXPECTED — the cut hasn't
 * started. Score should reflect walk-around proximity, not target gap.
 */
function computeWeight(input: CutScoreInput): number {
  const isTrainingPhase = input.daysRemaining > 5;

  // ── Training phase: score based on walk-around weight, not target ──
  // During training, the athlete is supposed to be 5-10% above target.
  // Walk-around weight ≈ target × 1.07. Score how close they are to that.
  if (isTrainingPhase && input.currentWeight !== null) {
    const walkAround = input.targetWeight * 1.07;
    const walkAroundGap = input.currentWeight - walkAround;

    if (walkAroundGap <= 0) return 85;      // At or below walk-around — great
    if (walkAroundGap < 2) return 75;       // Slightly above walk-around — fine
    if (walkAroundGap < 4) return 60;       // A bit high but manageable with time
    if (walkAroundGap < 6) return 45;       // Getting heavy — worth monitoring
    return 30;                               // Well above walk-around even for training
  }

  // ── Comp week: use projection ──
  // Primary: use projection
  if (input.projectedSaturday !== null) {
    const gap = input.projectedSaturday - input.targetWeight;

    if (gap <= 0) {
      // Projected to make weight — 100
      return 100;
    }

    // Projected over — score based on gap size
    if (gap < 0.5) return 90;
    if (gap < 1.0) return 75;
    if (gap < 1.5) return 60;
    if (gap < 2.0) return 50;
    if (gap < 3.0) return 40;
    if (gap < 4.0) return 25;
    if (gap < 5.0) return 15;
    return 10;
  }

  // Fallback: no projection yet — use current weight vs target
  if (input.currentWeight !== null) {
    const gap = input.currentWeight - input.targetWeight;

    if (gap <= 0) return 100;

    // Scale by daily capacity if available
    if (input.grossDailyLoss && input.grossDailyLoss > 0 && input.daysRemaining > 0) {
      const totalCapacity = input.grossDailyLoss * input.daysRemaining;
      const usedPct = gap / totalCapacity;

      if (usedPct < 0.5) return 85;     // Plenty of capacity left
      if (usedPct < 0.75) return 65;    // Comfortable
      if (usedPct < 1.0) return 45;     // Going to need most of your capacity
      if (usedPct < 1.25) return 25;    // Probably need extra work
      return 10;                          // Very unlikely without extreme measures
    }

    // No capacity data — just use raw gap
    if (gap < 2) return 65;
    if (gap < 5) return 40;
    return 15;
  }

  // No weight data at all — can't score
  return 50; // Neutral
}

/**
 * RECOVERY PILLAR (0-100): Will you feel good and perform well?
 *
 * Tiered — uses whatever data is available:
 *   Basic:    sleep hours + overnight drift
 *   Enhanced: + bed/wake times, feel rating
 *   Premium:  + HRV, RHR, sleep stages, strain, recovery score
 *
 * Starts at 50 (neutral). Data pushes it up or down.
 * No data = not included in score (weight redistributed).
 */
function computeRecovery(input: CutScoreInput, tier: string): number {
  let score = 50;

  // ── Basic tier: sleep hours + drift ──
  if (input.recentSleepHours.length > 0) {
    const avgSleep = input.recentSleepHours.reduce((s, v) => s + v, 0) / input.recentSleepHours.length;

    // Sleep quantity
    if (avgSleep >= 8) score += 20;
    else if (avgSleep >= 7) score += 10;
    else if (avgSleep >= 6) score += 0;    // Neutral
    else if (avgSleep >= 5) score -= 10;
    else score -= 20;                       // Under 5 hrs — serious concern

    // Sleep consistency (if enough data points)
    if (input.recentSleepHours.length >= 3) {
      const variance = input.recentSleepHours.reduce((s, v) => s + (v - avgSleep) ** 2, 0) / input.recentSleepHours.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev < 0.5) score += 5;       // Very consistent
      else if (stdDev > 1.5) score -= 5;  // Erratic
    }
  }

  // Overnight drift — tells us the body is functioning
  if (input.avgOvernightDrift !== null) {
    if (input.avgOvernightDrift >= 1.5) score += 10;      // Strong drift = body working well
    else if (input.avgOvernightDrift >= 1.0) score += 5;
    else if (input.avgOvernightDrift < 0.5) score -= 10;  // Low drift = possible dehydration
  }

  // ── Enhanced tier: feel rating, bed/wake times ──
  if (tier === 'enhanced' || tier === 'premium') {
    if (input.feelRating != null) {
      // 1-5 scale: 1=terrible, 5=great
      if (input.feelRating >= 4) score += 10;
      else if (input.feelRating === 3) score += 0;
      else if (input.feelRating === 2) score -= 10;
      else score -= 15; // Feeling terrible
    }
    // Bed/wake times could improve drift rate accuracy — future use
  }

  // ── Premium tier: wearable data ──
  if (tier === 'premium') {
    // Whoop/Oura recovery score (0-100) — if available, it's the best single metric
    if (input.recoveryScore != null) {
      // Blend wearable recovery with our calculated score
      // Wearable gets heavy influence since it has real physiological data
      const wearableScore = input.recoveryScore; // Already 0-100
      score = score * 0.3 + wearableScore * 0.7;
    } else {
      // Individual metrics if no composite score
      if (input.hrv != null) {
        // HRV is highly individual — hard to set absolute thresholds
        // For now, just check if it's trending (would need historical HRV)
        // Placeholder: above 50ms is generally good for young athletes
        if (input.hrv >= 70) score += 10;
        else if (input.hrv >= 50) score += 5;
        else if (input.hrv < 30) score -= 10;
      }

      if (input.restingHeartRate != null) {
        // Lower is better for athletes, but elevated RHR = stress/overtraining
        // Young wrestlers: 50-70 is normal range
        if (input.restingHeartRate <= 55) score += 5;
        else if (input.restingHeartRate >= 80) score -= 10;
        else if (input.restingHeartRate >= 70) score -= 5;
      }

      if (input.sleepScore != null) {
        // Wearable sleep quality (0-100)
        if (input.sleepScore >= 80) score += 10;
        else if (input.sleepScore >= 60) score += 5;
        else if (input.sleepScore < 40) score -= 10;
      }
    }

    if (input.strainScore != null) {
      // High strain during a cut = overtraining risk
      // Whoop strain is 0-21, but we'll accept normalized 0-100 or raw
      // For now: high strain = body under stress = could hurt performance
      if (input.strainScore > 80) score -= 10;  // Overreaching
      else if (input.strainScore > 60) score -= 5;
    }
  }

  return clamp(score, 0, 100);
}

/**
 * PROTOCOL PILLAR (0-100): Are you following the nutrition/water plan?
 *
 * Tiered — uses whatever tracking data is available:
 *   Basic:    food servings vs target, water vs target
 *   Enhanced: + food type compliance (fructose/glucose), meal timing
 *   Premium:  + macro accuracy
 *
 * No data = not included in score (weight redistributed).
 */
function computeProtocol(input: CutScoreInput, tier: string): number {
  let score = 50;

  // ── Basic tier: food servings + water intake ──
  // Food compliance
  if (input.foodServingsTarget > 0 && input.foodServingsLogged > 0) {
    const foodPct = input.foodServingsLogged / input.foodServingsTarget;
    if (foodPct >= 0.9 && foodPct <= 1.1) score += 20;       // Hit target (within 10%)
    else if (foodPct >= 0.75 && foodPct <= 1.25) score += 10; // Close
    else if (foodPct < 0.5) score -= 15;                       // Way under — not eating enough
    else if (foodPct > 1.5) score -= 10;                       // Way over — eating too much
  }

  // Water compliance
  if (input.waterTargetOz > 0 && input.waterConsumedOz > 0) {
    const waterPct = input.waterConsumedOz / input.waterTargetOz;
    if (waterPct >= 0.9 && waterPct <= 1.1) score += 20;      // Hit target
    else if (waterPct >= 0.75 && waterPct <= 1.25) score += 10;
    else if (waterPct < 0.5) score -= 15;                      // Not drinking enough during loading
    else if (waterPct > 1.5) score -= 10;                      // Too much during restriction
  }

  // ── Enhanced tier: food type + timing ──
  if (tier === 'enhanced' || tier === 'premium') {
    if (input.correctFoodTypes === true) score += 10;
    else if (input.correctFoodTypes === false) score -= 10;

    if (input.mealTimingScore != null) {
      // 0-100 score for meal timing compliance
      score += (input.mealTimingScore - 50) * 0.2; // ±10 pts
    }
  }

  // ── Premium tier: macro accuracy ──
  if (tier === 'premium') {
    if (input.macroComplianceScore != null) {
      // 0-100 score for macro accuracy
      score += (input.macroComplianceScore - 50) * 0.2; // ±10 pts
    }
  }

  return clamp(score, 0, 100);
}

// ═══ SCORE ZONES & LABELS ═══

function getZoneAndLabel(score: number): { label: string; zone: 'green' | 'yellow' | 'red' } {
  if (score >= 90) return { label: 'Dialed In', zone: 'green' };
  if (score >= 75) return { label: 'On Track', zone: 'green' };
  if (score >= 60) return { label: 'Manageable', zone: 'yellow' };
  if (score >= 50) return { label: 'Tight', zone: 'yellow' };
  if (score >= 35) return { label: 'Needs Work', zone: 'red' };
  if (score >= 20) return { label: 'Behind', zone: 'red' };
  return { label: 'Critical', zone: 'red' };
}

/**
 * Generate a rationale sentence explaining what's driving the score.
 * Looks at the active pillars and identifies the biggest concern.
 */
function getRationale(
  pillars: CutScoreResult['pillars'],
  input: CutScoreInput
): string {
  // Collect active pillars (ones with data) sorted by raw score ascending (weakest first)
  const active = [
    { name: 'weight' as const, ...pillars.weight },
    { name: 'recovery' as const, ...pillars.recovery },
    { name: 'protocol' as const, ...pillars.protocol },
  ].filter(p => p.hasData).sort((a, b) => a.raw - b.raw);

  if (active.length === 0) return 'Log your weight to get started.';

  const weakest = active[0];

  switch (weakest.name) {
    case 'weight':
      // Training phase: don't alarm about target gap — they're supposed to be heavy
      if (input.daysRemaining > 5 && input.currentWeight !== null) {
        const walkAround = input.targetWeight * 1.07;
        const walkAroundGap = input.currentWeight - walkAround;
        if (walkAroundGap <= 2) return 'Holding near walk-around weight.';
        if (walkAroundGap <= 5) return `${walkAroundGap.toFixed(1)} lbs above walk-around — monitor intake.`;
        return `${walkAroundGap.toFixed(1)} lbs above walk-around — consider adjusting.`;
      }
      if (input.projectedSaturday !== null && input.projectedSaturday > input.targetWeight) {
        const over = (input.projectedSaturday - input.targetWeight).toFixed(1);
        return `Projected ${over} lbs over target at weigh-in.`;
      }
      if (input.currentWeight !== null && input.currentWeight > input.targetWeight) {
        const gap = (input.currentWeight - input.targetWeight).toFixed(1);
        return `${gap} lbs over target — keep tracking.`;
      }
      return 'On track to make weight.';

    case 'recovery':
      if (input.recentSleepHours.length > 0) {
        const avgSleep = input.recentSleepHours.reduce((s, v) => s + v, 0) / input.recentSleepHours.length;
        if (avgSleep < 6) return `Averaging ${avgSleep.toFixed(1)} hrs sleep — rest is critical for performance.`;
        if (avgSleep < 7) return `Averaging ${avgSleep.toFixed(1)} hrs sleep — aim for 7-8 hrs.`;
      }
      if (input.avgOvernightDrift !== null && input.avgOvernightDrift < 0.5) {
        return 'Low overnight drift — could indicate dehydration.';
      }
      if (input.feelRating != null && input.feelRating <= 2) {
        return 'Not feeling great — recovery matters for performance.';
      }
      if (input.recoveryScore != null && input.recoveryScore < 40) {
        return `Recovery score is ${input.recoveryScore}% — body needs rest.`;
      }
      return 'Recovery looks good — keep it up.';

    case 'protocol': {
      const hour = new Date().getHours();
      // Only flag low intake after noon — in the morning it's expected to be low
      if (hour >= 12 && input.waterTargetOz > 0 && input.waterConsumedOz < input.waterTargetOz * 0.5) {
        return 'Water intake is well below target for today.';
      }
      if (hour >= 12 && input.foodServingsTarget > 0 && input.foodServingsLogged < input.foodServingsTarget * 0.5) {
        return 'Food intake is well below target — follow the plan.';
      }
      if (input.foodServingsTarget > 0 && input.foodServingsLogged > input.foodServingsTarget * 1.5) {
        return 'Eating significantly over target for today.';
      }
      if (hour < 12) {
        return 'Morning — start fueling when ready.';
      }
      return 'Stay on the nutrition plan.';
    }

    default:
      return '';
  }
}

// ═══ MAIN COMPUTATION ═══

export function computeCutScore(input: CutScoreInput): CutScoreResult {
  // Detect data tiers for each pillar
  const recoveryTier = getRecoveryTier(input);
  const protocolTier = getProtocolTier(input);

  // Compute dynamic weights based on available data
  const weights = getDynamicWeights(recoveryTier, protocolTier);

  // Compute raw pillar scores (0-100 each)
  const weightRaw = computeWeight(input);
  const recoveryRaw = recoveryTier !== 'none' ? computeRecovery(input, recoveryTier) : 50;
  const protocolRaw = protocolTier !== 'none' ? computeProtocol(input, protocolTier) : 50;

  // Build pillar results
  const pillars: CutScoreResult['pillars'] = {
    weight: {
      raw: weightRaw,
      weighted: weightRaw * weights.weight,
      weight: weights.weight,
      hasData: true, // Weight always has data if we're computing a score
      tier: 'basic',
    },
    recovery: {
      raw: recoveryRaw,
      weighted: recoveryRaw * weights.recovery,
      weight: weights.recovery,
      hasData: recoveryTier !== 'none',
      tier: recoveryTier,
    },
    protocol: {
      raw: protocolRaw,
      weighted: protocolRaw * weights.protocol,
      weight: weights.protocol,
      hasData: protocolTier !== 'none',
      tier: protocolTier,
    },
  };

  // Weighted sum
  let rawScore = pillars.weight.weighted +
                 pillars.recovery.weighted +
                 pillars.protocol.weighted;

  // Safety guardrail: Weight pillar dominates.
  // If projected significantly over, cap the score — good sleep and nutrition
  // can't mask the fact that you're not going to make weight.
  // BUT: During training phase (6+ days out), the projection is unreliable
  // (often just flat-lines current weight), so don't apply the guardrail.
  if (input.daysRemaining <= 5 && input.projectedSaturday !== null && input.projectedSaturday > input.targetWeight) {
    const gap = input.projectedSaturday - input.targetWeight;
    if (gap > 3) rawScore = Math.min(rawScore, 40);       // Way over → stays red
    else if (gap > 1) rawScore = Math.min(rawScore, 55);  // Significantly over → can't reach green
    else rawScore = Math.min(rawScore, 75);                // Slightly over → tops out at low green
  }

  const score = Math.round(clamp(rawScore, 0, 100));
  const { label, zone } = getZoneAndLabel(score);
  const rationale = getRationale(pillars, input);

  return { score, label, zone, rationale, pillars };
}

// ═══ UTILS ═══

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
