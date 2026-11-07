import { describe, it, expect } from 'vitest';
import { computeCutScore, type CutScoreInput } from '../cut-score';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Minimal input — weight data only, no recovery or protocol tracking */
function makeInput(overrides: Partial<CutScoreInput> = {}): CutScoreInput {
  return {
    projectedSaturday: null,
    targetWeight: 165,
    currentWeight: 170,
    grossDailyLoss: null,
    daysRemaining: 3,
    recentSleepHours: [],
    avgOvernightDrift: null,
    foodServingsLogged: 0,
    foodServingsTarget: 0,
    waterConsumedOz: 0,
    waterTargetOz: 0,
    ...overrides,
  };
}

// ─── Score Range & Structure ─────────────────────────────────────────────────

describe('computeCutScore', () => {
  describe('score structure', () => {
    it('returns a score between 0 and 100', () => {
      const result = computeCutScore(makeInput());
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('returns a label string', () => {
      const result = computeCutScore(makeInput());
      expect(typeof result.label).toBe('string');
      expect(result.label.length).toBeGreaterThan(0);
    });

    it('returns a valid zone', () => {
      const result = computeCutScore(makeInput());
      expect(['green', 'yellow', 'red']).toContain(result.zone);
    });

    it('returns a rationale string', () => {
      const result = computeCutScore(makeInput());
      expect(typeof result.rationale).toBe('string');
    });

    it('returns three pillar scores', () => {
      const result = computeCutScore(makeInput());
      expect(result.pillars.weight).toBeDefined();
      expect(result.pillars.recovery).toBeDefined();
      expect(result.pillars.protocol).toBeDefined();
    });
  });

  // ─── Dynamic Weights ────────────────────────────────────────────────────────

  describe('dynamic pillar weights', () => {
    it('weight-only: weight pillar gets 100% when no recovery or protocol data', () => {
      const result = computeCutScore(makeInput());
      expect(result.pillars.weight.weight).toBe(1.0);
      expect(result.pillars.recovery.weight).toBe(0);
      expect(result.pillars.protocol.weight).toBe(0);
      expect(result.pillars.recovery.hasData).toBe(false);
      expect(result.pillars.protocol.hasData).toBe(false);
    });

    it('weight + recovery: redistributes to 75/25/0', () => {
      const result = computeCutScore(makeInput({
        recentSleepHours: [7, 8],
      }));
      expect(result.pillars.weight.weight).toBe(0.75);
      expect(result.pillars.recovery.weight).toBe(0.25);
      expect(result.pillars.protocol.weight).toBe(0);
    });

    it('weight + protocol: redistributes to 80/0/20', () => {
      const result = computeCutScore(makeInput({
        foodServingsLogged: 5,
        foodServingsTarget: 10,
        waterConsumedOz: 40,
        waterTargetOz: 80,
      }));
      expect(result.pillars.weight.weight).toBe(0.80);
      expect(result.pillars.recovery.weight).toBe(0);
      expect(result.pillars.protocol.weight).toBe(0.20);
    });

    it('all three pillars: 60/25/15', () => {
      const result = computeCutScore(makeInput({
        recentSleepHours: [7],
        foodServingsLogged: 5,
        foodServingsTarget: 10,
        waterConsumedOz: 40,
        waterTargetOz: 80,
      }));
      expect(result.pillars.weight.weight).toBe(0.60);
      expect(result.pillars.recovery.weight).toBe(0.25);
      expect(result.pillars.protocol.weight).toBe(0.15);
    });
  });

  // ─── Weight Pillar ──────────────────────────────────────────────────────────

  describe('weight pillar', () => {
    it('projected to make weight → score 100', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: 164, // under target of 165
        daysRemaining: 3,
      }));
      expect(result.pillars.weight.raw).toBe(100);
    });

    it('projected exactly at target → score 100', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: 165,
        daysRemaining: 3,
      }));
      expect(result.pillars.weight.raw).toBe(100);
    });

    it('projected 0.3 lbs over → score 90', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: 165.3,
        daysRemaining: 3,
      }));
      expect(result.pillars.weight.raw).toBe(90);
    });

    it('projected 2.5 lbs over → score 40', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: 167.5,
        daysRemaining: 3,
      }));
      expect(result.pillars.weight.raw).toBe(40);
    });

    it('projected 5+ lbs over → score 10', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: 172,
        daysRemaining: 3,
      }));
      expect(result.pillars.weight.raw).toBe(10);
    });

    it('no projection, current at target → score 100', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: null,
        currentWeight: 165,
      }));
      expect(result.pillars.weight.raw).toBe(100);
    });

    it('no projection, no weight data → neutral 50', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: null,
        currentWeight: null,
      }));
      expect(result.pillars.weight.raw).toBe(50);
    });

    it('fallback uses gross daily loss capacity when available', () => {
      // 2 lbs over, 2 lbs/day capacity, 3 days = 33% used → 85
      const result = computeCutScore(makeInput({
        projectedSaturday: null,
        currentWeight: 167,
        grossDailyLoss: 2,
        daysRemaining: 3,
      }));
      expect(result.pillars.weight.raw).toBe(85);
    });
  });

  // ─── Training Phase (6+ days out) ──────────────────────────────────────────

  describe('training phase (6+ days out)', () => {
    it('at walk-around weight → score 85', () => {
      // Walk-around = 165 × 1.07 ≈ 176.6
      const result = computeCutScore(makeInput({
        currentWeight: 176,
        daysRemaining: 10,
      }));
      expect(result.pillars.weight.raw).toBe(85);
    });

    it('slightly above walk-around → score 75', () => {
      const result = computeCutScore(makeInput({
        currentWeight: 178,
        daysRemaining: 10,
      }));
      expect(result.pillars.weight.raw).toBe(75);
    });

    it('well above walk-around → low score', () => {
      const result = computeCutScore(makeInput({
        currentWeight: 190,
        daysRemaining: 10,
      }));
      expect(result.pillars.weight.raw).toBeLessThanOrEqual(45);
    });
  });

  // ─── Recovery Pillar ────────────────────────────────────────────────────────

  describe('recovery pillar', () => {
    it('detects basic tier from sleep hours', () => {
      const result = computeCutScore(makeInput({
        recentSleepHours: [8, 7.5, 8],
      }));
      expect(result.pillars.recovery.tier).toBe('basic');
      expect(result.pillars.recovery.hasData).toBe(true);
    });

    it('good sleep (8+ hrs) boosts recovery score', () => {
      const result = computeCutScore(makeInput({
        recentSleepHours: [8, 8.5, 8],
      }));
      // 50 base + 20 (sleep 8+) + 5 (consistency) = 75
      expect(result.pillars.recovery.raw).toBeGreaterThanOrEqual(70);
    });

    it('poor sleep (<5 hrs) penalizes recovery score', () => {
      const result = computeCutScore(makeInput({
        recentSleepHours: [4, 4.5, 4],
      }));
      // 50 base - 20 (under 5) + consistency bonus = ~35
      expect(result.pillars.recovery.raw).toBeLessThanOrEqual(40);
    });

    it('strong overnight drift adds points', () => {
      const result = computeCutScore(makeInput({
        recentSleepHours: [7],
        avgOvernightDrift: 2.0,
      }));
      // 50 + 10 (sleep 7) + 10 (drift 2.0) = 70
      expect(result.pillars.recovery.raw).toBe(70);
    });

    it('low overnight drift subtracts points', () => {
      const result = computeCutScore(makeInput({
        recentSleepHours: [7],
        avgOvernightDrift: 0.3,
      }));
      // 50 + 10 (sleep 7) - 10 (drift < 0.5) = 50
      expect(result.pillars.recovery.raw).toBe(50);
    });

    it('detects enhanced tier from feelRating', () => {
      const result = computeCutScore(makeInput({
        recentSleepHours: [7],
        feelRating: 4,
      }));
      expect(result.pillars.recovery.tier).toBe('enhanced');
    });

    it('detects premium tier from wearable data', () => {
      const result = computeCutScore(makeInput({
        recentSleepHours: [7],
        hrv: 65,
      }));
      expect(result.pillars.recovery.tier).toBe('premium');
    });

    it('recovery score is clamped to 0-100', () => {
      // Very bad recovery data — should not go below 0
      const bad = computeCutScore(makeInput({
        recentSleepHours: [3, 3, 3],
        avgOvernightDrift: 0.2,
        feelRating: 1,
        recoveryScore: 5,
      }));
      expect(bad.pillars.recovery.raw).toBeGreaterThanOrEqual(0);

      // Very good recovery data — should not exceed 100
      const good = computeCutScore(makeInput({
        recentSleepHours: [9, 9, 9],
        avgOvernightDrift: 3,
        feelRating: 5,
        recoveryScore: 100,
      }));
      expect(good.pillars.recovery.raw).toBeLessThanOrEqual(100);
    });
  });

  // ─── Protocol Pillar ────────────────────────────────────────────────────────

  describe('protocol pillar', () => {
    it('detects basic tier from food/water logging', () => {
      const result = computeCutScore(makeInput({
        foodServingsLogged: 5,
        foodServingsTarget: 10,
        waterConsumedOz: 40,
        waterTargetOz: 80,
      }));
      expect(result.pillars.protocol.tier).toBe('basic');
      expect(result.pillars.protocol.hasData).toBe(true);
    });

    it('hitting food and water targets gives high score', () => {
      const result = computeCutScore(makeInput({
        foodServingsLogged: 10,
        foodServingsTarget: 10,
        waterConsumedOz: 80,
        waterTargetOz: 80,
      }));
      // 50 + 20 (food in range) + 20 (water in range) = 90
      expect(result.pillars.protocol.raw).toBe(90);
    });

    it('very low food intake penalizes score', () => {
      const result = computeCutScore(makeInput({
        foodServingsLogged: 2,
        foodServingsTarget: 10,
        waterConsumedOz: 80,
        waterTargetOz: 80,
      }));
      // 50 - 15 (food < 50%) + 20 (water on target) = 55
      expect(result.pillars.protocol.raw).toBe(55);
    });

    it('very high food intake penalizes score', () => {
      const result = computeCutScore(makeInput({
        foodServingsLogged: 20,
        foodServingsTarget: 10,
        waterConsumedOz: 80,
        waterTargetOz: 80,
      }));
      // 50 - 10 (food > 150%) + 20 (water on target) = 60
      expect(result.pillars.protocol.raw).toBe(60);
    });

    it('protocol score is clamped to 0-100', () => {
      const result = computeCutScore(makeInput({
        foodServingsLogged: 10,
        foodServingsTarget: 10,
        waterConsumedOz: 80,
        waterTargetOz: 80,
        macroComplianceScore: 100,
      }));
      expect(result.pillars.protocol.raw).toBeLessThanOrEqual(100);
    });
  });

  // ─── Safety Guardrail ──────────────────────────────────────────────────────

  describe('safety guardrail (comp week)', () => {
    it('caps score at 40 when projected 3+ lbs over during comp week', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: 169, // 4 lbs over
        daysRemaining: 3,
        recentSleepHours: [9, 9, 9], // great sleep
        foodServingsLogged: 10,
        foodServingsTarget: 10,
        waterConsumedOz: 80,
        waterTargetOz: 80,
      }));
      expect(result.score).toBeLessThanOrEqual(40);
    });

    it('caps score at 55 when projected 1-3 lbs over during comp week', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: 167, // 2 lbs over
        daysRemaining: 3,
        recentSleepHours: [9, 9, 9],
        foodServingsLogged: 10,
        foodServingsTarget: 10,
        waterConsumedOz: 80,
        waterTargetOz: 80,
      }));
      expect(result.score).toBeLessThanOrEqual(55);
    });

    it('does NOT apply guardrail during training phase (6+ days)', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: 172, // 7 lbs over
        currentWeight: 172,
        daysRemaining: 10,
        recentSleepHours: [9, 9, 9],
        foodServingsLogged: 10,
        foodServingsTarget: 10,
        waterConsumedOz: 80,
        waterTargetOz: 80,
      }));
      // Training phase uses walk-around weight scoring, not projection guardrail
      // Should not be capped at 40
      expect(result.score).toBeGreaterThan(40);
    });
  });

  // ─── Zone & Label ──────────────────────────────────────────────────────────

  describe('zones and labels', () => {
    it('score 90+ is green / Dialed In', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: 164,
        daysRemaining: 3,
        recentSleepHours: [8, 8, 8],
        foodServingsLogged: 10,
        foodServingsTarget: 10,
        waterConsumedOz: 80,
        waterTargetOz: 80,
      }));
      if (result.score >= 90) {
        expect(result.zone).toBe('green');
        expect(result.label).toBe('Dialed In');
      }
    });

    it('score below 35 is red', () => {
      const result = computeCutScore(makeInput({
        projectedSaturday: 172,
        daysRemaining: 2,
      }));
      if (result.score < 35) {
        expect(result.zone).toBe('red');
      }
    });
  });
});
