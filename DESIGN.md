# SPAR Nutrition design guide

One page of rules for how the app looks and talks. Read it before changing any screen, icon or wording. The source of truth for values is `client/src/index.css`; if this page and that file disagree, fix one of them.

## Name and logo

- **App name:** SPAR Nutrition. Wordmark: "SPAR" in the text color, "NUTRITION" in brand orange.
- **Parent brand:** SPAR Life. The **SL** mark (black S, blue slash, orange L) is the SPAR Life logo and is the app's only logo. The old triangle (`spar-icon.png`) is retired: don't use it.
- **Logo files** (in `client/public/`):
  - `spar-logo.png` for in-app use (sign-in page);
  - `icon-192.png` / `icon-512.png` / `apple-touch-icon.png` for app icons, the PWA manifest and the loading screen;
  - `favicon-32.png` for browser tabs;
  - `ios/App/App/Assets.xcassets/Splash.imageset/` for the iOS launch image.
- **How to show it:** always on a white rounded tile (the mark is drawn for a white background). Sizes in use: 80px tile with `rounded-2xl p-2` on the welcome screen, 56px with `rounded-xl p-1.5` on the sign-in form.

## Color

Use the theme tokens (`bg-primary`, `text-muted-foreground`, …), not raw hex or Tailwind palette colors, so light and dark mode both work.

| Role | Token | Dark | Light |
|---|---|---|---|
| Brand orange: main actions, wordmark | `primary` | #EE5F2B | #C84414 (darker so white text passes 4.5:1) |
| Brand blue: water and hydration | `secondary` | #3366FF | #245BFF |
| Background | `background` | #0B0C14 | #FAFAFA |
| Cards | `card` | #11131D | #FFFFFF |
| Secondary text | `muted-foreground` | | |

**Status colors** mean the same thing everywhere. Never use them for decoration.

- **Green:** on track, made weight. Token `chart-5`.
- **Amber:** watch it, close to the line. Token `chart-3`.
- **Red:** over the line, not eligible, danger. Token `chart-4`.
- **Blue:** water and fluids. Token `chart-2`.

Orange is the brand color, not a warning color.

**Theme:** the app follows the phone's light or dark setting. Check every change in both.

**One exception to tokens:** the loading screen in `client/index.html` draws before the stylesheet loads, so it hard-codes #0D0F17 for the background and #E8501E for the orange. Keep those close to the dark tokens.

## Type

- **Headings, big numbers and the wordmark:** Barlow Condensed (`font-heading`), uppercase, wide tracking. `h1` to `h6` get this automatically.
- **Body text, labels and buttons:** Inter (`font-sans`).
- **Weights and other numbers that change:** add `tabular-nums` so digits don't jump.
- **Smallest size: 12px (`text-xs`).** This text is read on a phone, often after practice. Don't add new text smaller than 12px: no `text-[8px]` to `text-[11px]`. Older screens still have some, and they should be raised when those screens are touched.

## Layout and controls

- **Phone first:** design at 375px wide, then check wider.
- **Touch targets:** at least 44×44px (`h-11 w-11`) for anything tapped. Many buttons are still 36 to 40px; raise them when you touch them.
- **Corners:** `rounded-lg` for cards and inputs, `rounded-xl`/`rounded-2xl` for large panels and the logo tile, `rounded-full` for pills and avatars.
- **Safe areas:** use `pb-safe-bottom` on bottom bars so the iPhone home indicator doesn't cover them.
- **Every form field** has a visible `<label>`. Error messages use `role="alert"`. Icon-only buttons have an `aria-label`.
- **Motion:** short and calm (0.2 to 0.5s, ease-out). Animation shows a change; it doesn't decorate.

## Wording

Write the way wrestlers and coaches talk, and match TrackWrestling wherever it has a term.

| Say | Don't say |
|---|---|
| eligible weight, eligible weight class | lowest weight, minimum allowed |
| Not eligible for 125 until Nov 21 | 125 opens again Nov 21 |
| official weigh-in (tournament or dual; it counts toward the descent plan) | a bare "weigh-in" when you mean the official one |
| weigh-ins: morning, pre-practice, post-practice, before bed | logs, entries |
| weight check (a quick extra weigh that isn't counted) | weigh-in |
| descent plan | weight-loss plan, cut schedule |

- **No growth allowance.** Don't mention or calculate one.
- **Official weigh-ins are permanent.** Wording should never suggest one can be edited away.
- **Numbers carry units:** "152.4 lbs", "1.5% per week".
- **Be direct:** short sentences, tell the athlete what to do next. No hype and no emoji in coaching text.
