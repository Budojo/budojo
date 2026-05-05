## What

Public `/help` page with 6 sectioned FAQ categories (Getting started, Athletes, Attendance, Payments, Documents, Account), 17 seeded entries, client-side search, stable per-entry URL anchors (`/help#how-to-add-payment`), and a Help link added to the dashboard sidebar footer.

## Why

There was no in-product self-service answer path for "how do I…?" questions — users had no choice but to use the in-app feedback form, which dumps the question into the owner's inbox. Closes #422.

## How

- **Component** at `client/src/app/features/help/`, structure mirrored from `/whats-new` (#254): typed array in the component, content rendered via translation keys, no markdown parser dependency.
- **Public route** `/help` (no auth guard) — same shape as `/privacy` and `/sub-processors`. Lets signed-out prospects, the setup-wizard user mid-flow, and existing customers all reach the FAQ.
- **Search** is client-side, signal + computed. Case-insensitive, matches question OR answer text, reactive to the active language (the `filtered` computed reads `LanguageService.currentLang()` so an EN ⇄ IT flip re-evaluates the matcher).
- **Anchors** — `app.config.ts` gains `withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'top' })` so `[fragment]="id"` links scroll the matching `<section id>` into view. Each entry carries an anchor link (chain icon next to the question) for "copy this URL". `?q=…` deep-link pre-seeds the search box too, for empty states that want to land users on a filtered FAQ.
- **Dashboard sidebar footer** — adds a Help link before the Privacy link in the version row (`Help · Privacy · vTag`). Help leads because help-seeking is higher frequency than reading the policy.
- **i18n** — 6 categories + 17 entries × {question, answer} + 9 page-chrome strings, EN+IT in lock-step. The `i18n-keys.spec.ts` parity check passes (en.json and it.json both at 698 leaf keys).
- **Dynamic-key indirection** — the entry IDs and category IDs are statically declared in the component as a typed union; the Vitest spec then locks the EN+IT translation parity for every declared key (per `client/CLAUDE.md` § i18n: "declare the allowed key set in code and lock it with a unit test").

## Notes

- The 17 seeded questions come from likely beta-tester pain points (import-from-spreadsheet, suspended-athlete behaviour, unpaid-badge meaning, medical-cert upload, account deletion). Real user feedback will reshape the list later — that's the planned follow-up after the page lands.
- The page wrapper consumes `--budojo-container-prose` directly (border-box) because `/help` is a **public** route outside the dashboard shell — same pattern as `_legal-page.scss` (#261).
- Tested only at the Vitest + Cypress layers. No backend changes; no `docs/api/v1.yaml` delta needed.

## Out of scope

- Markdown content pipeline, AI-assisted search, separate KB sub-domain (per the issue brief).
- An IT-only `/help/it` mirror — the search bar already filters in either active language; if SEO indexability of the Italian version becomes a need, we'll split mirror routes the way `/privacy` ↔ `/privacy/it` does.

## References

- Closes #422
- Related: #254 (What's new — same typed-array structural pattern), #273 (i18n framework), #291 (privacy public-route shape)

## Test plan

- [x] Vitest unit spec covers: title, category order, entry-id list, EN+IT translation parity for every dynamic key, empty-query renders all entries, `spreadsheet` keyword filters to only `import-athletes`, case-insensitive search, empty-state on no matches, IT language switch matches "certificato medico", `?q=` query-param pre-seeds the search box, back-CTA navigates to `/`.
- [x] Vitest dashboard spec covers: Help link rendered before Privacy in the sidebar footer, sits inside `[data-cy="sidebar-version"]`.
- [x] i18n parity (`i18n-keys.spec.ts`) — locally verified, en.json and it.json both at 698 leaf keys.
- [x] Cypress E2E spec covers: page loads at `/help` without auth, all 6 categories render, search narrows to `import-athletes` on `spreadsheet`, sidebar Help link → `/help` navigation, `/help#unpaid-badge` deep-link scrolls the entry into view, per-entry anchor click updates the URL hash.
- [ ] CI: PR checks (Vitest, ESLint, Prettier, Cypress, Spectral) — pending CI run.
- [ ] Manual smoke (post-merge): tap Help link in sidebar from dashboard; verify search; deep-link `/help#mark-paid` from a fresh tab; toggle EN ⇄ IT and re-search.
