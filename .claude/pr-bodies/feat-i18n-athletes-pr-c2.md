## What

Final slice of the i18n PR-C umbrella (#279). Translates the **Athletes list page** (`/dashboard/athletes`) — the most-used surface in the SPA — into translation keys, EN + IT in lock-step. Also introduces a shared `statuses.*` namespace for the active/suspended/inactive enum that's used across athletes-list, athlete-form, and the athlete-detail header.

## Slice plan (per #279)

- **C1: Profile** — shipped in #337
- **C2: Athletes (this PR)** — list page only; detail header + form + 4 sub-tabs deferred to follow-up PRs (see Out of scope)
- **C3: Attendance** — shipped in #339
- **C4: Documents** — shipped in #338
- **C5: Academy** — shipped in #340

## What ships in C2 (list-only scope)

- 43 new keys across two namespaces:
  - **`statuses.*` (4 keys)** — top-level shared: `all` + 3 `AthleteStatus` cases (`active` / `suspended` / `inactive`). Used here by athletes-list filter + status tag; will be reused by C2-detail and C2-form follow-up PRs.
  - **`athletes.list.*` (~39 keys)** — title, total count split into `totalCountOne` / `totalCountOther` for proper IT pluralization (with `{{count}}`), add button, 4 filter placeholders + `paidOptions` (3), 4 table headers, 6 sort tooltips (initial + 4 first/last × asc/desc states for full-name + 2 belt asc/desc states), 4 row tooltips (edit/delete + their parameterised arias), paid/unpaid tooltip labels, 2 empty-state strings, 9 toast strings (mark paid/unpaid success, error summary/detail variants for paid/load/delete), 7 confirm-popup strings (delete message + accept, mark-paid/unpaid message + accept, shared cancel — with `{{name}}` + `{{month}}` interpolation on messages).
- `en.json` + `it.json` updated in lock-step.
- `AthletesListComponent` template uses `TranslatePipe`; component uses `TranslateService.instant()` for sort tooltips, status labels, toasts, and confirm-popup messages.
- Reactive belt / status / paid options — `Record<Belt, string>` + `Record<AthleteStatus, string>` (exhaustive, fail TS if a new case is added without a matching key) + a separate readonly order array. Same canonical pattern as `DailyAttendanceComponent` (#339). Computed re-renders on language toggle via `LanguageService.currentLang` signal dependency.
- Locale-aware month labels (Copilot review fix `5b342e6`): `currentMonthShort` / `currentMonthLong` and the in-handler `monthLabel` for the mark-paid/unpaid confirm dialog all derive their `toLocaleString` locale from `LanguageService.currentLang()` (en-US ↔ it-IT) so the IT confirm reads "maggio 2026" instead of "May 2026".
- Confirm-popup buttons fully localized (Copilot review fix `5b342e6`): both `confirmDelete` and `confirmTogglePaid` now set `acceptLabel` / `rejectLabel` so the popup buttons are no longer the PrimeNG defaults Yes/No. Delete also carries `acceptButtonProps: { severity: 'danger' }` so the destructive action reads as such.

## Voice / register notes

- "Athletes" → "Atleti" (matches the existing sidebar navigation).
- "Add athlete" → "Aggiungi atleta" (verb imperative for buttons, consistent with PR-C5 "Modifica" and "Salva").
- Status labels: "Attivo", "Sospeso", "Inattivo" (masculine forms — IT software register treats "atleta" as the implicit subject).
- Sort tooltips translated with both directions explicit ("nome" for first name, "cognome" for last name, "bianca → nera" for belt rank). The compact `F↑` / `F↓` / `L↑` / `L↓` / `↕` / `↑` / `↓` symbol signifiers stay locale-agnostic.
- Paid status: "Pagato" / "Non pagato" (consistent with the Profile / Academy register where verb-actions take Italian forms; "Download" stayed the loanword in C4 for the toast noun-phrase but here "Pagato" is the natural agreement with "{{name}} pagato").

## Out of scope

Athletes is the biggest area in the umbrella (~80-120 keys total per #279). Splitting into reviewable pieces:

- **C2-detail** (follow-up): athlete-detail header (back link / edit button / status row / contact rows), 4 sub-tabs (documents-list, attendance-history, payments-list, upload-document-dialog).
- **C2-form** (follow-up): athlete-form — by far the biggest single template (~509 lines), big sibling of academy-form (#340) with phone pair, 4 contact link fields, address group, monthly fee.

Both follow-ups will reuse the `statuses.*` and `belts.*` namespaces this PR establishes — no duplication.

## Test plan

- [x] `./.claude/scripts/test-client.sh` — prettier + lint + vitest 420/420 green
- [x] `i18n-keys.spec.ts` parity check (en.json ↔ it.json) green
- [ ] Cypress green in CI
- [ ] Manual smoke: toggle language to Italian via sidebar → `/dashboard/athletes` shows IT title + count + Add button + 4 filter dropdowns (each with translated options) + table headers + sort tooltips on hover + status tag values + edit/delete tooltips + empty-state copy. Mark-paid / Mark-unpaid confirm dialog reads in IT. Delete confirm reads in IT. Toast messages on success/error are in IT. Toggle back to EN → all surfaces flip back.

## References

- Tracking: #279 (PR-C umbrella)
- Predecessors: #337 (PR-C1 Profile), #338 (PR-C4 Documents), #339 (PR-C3 Attendance), #340 (PR-C5 Academy)
- Framework: ngx-translate, in place since PR #274 (closed #273)
