## What

Third slice of the i18n PR-C umbrella (#279). Translates the Attendance area — daily check-in page, monthly summary page, and the dashboard summary widget — into translation keys, EN + IT in lock-step. Also introduces a shared `belts.*` namespace for the IBJJF belt labels (used in this PR by daily-attendance, will be reused in C2 Athletes for the same dropdown).

## Slice plan (per #279)

- **C1: Profile** — shipped in #337
- C2: Athletes — TBD
- **C3: Attendance (this PR)** — 38 keys, 3 components
- **C4: Documents** — shipped in #338
- C5: Academy — TBD

## What ships in C3

- 38 new keys across two namespaces:
  - **`belts.*` (13 keys)** — top-level shared namespace for IBJJF belts: `all` + 12 belt names. Used here by the daily-attendance filter, will be reused by C2 Athletes (athletes-list, athlete-form) without duplication.
  - **`attendance.daily.*` (16 keys)** — eyebrow, title, search/belt placeholders, table headers (full name / belt / present aria), empty states (filtered + no-athletes), pagination hint with `{{shown}}` + `{{total}}`, undo button, and 6 toast strings (load errors + per-action confirm/error toasts with `{{name}}` interpolation).
  - **`attendance.summary.*` (12 keys)** — eyebrow, plural-aware counter (`daysOne`/`daysOther`/`athletesOne`/`athletesOther` with `{{count}}`), prev/next aria labels, filter placeholder + aria, error string, empty states, table headers.
  - **`attendance.summaryWidget.*` (5 keys)** — eyebrow prefix, error title, "athletes / session" unit, "View all →" CTA, empty state.
- `en.json` + `it.json` updated in lock-step.
- `DailyAttendanceComponent`, `MonthlySummaryComponent`, `MonthlySummaryWidgetComponent` now use `TranslatePipe` in templates; the daily component uses `TranslateService.instant()` for the 4 toast variants (mark/unmark success and error, both with `{{name}}` interpolation).
- All 3 component specs updated to register `provideI18nTesting()`.
- **Reactive belt options** — `DailyAttendanceComponent.beltOptions` flipped from a static `readonly` array to a `computed()` keyed off `LanguageService.currentLang` so the dropdown labels re-render when the user toggles language via the sidebar (without reloading the page).
- **`AthletesListComponent` spec** also needs `provideI18nTesting()` now — it imports `MonthlySummaryWidgetComponent` (and `ExpiringDocumentsWidgetComponent` from C4) as children, both of which carry `TranslatePipe`. Tangential one-line fix.

## Voice / register notes

- Belt labels in IT use feminine forms because "cintura" (belt) is feminine: "Bianca", "Nera", "Rossa e nera (7°)", etc. The kid belts get "(bambini)" parenthetical mirroring the EN "(kids)".
- Daily title: "Today's check-in" → "Check-in di oggi". "Check-in" stays as the loanword (matches Italian gym/sport register; Italian software UX uses it widely).
- Toast undo: kept short for the 5-second window — "Annulla" rather than "Annulla l'azione".
- Counter pluralisation handled via 4 separate keys (`daysOne`/`daysOther` × `athletesOne`/`athletesOther`) rather than ngx-translate's ICU plural — keeps it readable and the parity-spec catches drift.

## Out of scope

- The monthly summary's `monthLabel` still uses `toLocaleDateString('en-GB', …)` (hardcoded English month name in the page header). That's a date-locale concern → PR-D scope (#280) per the umbrella's split.
- Toast severity / icon strings live inside PrimeNG itself; nothing to translate at our layer.
- Remaining C-slices (Athletes / Academy) — separate PRs.

## Test plan

- [x] `./.claude/scripts/test-client.sh` — prettier + lint + vitest 420/420 green
- [x] `i18n-keys.spec.ts` parity check (en.json ↔ it.json) green
- [ ] Cypress green in CI
- [ ] Manual smoke: toggle language to Italian via sidebar → land on `/dashboard/attendance` → header / search / belt dropdown / table headers / empty states / pagination hint / undo toast all in IT. Same on `/dashboard/attendance/summary` (counter pluralisation, prev/next arias, filter, error/empty). Widget on the Athletes list page eyebrow + counter + CTA in IT. Toggle back to EN.

## References

- Tracking: #279 (PR-C umbrella)
- Predecessors: #337 (PR-C1 Profile), #338 (PR-C4 Documents)
- Framework: ngx-translate, in place since PR #274 (closed #273)
