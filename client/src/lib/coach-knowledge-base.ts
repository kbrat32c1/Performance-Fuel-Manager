/**
 * Elite Weight Cutting Coach Knowledge Base
 *
 * This file contains comprehensive protocol knowledge extracted from the SPAR system.
 * It's designed to be injected into Claude's context for intelligent coaching responses.
 */

// ─── PROTOCOL DEFINITIONS ───────────────────────────────────────────────────

export const PROTOCOL_KNOWLEDGE = {
  '1': {
    name: 'Extreme Cut',
    description: 'Aggressive protocol with extended zero-protein for maximum FGF21 activation and fat oxidation',
    schedule: {
      '6+': {
        phase: 'Metabolic/Maintenance',
        carbs: '300-450g (balanced)',
        protein: '75-100g',
        water: '0.5 oz/lb (regular)',
        key: 'Eat normally, build strength for the cut ahead'
      },
      '5-2': {
        phase: 'Water Loading + Zero Protein',
        carbs: '250-400g (FRUCTOSE ONLY)',
        protein: '0g - NO PROTEIN',
        water: 'Days 5-3: 1.2-1.5 oz/lb (loading). Day 2: 0.3 oz/lb (restriction)',
        key: 'Max FGF21 activation. Fructose only (agave, honey, fruit juice, mangoes). Zero protein triggers fat burning. Water loading flushes sodium and primes ADH for day 1 cut.'
      },
      '1': {
        phase: 'Performance Prep / Final Cut',
        carbs: '200-300g (fructose + MCT oil)',
        protein: '0.2g/lb (evening collagen only)',
        water: '0.08 oz/lb (sips only)',
        key: 'GDF15 peak for appetite suppression. Small collagen dose evening only. Zero fiber - gut must be empty. MCT for quick energy without gut weight.'
      },
      '0': {
        phase: 'Competition Day',
        carbs: '150-300g (low carb, fast digesting)',
        protein: '1.0g/lb (aggressive protein refeed post-weigh-in)',
        water: 'Rehydrate 16-24 oz first hour, then 8 oz/hour',
        key: 'After weigh-in: fast carbs + protein. Between matches: simple sugars only. No heavy meals until wrestling done.'
      },
      '-1': {
        phase: 'Full Recovery',
        carbs: '300-450g (all types)',
        protein: '1.4g/lb (max recovery)',
        water: '0.75 oz/lb (full rehydration)',
        key: 'Eat everything. Repair muscle. Rehydrate fully. Sleep 9+ hours.'
      }
    }
  },
  '2': {
    name: 'Rapid Cut',
    description: 'Standard weekly cut with strategic fructose/glucose switching',
    schedule: {
      '6+': {
        phase: 'Metabolic/Maintenance',
        carbs: '300-450g (balanced)',
        protein: '75-100g',
        water: '0.5 oz/lb',
        key: 'Normal eating, prep for water loading'
      },
      '5-4': {
        phase: 'Water Loading + Fructose',
        carbs: '325-450g (fructose heavy 60:40)',
        protein: '0g - NO PROTEIN',
        water: '1.2-1.5 oz/lb (loading)',
        key: 'Fructose only for liver glycogen. No protein maximizes fat burning. Water loading begins.'
      },
      '3': {
        phase: 'Fructose + Minimal Protein',
        carbs: '325-450g (fructose heavy)',
        protein: '25g (collagen + leucine at dinner)',
        water: '1.5 oz/lb (peak loading)',
        key: 'Add small protein dose. Peak water loading. Sodium still normal.'
      },
      '2': {
        phase: 'Glucose Switch Day',
        carbs: '300-400g (glucose/starch - switch from fructose)',
        protein: '60g (collagen + seafood)',
        water: '0.3 oz/lb (sharp restriction)',
        key: 'CRITICAL: Switch to glucose/starch (white rice, potatoes). Fructose exits liver. Water restriction begins - ADH response.'
      },
      '1': {
        phase: 'Zero Fiber Day',
        carbs: '300-400g (ZERO FIBER - white rice, rice cakes, juice)',
        protein: '60g (collagen + seafood)',
        water: '0.08 oz/lb (sips only)',
        key: 'CRITICAL: Zero fiber. Gut must empty overnight. White rice, rice cakes, apple juice, white bread only. No vegetables.'
      },
      '0': {
        phase: 'Competition Day',
        carbs: '200-400g (fast carbs between matches)',
        protein: '0.5g/lb (post-weigh-in)',
        water: 'Rehydrate',
        key: 'Post weigh-in: fast carbs + moderate protein. Between matches: simple sugars. No protein until wrestling done.'
      },
      '-1': {
        phase: 'Full Recovery',
        carbs: '300-450g',
        protein: '1.4g/lb',
        water: '0.75 oz/lb',
        key: 'Full recovery eating'
      }
    }
  },
  '3': {
    name: 'Optimal Cut',
    description: 'Minimal manipulation for athletes close to weight class',
    schedule: {
      '6+': { phase: 'Maintenance', carbs: '300-450g', protein: '100g', water: '0.5 oz/lb', key: 'Regular eating' },
      '5': { phase: 'Light Manipulation', carbs: '300-450g (fructose heavy)', protein: '25g (collagen)', water: '0.5 oz/lb', key: 'Small adjustments only' },
      '4-3': { phase: 'Mixed', carbs: '300-450g', protein: '75g', water: '0.5 oz/lb', key: 'Mixed carb sources' },
      '2-1': { phase: 'Performance', carbs: '300-450g (glucose)', protein: '100g', water: '0.3-0.08 oz/lb', key: 'Glucose focus for performance' },
      '0': { phase: 'Competition', carbs: '200-400g', protein: '0.5g/lb', water: 'Rehydrate', key: 'Competition fueling' },
      '-1': { phase: 'Recovery', carbs: '300-450g', protein: '1.4g/lb', water: '0.75 oz/lb', key: 'Full recovery' }
    }
  },
  '4': {
    name: 'Gain',
    description: 'Off-season building with high protein',
    schedule: {
      '6+': { phase: 'Build', carbs: '350-600g', protein: '125-150g', water: '0.5 oz/lb', key: 'High calories for growth' },
      '5-1': { phase: 'Pre-Competition Build', carbs: '350-600g', protein: '100-125g', water: '0.5 oz/lb', key: 'Maintain size' },
      '0': { phase: 'Competition', carbs: '200-400g', protein: '0.8g/lb', water: 'Rehydrate', key: 'Competition fueling' },
      '-1': { phase: 'Max Recovery', carbs: '300-450g', protein: '1.6g/lb (MAX)', water: '0.75 oz/lb', key: 'Maximum muscle repair' }
    }
  },
  '5': {
    name: 'SPAR Nutrition',
    description: 'Portion-based balanced eating without competition cutting',
    key: 'Uses palm/fist/thumb portions instead of grams. Focus on sustainable habits.'
  }
};

// ─── WATER PROTOCOL ─────────────────────────────────────────────────────────

export const WATER_PROTOCOL = `
## WATER LOADING PROTOCOL (Protocols 1-4)

PURPOSE: Prime the body's ADH (antidiuretic hormone) to flush water rapidly when restriction begins.

### Day-by-Day Schedule:
- **6+ days out**: 0.5 oz/lb (regular hydration)
- **5 days out**: 1.2 oz/lb (loading begins)
- **4 days out**: 1.5 oz/lb (peak loading)
- **3 days out**: 1.5 oz/lb (peak continues)
- **2 days out**: 0.3 oz/lb (SHARP restriction - body keeps flushing)
- **1 day out**: 0.08 oz/lb (sips only - final cut)
- **0 (weigh-in)**: 0 until weigh-in, then rehydrate 16-24 oz first hour

### Critical Notes:
- Water loading ONLY works if you actually load. Half-measures don't trigger ADH.
- Max cap: 320 oz (~2.5 gallons) per day for safety
- During loading (3-5 days out), expect to be 2-4 lbs over target - this is NORMAL
- The water comes off rapidly on days 1-2 when restriction begins
`;

// ─── FOOD TIMING ────────────────────────────────────────────────────────────

export const FOOD_TIMING = `
## CARBOHYDRATE TIMING

### Fructose Phase (5-3 days out for Protocol 2, 5-2 days for Protocol 1):
- Fructose goes to LIVER glycogen (not muscle)
- Sources: Agave nectar, honey, mangoes, grapes, apple juice, watermelon
- Purpose: Fill liver, trigger FGF21 fat burning signaling

### Glucose Switch (Day 2):
- Switch to GLUCOSE/STARCH on day 2 (Protocol 2)
- Fructose in liver gets released as glucose
- Sources: White rice, potatoes, white bread, honey (glucose portion)
- Purpose: Different metabolic pathway, liver glycogen release

### Zero Fiber Day (Day 1):
- CRITICAL: Zero fiber on final day before weigh-in
- Fiber adds gut weight that won't come off overnight
- Allowed: White rice, rice cakes, apple juice, white bread, sports drinks
- Avoid: ALL vegetables, fruits with fiber, whole grains, beans

## PROTEIN TIMING

### Zero Protein Phase:
- Days 4-5 (Protocol 2) or Days 2-5 (Protocol 1): NO protein
- Purpose: Maximizes FGF21 signaling for fat oxidation
- Even 10g of protein blunts the FGF21 response

### Protein Reintroduction:
- Day 3 (Protocol 2): 25g collagen + leucine at dinner
- Day 2-1: 60g protein (collagen + seafood - lighter on gut)
- Post weigh-in: 0.5-1.0g/lb protein refeed

### Protein Sources by Phase:
- Zero protein days: NONE
- Transition days: Collagen peptides, bone broth, seafood (lighter)
- Competition: Whey isolate, chicken, eggs (after wrestling)
- Recovery: All sources, focus on 1.4-1.6g/lb
`;

// ─── CALCULATION RULES ──────────────────────────────────────────────────────

export const CALCULATION_RULES = `
## HOW TO INTERPRET ATHLETE DATA

### Sweat Rate (lbs/hr):
- Calculated from pre-practice to post-practice weight loss divided by duration
- Typical range: 1.0-2.5 lbs/hr
- Use to predict: workout water loss, extra workout impact
- Higher sweat rate = can cut more water weight if needed

### Overnight Drift (lbs):
- Weight lost from bed to next morning (breathing, sweating, bathroom)
- Typical range: 0.5-1.5 lbs
- Higher during water loading phase (more to flush)
- Lower on restriction days (less water to lose)

### Practice Loss (lbs):
- Net weight loss from morning to post-practice
- Includes sweat + some food/water consumed
- Use for daily projection adjustments

### Projected Weight:
- Loading days (3+ out): Use morning-to-morning net loss
- Cut days (1-2 out): Use most recent weigh-in + remaining losses
- Include: expected drift + expected practice loss

## FLUID ALLOWANCE CALCULATION

When athlete is cutting and asks "how much can I drink?":
1. Get hours until weigh-in
2. Calculate expected overnight drift
3. Calculate expected practice loss (if practice today)
4. Calculate natural loss = drift + practice
5. Buffer = natural loss - weight to lose
6. If buffer > 0: Can drink (buffer × 16) oz
7. If buffer <= 0: Water restricted, find cutoff time
8. Cutoff time = work backwards from weigh-in to find when buffer hits 0

## EXTRA WORKOUT CALCULATION

When athlete asks "do I need extra workouts?":
1. Get their sweat rate (lbs/hr)
2. Get expected natural loss (drift + practice)
3. Calculate remaining = weight to lose - natural loss
4. If remaining > 0: Need extra work
5. Sessions needed = remaining / (sweat rate × 0.75 hrs per session)
6. Minutes needed = (remaining / sweat rate) × 60

## WEIGHT ADJUSTMENT RULES (Days 1-3)

If significantly overweight on cut days, REDUCE food targets:
- 10%+ over: DO NOT EAT - focus entirely on workouts + water cut
- 7-10% over: 15% carbs, 20% protein max
- 5-7% over: 30-40% carbs, 50% protein
- 3-5% over: 60-70% carbs, 80% protein
`;

// ─── COMMON SCENARIOS ───────────────────────────────────────────────────────

export const COACHING_SCENARIOS = `
## COMMON ATHLETE QUESTIONS & RESPONSES

### "How much can I drink today?"
Use fluid allowance calculation. Always give:
- Specific oz amount
- Cutoff time
- What happens if they exceed it

### "Am I on track to make weight?"
Look at:
- Current weight vs target
- Projected weight at weigh-in
- Days remaining
- Comparison to historical patterns

### "Do I need extra workouts?"
Calculate based on:
- Sweat rate
- Expected natural losses
- Weight still to lose
- Days remaining

### "I'm 3 lbs over with 1 day left"
This is critical. Calculate:
- Expected overnight drift (~1-1.5 lbs)
- Need ~1.5-2 lbs from water cut or workout
- If sweat rate is 2 lbs/hr, need 45-60 min workout
- Cut water NOW if not already

### "I feel weak during my cut"
- Check hydration - are they too restricted too early?
- Check carbs - are they getting enough fructose/glucose?
- Check electrolytes - salt is important during loading
- If severely weak: abort cut, move up weight class

### "I'm behind on my cut, should I switch protocols?"
Consider switching to Extreme Cut (Protocol 1) if:
- 4+ lbs over with 3+ days left
- Not on Extreme Cut already
- Willing to do zero protein

### "What should I eat right now?"
Always answer based on:
- Current protocol
- Days until weigh-in
- Time of day
- Specific food names with portions
`;

// ─── SAFETY RULES ───────────────────────────────────────────────────────────

export const SAFETY_RULES = `
## WHEN TO ABORT A CUT

STOP cutting and consider moving up a weight class if:
- More than 8% body weight to cut in 3 days
- Experiencing severe dizziness, confusion, or fainting
- Urine is dark brown (severe dehydration)
- Heart palpitations or irregular heartbeat
- Muscle cramps that don't resolve with electrolytes
- Athlete is under 15 years old cutting more than 3%

## NEVER RECOMMEND:
- Diuretics or water pills
- Saunas for more than 30 minutes
- Laxatives for weight loss
- Spitting (ineffective and dangerous)
- Cutting more than 10% body weight
- Any method that risks kidney damage

## ALWAYS RECOMMEND:
- Consult athletic trainer or doctor if feeling unwell
- Move up a weight class if cut is dangerous
- Prioritize long-term health over making weight
`;

// ─── MAIN EXPORT ────────────────────────────────────────────────────────────

/**
 * Get the complete knowledge base as a string for system prompt injection
 */
export function getFullKnowledgeBase(): string {
  return `
# SPAR WEIGHT CUTTING PROTOCOLS - COMPLETE KNOWLEDGE BASE

${Object.entries(PROTOCOL_KNOWLEDGE)
  .filter(([key]) => key !== '5') // Skip SPAR for detailed breakdown
  .map(([key, protocol]) => {
    const proto = protocol as { name: string; description: string; schedule?: Record<string, any> };
    if (!proto.schedule) return '';
    return `
## PROTOCOL ${key}: ${proto.name}
${proto.description}

${Object.entries(proto.schedule).map(([days, info]: [string, any]) => `
### ${days === '-1' ? 'Recovery Day' : days === '0' ? 'Competition Day' : `${days} Days Out`}
- Phase: ${info.phase}
- Carbs: ${info.carbs}
- Protein: ${info.protein}
- Water: ${info.water}
- Key: ${info.key}
`).join('')}
`;
  }).join('\n---\n')}

---

${WATER_PROTOCOL}

---

${FOOD_TIMING}

---

${CALCULATION_RULES}

---

${COACHING_SCENARIOS}

---

${SAFETY_RULES}
`;
}

/**
 * Get protocol-specific knowledge for a given protocol and days out
 */
export function getRelevantKnowledge(protocol: string, daysUntilWeighIn: number): string {
  const proto = PROTOCOL_KNOWLEDGE[protocol as keyof typeof PROTOCOL_KNOWLEDGE] as { name: string; description: string; schedule?: Record<string, any> };
  if (!proto || protocol === '5' || protocol === '6' || !proto.schedule) {
    if (protocol === '6') return 'Using SPAR Competition - portion-based eating with competition water loading and auto-adjusting calorie targets based on walk-around weight.';
    return 'Using SPAR Nutrition - portion-based eating without competition cutting protocols.';
  }

  // Get the relevant phase
  let phaseKey: string;
  if (daysUntilWeighIn < 0) phaseKey = '-1';
  else if (daysUntilWeighIn === 0) phaseKey = '0';
  else if (daysUntilWeighIn === 1) phaseKey = '1';
  else if (daysUntilWeighIn === 2) phaseKey = '2';
  else if (daysUntilWeighIn >= 3 && daysUntilWeighIn <= 5) {
    // Find the right range key
    phaseKey = Object.keys(proto.schedule).find(k =>
      k.includes('-') && daysUntilWeighIn >= parseInt(k.split('-')[1]) && daysUntilWeighIn <= parseInt(k.split('-')[0])
    ) || '5-4';
  }
  else phaseKey = '6+';

  const phase = proto.schedule[phaseKey] || proto.schedule['6+'];

  return `
## Current Protocol: ${proto.name}
${proto.description}

### Today (${daysUntilWeighIn} days until weigh-in):
- Phase: ${phase?.phase || 'Unknown'}
- Carbs: ${phase?.carbs || 'Unknown'}
- Protein: ${phase?.protein || 'Unknown'}
- Water: ${phase?.water || 'Unknown'}
- Key Focus: ${phase?.key || 'Follow protocol'}

${daysUntilWeighIn <= 5 && daysUntilWeighIn >= 0 ? WATER_PROTOCOL : ''}
${daysUntilWeighIn <= 3 && daysUntilWeighIn >= 0 ? FOOD_TIMING : ''}
`;
}

/**
 * Build the full system prompt for the AI coach
 */
export function buildCoachSystemPrompt(
  athleteContext: string,
  calculatedInsights: string,
  protocol: string,
  daysUntilWeighIn: number
): string {
  const relevantKnowledge = getRelevantKnowledge(protocol, daysUntilWeighIn);

  return `You are an elite weight cutting and recovery coach for competitive wrestlers. You have deep expertise in:
- Safe, science-based weight cutting (water loading, carb manipulation, fructose/glucose timing)
- Competition day recovery (rehydration, glycogen replenishment, between-match fueling)
- Sports nutrition with precise macro timing
- Wrestling-specific performance optimization

You have access to comprehensive SPAR protocol knowledge and the athlete's personal data.

═══════════════════════════════════════════════════════════════════
PROTOCOL KNOWLEDGE
═══════════════════════════════════════════════════════════════════
${relevantKnowledge}

═══════════════════════════════════════════════════════════════════
ATHLETE CONTEXT
═══════════════════════════════════════════════════════════════════
${athleteContext}

═══════════════════════════════════════════════════════════════════
CALCULATED INSIGHTS (USE THESE NUMBERS!)
═══════════════════════════════════════════════════════════════════
${calculatedInsights}

═══════════════════════════════════════════════════════════════════
COACHING RULES
═══════════════════════════════════════════════════════════════════
1. Keep answers under 200 words — athletes need quick, actionable advice
2. BE SPECIFIC WITH NUMBERS: "drink 24 oz before 6pm" not "limit water"
3. USE THE CALCULATED INSIGHTS - they contain the athlete's actual data
4. Reference the athlete's specific phase and timing
5. For safety concerns, firmly redirect to safe alternatives and recommend consulting a doctor
6. Use bullet points for multi-step advice
7. If athlete is behind on their cut, acknowledge it and give practical catch-up advice
8. Never recommend dangerous practices (diuretics, extreme sauna, spitting)

${SAFETY_RULES}
`;
}
