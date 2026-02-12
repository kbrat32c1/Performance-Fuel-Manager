# HANDOFF.md — Performance Fuel Manager (SPAR Nutrition)

> Last updated: v131b — February 2026

---

## What This App Does

**Performance Fuel Manager** (branded as **SPAR Nutrition**) is a smart nutrition and weight management platform built for **wrestlers**. It helps athletes:

- **Track daily food intake** using portion-based (SPAR slices) or gram-based (Sugar) nutrition modes
- **Manage weight cuts** through 6 evidence-based protocols tailored to competition timelines
- **Plan weekly targets** for weight, water, sodium, and macros with day-by-day forecasts
- **Get AI coaching** via Claude-powered contextual recommendations based on protocol, phase, and progress
- **Log food multiple ways** — database search, barcode scan, food photo AI, voice AI, or manual custom entry
- **Share progress with coaches** via read-only UUID-protected snapshots

The app is a **Progressive Web App (PWA)** with offline support, haptic feedback, and home screen installation.

**Tagline:** *"Fuel Right, Make Weight, Perform"*

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript 5.6, Vite 7, TailwindCSS 4, Wouter (routing), Zustand-style context store, Radix/ShadCN UI, Framer Motion, Recharts, Embla Carousel |
| **Backend** | Express 5, Node.js, TypeScript, Drizzle ORM |
| **Database** | PostgreSQL (Supabase-hosted) with Row Level Security |
| **Auth** | Supabase Auth (email/password) |
| **AI** | Anthropic Claude (claude-sonnet-4-20250514) — coaching, food photo vision, voice transcript parsing |
| **Food APIs** | FatSecret Premier (primary), Open Food Facts (barcode + search), USDA FoodData Central (fallback) |
| **Deployment** | Vercel (serverless functions + static hosting) |
| **PWA** | Service worker (network-first caching), Web App Manifest, push notifications |

---

## File Structure

```
Performance-Fuel-Manager/
│
├── client/                              # Frontend application
│   ├── src/
│   │   ├── App.tsx                      # Router — 10 routes with auth protection
│   │   ├── main.tsx                     # Entry point — React root + providers
│   │   ├── index.css                    # Global styles + Tailwind base
│   │   │
│   │   ├── pages/                       # Page-level route components
│   │   │   ├── dashboard.tsx            # Main dashboard (weight, hydration, nutrition, AI coach)
│   │   │   ├── fuel.tsx                 # Nutrition tracking (macro/slice progress, food lists, phase tips)
│   │   │   ├── food.tsx                 # FatSecret-style food diary (meal sections, daily summary)
│   │   │   ├── weekly.tsx               # Weekly planning (water loading, sodium, weight targets)
│   │   │   ├── history.tsx              # Analytics (compliance, trends, drift, personal records)
│   │   │   ├── recovery.tsx             # Post-competition recovery (rehydration, glycogen replenishment)
│   │   │   ├── onboarding.tsx           # First-time setup wizard (profile, protocol, weigh-in)
│   │   │   ├── landing.tsx              # Auth landing (login/signup)
│   │   │   ├── coach-view.tsx           # Shareable read-only coach snapshot
│   │   │   └── not-found.tsx            # 404
│   │   │
│   │   ├── components/                  # Reusable components
│   │   │   ├── add-food-flow.tsx        # FatSecret-style add food sheet (search, recent, favorites, custom)
│   │   │   ├── food-diary.tsx           # Meal-section day view (breakfast/lunch/dinner/snacks)
│   │   │   ├── food-photo-camera.tsx    # Camera capture for food photo AI
│   │   │   ├── food-photo-review.tsx    # AI photo analysis results + edit before logging
│   │   │   ├── voice-food-logger.tsx    # Speech-to-text food logging via Web Speech API + Claude
│   │   │   ├── barcode-scanner.tsx      # Native BarcodeDetector + ZXing fallback
│   │   │   ├── quick-log-fab.tsx        # Floating action button (weight/food/water tabs, ~1280 lines)
│   │   │   ├── quick-log-food-tab.tsx   # FAB food tab (quick-add pills, repeat yesterday, category tabs)
│   │   │   ├── quick-log-water-tab.tsx  # FAB water tab (wraps HydrationTracker)
│   │   │   ├── plate-builder.tsx        # Visual plate composition builder
│   │   │   ├── food-history-panel.tsx   # Recent logged foods sidebar
│   │   │   ├── copy-food-modal.tsx      # Copy yesterday's food log
│   │   │   ├── mobile-layout.tsx        # PWA layout wrapper + bottom nav (5 tabs + FAB)
│   │   │   ├── ai-coach-proactive.tsx   # Context-aware AI coaching messages
│   │   │   ├── protected-route.tsx      # Auth guard wrapper
│   │   │   │
│   │   │   ├── dashboard/              # Dashboard sub-components
│   │   │   │   ├── spar-tracker.tsx     # SPAR slice tracker (5 categories, +/- buttons, food search)
│   │   │   │   ├── macro-tracker.tsx    # Gram-based macro tracker (carbs/protein with ranges)
│   │   │   │   ├── fuel-card.tsx        # Phase summary card (phase, target, water/macro goals)
│   │   │   │   ├── hydration-tracker.tsx # Water logging (presets, progress bar)
│   │   │   │   ├── trend-chart.tsx      # Weight trend LineChart (7-14 days)
│   │   │   │   ├── week-overview.tsx    # 7-day carousel (weight + hydration + macros)
│   │   │   │   ├── cut-score-gauge.tsx  # Radial gauge (0-100 readiness score)
│   │   │   │   ├── settings-dialog.tsx  # Profile editor (weight class, protocol, weigh-in date)
│   │   │   │   ├── info-dialog.tsx      # Context help popovers
│   │   │   │   ├── fuel-guide.tsx       # Fuel guidance display
│   │   │   │   ├── protocol-switch-banner.tsx # Protocol change suggestion
│   │   │   │   ├── next-cycle-prompt.tsx     # Post-weigh-in new cycle prompt
│   │   │   │   ├── weighin-countdown.tsx     # Days/hours/minutes countdown
│   │   │   │   └── why-explanation.tsx       # Protocol science explanation
│   │   │   │
│   │   │   ├── recovery/               # Recovery-specific
│   │   │   │   ├── ai-coach.tsx         # Recovery AI coach
│   │   │   │   └── food-search.tsx      # Recovery food search
│   │   │   │
│   │   │   └── ui/                      # 50+ Radix/ShadCN primitives
│   │   │       ├── button.tsx, card.tsx, dialog.tsx, sheet.tsx, slider.tsx, ...
│   │   │       └── confetti.tsx         # Celebration animations
│   │   │
│   │   ├── lib/                         # Utilities & business logic
│   │   │   ├── store.tsx                # Global state (~1500 lines) — profiles, tracking, calculations
│   │   │   ├── constants.ts             # Weight classes, protocols, water/sodium targets, conversions
│   │   │   ├── spar-calculator-v2.ts    # SPAR portion calculator (BMR → TDEE → slice targets)
│   │   │   ├── spar-competition-adjuster.ts # Protocol 6 dynamic calorie adjustment
│   │   │   ├── cut-score.ts             # Composite readiness score (weight/recovery/protocol pillars)
│   │   │   ├── phase-helpers.ts         # Protocol phase info (name, emoji, color, food tips)
│   │   │   ├── phase-colors.ts          # Phase visual styling
│   │   │   ├── protocol-utils.ts        # Protocol configs, recommendations, science explanations
│   │   │   ├── food-data.ts             # Food database + USDA name formatting
│   │   │   ├── favorites.ts             # Favorite foods management (localStorage + Supabase)
│   │   │   ├── coach-knowledge-base.ts  # AI coaching knowledge base
│   │   │   ├── supabase.ts              # Supabase client setup
│   │   │   ├── auth.tsx                 # Auth context + hooks
│   │   │   ├── notifications.ts         # PWA push notifications
│   │   │   ├── haptics.ts               # Vibration API wrappers
│   │   │   ├── theme.tsx                # Dark/light theme context
│   │   │   └── utils.ts                 # cn() utility, formatting helpers
│   │   │
│   │   └── hooks/                       # Custom React hooks
│   │       ├── use-food-search.ts       # Parallel FatSecret + OFF search with debounce
│   │       ├── use-swipe.ts             # Touch gesture detection
│   │       ├── use-carousel-swipe.ts    # Carousel navigation via swipe
│   │       ├── use-haptics.ts           # Haptic feedback patterns
│   │       ├── use-celebrations.ts      # Confetti on milestones
│   │       ├── use-mobile.tsx           # Responsive breakpoint hook
│   │       ├── use-toast.ts             # Toast notification system
│   │       ├── use-keyboard-shortcuts.ts # Global keyboard listener
│   │       ├── use-notification-scheduler.ts # Push notification scheduling
│   │       ├── use-online-status.ts     # Online/offline detection
│   │       └── use-pull-to-refresh.ts   # Pull-to-refresh gesture
│   │
│   ├── public/
│   │   ├── sw.js                        # Service worker (network-first, offline fallback)
│   │   └── manifest.json               # PWA manifest
│   └── index.html                       # HTML entry point
│
├── server/                              # Backend (Express)
│   ├── routes.ts                        # All API endpoints (~900 lines)
│   ├── coach-knowledge.ts               # AI coach system prompt builder (~445 lines)
│   ├── index.ts                         # Express setup, Helmet, rate limiting
│   ├── storage.ts                       # In-memory user store (dev only)
│   ├── static.ts                        # Static file serving
│   └── vite.ts                          # Vite dev server integration
│
├── api/                                 # Vercel serverless functions (production)
│   ├── ai/coach.ts                      # AI coach endpoint
│   ├── foods/search.ts                  # USDA search
│   ├── foods/fatsecret-search.ts        # FatSecret search
│   ├── foods/off-search.ts              # Open Food Facts search
│   ├── foods/off-barcode.ts             # Barcode lookup
│   ├── foods/photo-analysis.ts          # Food photo AI (Claude Vision)
│   └── share/[token].ts                # Coach sharing endpoint
│
├── shared/
│   └── schema.ts                        # Drizzle ORM schema (users table)
│
├── migrations/                          # Drizzle database migrations
├── dist/                                # Build output
├── vercel.json                          # Vercel deployment config
├── vite.config.ts                       # Vite bundler config
├── drizzle.config.ts                    # ORM config
├── tsconfig.json                        # TypeScript config
└── package.json                         # Dependencies & scripts
```

---

## Key Features

### 1. Weight Protocols (6 total)

| # | Protocol | Use Case | Macro Approach |
|---|----------|----------|---------------|
| P1 | Extreme Cut | 12%+ over target, <7 days | FGF21 activation via fructose, zero-protein windows |
| P2 | Rapid Cut | Over walk-around weight | 35/40/25 ratio (C/P/F) |
| P3 | Optimal Cut | At or under walk-around | 40/35/25 ratio, moderate deficit |
| P4 | Gain Phase | Under target weight | 45/30/25 ratio, caloric surplus |
| P5 | SPAR Nutrition | General balanced eating | Portion-based (palms, fists, thumbs) |
| P6 | SPAR Competition | Competition prep with SPAR | Dynamic calorie adjustment by days to weigh-in |

### 2. Dual Nutrition Modes

- **SPAR Mode** (slice-based): Protein palms, carb fists, veg fists, fruit pieces, fat thumbs. Calculated by BMR × activity × goal.
- **Sugar Mode** (gram-based): Exact carbs/protein in grams with ranges. Uses protocol-specific macro ratios.
- Cross-sync: SPAR logs auto-convert to gram estimates and vice versa.

### 3. Food Diary (v131)

FatSecret-style interface with 4 meal sections (Breakfast, Lunch, Dinner, Snacks). Each entry shows name, time, macro contribution, and colored category dot. Supports inline edit/delete.

### 4. Multi-Method Food Entry

| Method | How It Works |
|--------|-------------|
| **Search** | Parallel FatSecret + Open Food Facts queries with serving selection |
| **Barcode** | Native BarcodeDetector API (Chrome/Safari 17+) with ZXing fallback |
| **Photo** | Camera capture → Claude Vision → JSON food extraction → review & log |
| **Voice** | Web Speech API → transcript → Claude parsing → food items logged |
| **Custom** | Manual name + carbs/protein (grams) or slice type (SPAR) |

### 5. AI Coach

Claude-powered coaching with full protocol knowledge base. Sanitized inputs prevent prompt injection. Rate-limited at 10 req/min. Context includes: athlete profile, weight trends, current phase, macro compliance, hydration status.

### 6. Cut Score (0-100)

Composite readiness metric combining:
- **Weight Pillar (60-80%)** — Projected make-weight vs target, daily loss capacity
- **Recovery Pillar (10-30%)** — Sleep, overnight drift
- **Protocol Pillar (0-20%)** — Food servings + water compliance

### 7. Weekly Planning

7-day forecast with phase-specific targets for weight, water, sodium, and macros. Water loading protocol follows research-based oz/lb scaling by days until weigh-in.

### 8. PWA

Offline-first service worker, installable on home screen, haptic feedback on mobile, pull-to-refresh, push notification scheduling.

---

## API Endpoints

| Method | Path | Purpose | Rate Limit |
|--------|------|---------|-----------|
| GET | `/api/foods/fatsecret-search` | FatSecret food search (OAuth2) | 30/min |
| GET | `/api/foods/search` | USDA FDC food search | 30/min |
| GET | `/api/foods/off-search` | Open Food Facts text search | 30/min |
| GET | `/api/foods/off-barcode` | Barcode → product lookup | 30/min |
| POST | `/api/foods/photo-analysis` | Food photo → Claude Vision → JSON | 30/min |
| POST | `/api/foods/voice-parse` | Text transcript → Claude → food items | 30/min |
| POST | `/api/ai/coach` | AI coaching query | 10/min |
| GET | `/api/share/:token` | Read-only athlete snapshot | 100/min |

**Global rate limit:** 100 req/min per IP. Security headers via Helmet. CSP policy restricts connections to approved domains.

---

## Environment Variables

```bash
# Supabase
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon_jwt]
SUPABASE_SERVICE_ROLE_KEY=[service_role_key]

# AI
ANTHROPIC_API_KEY=[required for AI coach, photo analysis, voice parse]

# Food APIs
FATSECRET_CLIENT_ID=[client_id]
FATSECRET_CLIENT_SECRET=[client_secret]
USDA_API_KEY=[optional — defaults to DEMO_KEY with 30 req/hr limit]
```

---

## Core Architecture Patterns

### State Management
Central context-based store in `store.tsx` (~1500 lines). Profile, weight logs, daily tracking, and food logs stored in Supabase with localStorage fallback for offline. All calculations (macro targets, slice targets, weekly plan, cut score, status) are derived functions within the store.

### Food Logging
Unified `FoodLogEntry` type supports both modes:
```typescript
interface FoodLogEntry {
  id: string;
  name: string;
  timestamp: string;
  mode: 'spar' | 'sugar';
  mealSection?: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  // SPAR fields
  sliceType?: 'protein' | 'carb' | 'veg' | 'fruit' | 'fat';
  sliceCount?: number;
  // Sugar fields
  macroType?: 'carbs' | 'protein';
  amount?: number;
  gramAmount?: number;
  category?: string;
  liquidOz?: number;
}
```

### Navigation
Bottom nav with 5 positions: **Today** (dashboard) | **Food** (diary) | **FAB** (quick log) | **Week** (weekly) | **Recovery**. Fuel page accessible from dashboard. History at `/history` (not in nav).

### Security
- Helmet CSP policy with approved domains
- Rate limiting per endpoint category
- AI input sanitization (removes backticks, HTML, limits length)
- UUID validation for share tokens
- Supabase RLS for data isolation

---

## Incomplete / In-Progress Items

1. **Uncommitted work** — 23 new files + 41 modified files represent the v129-v131b feature set. All functional but not yet committed to git.

2. **Duplicate food search** — The Food page (AddFoodFlow) and the FAB (embedded SparTracker/MacroTracker) both offer full food database search. The FAB should be simplified to quick-add only.

3. **Voice parse edge cases** — Fixed in v131a/b with text-block finding and `temperature: 0`, but may need further testing on unusual food descriptions.

4. **No test coverage for new features** — 46 tests exist for `constants.ts`, but no tests for food diary, cut score, SPAR calculator v2, or any v131 components.

5. **Coach sharing UX** — Backend endpoint works, but the UI flow for generating and viewing share tokens could use polish.

6. **Recovery page** — Functional with rehydration plan and timer, but lightly used and may benefit from UX attention.

---

## Recent Version History

| Version | Changes |
|---------|---------|
| **v131b** (current) | Food diary UX fixes: Tailwind class purging, portal z-index for overlays, custom food entry, meal dropdown close-on-outside-tap, voice error guards |
| **v131a** | Camera/barcode/voice portal fixes (escape Sheet z-index), voice parse API hardening (text-block finding, temperature:0) |
| **v131** | FatSecret-style food diary page, meal sections, AddFoodFlow, bottom nav restructure (Food tab replaces History) |
| **v130** | Fuel page, food photo camera/review, voice food logger, barcode scanner, favorites system |
| **v129** | Cut score engine, protocol utils, phase helpers, SPAR competition adjuster, fuel tanks |

---

## Development Commands

```bash
npm run dev          # Start dev server (client + backend, port 5000)
npm run build        # Production build (Vite + custom script)
npm start            # Start production server
npx tsc --noEmit     # TypeScript type check
npx vercel --prod    # Deploy to Vercel production
```

---

## Key File Quick Reference

| What you need | Where to look |
|---------------|--------------|
| App routes | `client/src/App.tsx` |
| Global state & calculations | `client/src/lib/store.tsx` |
| Protocol definitions & constants | `client/src/lib/constants.ts` |
| SPAR portion calculator | `client/src/lib/spar-calculator-v2.ts` |
| Cut score algorithm | `client/src/lib/cut-score.ts` |
| Phase logic (names, colors, tips) | `client/src/lib/phase-helpers.ts` |
| Food diary component | `client/src/components/food-diary.tsx` |
| Add food flow | `client/src/components/add-food-flow.tsx` |
| FAB (quick logging) | `client/src/components/quick-log-fab.tsx` |
| Bottom navigation | `client/src/components/mobile-layout.tsx` |
| API endpoints | `server/routes.ts` |
| AI coach system prompt | `server/coach-knowledge.ts` |
| Vercel deployment config | `vercel.json` |
| Service worker | `client/public/sw.js` |
