# Budojo — Client CLAUDE.md

This file is loaded by Claude Code when you (or an agent) work under `client/`. It **extends** the root `CLAUDE.md` — read both. Anything written here takes precedence over the root file for frontend work.

## Scope

Applies to every file under:
- `client/src/**` — Angular SPA source
- `client/cypress/**` — E2E tests
- `client/angular.json`, `client/package.json`, `client/tsconfig*.json`, `client/eslint.config.js`

> **Note for Claude:** The developer is BE-focused and learning the FE stack. Always explain Angular/TypeScript decisions clearly, suggest the simplest PrimeNG component that fits the use case, and avoid over-engineering.

---

## Design canon — the frontend shared vocabulary

This SPA is judged by four shared references. When a reviewer (human or Copilot) cites one of these by name, the citation is a valid argument on its own. Pushback requires a specific pragmatic reason, never taste.

| Source | What we take from it |
|--------|----------------------|
| **[Material Design 3](https://m3.material.io/)** | Visual system — spacing (8dp grid), elevation, color roles, motion curves, accessibility (contrast, touch targets ≥ 48dp) |
| **Don't Make Me Think** — Steve Krug | Self-evident UI — if the user has to think about what a button does, you failed |
| **The Design of Everyday Things** — Donald Norman | Affordances, signifiers, feedback, constraints, mapping — the psychology of "does this thing look like what it does?" |
| **[Laws of UX](https://lawsofux.com/)** — Jon Yablonski | Hick's, Miller's, Jakob's, Fitts's and friends — quantitative cognitive rules we honour, not vibes |

### Material Design 3 — how we apply it

Budojo's UI runs on **PrimeNG 21 with the Material preset**. MD3 is our **design philosophy**; PrimeNG-Material is the concrete implementation.

- **8dp baseline grid.** Every spacing value is a multiple of `0.5rem` (8px). Don't invent `0.75rem` or `13px` — pick `0.5rem` / `1rem` / `1.5rem` / `2rem`.
- **Color roles over raw colors.** Use PrimeNG theme tokens (`var(--p-primary-color)`, `var(--p-surface-*)`, etc.) — never hex/rgb in component SCSS unless the token truly doesn't exist.
- **Elevation for hierarchy.** Cards use `var(--p-content-border-color)` + subtle shadow; floating surfaces (dialogs, popovers) carry a deeper shadow. Don't stack > 3 elevation levels on one screen.
- **Motion budget.** MD3's "easing standard" (cubic-bezier 0.2, 0, 0, 1) for ~200–300ms. No 1-second animations, no springs, no bounce.
- **Accessibility baseline.** Touch target ≥ 48×48 CSS pixels (Laws of UX Fitts). Contrast ratio ≥ 4.5:1 for text. Never rely on color alone — pair with icon or text.

### Design system — Apple-minimal override layer

The MD3 philosophy above is the *why*; `docs/design/DESIGN_SYSTEM.md` is the *what*. It's an Apple HIG / iOS 17+ override layer on the PrimeNG Material preset — near-monochrome palette + one indigo accent (`--p-primary-500: #5b6cff`), hairline borders, max two elevation levels, 12/16/24 px radii, 160/240/360 ms motion on a decelerate cubic-bezier.

Mandatory reads before any new component or screen:

- **[`docs/design/DESIGN_SYSTEM.md`](../docs/design/DESIGN_SYSTEM.md)** — full token inventory, per-component override specs for 13 PrimeNG atoms, PWA gotchas.
- **[`docs/design/README.md`](../docs/design/README.md)** — content voice (sentence-case, second-person, no emoji in UI, `·` as separator), iconography (`pi pi-*` only — no SF Symbols, no custom SVG), palette + casing rules.

Wiring:

- Tokens live in `client/src/styles/budojo-theme.scss` and are imported last from `client/src/styles.scss` so they win against the Material preset defaults.
- **Variant matrix lives in `client/src/styles/budojo-variants.scss`** and is imported *after* the theme. This is where the button / tag / form field / card variants are locked — when you need to pick a button variant or a tag variant, the matrix is the authoritative source. Static HTML previews under [`docs/design/preview/`](../docs/design/preview/README.md).
- PrimeNG is wrapped in a `@layer primeng` via `providePrimeNG({ theme: { options: { cssLayer: { name: 'primeng' } } } })`. This is the *only* reliable way to make our `:root` overrides win the cascade — see `.claude/gotchas.md` § Design system / PrimeNG precedence.
- Inter is loaded via `@fontsource/inter` (weights 400/500/600/700).
- Dark mode: `.dark` class on `<html>`, matches `providePrimeNG({ theme: { options: { darkModeSelector: '.dark' } } })`.

Hard rules, on top of the MD3 bullets above:

- **Never use raw hex in component SCSS.** Use `var(--p-*)` tokens or the `--budojo-*` semantics. Exceptions are belt colors (domain palette) with a rationale comment — canon § gotchas.
- **Do not restyle PrimeNG internals from component SCSS.** Override via CSS custom properties; use `::ng-deep` only when a token truly doesn't exist AND the pattern is already documented in `DESIGN_SYSTEM.md`. The *global* override layer (`client/src/styles/budojo-theme.scss`) is the **sanctioned exception**: it's allowed to touch selectors like `.p-button` / `.p-dialog` when token overrides alone can't express the behavior (e.g. killing Material box-shadow, mobile bottom-sheet transform). Every selector there carries a one-line comment explaining why a token isn't enough. Component SCSS never does this.
- **Motion uses the `--budojo-motion-*` tokens**, not hand-picked `200ms ease-out`. Three durations, one curve.
- **Sentence-case everything.** Buttons, headers, tags. No title-case, no uppercase — except eyebrow labels (`EXPIRING SOON`, `letter-spacing: 0.06em`). If you find yourself writing `text-transform: uppercase` elsewhere, you're off-canon.

### Don't Make Me Think — operational rules

Krug's three laws, translated:

1. **Self-evidence first.** A button's label tells me exactly what happens when I click it. Not "Save" when it also sends a notification — "Save & notify". Not "Proceed" — "Create athlete".
2. **Forgiveness for mistakes.** Destructive actions always ask for confirmation (`p-confirmpopup`). Undo is better than confirm when feasible (toast with "Undo" link).
3. **Reduce cognitive load.** Never more than one primary CTA per view. Hide secondary actions in menus/overflow once they exceed 3.

### Norman's laws — affordances and feedback

1. **Affordance.** A link looks like a link (underline on hover or blue). A button looks like a button (filled background + shadow + pointer cursor). An input looks editable (border + padding + cursor). An icon-only button is NEVER an affordance — it must carry a tooltip (`pTooltip`).
2. **Signifier.** The `disabled` state is visually obvious (opacity ≤ 0.5 + not-allowed cursor). A loading state shows a spinner AND disables the control.
3. **Feedback.** Every user action must produce feedback within **300ms**. A submit button shows `loading` (spinner) immediately on click. Long-running operations (> 1s) use a skeleton or progress bar.
4. **Constraints.** If an action is forbidden in the current state, disable it — don't let the user click and receive an error. A `p-button` with `[disabled]="form.invalid"` is always better than a 422 alert.

### Laws of UX — quantitative rules

| Law | Rule for Budojo |
|-----|-----------------|
| **Hick's Law** | Don't show more than 5 top-level options in a menu at once. If you have 7, group. If you have 12, add search. |
| **Miller's Law** | Chunk lists into groups of 5–9. Athletes paginated at 20/page is fine because the user scans, not memorizes. A settings form with 15 flat fields needs sections. |
| **Jakob's Law** | Users expect Budojo to behave like every other web app. Login button top-right. Logo top-left = home. Back button always bottom-left of breadcrumb. Don't reinvent. |
| **Fitts's Law** | Primary CTAs are big (height ≥ 40px) and reachable (corners and centered positions). Close-X buttons top-right of a dialog minimum 32×32 with 8px padding. |
| **Aesthetic-Usability effect** | A polished UI is forgiven for minor flaws; a rough UI makes every flaw feel worse. Invest in spacing and alignment — the cheapest perceived-quality lift. |
| **Doherty Threshold** | 400ms is the threshold above which users perceive delay. Optimistic UI (update local state before server confirms) for `DELETE` and `PUT` where rollback is cheap. |

### Mobile-first is the default

The primary form factor for Budojo is the phone: the instructor moves around the mat with the device in hand (check-in, look up athlete, scan a document expiring). Desktop is the **secondary** layout, not the default. Every new component, screen, and layout decision starts from the mobile viewport and scales **up**.

**Breakpoint tokens** — these are the only breakpoints we use. Don't invent new ones without adding them here first.

| Token | Pixel | Meaning |
|-------|-------|---------|
| — | < 768px | Mobile (default). Topbar + off-canvas drawer, single-column, full-bleed cards. |
| `768px` | tablet / small desktop | Sidebar shell appears, multi-column grids can emerge. |
| `1024px` | desktop | Full two-column dashboard, wider dialogs, more horizontal nav. |
| `1440px` | wide desktop | Max-width content, no further scaling. |

**Rules:**

- **Base styles are mobile.** Write the mobile layout first; add `@media (min-width: <token>)` blocks to scale up. Never the inverse (don't write desktop and then `@media (max-width: …)` down).
- **Touch targets ≥ 48 × 48 CSS px** for any primary CTA, nav link, icon button. Bigger where ambient noise or thumb reach demands it (bottom of screen, corners per Fitts).
- **Dialogs** (`p-dialog`) use `[breakpoints]="{ '768px': '92vw' }"` so they never overflow on mobile.
- **Tables** (`p-table`) either wrap in a scrollable container (horizontal scroll acceptable with visual cue) or collapse to a card layout below 768px. The choice is per-feature; attendance, list-heavy views prefer cards.
- **Sidebar / drawer behavior.** The dashboard shell renders a **mobile topbar + off-canvas drawer** below 768px and a **static sidebar** at or above it. See `DashboardComponent` as the reference implementation.
- **Viewport units**: prefer `100dvh` over `100vh` for full-height layouts so iOS Safari's dynamic viewport doesn't cut off the bottom. Fall back to `100vh` as progressive enhancement.
- **Safe area**: honour `env(safe-area-inset-*)` on any pinned UI (topbar, bottom nav) when iOS notches become relevant. For now the topbar is fine without it because it isn't sticky to the very edge.
- **Gesture-based interactions** (swipe-to-delete, pull-to-refresh) are *not* the default — they're added only where the business flow genuinely benefits (e.g. M4 attendance check-in). Otherwise plain taps + buttons.

### PWA scaffold

The app is installable as a PWA. Key files:

- `client/public/manifest.webmanifest` — name, icons, theme, `start_url: /dashboard/athletes`, `display: standalone`
- `client/public/icons/` — `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`
- `client/ngsw-config.json` — Angular Service Worker cache strategy: app shell `prefetch`, `/api/v1/**` `freshness` (3s network timeout, 1h max age)
- `client/src/index.html` — `<link rel="manifest">`, `<meta name="theme-color">`, iOS-specific meta (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`)
- `client/src/app/app.config.ts` — `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })`

**Don't** register a new service worker file or bypass the Angular builder — `ngsw-worker.js` is generated at build time from `ngsw-config.json`.

### Red flags in code review

A reviewer should push back when they see:

- Raw hex colors / `rgb()` in component SCSS (use theme tokens)
- A spacing not on the 8dp grid (e.g. `13px`, `0.9rem`)
- An icon-only button without `pTooltip` or `ariaLabel`
- A form without a clear submit button (floating "Ok" in the corner, arcane layout)
- A destructive action (`DELETE`) without confirmation
- More than one primary CTA (`[severity]="'primary'"` filled) per view
- A `loading` state that's not reflected in the UI (user clicks, nothing happens for 2s, then redirect)
- Inline styles (`style="..."`) instead of a component scss file
- A Material Design rule or Law-of-UX cited in review that was dismissed with "I prefer it this way"
- **A new component with a `max-width: 1024px`-style hard cap that doesn't also have a mobile-first base rule**
- **A `p-dialog` with a fixed `width` and no `[breakpoints]` for mobile**
- **A custom breakpoint value that isn't one of `768 / 1024 / 1440`**

---

## Client structure conventions

```
client/src/app/
├── core/
│   ├── guards/        # Route guards (authGuard, hasAcademyGuard, noAcademyGuard)
│   ├── interceptors/  # HTTP interceptors (functional — authInterceptor)
│   └── services/      # AuthService, AcademyService, AthleteService, DocumentService — HTTP only here
├── features/
│   ├── auth/          # Login, Register pages
│   ├── academy/       # Setup page
│   ├── athletes/      # List, Form, Detail pages
│   └── dashboard/     # Layout shell (sidebar + router-outlet)
└── shared/
    └── components/    # BeltBadge, ExpiryStatusBadge, and other reusable presentational components
```

- Feature folders under `src/app/features/<feature>/`
- HTTP calls only in `*.service.ts` — never inside components
- Components use **OnPush** change detection by default
- State via **Angular Signals** — no NgRx unless complexity genuinely demands it
- Standalone components only (no NgModules)
- **Functional** interceptors and guards (Angular 15+ style) — the `authInterceptor` is exported as a `HttpInterceptorFn`, NOT a class

---

## UI — PrimeNG 21 with the Material preset

All UI components come from **PrimeNG 21**. Theme preset is **Material** (from `@primeuix/themes/material`), configured in `client/src/app/app.config.ts`:

```typescript
import Material from '@primeuix/themes/material';

providePrimeNG({
  theme: {
    preset: Material,
    options: { darkModeSelector: '.dark' },
  },
});
```

- Before building a custom component, check `https://primeng.org/` for an existing one. 9 times out of 10 there is one.
- Use PrimeFlex for layout utilities.
- Follow PrimeNG's theming system; no inline styles.
- When a PrimeNG component doesn't exist for your case, the fallback is a plain HTML/SCSS component under `shared/components/` — still using theme tokens (`var(--p-*)`), never raw hex.

---

## Testing — Vitest 4 (unit) + Cypress 13 (E2E)

### Unit tests (Vitest)

```bash
cd client
npm test -- --watch=false       # single run
npm test                        # watch mode
```

- Test components, services, and guards in isolation.
- Mock `HttpClient` with `provideHttpClientTesting()`.
- Config: Angular's `@angular/build:unit-test` builder (see `client/angular.json`), TypeScript settings in `client/tsconfig.spec.json` (`"types": ["vitest/globals"]`), npm scripts in `client/package.json`. There is no standalone `vitest.config.ts` — the Angular builder wires Vitest up for us.

### E2E tests (Cypress)

```bash
cd client
npm run cy:open                 # interactive mode (requires ng serve running)
npm run cy:run                  # headless run (CI mode, requires ng serve running)
```

**Rules:**
- **Always mock every HTTP call** with `cy.intercept()` — E2E tests must not depend on a live backend.
- Use `cy.visitAuthenticated(url)` (custom command in `cypress/support/commands.ts`) to pre-seed `auth_token` in localStorage before Angular boots, satisfying the `authGuard`.
- When the **same endpoint is called multiple times in a test** (e.g. `GET /api/v1/academy` fires once for `noAcademyGuard` on page load and again for `hasAcademyGuard` after a redirect), use `times: 1` in the `beforeEach` intercept and add a second intercept in the specific test for the post-action call.
- Specs live in `cypress/e2e/*.cy.ts`; config in `cypress.config.ts`.

---

## What Claude Should Always Do — client-specific

(These complement the general rules in root `CLAUDE.md`.)

- **Suggest a PrimeNG component by name** when building any UI element. Check [primeng.org](https://primeng.org/) before rolling custom.
- **Explain FE decisions** in plain terms (the developer is BE-focused).
- **Write code under the design canon.** Material Design 3, Don't Make Me Think, Norman, Laws of UX — a citation by a reviewer is a valid critique on its own. Push back only with a specific pragmatic reason, never with taste.
- **Components are OnPush by default.** No exceptions without a comment explaining why.
- **State via signals.** Don't reach for `BehaviorSubject` where a `signal()` works.
- **Reactive Forms, not template-driven.** For anything beyond a two-field filter.
- **Before pushing Angular changes:** `npx prettier --write "src/**/*.{ts,html,scss}"` → `npm run lint` → `npm test -- --watch=false`. All three must be clean. Cypress runs in CI.
- **Keep `docs/api/v1.yaml` in sync** if you change how the SPA consumes the API (e.g. new query param). See root `CLAUDE.md` § Documentation discipline.
