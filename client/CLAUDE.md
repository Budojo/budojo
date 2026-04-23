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
- Config: `vitest.config.ts` at `client/`.

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
