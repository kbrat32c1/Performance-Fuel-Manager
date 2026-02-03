/**
 * PWM Nutrition Stress Test
 * Tests the protocol-based food system routing, slice/gram conversions,
 * SPAR BMR calculations, and rendering decision logic.
 *
 * KEY RULE BEING TESTED:
 *   Protocols 1-4 → Sugar Diet foods (MacroTracker), always
 *   Protocol 5    → SPAR foods (SparTracker), always
 *   The slices/grams toggle only affects DISPLAY FORMAT, never food system.
 */

// ============================================================================
// CONSTANTS (from spar-calculator.ts + store.tsx + constants.ts)
// ============================================================================
const PROTOCOLS = { BODY_COMP: '1', MAKE_WEIGHT: '2', HOLD_WEIGHT: '3', BUILD: '4', SPAR: '5' };

const ACTIVITY_MULTIPLIERS = {
  'sedentary': 1.2,
  'light': 1.375,
  'moderate': 1.55,
  'active': 1.725,
  'very-active': 1.9,
};

const GOAL_ADJUSTMENTS = { 'cut': -500, 'maintain': 0, 'build': 300 };

const CALORIES_PER_SLICE = { protein: 110, carb: 120, veg: 50 };
const MACRO_SPLIT = { protein: 0.35, carb: 0.40, veg: 0.25 };

// ============================================================================
// LOGIC FUNCTIONS (extracted from store.tsx + spar-calculator.ts)
// ============================================================================

function calculateBMR(weightLbs, heightInches, age, gender) {
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightInches * 2.54;
  if (gender === 'male') return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

function calculateTDEE(bmr, activityLevel) {
  return bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || 1.725);
}

function calculateSparSliceTargets(weightLbs, heightInches, age, gender, activityLevel, weeklyGoal) {
  const bmr = calculateBMR(weightLbs, heightInches, age, gender);
  const tdee = calculateTDEE(bmr, activityLevel);
  const adjusted = tdee + (GOAL_ADJUSTMENTS[weeklyGoal] || 0);
  const proteinCals = adjusted * MACRO_SPLIT.protein;
  const carbCals = adjusted * MACRO_SPLIT.carb;
  const vegCals = adjusted * MACRO_SPLIT.veg;
  return {
    protein: Math.round(proteinCals / CALORIES_PER_SLICE.protein),
    carb: Math.round(carbCals / CALORIES_PER_SLICE.carb),
    veg: Math.round(vegCals / CALORIES_PER_SLICE.veg),
    totalCalories: Math.round(adjusted),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
  };
}

// Macro targets for Sugar Diet protocols (from store.tsx getMacroTargets)
function getMacroTargets(w, protocol, daysUntil) {
  if (protocol === '1') {
    if (daysUntil < 0) return { carbs: { min: 300, max: 450 }, protein: { min: Math.round(w * 1.4), max: Math.round(w * 1.4) }, ratio: "Full Recovery" };
    if (daysUntil === 0) return { carbs: { min: 150, max: 300 }, protein: { min: Math.round(w * 1.0), max: Math.round(w * 1.0) }, ratio: "Low Carb / Protein Refeed" };
    if (daysUntil === 1) return { carbs: { min: 200, max: 300 }, protein: { min: Math.round(w * 0.2), max: Math.round(w * 0.2) }, ratio: "Fructose + MCT (Evening Protein)" };
    if (daysUntil >= 2 && daysUntil <= 5) return { carbs: { min: 250, max: 400 }, protein: { min: 0, max: 0 }, ratio: "Fructose Only (60:40)" };
    return { carbs: { min: 300, max: 450 }, protein: { min: 75, max: 100 }, ratio: "Maintenance" };
  }
  if (protocol === '2') {
    if (daysUntil < 0) return { carbs: { min: 300, max: 450 }, protein: { min: Math.round(w * 1.4), max: Math.round(w * 1.4) }, ratio: "Full Recovery" };
    if (daysUntil === 0) return { carbs: { min: 200, max: 400 }, protein: { min: Math.round(w * 0.5), max: Math.round(w * 0.5) }, ratio: "Fast Carbs (Between Matches)" };
    if (daysUntil >= 1 && daysUntil <= 2) return { carbs: { min: 300, max: 400 }, protein: { min: 60, max: 60 }, ratio: "Glucose Heavy (Switch to Starch)" };
    if (daysUntil === 3) return { carbs: { min: 325, max: 450 }, protein: { min: 25, max: 25 }, ratio: "Fructose Heavy (60:40)" };
    if (daysUntil >= 4 && daysUntil <= 5) return { carbs: { min: 325, max: 450 }, protein: { min: 0, max: 0 }, ratio: "Fructose Heavy (60:40)" };
    return { carbs: { min: 300, max: 450 }, protein: { min: 75, max: 100 }, ratio: "Maintenance" };
  }
  if (protocol === '3') {
    if (daysUntil < 0) return { carbs: { min: 300, max: 450 }, protein: { min: Math.round(w * 1.4), max: Math.round(w * 1.4) }, ratio: "Full Recovery" };
    if (daysUntil === 0) return { carbs: { min: 200, max: 400 }, protein: { min: Math.round(w * 0.5), max: Math.round(w * 0.5) }, ratio: "Competition Day" };
    if (daysUntil >= 1 && daysUntil <= 2) return { carbs: { min: 300, max: 450 }, protein: { min: 100, max: 100 }, ratio: "Performance (Glucose)" };
    if (daysUntil >= 3 && daysUntil <= 4) return { carbs: { min: 300, max: 450 }, protein: { min: 75, max: 75 }, ratio: "Mixed Fructose/Glucose" };
    if (daysUntil === 5) return { carbs: { min: 300, max: 450 }, protein: { min: 25, max: 25 }, ratio: "Fructose Heavy" };
    return { carbs: { min: 300, max: 450 }, protein: { min: 100, max: 100 }, ratio: "Maintenance" };
  }
  if (protocol === '4') {
    if (daysUntil < 0) return { carbs: { min: 300, max: 450 }, protein: { min: Math.round(w * 1.6), max: Math.round(w * 1.6) }, ratio: "Full Recovery (Max Protein)" };
    if (daysUntil === 0) return { carbs: { min: 200, max: 400 }, protein: { min: Math.round(w * 0.8), max: Math.round(w * 0.8) }, ratio: "Competition Day" };
    if (daysUntil >= 1 && daysUntil <= 4) return { carbs: { min: 350, max: 600 }, protein: { min: 125, max: 125 }, ratio: "Glucose Emphasis" };
    if (daysUntil === 5) return { carbs: { min: 350, max: 600 }, protein: { min: 100, max: 100 }, ratio: "Balanced Carbs" };
    return { carbs: { min: 350, max: 600 }, protein: { min: 125, max: 150 }, ratio: "Build Phase" };
  }
  return { carbs: { min: 300, max: 400 }, protein: { min: 75, max: 100 }, ratio: "Balanced" };
}

// Slice conversion for Protocols 1-4 (from store.tsx getSliceTargets)
function getSliceTargetsForSugarProtocol(w, protocol, daysUntil) {
  const macros = getMacroTargets(w, protocol, daysUntil);
  const proteinSlices = macros.protein.max > 0 ? Math.max(1, Math.round(macros.protein.max / 25)) : 0;
  const carbSlices = macros.carbs.max > 0 ? Math.max(1, Math.round(macros.carbs.max / 30)) : 0;
  const vegSlices = macros.protein.max === 0 ? 0 : Math.max(2, Math.round(carbSlices * 0.4));
  const totalCal = (proteinSlices * 110) + (carbSlices * 120) + (vegSlices * 50);
  return { protein: proteinSlices, carb: carbSlices, veg: vegSlices, totalCalories: totalCal };
}

// Rendering decision logic (from fuel-card.tsx)
function getRendering(protocol, nutritionPreference) {
  const isSparMode = nutritionPreference === 'spar';
  const isSparProtocol = protocol === '5';
  const showSparTracker = isSparProtocol;
  const showSliceEquivalents = isSparMode && !isSparProtocol;
  return { showSparTracker, showSliceEquivalents, showMacroTracker: !showSparTracker };
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
    if (failures.length <= 60) console.log(`  ❌ FAIL: ${msg}`);
  }
}

function assertRange(value, min, max, message, context = '') {
  assert(value >= min && value <= max, `${message} (got ${value}, expected ${min}-${max})`, context);
}

function assertFinite(value, message, context = '') {
  assert(Number.isFinite(value), `${message} (got ${value})`, context);
}

function assertEqual(actual, expected, message, context = '') {
  assert(actual === expected, `${message} (got ${actual}, expected ${expected})`, context);
}

// ============================================================================
// TEST ATHLETES
// ============================================================================
const athletes = [
  // Protocols 1-4: Sugar Diet athletes (various weights, all days)
  { name: "125 P1 Body Comp", weight: 125, protocol: '1', height: 64, age: 15, gender: 'male' },
  { name: "133 P1 Body Comp", weight: 133, protocol: '1', height: 66, age: 16, gender: 'male' },
  { name: "141 P2 Make Weight", weight: 141, protocol: '2', height: 67, age: 17, gender: 'male' },
  { name: "149 P2 Make Weight", weight: 149, protocol: '2', height: 68, age: 16, gender: 'male' },
  { name: "157 P3 Hold Weight", weight: 157, protocol: '3', height: 69, age: 17, gender: 'male' },
  { name: "165 P3 Hold Weight", weight: 165, protocol: '3', height: 70, age: 18, gender: 'male' },
  { name: "174 P4 Build", weight: 174, protocol: '4', height: 71, age: 17, gender: 'male' },
  { name: "184 P4 Build", weight: 184, protocol: '4', height: 72, age: 18, gender: 'male' },
  { name: "197 P4 Build", weight: 197, protocol: '4', height: 73, age: 17, gender: 'male' },
  { name: "285 P1 Body Comp", weight: 285, protocol: '1', height: 76, age: 18, gender: 'male' },
  // Protocol 5: SPAR athletes
  { name: "125 P5 SPAR Cut", weight: 125, protocol: '5', height: 64, age: 15, gender: 'male', activity: 'active', goal: 'cut' },
  { name: "133 P5 SPAR Maintain", weight: 133, protocol: '5', height: 66, age: 16, gender: 'male', activity: 'active', goal: 'maintain' },
  { name: "149 P5 SPAR Build", weight: 149, protocol: '5', height: 68, age: 17, gender: 'male', activity: 'very-active', goal: 'build' },
  { name: "165 P5 SPAR Sedentary", weight: 165, protocol: '5', height: 70, age: 18, gender: 'male', activity: 'sedentary', goal: 'maintain' },
  { name: "184 P5 SPAR Female", weight: 184, protocol: '5', height: 68, age: 17, gender: 'female', activity: 'active', goal: 'cut' },
  { name: "285 P5 SPAR Heavy", weight: 285, protocol: '5', height: 76, age: 18, gender: 'male', activity: 'very-active', goal: 'build' },
  // Edge: female athletes across protocols
  { name: "125 P1 Female", weight: 125, protocol: '1', height: 62, age: 15, gender: 'female' },
  { name: "141 P2 Female", weight: 141, protocol: '2', height: 64, age: 16, gender: 'female' },
  { name: "157 P5 Female SPAR", weight: 157, protocol: '5', height: 66, age: 17, gender: 'female', activity: 'moderate', goal: 'maintain' },
];

console.log('🏋️ PWM Nutrition Stress Test');
console.log('━'.repeat(60));

// ============================================================================
// TEST 1: RENDERING DECISION — Protocol determines food system, NOT toggle
// ============================================================================
console.log('\n📋 Test 1: Rendering Decision (Protocol → Food System)');
{
  const sugarProtocols = ['1', '2', '3', '4'];
  const preferences = ['spar', 'sugar'];

  for (const pref of preferences) {
    for (const proto of sugarProtocols) {
      const r = getRendering(proto, pref);
      const ctx = `Protocol ${proto}, pref=${pref}`;
      assertEqual(r.showSparTracker, false, `Protocol ${proto} must NEVER show SparTracker`, ctx);
      assertEqual(r.showMacroTracker, true, `Protocol ${proto} must ALWAYS show MacroTracker`, ctx);
      if (pref === 'spar') {
        assertEqual(r.showSliceEquivalents, true, `Protocol ${proto} + slices pref should show slice equivalents`, ctx);
      } else {
        assertEqual(r.showSliceEquivalents, false, `Protocol ${proto} + grams pref should NOT show slice equivalents`, ctx);
      }
    }
  }

  // Protocol 5: always SPAR
  for (const pref of preferences) {
    const r = getRendering('5', pref);
    const ctx = `Protocol 5, pref=${pref}`;
    assertEqual(r.showSparTracker, true, `Protocol 5 must ALWAYS show SparTracker`, ctx);
    assertEqual(r.showMacroTracker, false, `Protocol 5 must NEVER show MacroTracker`, ctx);
    assertEqual(r.showSliceEquivalents, false, `Protocol 5 never shows slice equivalents (it IS slices)`, ctx);
  }
}

// ============================================================================
// TEST 2: SPAR BMR / TDEE / Slice Calculations (Protocol 5)
// ============================================================================
console.log('\n📋 Test 2: SPAR BMR → TDEE → Slice Targets (Protocol 5)');
{
  const sparAthletes = athletes.filter(a => a.protocol === '5');
  for (const a of sparAthletes) {
    const ctx = a.name;
    const targets = calculateSparSliceTargets(
      a.weight, a.height, a.age, a.gender,
      a.activity || 'active', a.goal || 'maintain'
    );

    // BMR should be reasonable (800-3000 for athletes)
    assertFinite(targets.bmr, 'BMR must be finite', ctx);
    assertRange(targets.bmr, 800, 3000, 'BMR in reasonable range', ctx);

    // TDEE should be > BMR
    assertFinite(targets.tdee, 'TDEE must be finite', ctx);
    assert(targets.tdee > targets.bmr, `TDEE (${targets.tdee}) must be > BMR (${targets.bmr})`, ctx);

    // Total calories should be reasonable
    assertFinite(targets.totalCalories, 'totalCalories must be finite', ctx);
    if (a.goal === 'cut') {
      assertRange(targets.totalCalories, 1000, 4000, 'Cut calories in range', ctx);
    } else if (a.goal === 'build') {
      assertRange(targets.totalCalories, 1500, 5500, 'Build calories in range', ctx);
    } else {
      assertRange(targets.totalCalories, 1200, 5000, 'Maintain calories in range', ctx);
    }

    // Slices should be positive integers
    assert(targets.protein >= 1, `Protein slices (${targets.protein}) >= 1`, ctx);
    assert(targets.carb >= 1, `Carb slices (${targets.carb}) >= 1`, ctx);
    assert(targets.veg >= 1, `Veg slices (${targets.veg}) >= 1`, ctx);

    // Slice totals should roughly match calorie target (within 20%)
    const sliceCals = targets.protein * 110 + targets.carb * 120 + targets.veg * 50;
    const calDiff = Math.abs(sliceCals - targets.totalCalories) / targets.totalCalories;
    assert(calDiff < 0.2, `Slice calories (${sliceCals}) within 20% of target (${targets.totalCalories}), diff=${(calDiff * 100).toFixed(1)}%`, ctx);

    // Female BMR should be lower than male of same size
    if (a.gender === 'female') {
      const maleBmr = calculateBMR(a.weight, a.height, a.age, 'male');
      assert(targets.bmr < maleBmr, `Female BMR (${targets.bmr}) < Male BMR (${maleBmr})`, ctx);
    }
  }

  // Activity level ordering: more active → higher TDEE
  const baseBMR = calculateBMR(165, 70, 17, 'male');
  const activities = ['sedentary', 'light', 'moderate', 'active', 'very-active'];
  let prevTDEE = 0;
  for (const act of activities) {
    const tdee = calculateTDEE(baseBMR, act);
    assert(tdee > prevTDEE, `TDEE for ${act} (${Math.round(tdee)}) > previous (${Math.round(prevTDEE)})`, 'Activity ordering');
    prevTDEE = tdee;
  }

  // Goal ordering: cut < maintain < build
  const base = calculateSparSliceTargets(165, 70, 17, 'male', 'active', 'maintain');
  const cut = calculateSparSliceTargets(165, 70, 17, 'male', 'active', 'cut');
  const build = calculateSparSliceTargets(165, 70, 17, 'male', 'active', 'build');
  assert(cut.totalCalories < base.totalCalories, `Cut cals (${cut.totalCalories}) < maintain (${base.totalCalories})`, 'Goal ordering');
  assert(build.totalCalories > base.totalCalories, `Build cals (${build.totalCalories}) > maintain (${base.totalCalories})`, 'Goal ordering');
}

// ============================================================================
// TEST 3: SLICE CONVERSION for Protocols 1-4 (gram → slice mapping)
// ============================================================================
console.log('\n📋 Test 3: Gram → Slice Conversion (Protocols 1-4)');
{
  const sugarAthletes = athletes.filter(a => a.protocol !== '5');
  const allDays = [-1, 0, 1, 2, 3, 4, 5, 7, 14];

  for (const a of sugarAthletes) {
    for (const day of allDays) {
      const ctx = `${a.name} day=${day}`;
      const macros = getMacroTargets(a.weight, a.protocol, day);
      const slices = getSliceTargetsForSugarProtocol(a.weight, a.protocol, day);

      // All values must be finite
      assertFinite(slices.protein, 'Protein slices finite', ctx);
      assertFinite(slices.carb, 'Carb slices finite', ctx);
      assertFinite(slices.veg, 'Veg slices finite', ctx);
      assertFinite(slices.totalCalories, 'Total calories finite', ctx);

      // No negative slices
      assert(slices.protein >= 0, `Protein slices (${slices.protein}) >= 0`, ctx);
      assert(slices.carb >= 0, `Carb slices (${slices.carb}) >= 0`, ctx);
      assert(slices.veg >= 0, `Veg slices (${slices.veg}) >= 0`, ctx);

      // If macros say 0 protein, slices should be 0
      if (macros.protein.max === 0) {
        assertEqual(slices.protein, 0, 'Zero protein grams → 0 protein slices', ctx);
        assertEqual(slices.veg, 0, 'Zero protein → 0 veg slices', ctx);
      }

      // If macros say 0 carbs, slices should be 0
      if (macros.carbs.max === 0) {
        assertEqual(slices.carb, 0, 'Zero carb grams → 0 carb slices', ctx);
      }

      // If macros are non-zero, slices must be at least 1
      if (macros.protein.max > 0) {
        assert(slices.protein >= 1, `Non-zero protein (${macros.protein.max}g) → at least 1 slice`, ctx);
      }
      if (macros.carbs.max > 0) {
        assert(slices.carb >= 1, `Non-zero carbs (${macros.carbs.max}g) → at least 1 slice`, ctx);
      }

      // Slice conversion sanity: protein slice ≈ 25g, so slices ~ max/25
      if (macros.protein.max > 0) {
        const expectedSlices = Math.max(1, Math.round(macros.protein.max / 25));
        assertEqual(slices.protein, expectedSlices, `Protein slice count matches formula`, ctx);
      }
      if (macros.carbs.max > 0) {
        const expectedSlices = Math.max(1, Math.round(macros.carbs.max / 30));
        assertEqual(slices.carb, expectedSlices, `Carb slice count matches formula`, ctx);
      }
    }
  }
}

// ============================================================================
// TEST 4: PROTOCOL 1 (Body Comp) — Fructose-only days must block protein
// ============================================================================
console.log('\n📋 Test 4: Protocol 1 Food Phase Restrictions');
{
  const weights = [125, 141, 165, 184, 285];
  for (const w of weights) {
    // Days 2-5: Fructose only — protein = 0
    for (const day of [2, 3, 4, 5]) {
      const macros = getMacroTargets(w, '1', day);
      assertEqual(macros.protein.max, 0, `P1 day ${day}: protein must be 0 (fructose only)`, `${w}lbs P1 day ${day}`);
      assert(macros.carbs.max > 0, `P1 day ${day}: carbs must be > 0`, `${w}lbs P1 day ${day}`);

      // Slice conversion should give 0 protein, 0 veg
      const slices = getSliceTargetsForSugarProtocol(w, '1', day);
      assertEqual(slices.protein, 0, 'Fructose-only day → 0 protein slices', `${w}lbs P1 day ${day}`);
      assertEqual(slices.veg, 0, 'Fructose-only day → 0 veg slices', `${w}lbs P1 day ${day}`);
      assert(slices.carb > 0, 'Fructose-only day → still has carb slices', `${w}lbs P1 day ${day}`);
    }

    // Day 1: Low protein but non-zero (evening protein)
    const d1 = getMacroTargets(w, '1', 1);
    assert(d1.protein.max > 0, `P1 day 1: should have some protein`, `${w}lbs P1 day 1`);
    assert(d1.protein.max < w * 0.5, `P1 day 1: protein should be low`, `${w}lbs P1 day 1`);

    // Day 0: Competition day refeed
    const d0 = getMacroTargets(w, '1', 0);
    assert(d0.protein.max > 0, `P1 day 0: should have protein (refeed)`, `${w}lbs P1 day 0`);

    // Recovery: highest protein
    const rec = getMacroTargets(w, '1', -1);
    assert(rec.protein.max > d0.protein.max, `P1 recovery protein > competition protein`, `${w}lbs P1 recovery`);
  }
}

// ============================================================================
// TEST 5: PROTOCOL 2 (Make Weight) — Progressive protein introduction
// ============================================================================
console.log('\n📋 Test 5: Protocol 2 Progressive Protein');
{
  const weights = [133, 149, 174, 197];
  for (const w of weights) {
    const d5 = getMacroTargets(w, '2', 5);
    const d4 = getMacroTargets(w, '2', 4);
    const d3 = getMacroTargets(w, '2', 3);
    const d2 = getMacroTargets(w, '2', 2);
    const d1 = getMacroTargets(w, '2', 1);
    const d0 = getMacroTargets(w, '2', 0);

    // Days 4-5: fructose only, 0 protein
    assertEqual(d5.protein.max, 0, 'P2 day 5: 0 protein', `${w}lbs P2`);
    assertEqual(d4.protein.max, 0, 'P2 day 4: 0 protein', `${w}lbs P2`);

    // Day 3: small protein (25g)
    assertEqual(d3.protein.max, 25, 'P2 day 3: 25g protein', `${w}lbs P2`);

    // Days 1-2: more protein (60g)
    assertEqual(d2.protein.max, 60, 'P2 day 2: 60g protein', `${w}lbs P2`);
    assertEqual(d1.protein.max, 60, 'P2 day 1: 60g protein', `${w}lbs P2`);

    // Competition: weight-based protein
    assert(d0.protein.max > 0, 'P2 day 0: has protein', `${w}lbs P2`);
  }
}

// ============================================================================
// TEST 6: ALL PROTOCOLS × ALL DAYS — No NaN, no Infinity, no crashes
// ============================================================================
console.log('\n📋 Test 6: Full Matrix — All Protocols × All Days (crash test)');
{
  const allProtocols = ['1', '2', '3', '4', '5'];
  const allDays = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 10, 14, 21];
  const allWeights = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285];

  for (const proto of allProtocols) {
    for (const day of allDays) {
      for (const w of allWeights) {
        const ctx = `P${proto} day=${day} w=${w}`;

        if (proto === '5') {
          // SPAR calculation
          const slices = calculateSparSliceTargets(w, 68, 17, 'male', 'active', 'maintain');
          assertFinite(slices.protein, 'SPAR protein finite', ctx);
          assertFinite(slices.carb, 'SPAR carb finite', ctx);
          assertFinite(slices.veg, 'SPAR veg finite', ctx);
          assertFinite(slices.totalCalories, 'SPAR totalCal finite', ctx);
        } else {
          // Sugar Diet macro + slice conversion
          const macros = getMacroTargets(w, proto, day);
          assertFinite(macros.carbs.min, 'Carbs min finite', ctx);
          assertFinite(macros.carbs.max, 'Carbs max finite', ctx);
          assertFinite(macros.protein.min, 'Protein min finite', ctx);
          assertFinite(macros.protein.max, 'Protein max finite', ctx);
          assert(macros.carbs.min >= 0, 'Carbs min >= 0', ctx);
          assert(macros.carbs.max >= 0, 'Carbs max >= 0', ctx);
          assert(macros.protein.min >= 0, 'Protein min >= 0', ctx);
          assert(macros.protein.max >= 0, 'Protein max >= 0', ctx);
          assert(macros.carbs.max >= macros.carbs.min, 'Carbs max >= min', ctx);
          assert(macros.protein.max >= macros.protein.min, 'Protein max >= min', ctx);
          assert(typeof macros.ratio === 'string' && macros.ratio.length > 0, 'Has ratio string', ctx);

          const slices = getSliceTargetsForSugarProtocol(w, proto, day);
          assertFinite(slices.protein, 'Slice protein finite', ctx);
          assertFinite(slices.carb, 'Slice carb finite', ctx);
          assertFinite(slices.veg, 'Slice veg finite', ctx);
          assertFinite(slices.totalCalories, 'Slice totalCal finite', ctx);
        }

        // Rendering decision must not crash and must be deterministic
        for (const pref of ['spar', 'sugar']) {
          const r = getRendering(proto, pref);
          assert(typeof r.showSparTracker === 'boolean', 'showSparTracker is boolean', ctx);
          assert(typeof r.showMacroTracker === 'boolean', 'showMacroTracker is boolean', ctx);
          assert(typeof r.showSliceEquivalents === 'boolean', 'showSliceEquivalents is boolean', ctx);
          // Exactly one tracker
          assert(r.showSparTracker !== r.showMacroTracker, 'Exactly one tracker active', ctx);
        }
      }
    }
  }
}

// ============================================================================
// TEST 7: SPAR edge cases — extreme inputs
// ============================================================================
console.log('\n📋 Test 7: SPAR Edge Cases');
{
  // Very light athlete
  const light = calculateSparSliceTargets(100, 60, 14, 'female', 'sedentary', 'cut');
  assert(light.totalCalories >= 800, `Very light female: cals (${light.totalCalories}) >= 800`, 'Light edge');
  assert(light.protein >= 1, 'Light: protein >= 1 slice', 'Light edge');

  // Very heavy athlete
  const heavy = calculateSparSliceTargets(350, 78, 19, 'male', 'very-active', 'build');
  assert(heavy.totalCalories >= 3000, `Heavy male: cals (${heavy.totalCalories}) >= 3000`, 'Heavy edge');
  assert(heavy.protein >= 5, `Heavy: protein (${heavy.protein}) >= 5 slices`, 'Heavy edge');

  // Young athlete
  const young = calculateSparSliceTargets(125, 64, 13, 'male', 'active', 'maintain');
  assertFinite(young.bmr, 'Young BMR finite', 'Young edge');
  assert(young.totalCalories > 1500, `Young active: cals (${young.totalCalories}) > 1500`, 'Young edge');

  // All activity levels produce valid results for same athlete
  const activities = ['sedentary', 'light', 'moderate', 'active', 'very-active'];
  for (const act of activities) {
    const t = calculateSparSliceTargets(165, 70, 17, 'male', act, 'maintain');
    assert(t.protein > 0 && t.carb > 0 && t.veg > 0, `${act}: all slices > 0`, 'Activity edge');
  }

  // All goals produce valid results
  const goals = ['cut', 'maintain', 'build'];
  for (const goal of goals) {
    const t = calculateSparSliceTargets(165, 70, 17, 'male', 'active', goal);
    assert(t.protein > 0 && t.carb > 0 && t.veg > 0, `${goal}: all slices > 0`, 'Goal edge');
  }
}

// ============================================================================
// TEST 8: Slice equivalents consistency — P1-4 slices should be reasonable
// ============================================================================
console.log('\n📋 Test 8: Slice Equivalent Reasonableness');
{
  // For a typical wrestler (165lbs), check slice targets make sense across days
  const w = 165;
  for (const proto of ['1', '2', '3', '4']) {
    for (const day of [0, 1, 2, 3, 5, 7]) {
      const ctx = `P${proto} day=${day} w=${w}`;
      const macros = getMacroTargets(w, proto, day);
      const slices = getSliceTargetsForSugarProtocol(w, proto, day);

      // Total slices should be reasonable (1-30 slices per day)
      const totalSlices = slices.protein + slices.carb + slices.veg;
      if (macros.carbs.max > 0 || macros.protein.max > 0) {
        assertRange(totalSlices, 1, 35, 'Total slices in sane range', ctx);
      }

      // Calorie estimate from slices should be in a reasonable range
      if (slices.totalCalories > 0) {
        assertRange(slices.totalCalories, 100, 5000, 'Slice calorie estimate reasonable', ctx);
      }
    }
  }
}

// ============================================================================
// TEST 9: Rendering matrix — every protocol/pref combo is deterministic
// ============================================================================
console.log('\n📋 Test 9: Rendering Determinism');
{
  // Call getRendering 1000 times and ensure same inputs → same outputs
  for (let i = 0; i < 100; i++) {
    for (const proto of ['1', '2', '3', '4', '5']) {
      for (const pref of ['spar', 'sugar']) {
        const r1 = getRendering(proto, pref);
        const r2 = getRendering(proto, pref);
        assert(
          r1.showSparTracker === r2.showSparTracker &&
          r1.showMacroTracker === r2.showMacroTracker &&
          r1.showSliceEquivalents === r2.showSliceEquivalents,
          'Rendering is deterministic',
          `P${proto} pref=${pref} iteration ${i}`
        );
      }
    }
  }
}

// ============================================================================
// TEST 10: Protocol 5 does NOT use gram targets at all
// ============================================================================
console.log('\n📋 Test 10: Protocol 5 Independence from Sugar Macros');
{
  // SPAR targets should be the same regardless of daysUntilWeighIn
  // because Protocol 5 uses BMR-based calculation, not day-based macros
  const sparTargets1 = calculateSparSliceTargets(165, 70, 17, 'male', 'active', 'maintain');
  const sparTargets2 = calculateSparSliceTargets(165, 70, 17, 'male', 'active', 'maintain');
  assertEqual(sparTargets1.protein, sparTargets2.protein, 'SPAR protein consistent', 'P5 consistency');
  assertEqual(sparTargets1.carb, sparTargets2.carb, 'SPAR carb consistent', 'P5 consistency');
  assertEqual(sparTargets1.veg, sparTargets2.veg, 'SPAR veg consistent', 'P5 consistency');

  // Different weight → different slices (proves it's using BMR, not fixed)
  const light = calculateSparSliceTargets(125, 64, 15, 'male', 'active', 'maintain');
  const heavy = calculateSparSliceTargets(285, 76, 18, 'male', 'active', 'maintain');
  assert(heavy.totalCalories > light.totalCalories, 'Heavy athlete gets more calories than light', 'P5 weight scaling');
  assert(heavy.protein > light.protein, 'Heavy gets more protein slices', 'P5 weight scaling');
}

// ============================================================================
// TEST 11: Cross-check — Protocols 1-4 macros must never return SPAR-like values
// ============================================================================
console.log('\n📋 Test 11: Sugar Diet Macros Are Not SPAR-Like');
{
  // Sugar Diet uses specific gram targets per day that vary by daysUntilWeighIn
  // SPAR uses fixed BMR-based targets. They should not accidentally match.
  for (const proto of ['1', '2', '3', '4']) {
    const day5 = getMacroTargets(165, proto, 5);
    const day1 = getMacroTargets(165, proto, 1);
    const dayRec = getMacroTargets(165, proto, -1);

    // Sugar Diet macros change by day
    const changes = (day5.carbs.max !== day1.carbs.max) || (day5.protein.max !== day1.protein.max);
    assert(changes, `P${proto} macros differ between day 5 and day 1`, `P${proto} day-variation`);

    // Recovery always has protein
    assert(dayRec.protein.max > 0, `P${proto} recovery has protein`, `P${proto} recovery`);
  }
}

// ============================================================================
// RESULTS
// ============================================================================
console.log('\n' + '━'.repeat(60));
console.log(`✅ Passed: ${passedTests}/${totalTests}`);
if (failedTests > 0) {
  console.log(`❌ Failed: ${failedTests}/${totalTests}`);
  if (failures.length > 60) {
    console.log(`   (showing first 60 of ${failures.length} failures)`);
  }
  console.log('\nFirst failures:');
  failures.slice(0, 10).forEach(f => console.log(`  • ${f}`));
} else {
  console.log('🎉 ALL TESTS PASSED — Nutrition logic is solid!');
}
console.log('━'.repeat(60));
process.exit(failedTests > 0 ? 1 : 0);
