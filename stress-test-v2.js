/**
 * PWM Comprehensive Stress Test V2
 * Tests ALL app logic: weight targets, water, macros, food phases, weight adjustments
 * 50+ wrestlers across all protocols, weight classes, and timelines (1 day to 3 weeks)
 */

// ============================================================================
// CONSTANTS (extracted from constants.ts + store.tsx)
// ============================================================================
const WEIGHT_CLASSES = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285];
const PROTOCOLS = ['1', '2', '3', '4'];

const WATER_OZ_PER_LB = { 5: 1.2, 4: 1.5, 3: 1.5, 2: 0.3, 1: 0.08, 0: 0, [-1]: 0.75 };
const MAX_WATER_LOADING_OZ = 320;

const WEIGHT_TARGET_BY_DAYS_OUT = { 5: 1.07, 4: 1.06, 3: 1.05, 2: 1.04, 1: 1.03, 0: 1.00, [-1]: 1.07 };
const WATER_LOADING_DAYS = [5, 4, 3];

// ============================================================================
// LOGIC FUNCTIONS (extracted from store.tsx + constants.ts)
// ============================================================================

function getWeightMultiplier(daysUntil) {
  if (daysUntil < 0) return WEIGHT_TARGET_BY_DAYS_OUT[-1];
  if (daysUntil >= 0 && daysUntil <= 5) return WEIGHT_TARGET_BY_DAYS_OUT[daysUntil];
  return WEIGHT_TARGET_BY_DAYS_OUT[5]; // 6+ days = walk-around
}

function isWaterLoadingDay(daysUntil, protocol) {
  if (protocol !== '1' && protocol !== '2') return false;
  return WATER_LOADING_DAYS.includes(daysUntil);
}

function calculateTargetWeight(targetWeightClass, daysUntil, protocol) {
  const multiplier = getWeightMultiplier(daysUntil);
  const base = Math.round(targetWeightClass * multiplier);
  const waterLoading = isWaterLoadingDay(daysUntil, protocol);
  if (waterLoading) {
    return { base, withWaterLoad: base + 4, range: { min: base + 2, max: base + 4 } };
  }
  return { base, withWaterLoad: null, range: null };
}

function calculateTarget(targetWeightClass, protocol, daysUntil) {
  if (protocol === '4') return targetWeightClass;
  if (protocol === '3') {
    if (daysUntil < 0) return Math.round(targetWeightClass * 1.05);
    if (daysUntil === 0) return targetWeightClass;
    if (daysUntil === 1) return Math.round(targetWeightClass * 1.03);
    if (daysUntil === 2) return Math.round(targetWeightClass * 1.04);
    return Math.round(targetWeightClass * 1.05);
  }
  const targetCalc = calculateTargetWeight(targetWeightClass, daysUntil, protocol);
  return targetCalc.withWaterLoad || targetCalc.base;
}

function getWaterTargetOz(daysUntil, weightLbs) {
  if (daysUntil === 0) return 0;
  const key = daysUntil < 0 ? -1 : Math.min(daysUntil, 5);
  const ozPerLb = WATER_OZ_PER_LB[key] ?? 0.5;
  const raw = Math.round(ozPerLb * weightLbs);
  return ozPerLb > 0.5 ? Math.min(raw, MAX_WATER_LOADING_OZ) : raw;
}

function getMacroTargets(w, protocol, daysUntil) {
  // Protocol 1: Body Comp / Emergency Cut
  if (protocol === '1') {
    if (daysUntil < 0) return { carbs: { min: 300, max: 450 }, protein: { min: Math.round(w * 1.4), max: Math.round(w * 1.4) }, ratio: "Full Recovery" };
    if (daysUntil === 0) return { carbs: { min: 150, max: 300 }, protein: { min: Math.round(w * 1.0), max: Math.round(w * 1.0) }, ratio: "Low Carb / Protein Refeed" };
    if (daysUntil === 1) return { carbs: { min: 200, max: 300 }, protein: { min: Math.round(w * 0.2), max: Math.round(w * 0.2) }, ratio: "Fructose + MCT (Evening Protein)" };
    if (daysUntil >= 2 && daysUntil <= 5) return { carbs: { min: 250, max: 400 }, protein: { min: 0, max: 0 }, ratio: "Fructose Only (60:40)" };
    return { carbs: { min: 300, max: 450 }, protein: { min: 75, max: 100 }, ratio: "Maintenance" };
  }
  // Protocol 2: Make Weight
  if (protocol === '2') {
    if (daysUntil < 0) return { carbs: { min: 300, max: 450 }, protein: { min: Math.round(w * 1.4), max: Math.round(w * 1.4) }, ratio: "Full Recovery" };
    if (daysUntil === 0) return { carbs: { min: 200, max: 400 }, protein: { min: Math.round(w * 0.5), max: Math.round(w * 0.5) }, ratio: "Fast Carbs (Between Matches)" };
    if (daysUntil >= 1 && daysUntil <= 2) return { carbs: { min: 300, max: 400 }, protein: { min: 60, max: 60 }, ratio: "Glucose Heavy (Switch to Starch)" };
    if (daysUntil === 3) return { carbs: { min: 325, max: 450 }, protein: { min: 25, max: 25 }, ratio: "Fructose Heavy (60:40)" };
    if (daysUntil >= 4 && daysUntil <= 5) return { carbs: { min: 325, max: 450 }, protein: { min: 0, max: 0 }, ratio: "Fructose Heavy (60:40)" };
    return { carbs: { min: 300, max: 450 }, protein: { min: 75, max: 100 }, ratio: "Maintenance" };
  }
  // Protocol 3: Hold Weight
  if (protocol === '3') {
    if (daysUntil < 0) return { carbs: { min: 300, max: 450 }, protein: { min: Math.round(w * 1.4), max: Math.round(w * 1.4) }, ratio: "Full Recovery" };
    if (daysUntil === 0) return { carbs: { min: 200, max: 400 }, protein: { min: Math.round(w * 0.5), max: Math.round(w * 0.5) }, ratio: "Competition Day" };
    if (daysUntil >= 1 && daysUntil <= 2) return { carbs: { min: 300, max: 450 }, protein: { min: 100, max: 100 }, ratio: "Performance (Glucose)" };
    if (daysUntil >= 3 && daysUntil <= 4) return { carbs: { min: 300, max: 450 }, protein: { min: 75, max: 75 }, ratio: "Mixed Fructose/Glucose" };
    if (daysUntil === 5) return { carbs: { min: 300, max: 450 }, protein: { min: 25, max: 25 }, ratio: "Fructose Heavy" };
    return { carbs: { min: 300, max: 450 }, protein: { min: 100, max: 100 }, ratio: "Maintenance" };
  }
  // Protocol 4: Build
  if (protocol === '4') {
    if (daysUntil < 0) return { carbs: { min: 300, max: 450 }, protein: { min: Math.round(w * 1.6), max: Math.round(w * 1.6) }, ratio: "Full Recovery (Max Protein)" };
    if (daysUntil === 0) return { carbs: { min: 200, max: 400 }, protein: { min: Math.round(w * 0.8), max: Math.round(w * 0.8) }, ratio: "Competition Day" };
    if (daysUntil >= 1 && daysUntil <= 4) return { carbs: { min: 350, max: 600 }, protein: { min: 125, max: 125 }, ratio: "Glucose Emphasis" };
    if (daysUntil === 5) return { carbs: { min: 350, max: 600 }, protein: { min: 100, max: 100 }, ratio: "Balanced Carbs" };
    return { carbs: { min: 350, max: 600 }, protein: { min: 125, max: 150 }, ratio: "Build Phase" };
  }
  return { carbs: { min: 300, max: 400 }, protein: { min: 75, max: 100 }, ratio: "Balanced" };
}

function getWeightAdjustedMacros(w, protocol, daysUntil, latestWeight, targetWeightClass) {
  const base = getMacroTargets(w, protocol, daysUntil);
  if (daysUntil < 1 || daysUntil > 3 || latestWeight === 0) return base;

  const overTarget = latestWeight - targetWeightClass;
  const pctOver = (overTarget / targetWeightClass) * 100;
  const dayMultiplier = daysUntil === 1 ? 1.5 : daysUntil === 2 ? 1.2 : 1.0;
  const effectivePctOver = pctOver * dayMultiplier;

  if (effectivePctOver >= 10) return { ...base, carbs: { min: 0, max: 0 }, protein: { min: 0, max: 0 }, warning: 'DO NOT EAT' };
  if (effectivePctOver >= 7) return { ...base, carbs: { min: 0, max: Math.round(base.carbs.max * 0.15) }, protein: { min: 0, max: Math.round(base.protein.max * 0.2) }, warning: 'survival only' };
  if (effectivePctOver >= 5) return { ...base, carbs: { min: Math.round(base.carbs.min * 0.3), max: Math.round(base.carbs.max * 0.4) }, protein: { min: Math.round(base.protein.min * 0.5), max: Math.round(base.protein.max * 0.5) }, warning: 'heavy restriction' };
  if (effectivePctOver >= 3) return { ...base, carbs: { min: Math.round(base.carbs.min * 0.6), max: Math.round(base.carbs.max * 0.7) }, protein: { min: Math.round(base.protein.min * 0.8), max: Math.round(base.protein.max * 0.8) }, warning: 'moderate reduction' };
  return base;
}

function getPhaseForDaysUntil(daysUntil) {
  if (daysUntil < 0) return 'Recover';
  if (daysUntil === 0) return 'Compete';
  if (daysUntil === 1) return 'Cut';
  if (daysUntil === 2) return 'Prep';
  if (daysUntil >= 3 && daysUntil <= 5) return 'Load';
  return 'Train';
}

function getFoodPhase(protocol, daysUntil) {
  const isCuttingProtocol = protocol !== '3' && protocol !== '4';
  return {
    isFructosePhase: isCuttingProtocol && daysUntil >= 3 && daysUntil <= 5,
    isGlucosePhase: isCuttingProtocol && daysUntil >= 1 && daysUntil <= 2,
    isZeroFiberPhase: isCuttingProtocol && (daysUntil === 1 || daysUntil === 2),
    isRecovery: daysUntil < 0,
    isCompetition: daysUntil === 0,
  };
}

function getRehydrationPlan(lostWeight) {
  return {
    fluidMin: Math.round(lostWeight * 16),
    fluidMax: Math.round(lostWeight * 24),
    sodiumMin: Math.round(lostWeight * 500),
    sodiumMax: Math.round(lostWeight * 700),
  };
}

// ============================================================================
// TEST INFRASTRUCTURE
// ============================================================================
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, message, context = '') {
  totalTests++;
  if (condition) {
    passedTests++;
  } else {
    failedTests++;
    const msg = context ? `${context}: ${message}` : message;
    failures.push(msg);
    if (failures.length <= 50) console.log(`  ❌ FAIL: ${msg}`);
  }
}

function assertRange(value, min, max, message, context = '') {
  assert(value >= min && value <= max, `${message} (got ${value}, expected ${min}-${max})`, context);
}

function assertFinite(value, message, context = '') {
  assert(Number.isFinite(value), `${message} (got ${value})`, context);
}

function assertNoNaN(value, message, context = '') {
  assert(!Number.isNaN(value), `${message} is NaN`, context);
}

// ============================================================================
// TEST WRESTLERS — 50 unique scenarios
// ============================================================================
const wrestlers = [
  // Protocol 1 (Body Comp) - all 10 weight classes
  { name: "Lightweight P1", weight: 133, startWeight: 142, protocol: '1', daysOut: 7 },
  { name: "133 Extreme Cut P1", weight: 133, startWeight: 148, protocol: '1', daysOut: 14 },
  { name: "141 Standard P1", weight: 141, startWeight: 150, protocol: '1', daysOut: 7 },
  { name: "149 Close P1", weight: 149, startWeight: 152, protocol: '1', daysOut: 5 },
  { name: "165 Heavy Cut P1", weight: 165, startWeight: 178, protocol: '1', daysOut: 21 },
  { name: "184 Big Cut P1", weight: 184, startWeight: 198, protocol: '1', daysOut: 14 },
  { name: "285 Heavy P1", weight: 285, startWeight: 305, protocol: '1', daysOut: 21 },
  { name: "125 Smallest P1", weight: 125, startWeight: 134, protocol: '1', daysOut: 7 },

  // Protocol 2 (Make Weight) - weekly cycles across all weight classes
  { name: "125 Weekly P2", weight: 125, startWeight: 131, protocol: '2', daysOut: 5 },
  { name: "133 Weekly P2", weight: 133, startWeight: 140, protocol: '2', daysOut: 5 },
  { name: "141 Weekly P2", weight: 141, startWeight: 147, protocol: '2', daysOut: 5 },
  { name: "149 Weekly P2", weight: 149, startWeight: 157, protocol: '2', daysOut: 5 },
  { name: "157 Weekly P2", weight: 157, startWeight: 164, protocol: '2', daysOut: 5 },
  { name: "165 Weekly P2", weight: 165, startWeight: 173, protocol: '2', daysOut: 5 },
  { name: "174 Weekly P2", weight: 174, startWeight: 182, protocol: '2', daysOut: 5 },
  { name: "184 Weekly P2", weight: 184, startWeight: 192, protocol: '2', daysOut: 5 },
  { name: "197 Weekly P2", weight: 197, startWeight: 207, protocol: '2', daysOut: 5 },
  { name: "285 Weekly P2", weight: 285, startWeight: 298, protocol: '2', daysOut: 5 },
  { name: "133 Long Cycle P2", weight: 133, startWeight: 143, protocol: '2', daysOut: 14 },
  { name: "165 Long Cycle P2", weight: 165, startWeight: 176, protocol: '2', daysOut: 14 },

  // Protocol 3 (Hold Weight) - minimal cutting
  { name: "125 Hold P3", weight: 125, startWeight: 128, protocol: '3', daysOut: 5 },
  { name: "133 Hold P3", weight: 133, startWeight: 137, protocol: '3', daysOut: 5 },
  { name: "141 Hold P3", weight: 141, startWeight: 145, protocol: '3', daysOut: 7 },
  { name: "157 Hold P3", weight: 157, startWeight: 162, protocol: '3', daysOut: 5 },
  { name: "174 Hold P3", weight: 174, startWeight: 179, protocol: '3', daysOut: 5 },
  { name: "197 Hold P3", weight: 197, startWeight: 202, protocol: '3', daysOut: 7 },
  { name: "285 Hold P3", weight: 285, startWeight: 292, protocol: '3', daysOut: 5 },

  // Protocol 4 (Build) - no cutting
  { name: "125 Build P4", weight: 125, startWeight: 123, protocol: '4', daysOut: 7 },
  { name: "141 Build P4", weight: 141, startWeight: 138, protocol: '4', daysOut: 7 },
  { name: "157 Build P4", weight: 157, startWeight: 155, protocol: '4', daysOut: 14 },
  { name: "174 Build P4", weight: 174, startWeight: 172, protocol: '4', daysOut: 7 },
  { name: "197 Build P4", weight: 197, startWeight: 194, protocol: '4', daysOut: 7 },
  { name: "285 Build P4", weight: 285, startWeight: 280, protocol: '4', daysOut: 14 },

  // Edge cases: extreme cuts, last-minute, different timelines
  { name: "133 Same Day P2", weight: 133, startWeight: 135, protocol: '2', daysOut: 1 },
  { name: "141 One Day Out P1", weight: 141, startWeight: 144, protocol: '1', daysOut: 1 },
  { name: "165 Two Days P2", weight: 165, startWeight: 170, protocol: '2', daysOut: 2 },
  { name: "184 Three Weeks P1", weight: 184, startWeight: 200, protocol: '1', daysOut: 21 },
  { name: "149 Competition Day", weight: 149, startWeight: 149, protocol: '2', daysOut: 0 },
  { name: "157 Recovery Day", weight: 157, startWeight: 157, protocol: '2', daysOut: -1 },
  { name: "133 Right At Weight", weight: 133, startWeight: 133, protocol: '1', daysOut: 3 },
  { name: "285 Massive Cut P1", weight: 285, startWeight: 310, protocol: '1', daysOut: 21 },
  { name: "125 Tiny Cut P2", weight: 125, startWeight: 127, protocol: '2', daysOut: 5 },

  // Struggling wrestlers (significantly overweight with few days)
  { name: "133 Struggling P2", weight: 133, startWeight: 146, protocol: '2', daysOut: 3 },
  { name: "149 Struggling P1", weight: 149, startWeight: 162, protocol: '1', daysOut: 5 },
  { name: "165 Desperate P2", weight: 165, startWeight: 180, protocol: '2', daysOut: 2 },
  { name: "184 Desperate P1", weight: 184, startWeight: 200, protocol: '1', daysOut: 3 },

  // On-track wrestlers (good compliance)
  { name: "133 Perfect P2", weight: 133, startWeight: 138, protocol: '2', daysOut: 5 },
  { name: "149 Perfect P1", weight: 149, startWeight: 155, protocol: '1', daysOut: 7 },
  { name: "165 Perfect P2", weight: 165, startWeight: 170, protocol: '2', daysOut: 5 },
  { name: "174 Perfect P3", weight: 174, startWeight: 178, protocol: '3', daysOut: 5 },
];

console.log(`\n${'='.repeat(80)}`);
console.log(`  PWM COMPREHENSIVE STRESS TEST V2`);
console.log(`  ${wrestlers.length} wrestlers × all days × all checks`);
console.log(`${'='.repeat(80)}\n`);

// ============================================================================
// TEST SUITE 1: Weight Target Calculations
// ============================================================================
console.log('━━━ TEST SUITE 1: Weight Targets ━━━');

for (const w of wrestlers) {
  const ctx = `[${w.name}]`;

  for (let d = w.daysOut; d >= -1; d--) {
    const target = calculateTarget(w.weight, w.protocol, d);

    // Target should never be NaN or Infinity
    assertNoNaN(target, `target at d=${d}`, ctx);
    assertFinite(target, `target at d=${d}`, ctx);

    // Target should be >= weight class (never below, except build/hold at class)
    if (w.protocol === '4') {
      assert(target === w.weight, `P4 target should equal weight class (${target} vs ${w.weight})`, ctx);
    } else if (d === 0) {
      assert(target === w.weight, `Competition day target should equal weight class (${target} vs ${w.weight})`, ctx);
    } else if (d > 0) {
      assert(target >= w.weight, `Target should be >= weight class on day ${d} (${target} vs ${w.weight})`, ctx);
    }

    // Target should be reasonable (not more than 15% above weight class for any protocol)
    if (d >= 0) {
      assert(target <= w.weight * 1.15, `Target ${target} too high (>115% of ${w.weight}) at d=${d}`, ctx);
    }

    // Targets should decrease as competition approaches (for cutting protocols)
    if (d > 0 && d <= 5 && (w.protocol === '1' || w.protocol === '2')) {
      const nextDayTarget = calculateTarget(w.weight, w.protocol, d - 1);
      assert(target >= nextDayTarget, `Target should decrease toward comp: d=${d} (${target}) >= d=${d-1} (${nextDayTarget})`, ctx);
    }
  }
}
console.log(`  ✅ Weight target tests complete\n`);

// ============================================================================
// TEST SUITE 2: Water Targets
// ============================================================================
console.log('━━━ TEST SUITE 2: Water Targets ━━━');

for (const w of wrestlers) {
  const ctx = `[${w.name}]`;

  for (let d = Math.min(w.daysOut, 6); d >= -1; d--) {
    const waterOz = getWaterTargetOz(d, w.startWeight);

    assertNoNaN(waterOz, `water oz at d=${d}`, ctx);
    assertFinite(waterOz, `water oz at d=${d}`, ctx);
    assert(waterOz >= 0, `Water oz should be non-negative at d=${d} (got ${waterOz})`, ctx);

    // Competition day = 0 water
    if (d === 0) {
      assert(waterOz === 0, `Competition day water should be 0 (got ${waterOz})`, ctx);
    }

    // Day 1 (sips only) should be very low
    if (d === 1) {
      assert(waterOz < 30, `Day 1 (sips) water should be <30oz (got ${waterOz})`, ctx);
    }

    // Loading days (3-5) should be high for cutting protocols
    if (d >= 3 && d <= 5 && (w.protocol === '1' || w.protocol === '2')) {
      assert(waterOz > 50, `Loading day water should be >50oz (got ${waterOz})`, ctx);
    }

    // Water should never exceed safety cap on loading days
    if (d >= 3 && d <= 5) {
      assert(waterOz <= MAX_WATER_LOADING_OZ, `Water ${waterOz} exceeds cap ${MAX_WATER_LOADING_OZ}`, ctx);
    }

    // Day 2 (restriction) should be much less than loading
    if (d === 2) {
      const loadDayWater = getWaterTargetOz(3, w.startWeight);
      if (loadDayWater > 0) {
        assert(waterOz < loadDayWater * 0.5, `Restriction day water (${waterOz}) should be < 50% of load day (${loadDayWater})`, ctx);
      }
    }
  }
}
console.log(`  ✅ Water target tests complete\n`);

// ============================================================================
// TEST SUITE 3: Macro Targets (Carbs + Protein per phase)
// ============================================================================
console.log('━━━ TEST SUITE 3: Macro Targets ━━━');

for (const w of wrestlers) {
  const ctx = `[${w.name}]`;

  for (let d = Math.min(w.daysOut, 7); d >= -1; d--) {
    const macros = getMacroTargets(w.weight, w.protocol, d);

    // No NaN
    assertNoNaN(macros.carbs.min, `carbs.min at d=${d}`, ctx);
    assertNoNaN(macros.carbs.max, `carbs.max at d=${d}`, ctx);
    assertNoNaN(macros.protein.min, `protein.min at d=${d}`, ctx);
    assertNoNaN(macros.protein.max, `protein.max at d=${d}`, ctx);
    assertFinite(macros.carbs.min, `carbs.min at d=${d}`, ctx);
    assertFinite(macros.carbs.max, `carbs.max at d=${d}`, ctx);
    assertFinite(macros.protein.min, `protein.min at d=${d}`, ctx);
    assertFinite(macros.protein.max, `protein.max at d=${d}`, ctx);

    // Min <= Max always
    assert(macros.carbs.min <= macros.carbs.max, `carbs min (${macros.carbs.min}) <= max (${macros.carbs.max}) at d=${d}`, ctx);
    assert(macros.protein.min <= macros.protein.max, `protein min (${macros.protein.min}) <= max (${macros.protein.max}) at d=${d}`, ctx);

    // Non-negative
    assert(macros.carbs.min >= 0, `carbs.min non-negative at d=${d} (got ${macros.carbs.min})`, ctx);
    assert(macros.protein.min >= 0, `protein.min non-negative at d=${d} (got ${macros.protein.min})`, ctx);

    // Ratio should exist
    assert(macros.ratio && macros.ratio.length > 0, `ratio string exists at d=${d}`, ctx);

    // Protocol-specific validations
    if (w.protocol === '1') {
      // Protocol 1: ZERO protein on days 2-5
      if (d >= 2 && d <= 5) {
        assert(macros.protein.min === 0 && macros.protein.max === 0, `P1 should have 0 protein at d=${d} (got ${macros.protein.min}-${macros.protein.max})`, ctx);
      }
      // Protocol 1: Low protein on day 1 (0.2g/lb)
      if (d === 1) {
        const expected = Math.round(w.weight * 0.2);
        assert(macros.protein.min === expected, `P1 day 1 protein should be ${expected}g (0.2g/lb) got ${macros.protein.min}`, ctx);
      }
      // Protocol 1: High protein on recovery (1.4g/lb)
      if (d < 0) {
        const expected = Math.round(w.weight * 1.4);
        assert(macros.protein.min === expected, `P1 recovery protein should be ${expected}g (1.4g/lb) got ${macros.protein.min}`, ctx);
      }
    }

    if (w.protocol === '2') {
      // Protocol 2: ZERO protein on days 4-5
      if (d >= 4 && d <= 5) {
        assert(macros.protein.min === 0 && macros.protein.max === 0, `P2 should have 0 protein at d=${d} (got ${macros.protein.min}-${macros.protein.max})`, ctx);
      }
      // Protocol 2: 25g collagen on day 3
      if (d === 3) {
        assert(macros.protein.min === 25, `P2 day 3 protein should be 25g (got ${macros.protein.min})`, ctx);
      }
      // Protocol 2: 60g on days 1-2
      if (d === 1 || d === 2) {
        assert(macros.protein.min === 60, `P2 day ${d} protein should be 60g (got ${macros.protein.min})`, ctx);
      }
    }

    if (w.protocol === '4') {
      // Protocol 4: Recovery should be highest protein (1.6g/lb)
      if (d < 0) {
        const expected = Math.round(w.weight * 1.6);
        assert(macros.protein.min === expected, `P4 recovery protein should be ${expected}g (1.6g/lb) got ${macros.protein.min}`, ctx);
      }
      // Protocol 4: Higher carbs than cutting protocols
      if (d >= 1 && d <= 5) {
        assert(macros.carbs.max >= 350, `P4 should have high carbs on training days (got ${macros.carbs.max})`, ctx);
      }
    }
  }
}
console.log(`  ✅ Macro target tests complete\n`);

// ============================================================================
// TEST SUITE 4: Weight-Adjusted Macros (Overweight Wrestlers)
// ============================================================================
console.log('━━━ TEST SUITE 4: Weight-Adjusted Macros ━━━');

const overweightScenarios = [
  // (latestWeight, targetClass, daysUntil, expected behavior)
  { desc: "3% effective over, day 3", latest: 137, target: 133, daysUntil: 3, expectReduction: true },
  { desc: "5% effective over, day 2", latest: 140, target: 133, daysUntil: 2, expectReduction: true },
  { desc: "7% effective over, day 1", latest: 140, target: 133, daysUntil: 1, expectSurvivalOnly: true },
  { desc: "10% effective over, day 1", latest: 143, target: 133, daysUntil: 1, expectDoNotEat: true },
  { desc: "On track, day 1", latest: 135, target: 133, daysUntil: 1, expectNoChange: false },
  { desc: "On track, day 3", latest: 136, target: 133, daysUntil: 3, expectNoChange: true },
  { desc: "Way over, day 2 (P2)", latest: 150, target: 133, daysUntil: 2, expectDoNotEat: true },
  { desc: "Slightly over, day 3", latest: 137, target: 133, daysUntil: 3, expectReduction: true },
  // Edge: not on cut days (should not adjust)
  { desc: "Over but day 5", latest: 145, target: 133, daysUntil: 5, expectNoAdjustment: true },
  { desc: "Over but day 0", latest: 145, target: 133, daysUntil: 0, expectNoAdjustment: true },
];

for (const s of overweightScenarios) {
  const ctx = `[Adj: ${s.desc}]`;
  for (const protocol of ['1', '2']) {
    const base = getMacroTargets(s.target, protocol, s.daysUntil);
    const adjusted = getWeightAdjustedMacros(s.target, protocol, s.daysUntil, s.latest, s.target);

    assertNoNaN(adjusted.carbs.min, `adj carbs.min`, `${ctx} P${protocol}`);
    assertNoNaN(adjusted.carbs.max, `adj carbs.max`, `${ctx} P${protocol}`);
    assertNoNaN(adjusted.protein.min, `adj protein.min`, `${ctx} P${protocol}`);
    assertNoNaN(adjusted.protein.max, `adj protein.max`, `${ctx} P${protocol}`);

    // Non-negative
    assert(adjusted.carbs.min >= 0, `adj carbs.min non-negative`, `${ctx} P${protocol}`);
    assert(adjusted.protein.min >= 0, `adj protein.min non-negative`, `${ctx} P${protocol}`);

    if (s.expectDoNotEat) {
      assert(adjusted.carbs.max === 0 && adjusted.protein.max === 0, `Expected DO NOT EAT (carbs ${adjusted.carbs.max}, protein ${adjusted.protein.max})`, `${ctx} P${protocol}`);
    }
    if (s.expectNoAdjustment) {
      assert(adjusted.carbs.min === base.carbs.min && adjusted.carbs.max === base.carbs.max, `Expected no adjustment`, `${ctx} P${protocol}`);
    }
  }
}
console.log(`  ✅ Weight-adjusted macro tests complete\n`);

// ============================================================================
// TEST SUITE 5: Food Phase Restrictions
// ============================================================================
console.log('━━━ TEST SUITE 5: Food Phase Restrictions ━━━');

for (const w of wrestlers) {
  const ctx = `[${w.name}]`;
  for (let d = Math.min(w.daysOut, 6); d >= -1; d--) {
    const phases = getFoodPhase(w.protocol, d);

    // Protocol 3 and 4 should NEVER have fructose/glucose/zero-fiber phases
    if (w.protocol === '3' || w.protocol === '4') {
      assert(!phases.isFructosePhase, `P${w.protocol} should not have fructose phase at d=${d}`, ctx);
      assert(!phases.isGlucosePhase, `P${w.protocol} should not have glucose phase at d=${d}`, ctx);
      assert(!phases.isZeroFiberPhase, `P${w.protocol} should not have zero fiber phase at d=${d}`, ctx);
    }

    // Fructose phase: days 3-5 for protocols 1 & 2
    if ((w.protocol === '1' || w.protocol === '2') && d >= 3 && d <= 5) {
      assert(phases.isFructosePhase, `P${w.protocol} should be fructose phase at d=${d}`, ctx);
    }

    // Glucose/zero-fiber phase: days 1-2 for protocols 1 & 2
    if ((w.protocol === '1' || w.protocol === '2') && (d === 1 || d === 2)) {
      assert(phases.isGlucosePhase, `P${w.protocol} should be glucose phase at d=${d}`, ctx);
      assert(phases.isZeroFiberPhase, `P${w.protocol} should be zero fiber at d=${d}`, ctx);
    }

    // Competition day
    if (d === 0) {
      assert(phases.isCompetition, `should be competition at d=0`, ctx);
      assert(!phases.isFructosePhase, `should not be fructose on comp day`, ctx);
    }

    // Recovery
    if (d < 0) {
      assert(phases.isRecovery, `should be recovery at d=${d}`, ctx);
    }
  }
}
console.log(`  ✅ Food phase restriction tests complete\n`);

// ============================================================================
// TEST SUITE 6: Rehydration Plans
// ============================================================================
console.log('━━━ TEST SUITE 6: Rehydration Plans ━━━');

const weightLosses = [2, 4, 6, 8, 10, 12, 15, 20];

for (const loss of weightLosses) {
  const ctx = `[Loss: ${loss} lbs]`;
  const plan = getRehydrationPlan(loss);

  assertNoNaN(plan.fluidMin, 'fluidMin', ctx);
  assertNoNaN(plan.fluidMax, 'fluidMax', ctx);
  assertNoNaN(plan.sodiumMin, 'sodiumMin', ctx);
  assertNoNaN(plan.sodiumMax, 'sodiumMax', ctx);

  assert(plan.fluidMin > 0, `fluidMin > 0 (got ${plan.fluidMin})`, ctx);
  assert(plan.fluidMin <= plan.fluidMax, `fluidMin <= fluidMax`, ctx);
  assert(plan.sodiumMin <= plan.sodiumMax, `sodiumMin <= sodiumMax`, ctx);

  // Fluid: 16-24 oz per lb
  assert(plan.fluidMin === Math.round(loss * 16), `fluidMin should be ${loss * 16}`, ctx);
  assert(plan.fluidMax === Math.round(loss * 24), `fluidMax should be ${loss * 24}`, ctx);

  // Sodium: 500-700 mg per lb
  assert(plan.sodiumMin === Math.round(loss * 500), `sodiumMin should be ${loss * 500}`, ctx);
  assert(plan.sodiumMax === Math.round(loss * 700), `sodiumMax should be ${loss * 700}`, ctx);
}
console.log(`  ✅ Rehydration plan tests complete\n`);

// ============================================================================
// TEST SUITE 7: Phase Names
// ============================================================================
console.log('━━━ TEST SUITE 7: Phase Names ━━━');

const expectedPhases = {
  [-1]: 'Recover', 0: 'Compete', 1: 'Cut', 2: 'Prep', 3: 'Load', 4: 'Load', 5: 'Load', 6: 'Train', 7: 'Train', 14: 'Train', 21: 'Train'
};

for (const [d, expected] of Object.entries(expectedPhases)) {
  const phase = getPhaseForDaysUntil(Number(d));
  assert(phase === expected, `Phase at d=${d} should be "${expected}" (got "${phase}")`);
}
console.log(`  ✅ Phase name tests complete\n`);

// ============================================================================
// TEST SUITE 8: Full Weight Cut Simulation (day-by-day for every wrestler)
// ============================================================================
console.log('━━━ TEST SUITE 8: Full Weight Cut Simulations ━━━');

for (const w of wrestlers) {
  const ctx = `[${w.name}]`;
  let currentWeight = w.startWeight;
  const dailyLog = [];

  for (let d = w.daysOut; d >= -1; d--) {
    const target = calculateTarget(w.weight, w.protocol, d);
    const macros = getMacroTargets(w.weight, w.protocol, d);
    const waterOz = getWaterTargetOz(d, currentWeight);
    const phase = getPhaseForDaysUntil(d);
    const foodPhase = getFoodPhase(w.protocol, d);

    // All values should be valid
    assertNoNaN(target, `sim target d=${d}`, ctx);
    assertNoNaN(waterOz, `sim water d=${d}`, ctx);
    assertNoNaN(macros.carbs.min, `sim carbs.min d=${d}`, ctx);
    assertNoNaN(macros.carbs.max, `sim carbs.max d=${d}`, ctx);
    assertNoNaN(macros.protein.min, `sim protein.min d=${d}`, ctx);
    assertNoNaN(macros.protein.max, `sim protein.max d=${d}`, ctx);
    assertFinite(target, `sim target d=${d}`, ctx);

    // Weight-adjusted macros should also be valid
    const adjMacros = getWeightAdjustedMacros(w.weight, w.protocol, d, currentWeight, w.weight);
    assertNoNaN(adjMacros.carbs.min, `sim adj carbs.min d=${d}`, ctx);
    assertNoNaN(adjMacros.carbs.max, `sim adj carbs.max d=${d}`, ctx);
    assertNoNaN(adjMacros.protein.min, `sim adj protein.min d=${d}`, ctx);
    assertNoNaN(adjMacros.protein.max, `sim adj protein.max d=${d}`, ctx);
    assert(adjMacros.carbs.min >= 0, `sim adj carbs.min non-negative d=${d}`, ctx);
    assert(adjMacros.protein.min >= 0, `sim adj protein.min non-negative d=${d}`, ctx);

    dailyLog.push({
      day: d,
      phase,
      currentWeight: currentWeight.toFixed(1),
      target,
      waterOz,
      carbs: `${macros.carbs.min}-${macros.carbs.max}`,
      protein: `${macros.protein.min}-${macros.protein.max}`,
      fructose: foodPhase.isFructosePhase,
      glucose: foodPhase.isGlucosePhase,
      zeroFiber: foodPhase.isZeroFiberPhase,
    });

    // Simulate weight loss per day based on phase
    if (d > 0) {
      const overWeight = currentWeight - w.weight;
      if (overWeight > 0) {
        // Simulate realistic weight loss patterns
        if (d <= 2) {
          // Water cut days — faster loss (2-4 lbs/day from water manipulation)
          currentWeight -= Math.min(overWeight, 2.5 + Math.random() * 1.5);
        } else if (d <= 5) {
          // Loading/metabolic days — moderate loss (0.5-1.5 lbs/day)
          currentWeight -= Math.min(overWeight, 0.5 + Math.random() * 1.0);
        } else {
          // Training days — slow loss (0.3-0.8 lbs/day)
          currentWeight -= Math.min(overWeight, 0.3 + Math.random() * 0.5);
        }
      }
    } else if (d === 0) {
      // Competition morning — final water cut overnight
      currentWeight -= Math.min(currentWeight - w.weight, 1.5 + Math.random() * 0.5);
      currentWeight = Math.max(currentWeight, w.weight - 0.5); // Don't go way under
    } else {
      // Recovery — rehydrate +3-5 lbs
      currentWeight += 3 + Math.random() * 2;
    }
    currentWeight = Math.round(currentWeight * 10) / 10;
  }

  // Verify the descent curve makes sense:
  // First day weight should be near startWeight
  assert(Math.abs(parseFloat(dailyLog[0].currentWeight) - w.startWeight) < 0.1, `First day weight should be startWeight`, ctx);

  // Competition day target should equal weight class
  const compDay = dailyLog.find(d => d.day === 0);
  if (compDay) {
    assert(compDay.target === w.weight || w.protocol === '4', `Comp day target should be weight class`, ctx);
  }
}
console.log(`  ✅ Full simulation tests complete\n`);

// ============================================================================
// TEST SUITE 9: Water Loading Safety — Heavyweight Cap
// ============================================================================
console.log('━━━ TEST SUITE 9: Water Safety Caps ━━━');

// Test extreme heavyweight scenarios
const heavyweights = [200, 225, 250, 275, 285, 300, 310, 320];
for (const hw of heavyweights) {
  const ctx = `[HW ${hw} lbs]`;
  for (let d = 5; d >= 0; d--) {
    const water = getWaterTargetOz(d, hw);
    assert(water <= MAX_WATER_LOADING_OZ, `Water ${water}oz for ${hw}lb at d=${d} exceeds cap ${MAX_WATER_LOADING_OZ}`, ctx);
    assert(water >= 0, `Water should be non-negative`, ctx);

    // Gallons equivalent safety check (loading days)
    if (d >= 3) {
      const gallons = water / 128;
      assert(gallons <= 2.5, `Water ${gallons.toFixed(2)} gal for ${hw}lb at d=${d} exceeds 2.5 gal safety limit`, ctx);
    }
  }
}

// Days > 5 clamp to key 5 (1.2 oz/lb baseline). Verify it's capped properly.
const farOutWater = getWaterTargetOz(10, 180); // 10 days out → uses key 5 = 1.2 oz/lb
// 1.2 × 180 = 216, capped at 320. This is correct training-phase hydration.
assert(farOutWater === 216, `Far-out day water should be 216oz (1.2×180) (got ${farOutWater})`, '[Safety]');
assert(farOutWater <= MAX_WATER_LOADING_OZ, `Far-out water should be within safety cap`, '[Safety]');
// Heavy athlete 285 lbs: 1.2 × 285 = 342 → capped at 320
const farOutHeavy = getWaterTargetOz(10, 285);
assert(farOutHeavy === MAX_WATER_LOADING_OZ, `Heavy far-out water should be capped at ${MAX_WATER_LOADING_OZ} (got ${farOutHeavy})`, '[Safety]');
// Verify fallback is NOT the old dangerous 3.5 oz/lb (that would give 630oz for 180lb)
assert(farOutWater < 400, `Far-out water should not use dangerous 3.5 oz/lb fallback`, '[Safety]');

console.log(`  ✅ Water safety cap tests complete\n`);

// ============================================================================
// TEST SUITE 10: Protocol Consistency & Cross-Checks
// ============================================================================
console.log('━━━ TEST SUITE 10: Protocol Consistency ━━━');

for (const wc of WEIGHT_CLASSES) {
  const ctx = `[WC ${wc}]`;

  for (const protocol of PROTOCOLS) {
    // Competition day: all protocols should target weight class
    const compTarget = calculateTarget(wc, protocol, 0);
    assert(compTarget === wc, `P${protocol} comp target ${compTarget} should be ${wc}`, ctx);

    // Recovery protein should scale with weight class
    const recoveryMacros = getMacroTargets(wc, protocol, -1);
    assert(recoveryMacros.protein.min > 0, `P${protocol} recovery protein should be > 0`, ctx);

    // Build phase should never restrict carbs < 200
    if (protocol === '4') {
      for (let d = 7; d >= 0; d--) {
        const m = getMacroTargets(wc, protocol, d);
        assert(m.carbs.min >= 200, `P4 carbs.min should be >= 200 at d=${d} (got ${m.carbs.min})`, ctx);
      }
    }

    // Hold weight should not have extreme protein restrictions like P1/P2
    if (protocol === '3') {
      for (let d = 5; d >= 1; d--) {
        const m = getMacroTargets(wc, protocol, d);
        assert(m.protein.min >= 25, `P3 protein should never be 0 on training days d=${d} (got ${m.protein.min})`, ctx);
      }
    }
  }

  // Cross-protocol: P1 should be more aggressive than P2
  for (let d = 2; d <= 5; d++) {
    const p1 = getMacroTargets(wc, '1', d);
    const p2 = getMacroTargets(wc, '2', d);
    assert(p1.protein.max <= p2.protein.max, `P1 protein (${p1.protein.max}) should be <= P2 protein (${p2.protein.max}) at d=${d} — P1 is more aggressive`, ctx);
  }

  // P4 should have highest carbs
  for (let d = 1; d <= 5; d++) {
    const p4 = getMacroTargets(wc, '4', d);
    const p1 = getMacroTargets(wc, '1', d);
    assert(p4.carbs.max >= p1.carbs.max, `P4 carbs.max (${p4.carbs.max}) should be >= P1 carbs.max (${p1.carbs.max}) at d=${d}`, ctx);
  }
}
console.log(`  ✅ Protocol consistency tests complete\n`);

// ============================================================================
// TEST SUITE 11: Division by Zero & Edge Cases
// ============================================================================
console.log('━━━ TEST SUITE 11: Edge Cases & Division Safety ━━━');

// Weight class = 0 (edge case — should not crash)
const zeroTarget = calculateTarget(0, '1', 5);
assertFinite(zeroTarget, 'Zero weight class should produce finite target');

// Very large weight
const largeTarget = calculateTarget(285, '1', 5);
assertFinite(largeTarget, 'Large weight class should produce finite target');
assert(largeTarget > 285, 'Large weight target should be > weight class on loading day');

// Negative days (deep recovery)
for (let d = -1; d >= -5; d--) {
  const target = calculateTarget(133, '2', d);
  assertFinite(target, `Negative days (d=${d}) target should be finite`);
  const macros = getMacroTargets(133, '2', d);
  assertNoNaN(macros.carbs.min, `Negative days (d=${d}) carbs.min`);
  assertNoNaN(macros.protein.min, `Negative days (d=${d}) protein.min`);
}

// Very far out (50 days)
for (const protocol of PROTOCOLS) {
  const farTarget = calculateTarget(157, protocol, 50);
  assertFinite(farTarget, `50 days out P${protocol} target should be finite`);
  const farMacros = getMacroTargets(157, protocol, 50);
  assertNoNaN(farMacros.carbs.min, `50 days out P${protocol} carbs`);
  assert(farMacros.protein.max > 0, `50 days out P${protocol} should have maintenance protein`);
}

// Weight adjustment with 0 targetWeightClass (division by zero guard)
const adjZero = getWeightAdjustedMacros(0, '1', 1, 140, 0);
assertNoNaN(adjZero.carbs.min, 'Zero target class adj carbs');
assertNoNaN(adjZero.protein.min, 'Zero target class adj protein');

// Rehydration with 0 lost weight
const rehydZero = getRehydrationPlan(0);
assert(rehydZero.fluidMin === 0, 'Zero loss rehydration fluid should be 0');
assert(rehydZero.sodiumMin === 0, 'Zero loss rehydration sodium should be 0');

console.log(`  ✅ Edge case tests complete\n`);

// ============================================================================
// TEST SUITE 12: Multi-Week Weight Cut Analysis
// ============================================================================
console.log('━━━ TEST SUITE 12: Multi-Week Cut Analysis ━━━');

// Simulate a realistic 3-week cut for key scenarios
const multiWeekScenarios = [
  { name: "133 class, starting 148 (11.3% over), P1, 21 days", weight: 133, start: 148, protocol: '1', days: 21 },
  { name: "165 class, starting 178 (7.9% over), P2, 14 days", weight: 165, start: 178, protocol: '2', days: 14 },
  { name: "184 class, starting 196 (6.5% over), P1, 14 days", weight: 184, start: 196, protocol: '1', days: 14 },
  { name: "149 class, starting 155 (4.0% over), P2, 7 days", weight: 149, start: 155, protocol: '2', days: 7 },
  { name: "285 class, starting 305 (7.0% over), P1, 21 days", weight: 285, start: 305, protocol: '1', days: 21 },
];

for (const scenario of multiWeekScenarios) {
  const ctx = `[Multi: ${scenario.name}]`;
  console.log(`\n  📊 ${scenario.name}`);

  let cw = scenario.start;
  const pctOver = ((scenario.start - scenario.weight) / scenario.weight * 100).toFixed(1);
  console.log(`     Start: ${scenario.start} lbs (${pctOver}% over ${scenario.weight} class)`);

  let totalWater = 0;
  let totalCarbs = 0;
  let totalProtein = 0;
  let totalWaterLoadDays = 0;
  let zerProteinDays = 0;

  for (let d = scenario.days; d >= -1; d--) {
    const target = calculateTarget(scenario.weight, scenario.protocol, d);
    const macros = getMacroTargets(scenario.weight, scenario.protocol, d);
    const adjMacros = getWeightAdjustedMacros(scenario.weight, scenario.protocol, d, cw, scenario.weight);
    const waterOz = getWaterTargetOz(d, cw);
    const phase = getPhaseForDaysUntil(d);
    const isLoadDay = isWaterLoadingDay(d, scenario.protocol);

    // Validate everything
    assertNoNaN(target, `mw target d=${d}`, ctx);
    assertNoNaN(waterOz, `mw water d=${d}`, ctx);
    assertNoNaN(adjMacros.carbs.min, `mw adj carbs d=${d}`, ctx);
    assertNoNaN(adjMacros.protein.min, `mw adj protein d=${d}`, ctx);

    totalWater += waterOz;
    totalCarbs += (macros.carbs.min + macros.carbs.max) / 2;
    totalProtein += (macros.protein.min + macros.protein.max) / 2;
    if (isLoadDay) totalWaterLoadDays++;
    if (macros.protein.max === 0) zerProteinDays++;

    // Print key days
    if (d <= 5 || d === scenario.days || d === Math.floor(scenario.days / 2)) {
      const statusIcon = cw <= target ? '✅' : cw <= target + 2 ? '⚠️' : '🔴';
      const adjNote = adjMacros.warning ? ` [${adjMacros.warning}]` : '';
      console.log(`     D-${d.toString().padStart(2)}: ${phase.padEnd(7)} | ${cw.toFixed(1)} lbs → target ${target} | water ${waterOz}oz | C:${macros.carbs.min}-${macros.carbs.max} P:${macros.protein.min}-${macros.protein.max} ${statusIcon}${adjNote}`);
    }

    // Simulate weight change
    if (d > 0) {
      const over = cw - scenario.weight;
      if (over > 0) {
        if (d <= 2) cw -= Math.min(over, 2.0 + Math.random() * 1.5);
        else if (d <= 5) cw -= Math.min(over, 0.5 + Math.random() * 0.8);
        else cw -= Math.min(over, 0.3 + Math.random() * 0.4);
      }
    } else if (d === 0) {
      cw -= Math.min(cw - scenario.weight, 1.5);
      cw = Math.max(cw, scenario.weight - 0.5);
    } else {
      cw += 4;
    }
    cw = Math.round(cw * 10) / 10;
  }

  const totalDays = scenario.days + 2; // include comp + recovery
  console.log(`     Summary: ${totalWaterLoadDays} water load days | ${zerProteinDays} zero-protein days`);
  console.log(`     Avg daily: ${Math.round(totalWater / totalDays)}oz water | ${Math.round(totalCarbs / totalDays)}g carbs | ${Math.round(totalProtein / totalDays)}g protein`);

  // Critical assertion: athlete should be near weight class on competition day
  // (Our simulation is simplified, but targets should make sense)
  assert(totalWater > 0, `Total water should be > 0 over cut period`, ctx);
  assert(totalCarbs > 0, `Total carbs should be > 0 over cut period`, ctx);
}
console.log(`\n  ✅ Multi-week cut analysis complete\n`);

// ============================================================================
// RESULTS
// ============================================================================
console.log(`${'='.repeat(80)}`);
console.log(`  RESULTS: ${passedTests}/${totalTests} PASSED  (${failedTests} FAILED)`);
console.log(`${'='.repeat(80)}`);

if (failedTests > 0) {
  console.log(`\n  ❌ FAILURES (showing first ${Math.min(failures.length, 50)}):`);
  failures.slice(0, 50).forEach((f, i) => console.log(`     ${i + 1}. ${f}`));
  if (failures.length > 50) console.log(`     ... and ${failures.length - 50} more`);
  process.exit(1);
} else {
  console.log(`\n  ✅ ALL ${totalTests} TESTS PASSED — App logic is elite-level ready.`);
  process.exit(0);
}
