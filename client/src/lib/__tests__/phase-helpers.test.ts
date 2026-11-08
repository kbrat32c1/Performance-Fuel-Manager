import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_NAMES,
  getProtocolPhase,
  getPhaseBorderColor,
  CARB_LABELS,
  PROTEIN_LABELS,
} from '../phase-helpers';

// ─── PROTOCOL_NAMES ──────────────────────────────────────────────────────────

describe('PROTOCOL_NAMES', () => {
  it('contains all 6 protocols', () => {
    expect(Object.keys(PROTOCOL_NAMES)).toHaveLength(6);
    expect(PROTOCOL_NAMES['1']).toBe('Extreme Cut');
    expect(PROTOCOL_NAMES['2']).toBe('Rapid Cut');
    expect(PROTOCOL_NAMES['3']).toBe('Optimal Cut');
    expect(PROTOCOL_NAMES['4']).toBe('Gain');
    expect(PROTOCOL_NAMES['5']).toBe('SPAR Nutrition');
    expect(PROTOCOL_NAMES['6']).toBe('SPAR Competition');
  });
});

// ─── getProtocolPhase ────────────────────────────────────────────────────────

describe('getProtocolPhase', () => {
  describe('universal phases', () => {
    it('recovery (negative days) returns RECOVERY for any protocol', () => {
      for (const protocol of ['1', '2', '3', '4', '5', '6']) {
        const result = getProtocolPhase(protocol, -1);
        expect(result.phase).toBe('RECOVERY');
        expect(result.color).toContain('green');
      }
    });

    it('competition day (day 0) returns COMPETITION DAY for any protocol', () => {
      for (const protocol of ['1', '2', '3', '4', '5', '6']) {
        const result = getProtocolPhase(protocol, 0);
        expect(result.phase).toBe('COMPETITION DAY');
        expect(result.color).toContain('yellow');
      }
    });
  });

  describe('PhaseInfo shape', () => {
    it('returns all required fields', () => {
      const result = getProtocolPhase('1', 3);
      expect(result).toHaveProperty('phase');
      expect(result).toHaveProperty('emoji');
      expect(result).toHaveProperty('color');
      expect(result).toHaveProperty('bgColor');
      expect(result).toHaveProperty('foodTip');
      expect(typeof result.phase).toBe('string');
      expect(typeof result.emoji).toBe('string');
      expect(typeof result.color).toBe('string');
      expect(typeof result.bgColor).toBe('string');
      expect(typeof result.foodTip).toBe('string');
    });
  });

  describe('Protocol 1 — Extreme Cut', () => {
    it('day 1 → PERFORMANCE PREP', () => {
      expect(getProtocolPhase('1', 1).phase).toBe('PERFORMANCE PREP');
    });

    it('days 2-5 → MAX FAT BURN', () => {
      expect(getProtocolPhase('1', 2).phase).toBe('MAX FAT BURN');
      expect(getProtocolPhase('1', 5).phase).toBe('MAX FAT BURN');
    });

    it('day 6+ → EXTREME CUT', () => {
      expect(getProtocolPhase('1', 6).phase).toBe('EXTREME CUT');
      expect(getProtocolPhase('1', 14).phase).toBe('EXTREME CUT');
    });
  });

  describe('Protocol 2 — Rapid Cut', () => {
    it('days 1-2 → PERFORMANCE', () => {
      expect(getProtocolPhase('2', 1).phase).toBe('PERFORMANCE');
      expect(getProtocolPhase('2', 2).phase).toBe('PERFORMANCE');
    });

    it('day 3 → CUT → PERFORMANCE', () => {
      expect(getProtocolPhase('2', 3).phase).toBe('CUT → PERFORMANCE');
    });

    it('days 4-5 → CUT', () => {
      expect(getProtocolPhase('2', 4).phase).toBe('CUT');
      expect(getProtocolPhase('2', 5).phase).toBe('CUT');
    });

    it('day 6+ → RAPID CUT', () => {
      expect(getProtocolPhase('2', 6).phase).toBe('RAPID CUT');
    });
  });

  describe('Protocol 3 — Optimal Cut', () => {
    it('days 1-2 → PERFORMANCE', () => {
      expect(getProtocolPhase('3', 1).phase).toBe('PERFORMANCE');
      expect(getProtocolPhase('3', 2).phase).toBe('PERFORMANCE');
    });

    it('days 3-4 → MIXED', () => {
      expect(getProtocolPhase('3', 3).phase).toBe('MIXED');
      expect(getProtocolPhase('3', 4).phase).toBe('MIXED');
    });

    it('day 5 → FGF21 ACTIVATION', () => {
      expect(getProtocolPhase('3', 5).phase).toBe('FGF21 ACTIVATION');
    });

    it('day 6+ → OPTIMAL CUT', () => {
      expect(getProtocolPhase('3', 6).phase).toBe('OPTIMAL CUT');
    });
  });

  describe('Protocol 4 — Gain', () => {
    it('days 1-4 → GLUCOSE EMPHASIS', () => {
      expect(getProtocolPhase('4', 1).phase).toBe('GLUCOSE EMPHASIS');
      expect(getProtocolPhase('4', 4).phase).toBe('GLUCOSE EMPHASIS');
    });

    it('day 5 → BALANCED', () => {
      expect(getProtocolPhase('4', 5).phase).toBe('BALANCED');
    });

    it('day 6+ → GAIN', () => {
      expect(getProtocolPhase('4', 6).phase).toBe('GAIN');
    });
  });

  describe('Protocol 5 — SPAR Nutrition (general)', () => {
    it('always returns BALANCED regardless of days', () => {
      expect(getProtocolPhase('5', 1).phase).toBe('BALANCED');
      expect(getProtocolPhase('5', 7).phase).toBe('BALANCED');
      expect(getProtocolPhase('5', 30).phase).toBe('BALANCED');
    });
  });

  describe('Protocol 6 — SPAR Competition', () => {
    it('day 1 → WATER CUT, day 2 → HIGH WATER', () => {
      expect(getProtocolPhase('6', 1).phase).toBe('WATER CUT');
      expect(getProtocolPhase('6', 2).phase).toBe('HIGH WATER');
    });

    it('days 3-5 → WATER LOAD', () => {
      expect(getProtocolPhase('6', 3).phase).toBe('WATER LOAD');
      expect(getProtocolPhase('6', 5).phase).toBe('WATER LOAD');
    });

    it('day 6+ → TRAINING', () => {
      expect(getProtocolPhase('6', 6).phase).toBe('TRAINING');
      expect(getProtocolPhase('6', 14).phase).toBe('TRAINING');
    });
  });
});

// ─── getPhaseBorderColor ─────────────────────────────────────────────────────

describe('getPhaseBorderColor', () => {
  it('recovery (negative days) returns green border', () => {
    expect(getPhaseBorderColor('1', -1)).toContain('green');
  });

  it('competition day returns yellow border', () => {
    expect(getPhaseBorderColor('2', 0)).toContain('yellow');
  });

  it('returns non-empty string for all protocols in comp week', () => {
    for (const protocol of ['1', '2', '3', '4', '6']) {
      for (const day of [1, 2, 3, 4, 5, 7]) {
        const result = getPhaseBorderColor(protocol, day);
        expect(result.length).toBeGreaterThan(0);
      }
    }
  });

  it('protocol 5 returns empty string for normal days', () => {
    expect(getPhaseBorderColor('5', 3)).toBe('');
  });

  it('protocol 1 day 1 returns blue border', () => {
    expect(getPhaseBorderColor('1', 1)).toContain('blue');
  });

  it('protocol 1 days 2-5 returns red border', () => {
    expect(getPhaseBorderColor('1', 3)).toContain('red');
  });
});

// ─── Label Maps ──────────────────────────────────────────────────────────────

describe('CARB_LABELS', () => {
  it('contains fructose, glucose, mixed, and any', () => {
    expect(CARB_LABELS.fructose).toBeDefined();
    expect(CARB_LABELS.glucose).toBeDefined();
    expect(CARB_LABELS.mixed).toBeDefined();
    expect(CARB_LABELS.any).toBeDefined();
  });

  it('each entry has label, color, and bg', () => {
    for (const key of Object.keys(CARB_LABELS)) {
      const entry = CARB_LABELS[key];
      expect(entry.label).toBeDefined();
      expect(entry.color).toBeDefined();
      expect(entry.bg).toBeDefined();
    }
  });
});

describe('PROTEIN_LABELS', () => {
  it('contains all protein restriction levels', () => {
    expect(PROTEIN_LABELS.blocked).toBeDefined();
    expect(PROTEIN_LABELS['collagen-only']).toBeDefined();
    expect(PROTEIN_LABELS['collagen+seafood']).toBeDefined();
    expect(PROTEIN_LABELS.full).toBeDefined();
    expect(PROTEIN_LABELS.recovery).toBeDefined();
  });

  it('blocked protein shows NO PROTEIN label', () => {
    expect(PROTEIN_LABELS.blocked.label).toBe('NO PROTEIN');
  });

  it('each entry has label, color, and bg', () => {
    for (const key of Object.keys(PROTEIN_LABELS)) {
      const entry = PROTEIN_LABELS[key];
      expect(entry.label).toBeDefined();
      expect(entry.color).toBeDefined();
      expect(entry.bg).toBeDefined();
    }
  });
});

describe("water-loading switch off", () => {
  it("SPAR Competition phases don't mention a water cut or load", () => {
    expect(getProtocolPhase("6", 1, undefined, false).phase).toBe("FINAL PREP");
    expect(getProtocolPhase("6", 4, undefined, false).phase).toBe("COMP WEEK");
    expect(getProtocolPhase("6", 1, undefined, true).phase).toBe("WATER CUT");
  });
});

