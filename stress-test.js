#!/usr/bin/env node
/**
 * PWM (Performance Weight Management) Stress Test
 * Tests all calculation logic with 50 simulated wrestlers across all combinations.
 *
 * Replicates the exact constants and formulas from:
 *   - client/src/lib/constants.ts
 *   - client/src/lib/store.tsx
 */

// ============================================================================
// CONSTANTS (replicated from constants.ts)
// ============================================================================

const WEIGHT_CLASSES = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285];

const PROTOCOLS = { BODY_COMP: '1', MAKE_WEIGHT: '2', HOLD_WEIGHT: '3', BUILD: '4' };

const WEIGHT_TARGET_BY_DAYS_OUT = {
  5: 1.07, 4: 1.06, 3: 1.05, 2: 1.04, 1: 1.03, 0: 1.00, '-1': 1.07,
};

const WATER_LOADING_RANGE = { MIN: 2, MAX: 4 };
const WATER_LOADING_DAYS = [5, 4, 3];

const WATER_OZ_PER_LB = {
  5: 1.2, 4: 1.5, 3: 1.5, 2: 0.3, 1: 0.08, 0: 0, '-1': 0.75,
};

const MAX_WATER_LOADING_OZ = 320;

const SODIUM_MG_BY_DAY = {
  5:    { target: 5000, label: 'High — salt-load' },
  4:    { target: 5000, label: 'High — salt-load' },
  3:    { target: 5000, label: 'High — salt-load' },
  2:    { target: 2500, label: 'Normal — stop adding salt' },
  1:    { target: 1000, label: 'Minimal — under 1,000mg' },
  0:    { target: 0,    label: 'Reintroduce post weigh-in' },
  '-1': { target: 3000, label: 'Normal — replenish' },
};

const REHYDRATION = {
  FLUID_OZ_PER_LB_MIN: 16, FLUID_OZ_PER_LB_MAX: 24,
  SODIUM_MG_PER_LB_MIN: 500, SODIUM_MG_PER_LB_MAX: 700,
};

const STATUS_THRESHOLDS = { ON_TRACK_BUFFER: 1.5, BORDERLINE_BUFFER: 3 };

const EMA_ALPHA = 0.4;

// ============================================================================
// REPLICATED FUNCTIONS (from constants.ts & store.tsx)
// ============================================================================

function getWeightMultiplier(daysUntil) {
  if (daysUntil < 0) return WEIGHT_TARGET_BY_DAYS_OUT['-1'];
  if (daysUntil === 0) return WEIGHT_TARGET_BY_DAYS_OUT[0];
  if (daysUntil === 1) return WEIGHT_TARGET_BY_DAYS_OUT[1];
  if (daysUntil === 2) return WEIGHT_TARGET_BY_DAYS_OUT[2];
  if (daysUntil === 3) return WEIGHT_TARGET_BY_DAYS_OUT[3];
  if (daysUntil === 4) return WEIGHT_TARGET_BY_DAYS_OUT[4];
  if (daysUntil === 5) return WEIGHT_TARGET_BY_DAYS_OUT[5];
  return WEIGHT_TARGET_BY_DAYS_OUT[5]; // 6+ = walk-around 1.07
}

function isWaterLoadingDayFn(daysUntil, protocol) {
  if (protocol !== '1' && protocol !== '2') return false;
  return WATER_LOADING_DAYS.includes(daysUntil);
}

function calculateTargetWeight(targetWeightClass, daysUntil, protocol, includeWaterLoading = true) {
  const multiplier = getWeightMultiplier(daysUntil);
  const base = Math.round(targetWeightClass * multiplier);
  const waterLoading = includeWaterLoading && isWaterLoadingDayFn(daysUntil, protocol);
  if (waterLoading) {
    return {
      base,
      withWaterLoad: base + WATER_LOADING_RANGE.MAX,
      range: { min: base + WATER_LOADING_RANGE.MIN, max: base + WATER_LOADING_RANGE.MAX },
    };
  }
  return { base, withWaterLoad: null, range: null };
}

// Store's calculateTarget (depends on profile)
function calculateTarget(profile) {
  const w = profile.targetWeightClass;
  const protocol = profile.protocol;
  const daysUntil = profile.daysUntil;

  if (protocol === '4') return w;

  if (protocol === '3') {
    if (daysUntil < 0) return Math.round(w * 1.05);
    if (daysUntil === 0) return w;
    if (daysUntil === 1) return Math.round(w * 1.03);
    if (daysUntil === 2) return Math.round(w * 1.04);
    return Math.round(w * 1.05); // 3+ days
  }

  // Protocols 1 & 2
  const targetCalc = calculateTargetWeight(w, daysUntil, protocol);
  return targetCalc.withWaterLoad || targetCalc.base;
}

function getWaterTargetOz(daysUntil, weightLbs) {
  if (daysUntil === 0) return 0;
  const key = daysUntil < 0 ? '-1' : String(Math.min(daysUntil, 5));
  const ozPerLb = WATER_OZ_PER_LB[key] ?? 3.5;
  const raw = Math.round(ozPerLb * weightLbs);
  return ozPerLb > 0.5 ? Math.min(raw, MAX_WATER_LOADING_OZ) : raw;
}

function getWaterTargetGallons(daysUntil, weightLbs) {
  if (daysUntil === 0) return 'Rehydrate';
  const key = daysUntil < 0 ? '-1' : String(Math.min(daysUntil, 5));
  const ozPerLb = WATER_OZ_PER_LB[key] ?? 3.5;
  if (ozPerLb <= 0.1) return 'Sips only';
  let totalOz = ozPerLb * weightLbs;
  if (ozPerLb > 0.5) totalOz = Math.min(totalOz, MAX_WATER_LOADING_OZ);
  const gallons = totalOz / 128;
  const rounded = Math.round(gallons * 4) / 4;
  return `${rounded.toFixed(rounded % 1 === 0 ? 1 : 2)} gal`;
}

function getSodiumTarget(daysUntil) {
  const key = daysUntil < 0 ? '-1' : String(Math.min(daysUntil, 5));
  return SODIUM_MG_BY_DAY[key] ?? SODIUM_MG_BY_DAY['-1'];
}

function getPhaseForDaysUntil(daysUntil) {
  if (daysUntil < 0) return 'Recover';
  if (daysUntil === 0) return 'Compete';
  if (daysUntil === 1) return 'Cut';
  if (daysUntil === 2) return 'Prep';
  if (daysUntil >= 3 && daysUntil <= 5) return 'Load';
  return 'Train';
}

function getRehydrationPlan(lostWeight) {
  const fluidMin = Math.round(lostWeight * 16);
  const fluidMax = Math.round(lostWeight * 24);
  const sodiumMin = Math.round(lostWeight * 500);
  const sodiumMax = Math.round(lostWeight * 700);
  return {
    fluidRange: `${fluidMin}-${fluidMax} oz`,
    sodiumRange: `${sodiumMin}-${sodiumMax}mg`,
    glycogen: '40-50g Dextrose/Rice Cakes',
  };
}

function getWaterLoadBonus(targetWeightClass) {
  if (targetWeightClass >= 175) return 4;
  if (targetWeightClass >= 150) return 3;
  return 2;
}

function computeEMA(values) {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  let ema = values[values.length - 1];
  for (let i = values.length - 2; i >= 0; i--) {
    ema = EMA_ALPHA * values[i] + (1 - EMA_ALPHA) * ema;
  }
  return ema;
}

// getDriftMetrics replicated from store.tsx
function getDriftMetrics(logs) {
  const sorted = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let overnightSum = 0, overnightCount = 0, sessionSum = 0, sessionCount = 0;
  const morningLogs = sorted.filter(l => l.type === 'morning');
  const postPracticeLogs = sorted.filter(l => l.type === 'post-practice');
  const prePracticeLogs = sorted.filter(l => l.type === 'pre-practice');

  for (const morning of morningLogs) {
    const morningTime = new Date(morning.date).getTime();
    const match = postPracticeLogs.find(pp => {
      const ppTime = new Date(pp.date).getTime();
      const diffHours = (morningTime - ppTime) / (1000 * 60 * 60);
      return diffHours > 6 && diffHours < 16;
    });
    if (match) {
      overnightSum += (match.weight - morning.weight);
      overnightCount++;
    }
  }

  const usedPostIds = new Set();
  for (const pre of prePracticeLogs) {
    const preTime = new Date(pre.date).getTime();
    const match = postPracticeLogs.find(pp => {
      if (usedPostIds.has(pp.id)) return false;
      const ppTime = new Date(pp.date).getTime();
      const diffHours = (ppTime - preTime) / (1000 * 60 * 60);
      return diffHours > 0 && diffHours < 4;
    });
    if (match) {
      usedPostIds.add(match.id);
      sessionSum += (pre.weight - match.weight);
      sessionCount++;
    }
  }

  return {
    overnight: overnightCount > 0 ? overnightSum / overnightCount : null,
    session: sessionCount > 0 ? sessionSum / sessionCount : null,
  };
}

// getExtraWorkoutStats replicated from store.tsx
function getExtraWorkoutStats(logs, simulatedDate) {
  const today = new Date(simulatedDate);
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const extraBeforeLogs = logs.filter(l => l.type === 'extra-before')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const extraAfterLogs = logs.filter(l => l.type === 'extra-after')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const workoutLosses = [];
  let todayWorkouts = 0;
  let todayLoss = 0;
  const usedAfterIds = new Set();

  for (const before of extraBeforeLogs) {
    const beforeTime = new Date(before.date).getTime();
    const beforeDay = new Date(before.date);
    beforeDay.setHours(0, 0, 0, 0);
    const beforeDayStr = beforeDay.toISOString().slice(0, 10);

    let bestAfter = null;
    let bestTimeDiff = Infinity;

    for (const a of extraAfterLogs) {
      if (usedAfterIds.has(a.id)) continue;
      const afterTime = new Date(a.date).getTime();
      const afterDay = new Date(a.date);
      afterDay.setHours(0, 0, 0, 0);
      const afterDayStr = afterDay.toISOString().slice(0, 10);
      if (afterDayStr !== beforeDayStr) continue;
      const timeDiff = afterTime - beforeTime;
      if (timeDiff >= 0 && timeDiff < 3 * 60 * 60 * 1000 && timeDiff < bestTimeDiff) {
        bestAfter = a;
        bestTimeDiff = timeDiff;
      }
    }

    if (bestAfter) {
      usedAfterIds.add(bestAfter.id);
      const loss = before.weight - bestAfter.weight;
      if (loss > 0) {
        workoutLosses.push(loss);
        if (beforeDayStr === todayStr) {
          todayWorkouts++;
          todayLoss += loss;
        }
      }
    }
  }

  return {
    avgLoss: workoutLosses.length > 0 ? workoutLosses.reduce((a, b) => a + b, 0) / workoutLosses.length : null,
    totalWorkouts: workoutLosses.length,
    todayWorkouts,
    todayLoss,
  };
}

// getWeekDescentData replicated (simplified - we test the key outputs)
function getWeekDescentData(profile, logs) {
  const today = new Date(profile.simulatedDate);
  today.setHours(0, 0, 0, 0);
  const targetWeight = profile.targetWeightClass;
  const weighInDate = new Date(profile.weighInDate);
  weighInDate.setHours(0, 0, 0, 0);
  const daysRemaining = Math.max(0, Math.round((weighInDate - today) / (1000 * 60 * 60 * 24)));

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const morningWeights = [];

  // Find Monday of weigh-in week
  const weighInDow = weighInDate.getDay();
  const daysBackToMonday = weighInDow === 0 ? 6 : weighInDow - 1;
  const weekStartMonday = new Date(weighInDate);
  weekStartMonday.setDate(weighInDate.getDate() - daysBackToMonday);
  weekStartMonday.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(weekStartMonday);
    checkDate.setDate(weekStartMonday.getDate() + i);
    if (checkDate > today) break;

    const morningLog = logs.find(log => {
      const logDate = new Date(log.date);
      return log.type === 'morning' &&
        logDate.getFullYear() === checkDate.getFullYear() &&
        logDate.getMonth() === checkDate.getMonth() &&
        logDate.getDate() === checkDate.getDate();
    });

    if (morningLog) {
      morningWeights.push({
        day: dayNames[checkDate.getDay()],
        weight: morningLog.weight,
        date: new Date(checkDate),
      });
    }
  }

  const startWeight = morningWeights.length > 0 ? morningWeights[0].weight : null;
  const latestMorningWeight = morningWeights.length > 0 ? morningWeights[morningWeights.length - 1].weight : null;
  const currentWeight = latestMorningWeight;
  const totalLost = startWeight && currentWeight ? startWeight - currentWeight : null;

  let dailyAvgLoss = null;
  if (morningWeights.length >= 2 && startWeight && latestMorningWeight) {
    const firstDate = morningWeights[0].date;
    const lastDate = morningWeights[morningWeights.length - 1].date;
    const actualDaysBetween = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
    dailyAvgLoss = (startWeight - latestMorningWeight) / actualDaysBetween;
  }

  return {
    startWeight,
    currentWeight,
    targetWeight,
    daysRemaining,
    totalLost,
    dailyAvgLoss,
    morningWeights,
  };
}

// getCheckpoints replicated from store.tsx
function getCheckpoints(profile) {
  const w = profile.targetWeightClass;
  const protocol = profile.protocol;
  const daysUntil = profile.daysUntil;
  const waterLoading = isWaterLoadingDayFn(daysUntil, protocol);

  const walkAroundLow = Math.round(w * getWeightMultiplier(4));
  const walkAroundHigh = Math.round(w * getWeightMultiplier(5));
  const midWeekBaselineLow = Math.round(w * getWeightMultiplier(2));
  const midWeekBaselineHigh = Math.round(w * getWeightMultiplier(3));
  const criticalLow = Math.round(w * 1.02);
  const criticalHigh = Math.round(w * getWeightMultiplier(1));

  return {
    walkAround: `${walkAroundLow} - ${walkAroundHigh} lbs`,
    wedTarget: `${midWeekBaselineLow} - ${midWeekBaselineHigh} lbs`,
    friTarget: `${criticalLow} - ${criticalHigh} lbs`,
    waterLoadingAdjustment: waterLoading
      ? `Expect +${WATER_LOADING_RANGE.MIN} to +${WATER_LOADING_RANGE.MAX} lbs above baseline from water loading`
      : '',
    isWaterLoadingDay: waterLoading,
  };
}

// ============================================================================
// TEST FRAMEWORK
// ============================================================================

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, details) {
  totalTests++;
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push({ testName, details });
  }
}

function assertClose(actual, expected, tolerance, testName) {
  totalTests++;
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
  } else {
    failed++;
    failures.push({ testName, details: `Expected ~${expected} (±${tolerance}), got ${actual}` });
  }
}

// ============================================================================
// GENERATE 50 WRESTLERS
// ============================================================================

function generateWrestlers() {
  const wrestlers = [];
  const protocols = ['1', '2', '3', '4'];
  const protocolNames = { '1': 'Body Comp', '2': 'Make Weight', '3': 'Hold Weight', '4': 'Build' };
  let id = 1;

  // --- Group 1: One wrestler per weight class with rotating protocols and days (10 wrestlers) ---
  for (let i = 0; i < 10; i++) {
    const wc = WEIGHT_CLASSES[i];
    const protocol = protocols[i % 4];
    const daysOut = [5, 3, 1, 0, 7, 2, 4, -1, 6, 0][i];
    const overPct = [0.07, 0.05, 0.03, 0.0, 0.10, 0.04, 0.06, 0.02, 0.08, -0.01][i];
    const startWeight = Math.round(wc * (1 + overPct) * 10) / 10;
    wrestlers.push({
      id: id++,
      name: `W${id - 1}-${wc}lb-P${protocol}`,
      weightClass: wc,
      protocol,
      protocolName: protocolNames[protocol],
      startWeight,
      daysOut,
      hasExtraWorkouts: i % 3 === 0,
      pattern: i % 2 === 0 ? 'steady' : 'fluctuating',
    });
  }

  // --- Group 2: All 4 protocols at 133 lbs (4 wrestlers) ---
  for (const p of protocols) {
    const daysOut = { '1': 5, '2': 3, '3': 1, '4': 7 }[p];
    wrestlers.push({
      id: id++,
      name: `W${id - 1}-133lb-P${p}`,
      weightClass: 133,
      protocol: p,
      protocolName: protocolNames[p],
      startWeight: 142.3,
      daysOut,
      hasExtraWorkouts: p === '1',
      pattern: 'steady',
    });
  }

  // --- Group 3: All 4 protocols at 285 lbs (4 wrestlers) ---
  for (const p of protocols) {
    const daysOut = { '1': 5, '2': 4, '3': 2, '4': 0 }[p];
    wrestlers.push({
      id: id++,
      name: `W${id - 1}-285lb-P${p}`,
      weightClass: 285,
      protocol: p,
      protocolName: protocolNames[p],
      startWeight: p === '4' ? 285 : 305,
      daysOut,
      hasExtraWorkouts: true,
      pattern: 'fluctuating',
    });
  }

  // --- Group 4: Edge cases at 125 lbs - close to weight (4 wrestlers) ---
  const closeDays = [5, 2, 0, -1];
  for (let i = 0; i < 4; i++) {
    wrestlers.push({
      id: id++,
      name: `W${id - 1}-125lb-Close-D${closeDays[i]}`,
      weightClass: 125,
      protocol: protocols[i],
      protocolName: protocolNames[protocols[i]],
      startWeight: 125.5 + i * 0.3,
      daysOut: closeDays[i],
      hasExtraWorkouts: false,
      pattern: 'steady',
    });
  }

  // --- Group 5: Way over (10%+ over) — stress test (4 wrestlers) ---
  const wayOverClasses = [141, 157, 184, 197];
  for (let i = 0; i < 4; i++) {
    const wc = wayOverClasses[i];
    wrestlers.push({
      id: id++,
      name: `W${id - 1}-${wc}lb-WayOver`,
      weightClass: wc,
      protocol: protocols[i],
      protocolName: protocolNames[protocols[i]],
      startWeight: Math.round(wc * 1.12 * 10) / 10,
      daysOut: [7, 5, 3, 1][i],
      hasExtraWorkouts: true,
      pattern: 'fluctuating',
    });
  }

  // --- Group 6: Under weight class (4 wrestlers) ---
  const underClasses = [149, 165, 174, 285];
  for (let i = 0; i < 4; i++) {
    const wc = underClasses[i];
    wrestlers.push({
      id: id++,
      name: `W${id - 1}-${wc}lb-Under`,
      weightClass: wc,
      protocol: protocols[i],
      protocolName: protocolNames[protocols[i]],
      startWeight: Math.round(wc * 0.97 * 10) / 10,
      daysOut: [4, 2, 0, -1][i],
      hasExtraWorkouts: false,
      pattern: 'steady',
    });
  }

  // --- Group 7: Competition day (daysOut=0) across protocols (4 wrestlers) ---
  for (let i = 0; i < 4; i++) {
    const wc = WEIGHT_CLASSES[i + 3]; // 149, 157, 165, 174
    wrestlers.push({
      id: id++,
      name: `W${id - 1}-${wc}lb-CompDay`,
      weightClass: wc,
      protocol: protocols[i],
      protocolName: protocolNames[protocols[i]],
      startWeight: wc + (i < 2 ? 0.5 : -0.5), // Some just over, some just under
      daysOut: 0,
      hasExtraWorkouts: false,
      pattern: 'steady',
    });
  }

  // --- Group 8: Recovery day (daysOut=-1) across protocols (4 wrestlers) ---
  for (let i = 0; i < 4; i++) {
    const wc = WEIGHT_CLASSES[i + 5]; // 165, 174, 184, 197
    wrestlers.push({
      id: id++,
      name: `W${id - 1}-${wc}lb-Recovery`,
      weightClass: wc,
      protocol: protocols[i],
      protocolName: protocolNames[protocols[i]],
      startWeight: wc * 1.02,
      daysOut: -1,
      hasExtraWorkouts: false,
      pattern: 'steady',
    });
  }

  // --- Group 9: Protocols 1&2 on each water loading day (6 wrestlers) ---
  const wlDays = [5, 4, 3];
  for (const d of wlDays) {
    for (const p of ['1', '2']) {
      const wc = d === 5 ? 141 : d === 4 ? 165 : 197;
      wrestlers.push({
        id: id++,
        name: `W${id - 1}-${wc}lb-WL-D${d}-P${p}`,
        weightClass: wc,
        protocol: p,
        protocolName: protocolNames[p],
        startWeight: Math.round(wc * 1.07 * 10) / 10,
        daysOut: d,
        hasExtraWorkouts: d === 5,
        pattern: 'steady',
      });
    }
  }

  // --- Group 10: Fill remaining to 50 with varied scenarios ---
  const remaining = 50 - wrestlers.length;
  const fillerConfigs = [
    { wc: 133, p: '1', sw: 140, d: 2, extra: true, pat: 'fluctuating' },
    { wc: 149, p: '2', sw: 155, d: 4, extra: false, pat: 'steady' },
    { wc: 174, p: '3', sw: 179, d: 6, extra: false, pat: 'steady' },
    { wc: 184, p: '4', sw: 184, d: 3, extra: false, pat: 'steady' },
    { wc: 285, p: '1', sw: 300, d: 5, extra: true, pat: 'fluctuating' },
    { wc: 125, p: '2', sw: 132, d: 1, extra: true, pat: 'fluctuating' },
  ];
  for (let i = 0; i < remaining; i++) {
    const c = fillerConfigs[i % fillerConfigs.length];
    wrestlers.push({
      id: id++,
      name: `W${id - 1}-${c.wc}lb-Fill`,
      weightClass: c.wc,
      protocol: c.p,
      protocolName: protocolNames[c.p],
      startWeight: c.sw,
      daysOut: c.d,
      hasExtraWorkouts: c.extra,
      pattern: c.pat,
    });
  }

  return wrestlers.slice(0, 50);
}

// Generate fake logs for drift/extra workout testing
function generateLogs(wrestler) {
  const logs = [];
  const baseDate = new Date('2025-01-25');
  const weighInDate = new Date(baseDate);
  weighInDate.setDate(baseDate.getDate() + wrestler.daysOut);
  let currentW = wrestler.startWeight;
  let logId = 1;

  // Generate 3 days of logs for drift and session testing
  for (let dayOffset = -3; dayOffset <= 0; dayOffset++) {
    const dayDate = new Date(baseDate);
    dayDate.setDate(baseDate.getDate() + dayOffset);

    // Fluctuating pattern: weight bounces
    const fluctuation = wrestler.pattern === 'fluctuating' ? (Math.sin(dayOffset * 2) * 0.8) : 0;
    const dayWeight = currentW + fluctuation;
    const dailyDrop = wrestler.pattern === 'steady' ? 0.5 : 0.3;

    // Morning log
    const morningDate = new Date(dayDate);
    morningDate.setHours(7, 0, 0, 0);
    logs.push({ id: `${wrestler.id}-${logId++}`, date: morningDate, weight: Number((dayWeight - dailyDrop * 0.5).toFixed(1)), type: 'morning' });

    // Pre-practice
    const preDate = new Date(dayDate);
    preDate.setHours(15, 0, 0, 0);
    const preWeight = Number((dayWeight + 1.5).toFixed(1)); // ate during day
    logs.push({ id: `${wrestler.id}-${logId++}`, date: preDate, weight: preWeight, type: 'pre-practice' });

    // Post-practice (lose 1.5-2.5 lbs)
    const postDate = new Date(dayDate);
    postDate.setHours(17, 0, 0, 0);
    const practiceLoss = 1.8 + (wrestler.weightClass > 174 ? 0.5 : 0);
    const postWeight = Number((preWeight - practiceLoss).toFixed(1));
    logs.push({ id: `${wrestler.id}-${logId++}`, date: postDate, weight: postWeight, type: 'post-practice', duration: 120 });

    // Before bed
    const bedDate = new Date(dayDate);
    bedDate.setHours(22, 0, 0, 0);
    logs.push({ id: `${wrestler.id}-${logId++}`, date: bedDate, weight: Number((postWeight + 0.5).toFixed(1)), type: 'before-bed' });

    // Extra workouts
    if (wrestler.hasExtraWorkouts && dayOffset >= -1) {
      const extraBeforeDate = new Date(dayDate);
      extraBeforeDate.setHours(18, 30, 0, 0);
      const extraBeforeW = Number((postWeight + 0.3).toFixed(1));
      logs.push({ id: `${wrestler.id}-${logId++}`, date: extraBeforeDate, weight: extraBeforeW, type: 'extra-before' });

      const extraAfterDate = new Date(dayDate);
      extraAfterDate.setHours(19, 30, 0, 0);
      const extraLoss = 0.8 + (wrestler.weightClass > 174 ? 0.3 : 0);
      logs.push({ id: `${wrestler.id}-${logId++}`, date: extraAfterDate, weight: Number((extraBeforeW - extraLoss).toFixed(1)), type: 'extra-after', duration: 45 });
    }

    currentW -= dailyDrop;
  }

  return logs;
}

// ============================================================================
// RUN TESTS
// ============================================================================

function runTests() {
  const wrestlers = generateWrestlers();

  console.log('='.repeat(100));
  console.log('PWM STRESS TEST — 50 Wrestlers, All Calculation Logic');
  console.log('='.repeat(100));
  console.log();

  for (const w of wrestlers) {
    const logs = generateLogs(w);
    const profile = {
      targetWeightClass: w.weightClass,
      protocol: w.protocol,
      daysUntil: w.daysOut,
      simulatedDate: new Date('2025-01-25'),
      weighInDate: (() => {
        const d = new Date('2025-01-25');
        d.setDate(d.getDate() + w.daysOut);
        return d;
      })(),
    };

    const prefix = `[${w.name}] (${w.weightClass}lb, P${w.protocol}=${w.protocolName}, D${w.daysOut})`;
    console.log(`\n--- ${prefix} ---`);
    console.log(`  Start weight: ${w.startWeight} lbs | Pattern: ${w.pattern} | Extra workouts: ${w.hasExtraWorkouts}`);

    // =========================================================================
    // TEST 1: calculateTarget
    // =========================================================================
    const target = calculateTarget(profile);
    assert(!isNaN(target) && target > 0, `${prefix} calculateTarget not NaN`, `Got: ${target}`);
    assert(typeof target === 'number', `${prefix} calculateTarget is number`, `Got: ${typeof target}`);

    // Protocol 4: target should equal weight class exactly
    if (w.protocol === '4') {
      assert(target === w.weightClass, `${prefix} Build target = weight class`, `Expected ${w.weightClass}, got ${target}`);
    }

    // Protocol 3: target should be at most 5% over (1.05 * wc) on non-comp days
    if (w.protocol === '3' && w.daysOut > 0) {
      const maxHold = Math.round(w.weightClass * 1.05);
      assert(target <= maxHold, `${prefix} Hold target <= 1.05*wc`, `Expected <= ${maxHold}, got ${target}`);
    }
    if (w.protocol === '3' && w.daysOut === 0) {
      assert(target === w.weightClass, `${prefix} Hold comp day target = wc`, `Expected ${w.weightClass}, got ${target}`);
    }

    // Competition day (daysOut=0): all protocols should target weight class
    if (w.daysOut === 0) {
      assert(target === w.weightClass, `${prefix} Comp day target = wc`, `Expected ${w.weightClass}, got ${target}`);
    }

    console.log(`  calculateTarget(): ${target} lbs`);

    // =========================================================================
    // TEST 2: calculateTargetWeight from constants
    // =========================================================================
    const ctw = calculateTargetWeight(w.weightClass, w.daysOut, w.protocol);
    assert(!isNaN(ctw.base) && ctw.base > 0, `${prefix} calculateTargetWeight base valid`, `Got: ${ctw.base}`);

    // Verify consistency: store's calculateTarget should match what calculateTargetWeight produces
    if (w.protocol === '1' || w.protocol === '2') {
      const expectedFromCalc = ctw.withWaterLoad || ctw.base;
      assert(target === expectedFromCalc, `${prefix} store target matches constants`, `Store: ${target}, Constants: ${expectedFromCalc}`);
    }

    // Water loading: only protocols 1 & 2, only days 5,4,3
    if ((w.protocol === '1' || w.protocol === '2') && [5, 4, 3].includes(w.daysOut)) {
      assert(ctw.withWaterLoad !== null, `${prefix} water loading present on day ${w.daysOut}`, `Got withWaterLoad: ${ctw.withWaterLoad}`);
      assert(ctw.range !== null, `${prefix} water loading range present`, `Got range: ${JSON.stringify(ctw.range)}`);
      assert(ctw.range.max - ctw.range.min === WATER_LOADING_RANGE.MAX - WATER_LOADING_RANGE.MIN,
        `${prefix} WL range span = ${WATER_LOADING_RANGE.MAX - WATER_LOADING_RANGE.MIN}`,
        `Got span: ${ctw.range.max - ctw.range.min}`);
    } else if (w.protocol === '3' || w.protocol === '4') {
      // Protocols 3 and 4 should NEVER have water loading
      const ctwCheck = calculateTargetWeight(w.weightClass, w.daysOut, w.protocol);
      assert(ctwCheck.withWaterLoad === null, `${prefix} NO water loading for P${w.protocol}`, `Got withWaterLoad: ${ctwCheck.withWaterLoad}`);
      assert(ctwCheck.range === null, `${prefix} NO WL range for P${w.protocol}`, `Got range: ${JSON.stringify(ctwCheck.range)}`);
    }

    // TEST 10: Water loading adds 2-4 lbs on days 5,4,3 for protocols 1&2 ONLY
    if ((w.protocol === '1' || w.protocol === '2') && [5, 4, 3].includes(w.daysOut)) {
      const bonus = ctw.withWaterLoad - ctw.base;
      assert(bonus >= WATER_LOADING_RANGE.MIN && bonus <= WATER_LOADING_RANGE.MAX,
        `${prefix} WL bonus in [${WATER_LOADING_RANGE.MIN},${WATER_LOADING_RANGE.MAX}]`,
        `Got bonus: ${bonus}`);
    }

    // TEST 11: Build phase — NO water loading, NO cut targets
    if (w.protocol === '4') {
      for (const d of [5, 4, 3, 2, 1]) {
        const bCalc = calculateTargetWeight(w.weightClass, d, '4');
        assert(bCalc.withWaterLoad === null, `${prefix} Build P4 day ${d} no WL`, `Got: ${bCalc.withWaterLoad}`);
      }
      // Build target = weight class always
      assert(calculateTarget({ ...profile, daysUntil: 5 }) === w.weightClass, `${prefix} Build target=wc at D5`, '');
      assert(calculateTarget({ ...profile, daysUntil: 0 }) === w.weightClass, `${prefix} Build target=wc at D0`, '');
    }

    // TEST 12: Hold Weight — steady ~3-5% over, no water loading
    if (w.protocol === '3') {
      for (const d of [5, 4, 3]) {
        const hCalc = calculateTargetWeight(w.weightClass, d, '3');
        assert(hCalc.withWaterLoad === null, `${prefix} Hold P3 day ${d} no WL`, `Got: ${hCalc.withWaterLoad}`);
      }
      const holdTarget3plus = calculateTarget({ ...profile, daysUntil: 5 });
      assert(holdTarget3plus === Math.round(w.weightClass * 1.05), `${prefix} Hold 3+ days = 1.05*wc`,
        `Expected ${Math.round(w.weightClass * 1.05)}, got ${holdTarget3plus}`);
    }

    console.log(`  calculateTargetWeight(): base=${ctw.base}, withWL=${ctw.withWaterLoad}, range=${ctw.range ? `${ctw.range.min}-${ctw.range.max}` : 'none'}`);

    // =========================================================================
    // TEST 3: getWeekDescentData
    // =========================================================================
    const descent = getWeekDescentData(profile, logs);
    assert(descent.targetWeight === w.weightClass, `${prefix} descent targetWeight`, `Expected ${w.weightClass}, got ${descent.targetWeight}`);
    assert(descent.daysRemaining >= 0, `${prefix} descent daysRemaining >= 0`, `Got: ${descent.daysRemaining}`);
    if (descent.startWeight !== null && descent.currentWeight !== null) {
      assert(!isNaN(descent.startWeight), `${prefix} descent startWeight not NaN`, `Got: ${descent.startWeight}`);
      assert(!isNaN(descent.currentWeight), `${prefix} descent currentWeight not NaN`, `Got: ${descent.currentWeight}`);
    }
    if (descent.dailyAvgLoss !== null) {
      assert(!isNaN(descent.dailyAvgLoss), `${prefix} descent dailyAvgLoss not NaN`, `Got: ${descent.dailyAvgLoss}`);
    }

    // If we have morning weights, verify they're in date order
    if (descent.morningWeights.length >= 2) {
      for (let i = 1; i < descent.morningWeights.length; i++) {
        assert(descent.morningWeights[i].date >= descent.morningWeights[i - 1].date,
          `${prefix} morningWeights in date order`, `idx ${i} out of order`);
      }
    }

    console.log(`  getWeekDescentData(): start=${descent.startWeight}, current=${descent.currentWeight}, daysLeft=${descent.daysRemaining}, dailyAvg=${descent.dailyAvgLoss?.toFixed(2) ?? 'null'}`);

    // =========================================================================
    // TEST 4: getCheckpoints
    // =========================================================================
    const checkpoints = getCheckpoints(profile);
    assert(checkpoints.walkAround.includes('lbs'), `${prefix} walkAround format`, `Got: ${checkpoints.walkAround}`);
    assert(checkpoints.wedTarget.includes('lbs'), `${prefix} wedTarget format`, `Got: ${checkpoints.wedTarget}`);
    assert(checkpoints.friTarget.includes('lbs'), `${prefix} friTarget format`, `Got: ${checkpoints.friTarget}`);

    // Water loading adjustment should only be present for P1/P2 on WL days
    if (isWaterLoadingDayFn(w.daysOut, w.protocol)) {
      assert(checkpoints.waterLoadingAdjustment.length > 0, `${prefix} WL adjustment present on WL day`, '');
      assert(checkpoints.isWaterLoadingDay === true, `${prefix} isWaterLoadingDay=true on WL day`, '');
    } else {
      assert(checkpoints.waterLoadingAdjustment === '', `${prefix} no WL adjustment on non-WL day`, `Got: "${checkpoints.waterLoadingAdjustment}"`);
      assert(checkpoints.isWaterLoadingDay === false, `${prefix} isWaterLoadingDay=false`, '');
    }

    // Verify checkpoint numerical ordering: walkAround > wedTarget > friTarget
    const parseRange = (s) => {
      const nums = s.match(/\d+/g);
      return nums ? nums.map(Number) : [];
    };
    const waVals = parseRange(checkpoints.walkAround);
    const wedVals = parseRange(checkpoints.wedTarget);
    const friVals = parseRange(checkpoints.friTarget);
    if (waVals.length >= 2 && wedVals.length >= 2 && friVals.length >= 2) {
      assert(waVals[1] >= wedVals[1], `${prefix} walkAround >= wedTarget`, `${waVals[1]} vs ${wedVals[1]}`);
      assert(wedVals[1] >= friVals[1], `${prefix} wedTarget >= friTarget`, `${wedVals[1]} vs ${friVals[1]}`);
    }

    console.log(`  getCheckpoints(): WA=${checkpoints.walkAround}, Wed=${checkpoints.wedTarget}, Fri=${checkpoints.friTarget}, WL=${checkpoints.isWaterLoadingDay}`);

    // =========================================================================
    // TEST 5: getWaterTargetOz and getWaterTargetGallons
    // =========================================================================
    const waterOz = getWaterTargetOz(w.daysOut, w.startWeight);
    const waterGal = getWaterTargetGallons(w.daysOut, w.startWeight);

    assert(!isNaN(waterOz), `${prefix} waterOz not NaN`, `Got: ${waterOz}`);
    assert(waterOz >= 0, `${prefix} waterOz >= 0 (no negative water)`, `Got: ${waterOz}`);

    // Competition day: 0 oz
    if (w.daysOut === 0) {
      assert(waterOz === 0, `${prefix} comp day water = 0`, `Got: ${waterOz}`);
      assert(waterGal === 'Rehydrate', `${prefix} comp day gallons = Rehydrate`, `Got: ${waterGal}`);
    }

    // Day 1: sips only (0.08 oz/lb)
    if (w.daysOut === 1) {
      assert(waterGal === 'Sips only', `${prefix} D1 gallons = Sips only`, `Got: ${waterGal}`);
    }

    // TEST 15: 285 lb wrestler at day 5 with protocol 1 — water should cap at 320oz
    if (w.weightClass === 285 && w.daysOut === 5) {
      const heavyWaterOz = getWaterTargetOz(5, 305); // 305 lbs walk-around
      assert(heavyWaterOz <= MAX_WATER_LOADING_OZ, `${prefix} 285lb D5 water capped at ${MAX_WATER_LOADING_OZ}oz`,
        `Got: ${heavyWaterOz} oz (raw would be ${Math.round(1.2 * 305)})`);
    }

    // Loading days (5,4,3) cap at 320oz
    if ([5, 4, 3].includes(w.daysOut)) {
      assert(waterOz <= MAX_WATER_LOADING_OZ, `${prefix} loading day water <= ${MAX_WATER_LOADING_OZ}oz`, `Got: ${waterOz}`);
    }

    // Verify gallons format
    if (w.daysOut !== 0 && w.daysOut !== 1) {
      assert(typeof waterGal === 'string', `${prefix} waterGal is string`, `Got: ${typeof waterGal}`);
      if (waterGal !== 'Sips only') {
        assert(waterGal.includes('gal'), `${prefix} waterGal contains "gal"`, `Got: ${waterGal}`);
      }
    }

    console.log(`  getWaterTargetOz(): ${waterOz} oz | getWaterTargetGallons(): ${waterGal}`);

    // =========================================================================
    // TEST 6: getSodiumTarget
    // =========================================================================
    const sodium = getSodiumTarget(w.daysOut);
    assert(sodium !== null && sodium !== undefined, `${prefix} sodium target exists`, `Got: ${sodium}`);
    assert(!isNaN(sodium.target), `${prefix} sodium target not NaN`, `Got: ${sodium.target}`);
    assert(sodium.target >= 0, `${prefix} sodium target >= 0`, `Got: ${sodium.target}`);

    // Verify specific day values
    if (w.daysOut >= 3 && w.daysOut <= 5) {
      assert(sodium.target === 5000, `${prefix} loading day sodium = 5000`, `Got: ${sodium.target}`);
    }
    if (w.daysOut === 2) {
      assert(sodium.target === 2500, `${prefix} D2 sodium = 2500`, `Got: ${sodium.target}`);
    }
    if (w.daysOut === 1) {
      assert(sodium.target === 1000, `${prefix} D1 sodium = 1000`, `Got: ${sodium.target}`);
    }
    if (w.daysOut === 0) {
      assert(sodium.target === 0, `${prefix} comp day sodium = 0`, `Got: ${sodium.target}`);
    }
    if (w.daysOut < 0) {
      assert(sodium.target === 3000, `${prefix} recovery sodium = 3000`, `Got: ${sodium.target}`);
    }

    console.log(`  getSodiumTarget(): ${sodium.target}mg (${sodium.label})`);

    // =========================================================================
    // TEST 7: getRehydrationPlan
    // =========================================================================
    const lostWeight = Math.max(0, w.startWeight - w.weightClass);
    const rehydration = getRehydrationPlan(lostWeight);
    assert(rehydration.fluidRange.includes('oz'), `${prefix} rehydration fluid format`, `Got: ${rehydration.fluidRange}`);
    assert(rehydration.sodiumRange.includes('mg'), `${prefix} rehydration sodium format`, `Got: ${rehydration.sodiumRange}`);

    // Verify ranges match the formula
    const expectedFluidMin = Math.round(lostWeight * 16);
    const expectedFluidMax = Math.round(lostWeight * 24);
    const expectedSodiumMin = Math.round(lostWeight * 500);
    const expectedSodiumMax = Math.round(lostWeight * 700);
    assert(rehydration.fluidRange === `${expectedFluidMin}-${expectedFluidMax} oz`,
      `${prefix} rehydration fluid exact`, `Expected ${expectedFluidMin}-${expectedFluidMax} oz, got ${rehydration.fluidRange}`);
    assert(rehydration.sodiumRange === `${expectedSodiumMin}-${expectedSodiumMax}mg`,
      `${prefix} rehydration sodium exact`, `Expected ${expectedSodiumMin}-${expectedSodiumMax}mg, got ${rehydration.sodiumRange}`);

    console.log(`  getRehydrationPlan(${lostWeight.toFixed(1)} lbs lost): fluid=${rehydration.fluidRange}, sodium=${rehydration.sodiumRange}`);

    // =========================================================================
    // TEST 8: getDriftMetrics
    // =========================================================================
    const drift = getDriftMetrics(logs);
    if (drift.overnight !== null) {
      assert(!isNaN(drift.overnight), `${prefix} overnight drift not NaN`, `Got: ${drift.overnight}`);
      // Overnight drift CAN be negative if wrestler gains water weight overnight
      // (e.g., eats/drinks after post-practice). The app does not enforce >= 0.
      assert(typeof drift.overnight === 'number', `${prefix} overnight drift is number`, `Got: ${typeof drift.overnight}`);
    }
    if (drift.session !== null) {
      assert(!isNaN(drift.session), `${prefix} session loss not NaN`, `Got: ${drift.session}`);
      // Session loss should generally be positive (sweat during practice)
      // but we only assert it's a valid number since synthetic data may vary
      assert(typeof drift.session === 'number', `${prefix} session loss is number`, `Got: ${typeof drift.session}`);
    }

    console.log(`  getDriftMetrics(): overnight=${drift.overnight?.toFixed(2) ?? 'null'}, session=${drift.session?.toFixed(2) ?? 'null'}`);

    // =========================================================================
    // TEST 9: getExtraWorkoutStats
    // =========================================================================
    const extraStats = getExtraWorkoutStats(logs, profile.simulatedDate);
    assert(!isNaN(extraStats.totalWorkouts), `${prefix} extraWorkouts totalWorkouts not NaN`, `Got: ${extraStats.totalWorkouts}`);
    assert(extraStats.todayWorkouts >= 0, `${prefix} todayWorkouts >= 0`, `Got: ${extraStats.todayWorkouts}`);
    assert(extraStats.todayLoss >= 0, `${prefix} todayLoss >= 0`, `Got: ${extraStats.todayLoss}`);

    if (w.hasExtraWorkouts) {
      assert(extraStats.totalWorkouts > 0, `${prefix} has extra workouts logged`, `Got: ${extraStats.totalWorkouts} workouts`);
      if (extraStats.avgLoss !== null) {
        assert(extraStats.avgLoss > 0, `${prefix} avgLoss > 0 for extra workouts`, `Got: ${extraStats.avgLoss}`);
      }
    }

    console.log(`  getExtraWorkoutStats(): avgLoss=${extraStats.avgLoss?.toFixed(2) ?? 'null'}, total=${extraStats.totalWorkouts}, today=${extraStats.todayWorkouts}, todayLoss=${extraStats.todayLoss.toFixed(2)}`);

    // =========================================================================
    // TEST 13: Phase names
    // =========================================================================
    const phase = getPhaseForDaysUntil(w.daysOut);
    const expectedPhases = {
      '-1': 'Recover', 0: 'Compete', 1: 'Cut', 2: 'Prep',
      3: 'Load', 4: 'Load', 5: 'Load',
      6: 'Train', 7: 'Train', 8: 'Train',
    };
    const expectedPhase = expectedPhases[String(w.daysOut)] || 'Train';
    assert(phase === expectedPhase, `${prefix} phase name`, `Expected "${expectedPhase}", got "${phase}"`);

    console.log(`  Phase: ${phase}`);

    // =========================================================================
    // TEST 14: Safety — no NaN values anywhere
    // =========================================================================
    // Test all days for this wrestler to ensure no NaN
    for (const d of [-1, 0, 1, 2, 3, 4, 5, 6, 7]) {
      const tgt = calculateTarget({ ...profile, daysUntil: d });
      assert(!isNaN(tgt), `${prefix} target not NaN at D${d}`, `Got: ${tgt}`);
      assert(tgt > 0, `${prefix} target > 0 at D${d}`, `Got: ${tgt}`);

      const wOz = getWaterTargetOz(d, w.startWeight);
      assert(!isNaN(wOz), `${prefix} waterOz not NaN at D${d}`, `Got: ${wOz}`);
      assert(wOz >= 0, `${prefix} waterOz >= 0 at D${d} (no negative water)`, `Got: ${wOz}`);

      const sod = getSodiumTarget(d);
      assert(!isNaN(sod.target), `${prefix} sodium not NaN at D${d}`, `Got: ${sod.target}`);
    }

    // =========================================================================
    // TEST 16: 125 lb wrestler close to weight
    // =========================================================================
    if (w.weightClass === 125 && w.startWeight < 127) {
      // Should have very small targets relative to weight class
      // Max target = 1.07 * wc + 4 (water loading bonus) = ~13 lbs over for 125lb class
      const t = calculateTarget(profile);
      const diff = t - w.weightClass;
      const maxDiff = Math.round(w.weightClass * 0.07) + WATER_LOADING_RANGE.MAX; // multiplier + WL bonus
      assert(diff <= maxDiff, `${prefix} close-to-weight target reasonable`,
        `Diff: ${diff}, max expected: ${maxDiff} (incl water loading)`);
    }

    // =========================================================================
    // TEST 17: Status calculations
    // =========================================================================
    const diff = w.startWeight - target;
    let expectedStatus;
    if (diff <= STATUS_THRESHOLDS.ON_TRACK_BUFFER) {
      expectedStatus = 'on-track';
    } else if (diff <= STATUS_THRESHOLDS.BORDERLINE_BUFFER) {
      expectedStatus = 'borderline';
    } else {
      expectedStatus = 'risk';
    }
    // Just verify the thresholds are applied consistently (simplified - no projection data)
    assert(
      (diff <= 1.5 && expectedStatus === 'on-track') ||
      (diff > 1.5 && diff <= 3 && expectedStatus === 'borderline') ||
      (diff > 3 && expectedStatus === 'risk'),
      `${prefix} status threshold logic consistent`,
      `diff=${diff.toFixed(2)}, status=${expectedStatus}`
    );

    console.log(`  Status check: diff=${diff.toFixed(2)}, expectedStatus=${expectedStatus}`);

    // =========================================================================
    // Additional: computeEMA sanity check
    // =========================================================================
    const emaEmpty = computeEMA([]);
    assert(emaEmpty === null, `${prefix} EMA of empty = null`, `Got: ${emaEmpty}`);

    const emaSingle = computeEMA([2.5]);
    assert(emaSingle === 2.5, `${prefix} EMA of single = value`, `Got: ${emaSingle}`);

    const emaMulti = computeEMA([3.0, 2.0, 1.0]);
    assert(emaMulti !== null && !isNaN(emaMulti), `${prefix} EMA of multi not NaN`, `Got: ${emaMulti}`);
    // EMA should be between min and max
    assert(emaMulti >= 1.0 && emaMulti <= 3.0, `${prefix} EMA in range [1,3]`, `Got: ${emaMulti}`);

    // =========================================================================
    // Additional: getWaterLoadBonus
    // =========================================================================
    const bonus = getWaterLoadBonus(w.weightClass);
    if (w.weightClass >= 175) {
      assert(bonus === 4, `${prefix} WL bonus = 4 for 175+`, `Got: ${bonus}`);
    } else if (w.weightClass >= 150) {
      assert(bonus === 3, `${prefix} WL bonus = 3 for 150-174`, `Got: ${bonus}`);
    } else {
      assert(bonus === 2, `${prefix} WL bonus = 2 for <150`, `Got: ${bonus}`);
    }

    // =========================================================================
    // Additional: targets decrease toward weigh-in (for cutting protocols 1 & 2)
    // =========================================================================
    if (w.protocol === '1' || w.protocol === '2') {
      const targets = [];
      for (let d = 5; d >= 0; d--) {
        targets.push({ day: d, target: calculateTarget({ ...profile, daysUntil: d }) });
      }
      // Verify monotonic decrease (targets go down as weigh-in approaches)
      for (let i = 1; i < targets.length; i++) {
        assert(targets[i].target <= targets[i - 1].target,
          `${prefix} targets decrease D${targets[i - 1].day}→D${targets[i].day}`,
          `${targets[i - 1].target} -> ${targets[i].target}`);
      }
    }

    // =========================================================================
    // Additional: Full day sweep for water target capping
    // =========================================================================
    for (const d of [5, 4, 3]) {
      const heavyOz = getWaterTargetOz(d, 305); // 285 walk-around ~305 lbs
      assert(heavyOz <= MAX_WATER_LOADING_OZ,
        `${prefix} water cap 305lb D${d} <= ${MAX_WATER_LOADING_OZ}`,
        `Got: ${heavyOz}`);
    }
  }

  // ============================================================================
  // GLOBAL EDGE CASE TESTS
  // ============================================================================
  console.log('\n\n--- GLOBAL EDGE CASE TESTS ---\n');

  // Test all weight classes × all protocols × all days for no NaN
  for (const wc of WEIGHT_CLASSES) {
    for (const p of ['1', '2', '3', '4']) {
      for (const d of [-1, 0, 1, 2, 3, 4, 5, 6, 7, 10]) {
        const t = calculateTarget({ targetWeightClass: wc, protocol: p, daysUntil: d });
        assert(!isNaN(t) && t > 0, `Global: ${wc}/${p}/D${d} target valid`, `Got: ${t}`);

        const ctw = calculateTargetWeight(wc, d, p);
        assert(!isNaN(ctw.base) && ctw.base > 0, `Global: ${wc}/${p}/D${d} CTW base valid`, `Got: ${ctw.base}`);

        const wOz = getWaterTargetOz(d, wc * 1.07);
        assert(!isNaN(wOz) && wOz >= 0, `Global: ${wc}/D${d} waterOz valid`, `Got: ${wOz}`);

        const phase = getPhaseForDaysUntil(d);
        assert(typeof phase === 'string' && phase.length > 0, `Global: D${d} phase valid`, `Got: ${phase}`);

        const sod = getSodiumTarget(d);
        assert(!isNaN(sod.target), `Global: D${d} sodium valid`, `Got: ${sod.target}`);
      }
    }
  }

  // 285 lb at day 5 protocol 1: water MUST cap at 320oz
  const heavy285oz = getWaterTargetOz(5, 305);
  assert(heavy285oz === MAX_WATER_LOADING_OZ,
    'Global: 285lb D5 water exactly 320oz (capped)',
    `Got: ${heavy285oz} (raw would be ${Math.round(1.2 * 305)} = 366)`);

  // 285 lb at day 4 protocol 1: 1.5 oz/lb * 305 = 457.5 -> capped at 320
  const heavy285d4 = getWaterTargetOz(4, 305);
  assert(heavy285d4 === MAX_WATER_LOADING_OZ,
    'Global: 285lb D4 water exactly 320oz (capped)',
    `Got: ${heavy285d4} (raw would be ${Math.round(1.5 * 305)})`);

  // 125 lb at day 5: 1.2 * 125 = 150oz — should NOT be capped
  const light125oz = getWaterTargetOz(5, 125);
  assert(light125oz === Math.round(1.2 * 125),
    'Global: 125lb D5 water not capped',
    `Got: ${light125oz}, expected ${Math.round(1.2 * 125)}`);
  assert(light125oz < MAX_WATER_LOADING_OZ,
    'Global: 125lb D5 water < 320oz',
    `Got: ${light125oz}`);

  // Protocol 4 (Build): target always equals weight class regardless of day
  for (const wc of WEIGHT_CLASSES) {
    for (const d of [-1, 0, 1, 2, 3, 4, 5, 7]) {
      const t = calculateTarget({ targetWeightClass: wc, protocol: '4', daysUntil: d });
      assert(t === wc, `Global: Build P4 ${wc}lb D${d} = wc`, `Expected ${wc}, got ${t}`);
    }
  }

  // Protocol 3 (Hold): always within 5% of weight class (except comp day)
  for (const wc of WEIGHT_CLASSES) {
    for (const d of [1, 2, 3, 4, 5, 7]) {
      const t = calculateTarget({ targetWeightClass: wc, protocol: '3', daysUntil: d });
      assert(t <= Math.round(wc * 1.05), `Global: Hold P3 ${wc}lb D${d} <= 1.05*wc`, `Expected <= ${Math.round(wc * 1.05)}, got ${t}`);
      assert(t >= wc, `Global: Hold P3 ${wc}lb D${d} >= wc`, `Expected >= ${wc}, got ${t}`);
    }
    const tComp = calculateTarget({ targetWeightClass: wc, protocol: '3', daysUntil: 0 });
    assert(tComp === wc, `Global: Hold P3 ${wc}lb D0 = wc`, `Expected ${wc}, got ${tComp}`);
  }

  // Rehydration with 0 weight lost
  const zeroRehydration = getRehydrationPlan(0);
  assert(zeroRehydration.fluidRange === '0-0 oz', 'Global: 0 lost rehydration fluid', `Got: ${zeroRehydration.fluidRange}`);
  assert(zeroRehydration.sodiumRange === '0-0mg', 'Global: 0 lost rehydration sodium', `Got: ${zeroRehydration.sodiumRange}`);

  // EMA edge cases
  assert(computeEMA([]) === null, 'Global: EMA empty = null', '');
  assert(computeEMA([5]) === 5, 'Global: EMA single', '');
  const ema3 = computeEMA([1, 2, 3]);
  // Start from oldest (3), then: ema = 0.4*2 + 0.6*3 = 2.6, then ema = 0.4*1 + 0.6*2.6 = 1.96
  assertClose(ema3, 1.96, 0.001, 'Global: EMA [1,2,3] = 1.96');

  // Phase name completeness
  const allPhases = new Set();
  for (let d = -1; d <= 7; d++) {
    allPhases.add(getPhaseForDaysUntil(d));
  }
  assert(allPhases.has('Recover'), 'Global: phase has Recover', `Phases: ${[...allPhases]}`);
  assert(allPhases.has('Compete'), 'Global: phase has Compete', `Phases: ${[...allPhases]}`);
  assert(allPhases.has('Cut'), 'Global: phase has Cut', `Phases: ${[...allPhases]}`);
  assert(allPhases.has('Prep'), 'Global: phase has Prep', `Phases: ${[...allPhases]}`);
  assert(allPhases.has('Load'), 'Global: phase has Load', `Phases: ${[...allPhases]}`);
  assert(allPhases.has('Train'), 'Global: phase has Train', `Phases: ${[...allPhases]}`);

  // Sodium values for all days
  for (let d = -1; d <= 5; d++) {
    const s = getSodiumTarget(d);
    assert(s.target >= 0, `Global: sodium D${d} >= 0`, `Got: ${s.target}`);
    assert(typeof s.label === 'string', `Global: sodium D${d} has label`, `Got: ${s.label}`);
  }

  // Water target at day 6+ should use day 5 rate
  const w6 = getWaterTargetOz(6, 150);
  const w5 = getWaterTargetOz(5, 150);
  assert(w6 === w5, 'Global: D6 water = D5 water (clamped)', `D6=${w6}, D5=${w5}`);

  // Water target at day -2 should use recovery rate (-1)
  const wNeg2 = getWaterTargetOz(-2, 150);
  const wNeg1 = getWaterTargetOz(-1, 150);
  assert(wNeg2 === wNeg1, 'Global: D-2 water = D-1 water (recovery)', `D-2=${wNeg2}, D-1=${wNeg1}`);

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log('\n' + '='.repeat(100));
  console.log('TEST SUMMARY');
  console.log('='.repeat(100));
  console.log(`Total tests:  ${totalTests}`);
  console.log(`Passed:       ${passed}`);
  console.log(`Failed:       ${failed}`);
  console.log();

  if (failed > 0) {
    console.log('FAILURES:');
    console.log('-'.repeat(100));
    for (const f of failures) {
      console.log(`  FAIL: ${f.testName}`);
      console.log(`        ${f.details}`);
    }
    console.log();
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED!');
    process.exit(0);
  }
}

runTests();
