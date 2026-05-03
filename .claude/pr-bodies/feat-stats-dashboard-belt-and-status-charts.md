## What

New `/dashboard/stats` page surfacing two doughnut charts — **belt distribution** + **active roster status** — pulled live from the existing athletes list. Sidebar nav link "📊 Stats / Statistiche" sits between Feedback and What's new. First slice of the stats dashboard the user asked for in the "facciamo i grafici" thread; subsequent PRs will add inline gauges (knob/progress instead of "8/9 days" text) and trend charts (attendance + revenue) once the supporting backend aggregations are added.

## Why

Until now every numeric reading in Budojo is rendered as a string: "8/9 days", "87%", "3 athletes still owe". The user explicitly asked for prettier, more glanceable visualisations + a dedicated section to host them. Charts double as a higher-density read of the same data the existing list pages already compute — an instructor opening Stats sees "where is my academy at" in two seconds without navigating four tabs.

## How

### New surface — `client/src/app/features/stats/`

- `stats.component.ts` — fetches every page of `GET /api/v1/athletes` on init (page 1 first, then pages 2..N in parallel via `mergeMap` with concurrency 4 — bounded so we don't fan out to 50+ requests on a large academy). Aggregates client-side into two `<p-chart type="doughnut">` data structures.
- `stats.component.html` — header (eyebrow / title / subtitle) + total-athletes summary + responsive grid (1 col mobile, 2 cols ≥ 1024px) carrying the two chart cards. Loading skeletons match the chart card height; explicit `[data-cy]` selectors on every state for Cypress.
- `stats.component.scss` — Apple-minimal cards on the dashboard's `--p-content-*` tokens. No raw hex.

### Why client-side aggregation

`GET /api/v1/athletes` paginates 20 rows/page. For typical academy sizes (< 200 athletes) this is 5-10 round trips of ≤ 20 rows — fast enough that adding a `/api/v1/stats/breakdown` server-side endpoint would be premature optimisation. **When the trend charts land** (separate PR — attendance over 12 months, revenue over 12 months), they'll need server aggregations because the source data isn't reachable via a single fetch-all endpoint, and that PR will introduce `/api/v1/stats/*`. Stats page will then migrate the doughnut data fetching to the same endpoint family so all four charts share one round trip.

### Belt + status palettes

- **Belts**: domain colour per IBJJF rank (white, blue, purple, brown, black, kids ranks, senior coral / red). Hex values in code rather than `--budojo-belt-*` CSS tokens because Chart.js renders to a `<canvas>` and reads colours at draw time, not via the cascade. The exception is documented in `client/CLAUDE.md` § Design canon (gotchas: "belt colors are domain-specific, hex allowed with rationale").
- **Statuses**: severity tokens (`success` / `warn` / `secondary`) — green / amber / grey, matching every other status surface.

### i18n coverage

- New `nav.stats` key on the sidebar — "Stats" / "Statistiche".
- New `stats.*` namespace covering eyebrow / title / subtitle / loadError / empty / total + per-card title + hint copy.
- The chart slice labels reuse the existing `belts.*` and `statuses.*` namespaces — toggling EN ↔ IT re-renders both charts in the active language without a manual subscription (the `computed()` reads `languageService.currentLang()` as its signal dependency).

### Routing + nav

- New child route `dashboard/stats` (lazy-loaded, behind the same `authGuard + hasAcademyGuard` as every other dashboard route).
- Sidebar nav link uses `pi pi-chart-pie`, sits ABOVE What's new + Sign out so the dashboard reading order is: operative pages → settings (Academy / Profile) → Stats → Feedback → What's new → Sign out.

### Spec coverage

`stats.component.spec.ts` (4 tests):

1. Empty academy → renders the empty state, `totalAthletes()` reads 0.
2. Single-page response with 4 athletes → belt + status charts populate in canonical IBJJF order, `totalAthletes()` reads 4.
3. Multi-page response (lastPage = 3) → component fans out to pages 2 and 3, concatenates all rows, charts include data from every page.
4. First page request errors → renders the error state, no further requests fire, no charts render.

## Out of scope

- **Inline gauges** replacing the textual "8/9 days" / "87%" displays on attendance pages. Separate PR (PR-B per the brainstorming thread). Same `<p-knob>` / progress-circle pattern, smaller diff.
- **Trend charts** (attendance / revenue over 12 months) — needs `/api/v1/stats/*` endpoints, separate PR-C. Will migrate the existing doughnut fetches into the same shared endpoint family.
- **Belt colour customisation per academy** — domain palette is universal IBJJF, no per-academy override planned.
- **Date / belt / status filtering on the charts** — first-pass surfaces "everything in the academy"; filters can grow if user feedback asks for them.

## References

- Triggered by the user's "facciamo i grafici come avevamo detto" + "tutto quello che puoi mostrare come statistica carina user friendly accattivante" briefs in the dev chat — no formal issue (the multi-PR plan was sketched in the chat and goes here).
- Reuses `BELT_KEYS` / `BELT_ORDER` / `STATUS_KEYS` / `STATUS_ORDER` from `client/src/app/shared/utils/i18n-enum-keys.ts` (introduced in #358) — same single source of truth as the athlete form pickers.

## Test plan

- [ ] CI green on the PR
- [x] Vitest 48 specs / 428 tests pass locally
- [x] ESLint clean locally
- [x] `i18n-keys.spec.ts` parity check passes (en / it both carry the new `nav.stats` + `stats.*` keys)
- [ ] Smoke on develop after merge:
  - [ ] Sidebar shows "Stats" between Feedback and What's new with the chart-pie icon
  - [ ] `/dashboard/stats` loads, shows the loading skeletons, then both doughnuts populate
  - [ ] Empty academy renders the explicit empty state instead of an empty chart
  - [ ] Hover a doughnut slice → tooltip reads `<label>: <count> (<%>)`
  - [ ] Toggle language → chart legend labels reflow (Bianca / Blu / etc. on IT)
  - [ ] Mobile (< 1024px): the two charts stack vertically; on desktop side-by-side
