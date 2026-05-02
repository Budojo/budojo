## What

Fourth slice of the i18n PR-C umbrella (#279). Translates the cross-athlete expiring documents page (`/dashboard/documents/expiring`) and its companion dashboard widget into translation keys, EN + IT in lock-step.

## Slice plan (per #279)

- **C1: Profile** — shipped in #337
- C2: Athletes — TBD
- C3: Attendance — TBD
- **C4: Documents (this PR)** — 22 keys, 2 components
- C5: Academy — TBD

## What ships in C4

- 22 new keys under one namespace:
  - `documents.types.*` (4 keys) — `id_card` / `medical_certificate` / `insurance` / `other`; lookup goes through a static `Record<DocumentType, string>` map in the list component to keep keys greppable and force TS exhaustiveness if `DocumentType` ever expands (per `client/CLAUDE.md` § i18n — no dynamic key building without an explicit allowed-key map).
  - `documents.expiringList.*` (11 keys) — title, back-to-athletes link, count phrasing (singular/plural with `{{count}}` interpolation), 4 table headers, download tooltip + `ariaLabel` (with `{{filename}}`), error state, empty state, download-failed toast (summary + detail with `{{filename}}`).
  - `documents.expiringWidget.*` (7 keys) — error state, empty state, count phrasing (singular/plural), "expired or expiring" hint.
- `en.json` + `it.json` updated in lock-step.
- `ExpiringDocumentsListComponent` and `ExpiringDocumentsWidgetComponent` now use `TranslatePipe` in templates; the list component uses `TranslateService.instant()` for the download-failed toast.
- Both component specs updated to register `provideI18nTesting()` so the translate dependency resolves under vitest.

## Voice / register notes

- List count: "{{count}} document expired or expiring within 30 days" → "{{count}} documento scaduto o in scadenza entro 30 giorni" (singular/plural agreement on both noun and adjective).
- Widget count: "{{count}} documents need attention" → "{{count}} documenti da controllare" — kept tight for the small tile, paired with the hint "Scaduti o in scadenza entro 30 giorni" beneath it.
- IT uses "Scarica" for the verb action (button tooltip + aria) and "Scaricamento" for the gerund-noun (toast summary), matching the existing register on the Profile page (`exportButton: "Scarica i miei dati"`). The English noun-loanword pattern is not used here.

## Out of scope

- The Athletes documents *tab* (under `/dashboard/athletes/:id/documents`) is C2 scope, not C4.
- The remaining C-slices (Athletes / Attendance / Academy) — separate PRs to keep diffs reviewable.
- Centralised `MessageService` translate wrapper, currency/date locale-aware formatting — PR-D scope (#280).

## Test plan

- [x] `./.claude/scripts/test-client.sh` — prettier + lint + vitest 420/420 green
- [x] `i18n-keys.spec.ts` parity check (en.json ↔ it.json) green
- [ ] Cypress green in CI
- [ ] Manual smoke: toggle language to Italian via the sidebar, land on `/dashboard/athletes` and see the widget in IT; click through to `/dashboard/documents/expiring`, every visible string IT (table headers, count phrasing, download tooltip, error/empty states). Toggle back to EN, every string EN.

## References

- Tracking: #279 (PR-C umbrella)
- Predecessor: #337 (PR-C1 Profile)
- Framework: ngx-translate, in place since PR #274 (closed #273)
