# Budojo — Client CLAUDE.md

Loaded by Claude Code when you (or an agent) work under `client/`. **Extends** the root `CLAUDE.md` — read both. Anything here takes precedence for frontend work.

## Scope

Applies to every file under:

- `client/src/**` — Angular SPA source
- `client/cypress/**` — E2E tests
- `client/angular.json`, `client/package.json`, `client/tsconfig*.json`, `client/eslint.config.js`

> **Note for Claude:** The developer is BE-focused and learning the FE stack. Explain Angular/TypeScript decisions clearly, suggest the simplest PrimeNG component that fits, avoid over-engineering.

---

## Design canon — the frontend shared vocabulary

The SPA is judged against four shared references. When a reviewer cites one by name, the citation is a valid critique on its own. Push back only with a specific pragmatic reason, never with taste.

| Source | What we take from it |
|--------|----------------------|
| **[Material Design 3](https://m3.material.io/)** | Visual system — spacing (8dp grid), elevation, color roles, motion curves, accessibility (contrast, touch targets ≥ 48dp) |
| **Don't Make Me Think** — Steve Krug | Self-evident UI — if the user has to think about what a button does, you failed |
| **The Design of Everyday Things** — Donald Norman | Affordances, signifiers, feedback, constraints, mapping |
| **[Laws of UX](https://lawsofux.com/)** — Jon Yablonski | Hick's, Miller's, Jakob's, Fitts's — quantitative cognitive rules, not vibes |

Full per-source operational rules (e.g. Krug's three laws, Norman's affordance/feedback/constraints set, the LoUX table) live in [`docs/design/DESIGN_SYSTEM.md`](../docs/design/DESIGN_SYSTEM.md). The hard rules below are the load-bearing subset.

### Hard visual rules

- **8dp baseline grid.** Spacing is a multiple of `0.5rem` (8 px). No `0.75rem`, no `13px` — pick `0.5rem` / `1rem` / `1.5rem` / `2rem`.
- **Color roles, never raw hex** in component SCSS. Use PrimeNG tokens (`var(--p-primary-color)`, `var(--p-surface-*)`) or the `--budojo-*` semantics. Exceptions are belt colors (domain palette) with a one-line comment.
- **Sentence-case everything.** Buttons, headers, tags. No title-case, no uppercase — except eyebrow labels (`EXPIRING SOON`, `letter-spacing: 0.06em`).
- **Don't restyle PrimeNG internals from component SCSS.** Override via CSS custom properties; `::ng-deep` only when a token truly doesn't exist AND the pattern is already documented in `DESIGN_SYSTEM.md`. The global override layer (`client/src/styles/budojo-theme.scss`) is the sanctioned exception — its selectors carry a one-line comment explaining why a token isn't enough.
- **Motion uses `--budojo-motion-*` tokens**, not hand-picked `200ms ease-out`. Three durations, one curve (`cubic-bezier(0.2, 0, 0, 1)`).
- **Touch target ≥ 48 × 48 CSS px** for any primary CTA, nav link, icon button (Fitts).
- **One primary CTA per view.** Secondaries hide in menus/overflow past 3.
- **Destructive actions confirm.** `p-confirmpopup` always; `Undo`-toast where rollback is cheap.
- **Feedback within 300 ms** of any user action. Long ops (> 1 s) use a skeleton or progress bar.
- **Disabled = visually obvious** (opacity ≤ 0.5 + not-allowed cursor). Loading shows a spinner AND disables the control.

### Design system — Apple-minimal override on the PrimeNG Material preset

The MD3 philosophy is the *why*; [`docs/design/DESIGN_SYSTEM.md`](../docs/design/DESIGN_SYSTEM.md) is the *what*. An iOS 17+ override on the PrimeNG Material preset — near-monochrome palette + one indigo accent (`--p-primary-500: #5b6cff`), hairline borders, max two elevation levels, 12/16/24 px radii, decelerate-cubic motion.

Mandatory reads before any new component or screen:

- [`docs/design/DESIGN_SYSTEM.md`](../docs/design/DESIGN_SYSTEM.md) — token inventory, per-component override specs, PWA gotchas.
- [`docs/design/README.md`](../docs/design/README.md) — content voice (sentence-case, second-person, no emoji in UI), iconography (`pi pi-*` only), palette + casing rules.

Wiring quick reference:

- Tokens: `client/src/styles/budojo-theme.scss`, imported last from `client/src/styles.scss`.
- Variant matrix: `client/src/styles/budojo-variants.scss`, imported after the theme. Static HTML previews under [`docs/design/preview/`](../docs/design/preview/README.md). **This is the authoritative source when picking a button / tag / form-field variant.**
- PrimeNG wrapped in `@layer primeng` via `providePrimeNG({ theme: { options: { cssLayer: { name: 'primeng' } } } })` — the only reliable way to make our `:root` overrides win the cascade.
- Inter loaded via `@fontsource/inter` (weights 400/500/600/700).
- Dark mode: `.dark` class on `<html>`, matches `providePrimeNG({ theme: { options: { darkModeSelector: '.dark' } } })`.

### Page chrome comes from the shell, not the page (#261)

Two semantic container tokens describe the **outer extent** — `--budojo-container-content` (`75rem`, operative pages) and `--budojo-container-prose` (`56rem`, text-heavy pages).

Pages inside the dashboard shell consume the **derived inner-width** tokens — `--budojo-page-content-max` and `--budojo-page-prose-max` — which subtract `2 × --budojo-page-padding-x` so the page's outer visual extent matches the container token (preserves the pre-#261 `box-sizing: border-box` measure). Page padding lives once on `.main` in the dashboard shell via `--budojo-page-padding-{x,y}` (scaled at 768 px in `:root`).

A page wrapper inside the shell declares `max-width: var(--budojo-page-content-max); margin: 0 auto;` and **nothing else** for chrome. A new page that re-declares its own `padding` or invents a `max-width` is a red flag — push back.

Public routes outside the dashboard shell (`/privacy`, `/sub-processors`) keep their padding in `_legal-page.scss` and consume `--budojo-container-prose` directly because the shell can't reach them and their own padding is already included in `max-width` via border-box. See `docs/design/DESIGN_SYSTEM.md` § 1.7.

### Mobile-first is the default

> **🔭 Active porting (May 2026 onwards):** the SPA is being audited screen-by-screen against this canon. Roadmap: [`docs/design/mobile-ux-audit.md`](../docs/design/mobile-ux-audit.md) with 🟢 / 🟡 / 🔴 / ⚪ status per finding. **Every new feature PR is mobile-friendly on day one** — not retrofitted in a follow-up.

The primary form factor is the phone: instructor moves around the mat with device in hand. Desktop is **secondary**. Every component, screen, and layout decision starts mobile and scales **up**.

| Token | Pixel | Meaning |
|-------|-------|---------|
| — | < 768px | Mobile (default). Topbar + off-canvas drawer, single-column, full-bleed cards. |
| `768px` | tablet / small desktop | Sidebar shell appears, multi-column grids can emerge. |
| `1024px` | desktop | Full two-column dashboard, wider dialogs, more horizontal nav. |
| `1440px` | wide desktop | Max-width content, no further scaling. |

**Rules:**

- **Base styles are mobile.** Write the mobile layout first; `@media (min-width: <token>)` to scale up. Never `@media (max-width: …)` down.
- **Dialogs** (`p-dialog`) use `[breakpoints]="{ '768px': '92vw' }"` so they never overflow.
- **Tables** (`p-table`) either wrap in a scrollable container (horizontal scroll with visual cue) or collapse to a card layout below 768 px.
- **`100dvh` over `100vh`** for full-height layouts (iOS Safari dynamic viewport). Fall back to `100vh` as progressive enhancement.
- **Safe area**: honour `env(safe-area-inset-*)` on any pinned UI (topbar, bottom nav) when iOS notches become relevant.
- **Gesture interactions** (swipe-to-delete, pull-to-refresh) are NOT default — added only where the business flow genuinely benefits.

### PWA + service worker

The SPA is installable as a PWA. `ngsw-worker.js` is generated at build time from `client/ngsw-config.json` — **don't** register a new SW or bypass the Angular builder.

**Auto-update on new SW version (#305).** `AppUpdateService` (`client/src/app/core/services/app-update.service.ts`) wires `SwUpdate.versionUpdates` to `activateUpdate()` + `document.location.reload()` on `VERSION_READY`, plus a 1-hour periodic `checkForUpdate()`. Without this the prefetch cache leaves returning users on the old bundle until manual hard-refresh.

### i18n — ngx-translate (#273)

The SPA runs `@ngx-translate/core` with a synchronous bundled-JSON loader. EN is default + fallback; IT is opt-in via the sidebar toggle.

**Hard rules:**

- **Every new visible string lives in `client/public/assets/i18n/{en,it}.json`** — never hardcode a label / placeholder / message in a template or `.ts`. Use `| translate` in templates and `translateService.instant('key')` in components / services.
- **`en.json` and `it.json` stay in lock-step.** `i18n-keys.spec.ts` parity check fails when one has a key the other doesn't.
- **Component specs use `provideI18nTesting()`** (from `client/src/test-utils/i18n-test.ts`).
- **Cypress specs override the language via `localStorage.budojoLang`** in `onBeforeLoad` (see `cypress/support/commands.ts`).
- **Don't dynamically build translation keys with template strings** (`'errors.' + code`) without an explicit map of allowed keys — the JSON parity check can't see them and the IT translation drifts silently.
- **The parity check confirms key sets match, NOT that template paths resolve.** A typo in a template ships green and renders the raw key on prod. The usual victims are empty-state / error branches that specs don't cover.

Roadmap (#271) adds Spanish + German next; framework is multi-locale-ready.

### Red flags in code review

A reviewer should push back when they see:

- Raw hex / `rgb()` in component SCSS (use theme tokens)
- A spacing not on the 8dp grid (`13px`, `0.9rem`)
- An icon-only button without `pTooltip` or `ariaLabel`
- A form without a clear submit button
- A destructive action (`DELETE`) without confirmation
- More than one primary CTA per view
- A `loading` state not reflected in the UI
- Inline styles (`style="..."`) instead of a component SCSS file
- A page wrapper with a raw `max-width: 1024px`-style px value instead of `var(--budojo-page-{content,prose}-max)` (#261)
- A page wrapper inside the dashboard shell that re-declares its own `padding` (#261) or consumes `--budojo-container-*` directly instead of the derived `--budojo-page-*-max`
- A `p-dialog` with a fixed `width` and no `[breakpoints]` for mobile
- A custom breakpoint that isn't `768` / `1024` / `1440`
- A MD3 / Law-of-UX rule cited in review that was dismissed with "I prefer it this way"

---

## Client structure conventions

```
client/src/app/
├── core/
│   ├── guards/        # Functional route guards (authGuard, hasAcademyGuard, noAcademyGuard)
│   ├── interceptors/  # Functional HTTP interceptors (authInterceptor)
│   └── services/      # AuthService, AcademyService, AthleteService, DocumentService — HTTP only here
├── features/
│   ├── auth/          # Login, Register pages
│   ├── academy/       # Setup page
│   ├── athletes/      # List, Form, Detail pages
│   └── dashboard/     # Layout shell (sidebar + router-outlet)
└── shared/
    └── components/    # BeltBadge, ExpiryStatusBadge, and other reusable presentational components
```

- Feature folders under `src/app/features/<feature>/`.
- HTTP calls only in `*.service.ts` — never in components.
- Components use **OnPush** change detection by default (no exceptions without a comment).
- State via **Angular Signals** — no `BehaviorSubject` where `signal()` works. No NgRx unless complexity genuinely demands it.
- Standalone components only (no NgModules).
- **Functional** interceptors and guards (Angular 15+ style) — `authInterceptor` is exported as `HttpInterceptorFn`, NOT a class.

---

## UI — PrimeNG 21 with the Material preset

All UI from **PrimeNG 21**. Preset: `Material` (from `@primeuix/themes/material`), configured in `client/src/app/app.config.ts`:

```typescript
import Material from '@primeuix/themes/material';

providePrimeNG({
  theme: {
    preset: Material,
    options: { darkModeSelector: '.dark' },
  },
});
```

- Check [primeng.org](https://primeng.org/) before rolling custom — 9 times out of 10 there's a component.
- Use PrimeFlex for layout utilities. No inline styles.
- When PrimeNG doesn't fit, fall back to a plain HTML/SCSS component under `shared/components/` — still using theme tokens, never raw hex.

---

## Testing — Vitest 4 (unit) + Cypress 13 (E2E)

Run locally via `./.claude/scripts/test-client.sh` (prettier --write + lint + vitest). Cypress runs in CI.

### Unit tests (Vitest)

- Test components, services, guards in isolation.
- Mock `HttpClient` with `provideHttpClientTesting()`.
- Config: Angular's `@angular/build:unit-test` builder (see `client/angular.json`), TS settings in `client/tsconfig.spec.json` (`"types": ["vitest/globals"]`). There is no standalone `vitest.config.ts` — the Angular builder wires Vitest up.

### E2E tests (Cypress)

- **Always mock every HTTP call** with `cy.intercept()` — E2E must not depend on a live backend.
- Use `cy.visitAuthenticated(url)` (custom command in `cypress/support/commands.ts`) to pre-seed `auth_token` before Angular boots, satisfying `authGuard`.
- When the **same endpoint is called multiple times** in a test (e.g. `GET /api/v1/academy` for both `noAcademyGuard` on load and `hasAcademyGuard` after a redirect), use `times: 1` in the `beforeEach` intercept and add a second intercept in the specific test for the post-action call.
- Specs in `cypress/e2e/*.cy.ts`; config in `cypress.config.ts`.

**Multi-viewport responsive coverage (#240).** Default viewport is desktop (1280×720); layout regressions at narrow widths are invisible there:

- Use shared presets from `client/cypress/support/viewports.ts` — never hardcode `cy.viewport(390, 844)`. Presets cover `iPhone SE`, `Pixel 8 Pro`, `iPad mini`, `Desktop 1440`. `MOBILE_VIEWPORTS` is the high-yield set; `ALL_VIEWPORTS` is the full sweep.
- Filename convention: `*-mobile.cy.ts` is layout-only; the matching desktop spec covers business logic. Don't multiply test count by running the same business assertion at every viewport.
- Apply multi-viewport only where layout actually matters (forms, lists, modals, navigation chrome). Pure logic specs stay at default viewport.
- The non-trivial assertion at narrow viewports: `document.scrollWidth <= clientWidth` — true exactly when no child element broke out of the viewport. CSS `text-overflow: ellipsis` does NOT change `textContent`, so checking visible text alone is a false-positive guard.

---

## What Claude Should Always Do — client-specific

(Complements the rules in root `CLAUDE.md`.)

- **Suggest a PrimeNG component by name** when building any UI element. Check [primeng.org](https://primeng.org/) before rolling custom.
- **Explain FE decisions** in plain terms — the developer is BE-focused.
- **Write code under the design canon.** MD3, Don't Make Me Think, Norman, Laws of UX — a citation by a reviewer is a valid critique.
- **Components are OnPush by default.** No exceptions without a comment.
- **State via signals**, not `BehaviorSubject` where a `signal()` works.
- **Reactive Forms, not template-driven**, for anything beyond a two-field filter.
- **Run `./.claude/scripts/test-client.sh` before every push.** All three (prettier + lint + vitest) must be clean. Cypress runs in CI.
- **Keep `docs/api/v1.yaml` in sync** if you change how the SPA consumes the API (e.g. new query param). See root `CLAUDE.md` § Documentation discipline.
