# Performance-Fuel-Manager (SPAR Nutrition)

## Overview

Progressive Web App for wrestlers to manage weight cutting, nutrition, and performance. Branded as "SPAR Nutrition — Fuel Right, Make Weight, Perform."

**Live site:** Deployed on Vercel
**GitHub:** kbrat32c1/Performance-Fuel-Manager
**Database:** Supabase PostgreSQL (xcqsnrqjghcxuotoaryv.supabase.co)

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

## 6 Weight-Cutting Protocols

| # | Protocol | Use Case | Macro Split |
|---|----------|----------|-------------|
| 1 | Extreme Cut | 12%+ over, <7 days | Fructose only, zero protein (FGF21 activation) |
| 2 | Rapid Cut | Over walk-around | 35C/40P/25F |
| 3 | Optimal Cut | At/under walk-around | 40C/35P/25F |
| 4 | Gain Phase | Under target | 45C/30P/25F (surplus) |
| 5 | SPAR Nutrition | General balanced | Portion-based slices |
| 6 | SPAR Competition | Competition prep | SPAR slices + dynamic calorie adjustment |

## Dual Nutrition Modes

**SPAR Mode (Portion-Based):**
- Protein = palms, Carbs = fists, Vegetables = fists, Fruit = pieces, Fat = thumbs
- BMR × activity multiplier × goal = total slices

**Sugar Mode (Gram-Based):**
- Exact carb/protein targets in grams using protocol-specific ratios

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
