# Gotchas — mistakes we've made, one line each

Living checklist. **Before every `git push`, read this file against your diff.** New entries go in the same PR that fixes the mistake, not a follow-up.

Format: `→` separates the symptom from the action.

---

## Angular templates & a11y

- `[attr.aria-hidden]="!X && null"` evaluates wrong (`null` when closed, `false` when open) → use CSS `visibility: hidden` with a media query, or a viewport-aware signal. `transform: translateX(-100%)` alone does NOT hide from screen readers.
- `[class.foo]="cond"` with no matching `.foo {}` rule in the SCSS → grep the SCSS for the class before committing. Dead state is a code smell Copilot flags.
- Icon-only button without `pTooltip` or `ariaLabel` → always add one. Canon § Norman.

## Angular / PWA config

- Listed `/index.csr.html` in `ngsw-config.json` without SSR enabled → the file is only emitted with `@angular/ssr`. Remove if the project doesn't use SSR.
- `"serviceWorker": "ngsw-config.json"` at `angular.json` build `options` root → applies to dev too, fights HMR with stale caches. Put it in `configurations.production` only.
- `provideServiceWorker(..., { enabled: true })` in dev → same problem. Gate with `enabled: !isDevMode()`.

## SCSS / layout

- Z-index stack forgets the drawer-open state → when adding an off-canvas drawer + backdrop + topbar, write the z-index ordering as a comment. Backdrop below topbar so the trigger stays tappable while open.
- Inventing spacing values (`0.75rem`, `1.75rem`, `0.125rem`) → canon § MD3 8dp grid. Only `0.5rem / 1rem / 1.5rem / 2rem`.
- Hex color in a component SCSS when a theme token exists → search `--p-*` first. Use the token. Raw hex only for true domain colors (e.g. belt colors) with rationale comment.
- Fixed `width` on a `p-dialog` without `[breakpoints]` → overflows on mobile viewports. Always pair with `[breakpoints]="{ '768px': '92vw' }"`.

## Cypress

- Added a fetch-on-mount to a page already covered by other Cypress specs → sweep every spec whose flow routes through that page and add a defensive `cy.intercept` in its `beforeEach`. Grep the cypress dir for `cy.visitAuthenticated.*<route>`.
- Inlined an envelope object in a test that duplicates an existing top-of-file constant → reuse the constant. Single source of truth; response-shape drift bugs avoided.
- Asserting against `<p-dialog>` element disappearance to check a dialog closed → the Angular host element stays mounted; only the `.p-dialog-mask` overlay toggles. Assert on the mask instead.
- Targeting menu items via `.p-menuitem-link` (PrimeNG 20 class name) → PrimeNG 21 renamed to `.p-menu-item-link` (hyphen). Prefer `[role="menuitem"]` for version stability.
- `cy.contains('Remove').click()` after opening a `<p-confirmpopup>` whose accept label is also "Remove" → matches the trigger button (still in the DOM), not the popup primary. Scope the popup-specific accept via `.p-confirmpopup-accept-button`.
- `<p-table [customSort]="true">` with `[value]="[]"` (empty data) — PrimeNG's `(sortFunction)` does NOT fire on header click because there's nothing to sort. Cypress wait-for-XHR-on-sort tests time out. Drop `customSort` and use `(onSort)` instead — fires on every header click regardless of data.
- `<p-table>` with both `[sortField]`/`[sortOrder]` bindings AND `(onSort)` → the controlled bindings race PrimeNG's internal toggle, so two clicks on the same header both emit `order=1` (asc) instead of asc-then-desc. Drop the input bindings; let the table own its sort state and just listen.
- Assuming PrimeNG p-table sorts desc-first or skips the unsorted state → it actually cycles asc, then desc, then unsorted (first click is ASC, not DESC). Write Cypress assertions to match. Same convention as Material/AG-Grid; Jakob's law applies.

## PHP / Laravel

- `orderByRaw('CASE col WHEN ? THEN ? ... END ' . $direction)` (or the equivalent double-quoted `"... END {$direction}"`) with positional bindings → PHPStan flags `expects literal-string`. Use a literal string for both directions (`...END ASC` / `...END DESC`) and pick at runtime, OR drop bindings entirely if values are constants you control.
- Typing a method as `Builder<Model>` while the call site passes a `HasMany<...>` → runtime `TypeError`. Use a union: `Builder|HasMany` with `@param Builder<X>|HasMany<X, Y>` doc, or `->toBase()` to drop down to the query builder.
- `Athlete::withTrashed()->where(...)->forceDelete()` is a **bulk DELETE** that bypasses model events. Observers (`AthleteObserver::deleting()` cascading documents + files) never run, leaving orphans. Iterate via `lazyById()->each(fn ($a) => $a->forceDelete())` to fire the observer per row.
- `Storage::disk('public')->url(...)` returns an **absolute URL** based on `APP_URL`, not a relative `/storage/...` path. OpenAPI examples must reflect this (`format: uri` + absolute example).
- SVG accepted via `mimes:svg` validation can carry `<script>`, `on*` event handlers, and `javascript:` URIs that execute when the URL is opened directly (browsers sandbox `<img>`-loaded SVGs but not direct navigations). Sanitize on upload via DOMDocument: strip `<script>`, `<foreignObject>`, `<iframe>`, all `on*` attributes, and any attribute whose value contains `javascript:`. See `UploadAcademyLogoAction::sanitizeSvg()`.

## GitHub rulesets / CI

- Ruleset requires CI `required_status_checks` on a branch, but the workflow that emits those checks doesn't trigger on PRs targeting that branch → the branch becomes un-mergeable silently. Every protected branch in a ruleset MUST appear in `on.pull_request.branches` of the workflow producing the contexts.
- Used `POST /rulesets` to re-apply an already-existing ruleset → creates a duplicate. Updates use `PUT /rulesets/{id}` or `PATCH`.
- Expected `gh api .../requested_reviewers -f reviewers[]=Copilot` to assign Copilot → REST API returns 200 but silently drops the reviewer. Use the repo Settings → Code review → "Automatically request Copilot code review" toggle. Bot logins return 422 "not a collaborator".

## Git hygiene

- `prettier --write` over a broad glob (`"**/*.ts"`) → normalises CRLF↔LF on files outside your intended scope. **Run `git diff --stat` before staging**; revert files showing `0 insertions(+), 0 deletions(-)` with `git checkout --`.
- Accidentally `git add server/` while a binary like `server/budojo` (SQLite local DB) sits in the working tree → commits the binary to the repo. Use targeted `git add <file>` or verify `git status` doesn't show the binary before `-A`.
- Pushed commit to develop when the ruleset forbids direct pushes → branches protected. Always open a PR, even for trivial fixes.
- `.gitignore` pattern `foo/` with trailing slash → **git cannot re-include files inside an ignored directory**, so `!foo/bar.md` below it has no effect. Use `foo/*` (matches files inside, not the dir itself) if you need `!`-exceptions to work.

## commitlint

- Commit subject with uppercase (`HTTP`, `POST`, `UI`, `ATHLETES_EMPTY`, `beforeEach`) → `subject-case: lower-case` fails. **Includes camelCase code identifiers** — use prose, not identifiers, in subjects.
- Multi-line subject → commitlint treats first line as subject. Keep it one line, detail in the body.

## API & external services

- Assumed `FormRequest::validated()` provides compile-time types to downstream Actions → PHPStan sees it as `array<string, mixed>` unless `rules()` has explicit `array-shape` annotations. For runtime safety it's enough; for compile-time typing, either annotate or use `spatie/laravel-data`.
- Assumed semantic-release sees all git tags in CI → `actions/checkout@v4` defaults to `fetch-tags: false`. Add `fetch-tags: true` explicitly or versioning starts from scratch.
- Tried to assign Copilot to a PR via a GitHub Action workflow → the REST path accepts 200 but no-ops. Use the repo Settings toggle.

## Docker dev-env

- After pulling a branch that adds a client npm dependency, the `budojo_client` container still runs the old `node_modules` (the volume was populated at build time). Angular barfs with `TS2307 Cannot find module '<new-dep>'`. Fix: `docker exec budojo_client sh -c "cd /app && npm install"` after `git pull`. Rule of thumb: if `package.json` changed in the diff you just pulled, sync the container before running anything.

## Cypress — whitespace in interpolated text

- Asserted `cy.get(...).should('have.text', '—')` on an element whose template is `{{ a?.field ?? '—' }}` on its own line → Angular preserves the template's leading/trailing whitespace, so `textContent` is ` — ` (newline + indent + em-dash + newline). `have.text` does an exact match → fails. Fix: `.invoke('text').then((t) => expect(t.trim()).to.equal('—'))`. Vitest's `.textContent?.trim()` sidesteps the same trap.

## Design system / PrimeNG precedence

- Wrote `:root { --p-primary-500: #5b6cff; … }` in `styles/budojo-theme.scss`, imported LAST from `styles.scss` → buttons still rendered green (Material default), overrides silently ignored. PrimeNG injects its theme `<style>` tag at runtime AFTER the bundled CSS, so both declarations sit at `:root` with identical specificity → source-order tiebreak → PrimeNG wins. Fix: `providePrimeNG({ theme: { …, options: { cssLayer: { name: 'primeng' } } } })`. Unlayered rules (ours) always beat layered rules (PrimeNG's) regardless of injection order — this is the *only* reliable way to override PrimeNG tokens from global app SCSS.
- Referenced `var(--p-border-radius-full)` in the theme file without actually defining it in `:root` → `.p-tag { border-radius: var(--p-border-radius-full) }` fell through to the Material preset default (half-rounded, not a pill). Fix: every `var(--p-*)` used in our override SCSS must also be declared in our `:root` unless we genuinely intend to fall through to PrimeNG's default. Before shipping an override file, grep it against its own `:root` block.
- An SVG with `stroke="currentColor"` (or `fill="currentColor"`) loaded via `<img src="...">` does NOT inherit the host page's CSS color — browsers sandbox `<img>`-loaded SVGs and `currentColor` resolves to the SVG's own root context, which defaults to **black**. Symptom: `logo-glyph.svg` rendered black-on-near-black on the dark sidebar (`var(--p-surface-900)`). Fix: render the SVG **inline** in the Angular template (Angular handles the SVG namespace automatically) when you want it to pick up `var(--p-surface-0)` / `var(--p-text-color)` from the parent. Reserve `<img>` for raster/photo logos and user-uploaded content where currentColor is irrelevant. See PR for #99 + `dashboard.component.html` topbar/sidebar branches.

## Design inventory / Cypress in Docker

- Ran `npm run design:inventory` inside the `budojo_client` Alpine container → `Your system is missing the dependency: Xvfb`. Cypress needs a display server to run headed Chrome, and the slim Alpine image doesn't ship one. **Fix now codified in `client/scripts/design-inventory.cjs`**: the npm script spawns `cypress/included:13.17.0` (which bundles Xvfb + Chrome) as a sibling container via `docker run`. In CI, `cypress-io/github-action@v6` provides Xvfb automatically — so this only matters for local runs.
- `excludeSpecPattern: 'cypress/e2e/design-inventory.cy.ts'` in `cypress.config.ts` SILENTLY canceled `cypress run --spec cypress/e2e/design-inventory.cy.ts` — Cypress applies the exclude pattern even when `--spec` names the same file explicitly. Fix: **don't use `excludeSpecPattern` to hide on-demand specs. Put them in a separate folder outside the default `specPattern` glob.** We moved the inventory to `cypress/inventory/` and the on-demand run overrides `specPattern` to enable that folder.
- Adding a new field to a typed interface (e.g. `Academy.logo_url`) without scanning ALL Cypress mocks → vitest catches the missing field via TS strict checks; Cypress fixtures are plain JSON and silently produce `undefined` instead of `null`, breaking later runtime assertions. **Grep `client/cypress/e2e/*.cy.ts` for the entity name (`address: null`) and update every mock in the same PR.** See PR #92 (12 cypress files touched) — the `MOCK_ACADEMY` helper in `cypress/support/fixtures.ts` is a future centralisation.
- Angular dev server returned `403 Forbidden` when Cypress (running in a sibling docker container) hit `http://client:4200/dashboard/*` — Angular 21's `@angular/build:dev-server` has a default `allowedHosts: ['localhost']` for CSRF-style safety and rejects any other `Host` header. Fix: add explicit entries to `angular.json` → `projects.client.architect.serve.options.allowedHosts` (we use `["client", "localhost", "host.docker.internal"]`). Requires a dev server restart: `docker compose restart client`.

## Button variant picking

- Used `severity="secondary" [outlined]="true"` for a button that was the **only** CTA on the page (academy-detail Edit). With v2 variants the outlined variant renders as filled `surface-100` no border — on a white page body that's visually near-invisible. Fix: a lone CTA is `primary` (filled accent, default — no severity or outlined). The secondary/ghost variants are only canonical when there's a primary adjacent (Save + Cancel pair) or as row-level subtle actions — they're deliberately subdued, so they need a loud sibling or a dense row context to read correctly.

## Favicon / Chrome tab icon

- Replaced `client/public/favicon.ico` but Chrome kept showing the old Angular default tile → browsers cache favicons aggressively and `<link rel="icon">` alone doesn't bust that cache. **Hard reload is not always enough.** Fix chain: (1) make sure `client/public/favicon.ico` is actually the new file (size should match the new one, not 15 KB Angular default); (2) add explicit `<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />` tags alongside the ICO so modern Chromium picks the high-DPI PNG; (3) Shift + reload, then `chrome://favicon2/?pageUrl=http://localhost:4200&size=32` to verify what Chrome thinks the favicon is. Last resort: clear site data (dev-tools → Application → Clear storage).

---

## How to use this file

1. **Before every `git push`**, skim the categories relevant to your diff. A 30-second read vs. a 5-minute Copilot round-trip + fix.
2. **When Copilot flags a non-typo mistake in review**, add the `→` entry to the correct category in the SAME PR that fixes it. The file grows naturally.
3. **Never delete entries.** Even if the framework fixes an issue upstream, the pattern-recognition is still useful. Just annotate with `~~strikethrough~~` + reason.
4. **Keep it scannable.** One line per entry. If the explanation needs more, link to a doc or a PR discussion.
