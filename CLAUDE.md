# Performance-Fuel-Manager (SPAR Nutrition)

## Overview

Progressive Web App for wrestlers to manage weight cutting, nutrition, and performance. Branded as "SPAR Nutrition — Fuel Right, Make Weight, Perform."

**Live site:** https://performance-fuel-manager.vercel.app — Vercel deploys `main` to production on every push (GitHub integration). Other branches get preview deploys, which fail until the Preview environment has env vars. Rollback: promote an earlier deployment in Vercel.
**GitHub:** kbrat32c1/Performance-Fuel-Manager
**Database:** Supabase PostgreSQL (xcqsnrqjghcxuotoaryv.supabase.co)

**Design and wording rules:** see [DESIGN.md](DESIGN.md) before changing any screen, logo or user-facing text.

## Mission, goals and evidence rules (Kevin's discussion, 2026-11-08)

**Mission:** Help wrestlers understand and manage weight while fueling training, protecting health and performance, and recovering for competition and the next training week. Success means more than reaching the number on the scale. Preserve the original coaching intent while making unsupported claims and software inconsistencies explicit.

### Product goals

1. **Educate first.** Explain water, glycogen and its associated water, gut content, body fat and muscle as contributors to scale weight. Explain the costs and consequences of losing each, how restoration differs, and why the available recovery time before competition matters. A scale does not measure these compartments separately.
2. **Learn the athlete's own patterns.** Use comparable morning, bedtime, pre/post-practice and workout readings to show overnight change, practice change and daytime drift. Distinguish observations, estimates and predictions; show sample counts and missing data. A measured gain must not become an assumed loss. Patterns inform decisions, not promises of future weight loss or permission to dehydrate.
3. **Make food tracking practical.** Preserve Simple As Pie's quick portions and recommended food list alongside optional detailed macro/calorie tracking. Kevin's working preference is cooked/ready-to-eat food portions; verify the original spreadsheet and food database rather than assuming every historical entry follows that convention. Approximate exchanges are not exact nutrition equivalence.
4. **Support distinct eating approaches.** Kevin adapted Joe Binley's *Fueled To Thrive* and his/others' experience into sugar-focused and hybrid options, while also wanting conventional macro recommendations. "More to lose means more sugar fasting" is an intended coaching hypothesis requiring evidence review, not an established clinical dose-response rule.
5. **Cover the whole cycle.** Planning and daily fueling, competition preparation, post-weigh-in and between-match fueling, post-competition recovery, then readiness for the next training week. Account for the actual interval from weigh-in to wrestling and repeated weekly cycles. Preserve existing recovery/next-cycle functionality; verify gaps instead of declaring it absent.
6. **Performance before dehydration.** Kevin considers dehydration a last resort and excessive dehydration a performance killer. His document describes reverse water loading as optional when needed, not an automatic part of every plan. A class-based reference, NCAA eligibility floor, auto walk-around number, observed weight and approved target must have distinct labels. None alone establishes that a cut is safe or that the athlete is "on track."
7. **Useful, athletic design.** Follow DESIGN.md. Retain the WHOOP-inspired information-rich character, but prioritize the next useful action and reveal supporting detail progressively. Do not equate clarity with deleting meaningful information or treat an unapproved mockup as the final design.

### Sources and unresolved decisions

- **Original Simple As Pie spreadsheet and guide:** intended portion framework, food list and baseline calculations. Audit formulas, serving sizes, raw/cooked conventions and references before changing conversions.
- **FGF21_Sugar_System_FINAL_13 DOCX/PDF:** strongest candidate for Kevin's consolidated wrestling plan, not automatic proof that every sentence is final or clinically established. Reconcile internal contradictions with Kevin; preserve provenance.
- **Earlier Weight Cutting System / six-protocol drafts and original notes:** historical development, including conflicting alternatives. A draft's protocol numbering may not match the app's six protocols.
- **Joe Binley's Fueled To Thrive v3 PDF:** source inspiration, not independent proof. Compare the actual text and identify what Kevin adapted; do not attribute the app's water/sodium schedule to it without a passage.
- **Current code, git history and dated reviews:** evidence of what the app does or changed, not evidence that the behavior is correct. `docs/vision-gap-review.md`, if present, is a dated audit to recheck against the current commit, not a permanent list of live bugs.
- Keep **user intent, documentary fidelity, research support, sports-rule compliance and individual clinical suitability separate**. Never silently convert an unresolved number into an approved rule.

### Research still required

Maintain a claim-by-claim evidence register: exact claim/number, source and page or DOI, population, intervention, outcome, limitations, app locations, decision owner and status. Distinguish human trials, mechanisms, animal work and coaching experience. An FGF21 biomarker change does not establish fat loss, muscle protection or wrestling performance.

Priority questions:
- Sugar fasting/low protein: athlete-specific effects on body composition, muscle retention, training, recovery and repeated weekly use; collagen/leucine versus adequate complete protein; whether isoleucine claims justify restriction.
- Water and sodium: the exact reverse-loading schedule, distilled-water claim, defaults and applicability; dehydration, overhydration and electrolyte risks; short weigh-in recovery windows. Do not label all scale loss as water loss.
- Glycogen/gut-content manipulation: actual restoration times, variability and the evidence for fixed recovery percentages or promises of full power after weigh-in.
- Baseline nutrition and portions: calorie/macro assumptions, food-list serving equivalence, cooked/raw units and consistent conversions across manual/search/barcode/photo/voice entry.
- Competition and next-week recovery: reconcile protein timing, fluid estimates and sufficient recovery rather than merely replacing scale weight. Assess low energy availability and cumulative weekly strain.
- NCAA/NWCA attribution: cite the exact current rule and distinguish eligibility rules from physiological safety claims.

Start with ACSM's weight-category consensus (PMID 33790193), the specific water-loading trial cited in the app (PMID 29182412), and current NCAA/AIS guidance; verify the full evidence and its applicability rather than treating a citation as endorsement of this entire protocol. Qualified sports-dietitian and sports-medicine review of the combined athlete-facing guidance remains necessary; a code audit is not clinical clearance.

### Change and verification discipline

- Make existing behavior accurate and consistent before adding features. This documentation update does not authorize changing protocol numbers, application code, databases, publishing or deployment.
- Do not silently alter nutrition, fluid, sodium, weight, duration or recovery rules during refactoring. Record the old/new value, source, rationale and Kevin's decision; obtain appropriate clinical review where needed. Disclose unsourced values plainly.
- Prioritize review of restrictive food/extra-exercise commands, last-minute Extreme Cut escalation, water-off behavior, protocol-specific food guidance and production AI guardrails. Verify current code and live deployment before claiming these are still present or fixed.
- Use one consistent approved calculation across dashboard, weekly plan, Fuel, food guide, recovery and AI. Lack of reliable data must not produce a confident prescription. Do not let AI invent or override targets.
- Test the full athlete week in an authorized isolated account: both tracking modes; each relevant protocol; no/sparse/stale data; different weigh-in timing; water on/off; create/edit/delete/repeat and reload; competition and recovery. Distinguish local tests from live tests and actual WHOOP data from fixtures. Preserve real athlete data and label synthetic entries.
- Report passed, failed, blocked and untested flows separately. Preserve concurrent work and do not commit, push, merge or deploy without authorization.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + Radix/ShadCN UI
- **Backend:** Express 5 + Node.js (also Vercel serverless functions)
- **Database:** Supabase PostgreSQL with Row Level Security
- **Auth:** Supabase Auth (email/password + Google OAuth)
- **AI:** Claude Sonnet 4 (coaching, food photo analysis, voice parsing)
- **Food APIs:** FatSecret (primary), Open Food Facts (barcode + search), USDA FDC (fallback)
- **Charts:** Recharts
- **Native:** Capacitor 8 (iOS with HealthKit integration in progress)
- **PWA:** Service worker with network-first caching

## Project Structure

```
Performance-Fuel-Manager/
├── client/src/
│   ├── App.tsx              # Router (10 routes + auth)
│   ├── pages/               # Route pages
│   ├── components/          # UI components + feature components
│   │   ├── dashboard/       # Dashboard sub-components
│   │   ├── recovery/        # Recovery components
│   │   └── ui/              # 50+ Radix/ShadCN primitives
│   ├── lib/                 # Business logic
│   │   ├── store.tsx        # Central state (~1500 lines)
│   │   ├── constants.ts     # Weight classes, protocols, targets
│   │   ├── spar-calculator-v2.ts    # BMR → TDEE → slice targets
│   │   ├── spar-competition-adjuster.ts # Dynamic calories by days-to-weigh-in
│   │   ├── cut-score.ts     # Readiness score (0-100)
│   │   ├── phase-helpers.ts # Phase names, colors, tips
│   │   ├── protocol-utils.ts # Protocol configs & science
│   │   ├── food-data.ts     # Food database + USDA formatting
│   │   ├── coach-knowledge-base.ts # AI coaching knowledge
│   │   ├── supabase.ts      # Supabase client
│   │   └── auth.tsx         # Auth context + hooks
│   └── hooks/               # Custom React hooks
├── server/
│   ├── index.ts             # Express setup
│   ├── routes.ts            # API endpoints (~900 lines)
│   └── coach-knowledge.ts   # AI coach system prompt
├── api/                     # Vercel serverless functions
│   ├── ai/coach.ts
│   ├── foods/               # search, barcode, photo, voice endpoints
│   └── share/[token].ts     # Coach sharing
├── shared/schema.ts         # Drizzle ORM schema
├── ios/                     # Capacitor iOS app
└── supabase-*-migration.sql # Database migrations
```

## Nutrition approaches and tracking are separate choices

The six protocol names are Extreme Cut, Rapid Cut, Optimal Cut, Gain Phase, SPAR Nutrition and SPAR Competition. Read the current implementation and Kevin's latest explicit decisions before describing their eligibility, duration or targets. The former table here (including "12%+ over, <7 days" for Extreme Cut and fixed macro splits) was stale and must not be restored as a specification. Current selection code describes Extreme Cut as a supervised preseason option, not a last-minute response to one high weigh-in. Selection, execution, guide text and AI coaching must agree.

**Eating approach:** Kevin intends both his sugar-focused/hybrid approaches and a conventional balanced macro approach with baseline recommendations. These are not the same thing as choosing a display unit.

**Tracking method:** Settings → Nutrition Tracking offers **Slices** and **Grams**. Slices preserves fast manual portion logging without food searches. Search, barcode, photo, voice, recent foods and repeat-yesterday are additional entry methods. Grams is not synonymous with a sugar diet. Changing the display must not reinterpret or rewrite old entries. Do not claim full MyFitnessPal-style calorie/fat tracking until saved fields and totals have been verified; an estimated manual portion cannot become an exact calorie measurement merely by changing modes.

## Key Algorithms

### SPAR Calculator v2 (spar-calculator-v2.ts)
BMR (Mifflin-St Jeor) → TDEE (activity multiplier) → protocol adjustment → macro split → slice conversion

### Cut Score (cut-score.ts)
Composite readiness metric (0-100):
- Weight pillar (60-80%): projected make-weight vs target
- Recovery pillar (10-30%): sleep, overnight drift, HR zones
- Protocol pillar (0-20%): food/water compliance
- Dynamically weighted based on available data

### Competition Adjuster (spar-competition-adjuster.ts)
Daily calorie adjustment based on days-to-weigh-in (higher early, aggressive closer)

## Food Entry Methods

| Method | Tech |
|--------|------|
| Search | FatSecret + Open Food Facts in parallel |
| Barcode | Native BarcodeDetector + ZXing fallback |
| Photo | Capacitor Camera + Claude Vision API |
| Voice | Web Speech API + Claude text parsing |
| Custom | Manual form entry |

## Pages/Routes

| Route | Page |
|-------|------|
| `/` | Dashboard (weight, hydration, nutrition, AI coach) |
| `/fuel` | Protocol-specific nutrition guidance |
| `/food` | Food diary + logging (FatSecret-style) |
| `/weekly` | 7-day plan with water/sodium targets |
| `/history` | Analytics (compliance, trends, drifts) |
| `/recovery` | Post-competition rehydration plan |
| `/onboarding` | First-time setup wizard |
| `/landing` | Auth page (login/signup) |
| `/coach-view` | Read-only coach snapshot (shared) |
| `/reports` | Advanced analytics |

## API Endpoints

| Endpoint | Purpose | Rate Limit |
|----------|---------|-----------|
| `GET /api/foods/fatsecret-search` | FatSecret food search | 30/min |
| `GET /api/foods/off-search` | Open Food Facts search | 30/min |
| `GET /api/foods/off-barcode` | Barcode lookup | 30/min |
| `GET /api/foods/search` | USDA FDC search | 30/min |
| `POST /api/foods/photo-analysis` | Food photo → Claude Vision | 30/min |
| `POST /api/foods/voice-parse` | Voice transcript → Claude | 30/min |
| `POST /api/ai/coach` | AI coaching response | 10/min |
| `GET /api/share/:token` | Coach sharing snapshot | 100/min |

## Database (Supabase)

**Key tables:**
- `profiles` — user settings (weight, protocol, activity level, weigh-in date)
- `weight_logs` — morning/evening/post-practice weigh-ins
- `daily_tracking` — food logs, water logs, weigh-ins (JSONB)
- `user_foods` — favorites (food_id, name, macros, usage count)
- `health_data` — sleep, overnight drift, HR zones, TRIMP strain

All tables have RLS policies filtering by auth.uid() = user_id.

## Environment Variables

```
VITE_SUPABASE_URL=https://xcqsnrqjghcxuotoaryv.supabase.co
VITE_SUPABASE_ANON_KEY=[jwt_token]
SUPABASE_SERVICE_ROLE_KEY=[server_only]
ANTHROPIC_API_KEY=[for AI features]
FATSECRET_CLIENT_ID=[client_id]
FATSECRET_CLIENT_SECRET=[client_secret]
```

## Development

```bash
npm install
npm run dev          # Client + server (port 5000)
npm run build        # Production build
npm test             # Run tests (Vitest)
npm run db:push      # Push Drizzle migrations
npm run ios:sync     # Sync Capacitor iOS
```

## Key State Management

Central store at `client/src/lib/store.tsx` (~1500 lines):
- Profile, weights, food logs, calculations
- localStorage fallback + Supabase sync
- Context-based with Zustand-style patterns

## Security

- Supabase RLS on all tables
- Rate limiting per endpoint + global (100/min)
- AI input sanitization (no backticks, HTML, 500 char limit)
- Helmet CSP headers
- Service role key server-side only

## Current Version

v131b with ongoing feature work. Recent focus: food diary UX, barcode scanner, service worker updates, food persistence fixes.
