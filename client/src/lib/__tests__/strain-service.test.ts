import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeStrainFromHR,
  getMaxHR,
  updateObservedMaxHR,
  getObservedMaxHR,
  accumulateHRReadings,
  getStrainLabel,
  getStrainColor,
  strainToPercent,
  percentToStrain,
  getStrainTarget,
  getTodayDateKey,
  getHealthDay,
  getCalendarDateKey,
  advanceHealthDay,
  cleanupOldStrainData,
  type HRReading,
} from '../strain-service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create N readings at a given HR for a given hour */
function makeReadings(hr: number, count: number, hour = 10): HRReading[] {
  return Array.from({ length: count }, (_, i) => ({ hour, hr, index: i }));
}

/** Create readings spanning multiple zones for a realistic workout.
 * Uses HRR-based zone targets: RHR defaults to round(maxHR * 0.35).
 * Zone HR = RHR + pct * (maxHR - RHR).
 */
function makeWorkout(maxHR: number): HRReading[] {
  const rhr = Math.round(maxHR * 0.35);
  const hrr = maxHR - rhr;
  const readings: HRReading[] = [];
  let idx = 0;

  // 5 min warm-up at 40% HRR (zone 1) — 75 readings at 4s each
  for (let i = 0; i < 75; i++) {
    readings.push({ hour: 10, hr: Math.round(rhr + 0.40 * hrr), index: idx++ });
  }
  // 10 min at 60% HRR (zone 2) — 150 readings
  for (let i = 0; i < 150; i++) {
    readings.push({ hour: 10, hr: Math.round(rhr + 0.60 * hrr), index: idx++ });
  }
  // 15 min at 75% HRR (zone 3) — 225 readings
  for (let i = 0; i < 225; i++) {
    readings.push({ hour: 11, hr: Math.round(rhr + 0.75 * hrr), index: idx++ });
  }
  // 10 min at 85% HRR (zone 4) — 150 readings
  for (let i = 0; i < 150; i++) {
    readings.push({ hour: 11, hr: Math.round(rhr + 0.85 * hrr), index: idx++ });
  }
  // 5 min at 95% HRR (zone 5) — 75 readings
  for (let i = 0; i < 75; i++) {
    readings.push({ hour: 11, hr: Math.round(rhr + 0.95 * hrr), index: idx++ });
  }

  return readings;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});

describe('computeStrainFromHR', () => {
  describe('empty & edge cases', () => {
    it('returns zero strain for empty readings', () => {
      const result = computeStrainFromHR([], 190);
      expect(result.score).toBe(0);
      expect(result.rawTRIMP).toBe(0);
      expect(result.peakHR).toBe(0);
      expect(result.avgHR).toBe(0);
      expect(result.totalHRMinutes).toBe(0);
      expect(result.zoneMinutes.zone1).toBe(0);
    });

    it('filters out invalid HR readings (< 30)', () => {
      const readings = makeReadings(25, 100);
      const result = computeStrainFromHR(readings, 190);
      // All readings invalid, so no valid HR data
      expect(result.peakHR).toBe(0);
      expect(result.avgHR).toBe(0);
      expect(result.score).toBe(0);
    });

    it('filters out invalid HR readings (> 250)', () => {
      const readings = makeReadings(260, 100);
      const result = computeStrainFromHR(readings, 190);
      expect(result.peakHR).toBe(0);
      expect(result.avgHR).toBe(0);
    });

    it('readings below resting HR contribute zero strain', () => {
      // With maxHR=190, default RHR = round(190*0.35) = 67
      // HR=60 is below RHR, so pct<=0, no TRIMP contribution
      const readings = makeReadings(60, 500, 10);
      const result = computeStrainFromHR(readings, 190);
      expect(result.peakHR).toBe(60);
      expect(result.avgHR).toBe(60);
      expect(result.zoneMinutes.zone1).toBe(0);
      expect(result.rawTRIMP).toBe(0);
      expect(result.score).toBe(0);
    });
  });

  describe('zone classification', () => {
    it('classifies zone 1 correctly (50-60% max HR)', () => {
      // 104 BPM with maxHR 190 = 54.7% — zone 1
      const readings = makeReadings(104, 150, 10);
      const result = computeStrainFromHR(readings, 190);
      expect(result.zoneMinutes.zone1).toBeGreaterThan(0);
      expect(result.zoneMinutes.zone2).toBe(0);
      expect(result.zoneMinutes.zone3).toBe(0);
      expect(result.zoneMinutes.zone4).toBe(0);
      expect(result.zoneMinutes.zone5).toBe(0);
    });

    it('classifies zone 2 correctly (50-70% HRR)', () => {
      // maxHR=190, RHR=67, HRR=123. 60% HRR → HR = 67 + 0.60*123 = 141
      const readings = makeReadings(141, 150, 10);
      const result = computeStrainFromHR(readings, 190);
      expect(result.zoneMinutes.zone1).toBe(0);
      expect(result.zoneMinutes.zone2).toBeGreaterThan(0);
    });

    it('classifies zone 3 correctly (70-80% HRR)', () => {
      // maxHR=190, RHR=67, HRR=123. 75% HRR → HR = 67 + 0.75*123 = 159
      const readings = makeReadings(159, 150, 10);
      const result = computeStrainFromHR(readings, 190);
      expect(result.zoneMinutes.zone3).toBeGreaterThan(0);
    });

    it('classifies zone 4 correctly (80-90% HRR)', () => {
      // maxHR=190, RHR=67, HRR=123. 85% HRR → HR = 67 + 0.85*123 = 172
      const readings = makeReadings(172, 150, 10);
      const result = computeStrainFromHR(readings, 190);
      expect(result.zoneMinutes.zone4).toBeGreaterThan(0);
    });

    it('classifies zone 5 correctly (90-100% max HR)', () => {
      // 181 BPM with maxHR 190 = 95.3% — zone 5
      const readings = makeReadings(181, 150, 10);
      const result = computeStrainFromHR(readings, 190);
      expect(result.zoneMinutes.zone5).toBeGreaterThan(0);
    });
  });

  describe('TRIMP & strain mapping', () => {
    it('computes zone weight correctly — zone 5 contributes more than zone 1', () => {
      // Same duration in zone 1 vs zone 5
      const z1Readings = makeReadings(104, 150, 10); // 54.7% → zone 1
      const z5Readings = makeReadings(181, 150, 11); // 95.3% → zone 5

      const z1Result = computeStrainFromHR(z1Readings, 190);
      const z5Result = computeStrainFromHR(z5Readings, 190);

      // Zone 5 weight (5.0) is 5× zone 1 weight (1.0)
      expect(z5Result.rawTRIMP).toBeGreaterThan(z1Result.rawTRIMP * 4);
    });

    it('maps TRIMP to 0-21 scale via saturation curve', () => {
      // Small TRIMP → low strain, large TRIMP → approaches 21 asymptotically
      const maxHR = 190;

      // Light activity at 40% HRR (~10 min) → low strain
      const rhr = Math.round(maxHR * 0.35);
      const hrr = maxHR - rhr;
      const lightReadings = makeReadings(Math.round(rhr + 0.40 * hrr), 150, 10);
      const lightResult = computeStrainFromHR(lightReadings, maxHR);
      expect(lightResult.score).toBeGreaterThan(0);
      expect(lightResult.score).toBeLessThan(8);

      // Multi-zone workout (45 min, zones 1-5) → higher strain than light
      const hardReadings = makeWorkout(maxHR);
      const hardResult = computeStrainFromHR(hardReadings, maxHR);
      expect(hardResult.score).toBeGreaterThan(lightResult.score);
      expect(hardResult.score).toBeLessThan(21);
    });

    it('strain score rounds to 1 decimal place', () => {
      const readings = makeReadings(143, 200, 10);
      const result = computeStrainFromHR(readings, 190);
      const decimalPlaces = result.score.toString().split('.')[1]?.length || 0;
      expect(decimalPlaces).toBeLessThanOrEqual(1);
    });

    it('strain never exceeds 21', () => {
      // Massive amount of zone 5 data
      const readings = makeReadings(185, 10000, 10);
      const result = computeStrainFromHR(readings, 190);
      expect(result.score).toBeLessThanOrEqual(21);
    });
  });

  describe('HR stats', () => {
    it('correctly calculates peak HR', () => {
      const readings = [
        ...makeReadings(100, 50, 10),
        ...makeReadings(150, 50, 11),
        ...makeReadings(120, 50, 12),
      ];
      const result = computeStrainFromHR(readings, 190);
      expect(result.peakHR).toBe(150);
    });

    it('correctly calculates average HR', () => {
      const readings = [
        ...makeReadings(100, 100, 10),
        ...makeReadings(200, 100, 11),
      ];
      const result = computeStrainFromHR(readings, 190);
      expect(result.avgHR).toBe(150);
    });

    it('tracks total HR minutes correctly', () => {
      // 900 readings × 4 seconds each = 3600 seconds = 60 minutes
      const readings = makeReadings(120, 900, 10);
      const result = computeStrainFromHR(readings, 190);
      expect(result.totalHRMinutes).toBe(60);
    });
  });
});

describe('getMaxHR', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('estimates from age (220 - age)', () => {
    expect(getMaxHR(47)).toBe(173);
    expect(getMaxHR(20)).toBe(200);
    expect(getMaxHR(30)).toBe(190);
  });

  it('returns default 190 when age is null', () => {
    expect(getMaxHR(null)).toBe(190);
  });

  it('returns observed max HR if higher than age estimate', () => {
    localStorage.clear();
    // User is 47 → estimated 173. Observed 180 → should return 180.
    localStorage.setItem('spar-observed-max-hr', '180');
    expect(getMaxHR(47)).toBe(180);
  });

  it('returns age estimate if higher than observed', () => {
    localStorage.clear();
    localStorage.setItem('spar-observed-max-hr', '160');
    expect(getMaxHR(20)).toBe(200); // age 20 → 200 > 160
  });
});

describe('updateObservedMaxHR', () => {
  it('stores new max HR', () => {
    localStorage.clear();
    updateObservedMaxHR(180);
    expect(localStorage.getItem('spar-observed-max-hr')).toBe('180');
    expect(getObservedMaxHR()).toBe(180);
  });

  it('only updates if new value is higher', () => {
    localStorage.clear();
    localStorage.setItem('spar-observed-max-hr', '180');
    updateObservedMaxHR(170); // lower — should not update
    expect(localStorage.getItem('spar-observed-max-hr')).toBe('180');
  });

  it('rejects unrealistic values (>= 250)', () => {
    localStorage.clear();
    updateObservedMaxHR(260);
    expect(getObservedMaxHR()).toBe(0);
  });
});

describe('accumulateHRReadings', () => {
  it('merges new readings with existing', () => {
    const existing: HRReading[] = [
      { hour: 10, hr: 100, index: 0 },
      { hour: 10, hr: 105, index: 1 },
    ];
    const newReadings: HRReading[] = [
      { hour: 10, hr: 110, index: 2 },
      { hour: 11, hr: 120, index: 0 },
    ];
    const result = accumulateHRReadings(existing, newReadings);
    expect(result).toHaveLength(4);
  });

  it('deduplicates by (hour, index) key', () => {
    const existing: HRReading[] = [
      { hour: 10, hr: 100, index: 0 },
      { hour: 10, hr: 105, index: 1 },
    ];
    const newReadings: HRReading[] = [
      { hour: 10, hr: 100, index: 0 }, // duplicate
      { hour: 10, hr: 105, index: 1 }, // duplicate
      { hour: 10, hr: 110, index: 2 }, // new
    ];
    const result = accumulateHRReadings(existing, newReadings);
    expect(result).toHaveLength(3);
  });

  it('preserves order (existing first, then new)', () => {
    const existing: HRReading[] = [{ hour: 10, hr: 100, index: 0 }];
    const newReadings: HRReading[] = [{ hour: 11, hr: 120, index: 0 }];
    const result = accumulateHRReadings(existing, newReadings);
    expect(result[0]).toEqual({ hour: 10, hr: 100, index: 0 });
    expect(result[1]).toEqual({ hour: 11, hr: 120, index: 0 });
  });

  it('handles empty existing array', () => {
    const newReadings: HRReading[] = [{ hour: 10, hr: 100, index: 0 }];
    const result = accumulateHRReadings([], newReadings);
    expect(result).toHaveLength(1);
  });

  it('handles empty new readings', () => {
    const existing: HRReading[] = [{ hour: 10, hr: 100, index: 0 }];
    const result = accumulateHRReadings(existing, []);
    expect(result).toHaveLength(1);
  });
});

describe('getStrainLabel', () => {
  it('returns Minimal for 0-2.9', () => {
    expect(getStrainLabel(0)).toBe('Minimal');
    expect(getStrainLabel(2.9)).toBe('Minimal');
  });

  it('returns Low for 3-6.9', () => {
    expect(getStrainLabel(3)).toBe('Low');
    expect(getStrainLabel(6.9)).toBe('Low');
  });

  it('returns Light for 7-9.9', () => {
    expect(getStrainLabel(7)).toBe('Light');
    expect(getStrainLabel(9.9)).toBe('Light');
  });

  it('returns Moderate for 10-13.9', () => {
    expect(getStrainLabel(10)).toBe('Moderate');
    expect(getStrainLabel(13.9)).toBe('Moderate');
  });

  it('returns Strenuous for 14-17.9', () => {
    expect(getStrainLabel(14)).toBe('Strenuous');
    expect(getStrainLabel(17.9)).toBe('Strenuous');
  });

  it('returns All Out for 18-21', () => {
    expect(getStrainLabel(18)).toBe('All Out');
    expect(getStrainLabel(21)).toBe('All Out');
  });
});

describe('getStrainColor', () => {
  it('returns gray for minimal strain', () => {
    expect(getStrainColor(2)).toBe('#6b7280');
  });

  it('returns blue for light strain', () => {
    expect(getStrainColor(8)).toBe('#2563eb');
  });

  it('returns amber for moderate strain', () => {
    expect(getStrainColor(12)).toBe('#d97706');
  });

  it('returns orange for strenuous strain', () => {
    expect(getStrainColor(16)).toBe('#ea580c');
  });

  it('returns red for all-out strain', () => {
    expect(getStrainColor(20)).toBe('#dc2626');
  });
});

describe('strainToPercent / percentToStrain', () => {
  it('converts 0/21 to 0%', () => {
    expect(strainToPercent(0)).toBe(0);
  });

  it('converts 21/21 to 100%', () => {
    expect(strainToPercent(21)).toBe(100);
  });

  it('converts 10.5/21 to 50%', () => {
    expect(strainToPercent(10.5)).toBe(50);
  });

  it('round-trips correctly', () => {
    const original = 14.0;
    const percent = strainToPercent(original);
    const back = percentToStrain(percent);
    expect(back).toBeCloseTo(original, 0);
  });
});

describe('getStrainTarget', () => {
  it('returns null when recovery is null', () => {
    expect(getStrainTarget(null)).toBeNull();
    expect(getStrainTarget(undefined)).toBeNull();
  });

  it('returns red zone for low recovery (0-33)', () => {
    const target = getStrainTarget(20);
    expect(target).not.toBeNull();
    expect(target!.zone).toBe('red');
    expect(target!.label).toBe('Rest day');
    expect(target!.max).toBeLessThanOrEqual(8);
  });

  it('returns yellow zone for moderate recovery (34-66)', () => {
    const target = getStrainTarget(50);
    expect(target).not.toBeNull();
    expect(target!.zone).toBe('yellow');
    expect(target!.label).toBe('Moderate');
    expect(target!.min).toBeGreaterThanOrEqual(8);
    expect(target!.max).toBeLessThanOrEqual(14);
  });

  it('returns green zone for high recovery (67-100)', () => {
    const target = getStrainTarget(85);
    expect(target).not.toBeNull();
    expect(target!.zone).toBe('green');
    expect(target!.label).toBe('Push it');
    expect(target!.min).toBeGreaterThanOrEqual(14);
  });

  it('clamps recovery to 0-100 range', () => {
    const targetLow = getStrainTarget(-10);
    expect(targetLow!.zone).toBe('red');

    const targetHigh = getStrainTarget(150);
    expect(targetHigh!.zone).toBe('green');
  });

  it('scales within yellow zone — higher recovery = higher target', () => {
    const low = getStrainTarget(35)!;
    const high = getStrainTarget(65)!;
    expect(high.min).toBeGreaterThan(low.min);
    expect(high.max).toBeGreaterThan(low.max);
  });
});

describe('getCalendarDateKey', () => {
  it('returns a string in yyyy-MM-dd format', () => {
    const key = getCalendarDateKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches current date', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(getCalendarDateKey()).toBe(expected);
  });
});

describe('getHealthDay / advanceHealthDay', () => {
  it('returns yesterday before 9 AM or today after 9 AM on first use', () => {
    localStorage.clear();
    const healthDay = getHealthDay();
    const hour = new Date().getHours();
    if (hour < 9) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(healthDay).toBe(getCalendarDateKey(yesterday));
    } else {
      expect(healthDay).toBe(getCalendarDateKey());
    }
  });

  it('returns stored health day when it is behind today', () => {
    localStorage.clear();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getCalendarDateKey(yesterday);
    localStorage.setItem('spar-health-day', yesterdayKey);

    // If before 9 AM, should return yesterday; if after 9 AM, auto-advances
    const healthDay = getHealthDay();
    const hour = new Date().getHours();
    if (hour < 9) {
      expect(healthDay).toBe(yesterdayKey);
    } else {
      expect(healthDay).toBe(getCalendarDateKey());
    }
  });

  it('advanceHealthDay sets health day to today', () => {
    localStorage.clear();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    localStorage.setItem('spar-health-day', getCalendarDateKey(yesterday));

    advanceHealthDay();
    expect(getHealthDay()).toBe(getCalendarDateKey());
  });

  it('getTodayDateKey delegates to getHealthDay', () => {
    localStorage.clear();
    expect(getTodayDateKey()).toBe(getHealthDay());
  });
});

describe('cleanupOldStrainData', () => {
  it('removes strain data older than 14 days', () => {
    localStorage.clear();
    // Set up old data (years ago — definitely older than 14 days)
    localStorage.setItem('spar-strain-hr-2024-01-01', '[]');
    localStorage.setItem('spar-strain-result-2024-01-01', '{}');

    cleanupOldStrainData();

    // Old data should be removed
    expect(localStorage.getItem('spar-strain-hr-2024-01-01')).toBeNull();
    expect(localStorage.getItem('spar-strain-result-2024-01-01')).toBeNull();
  });

  it('keeps recent strain data', () => {
    localStorage.clear();
    const todayKey = getTodayDateKey();
    localStorage.setItem(`spar-strain-hr-${todayKey}`, '[]');

    cleanupOldStrainData();

    // Today's data should remain
    expect(localStorage.getItem(`spar-strain-hr-${todayKey}`)).toBe('[]');
  });

  it('does not remove non-strain keys', () => {
    localStorage.clear();
    localStorage.setItem('some-other-key', 'value');

    cleanupOldStrainData();

    expect(localStorage.getItem('some-other-key')).toBe('value');
  });
});
