## What

Fifth slice of the i18n PR-C umbrella (#279). Translates the Academy area — detail page (read-only grouped view + logo card) and edit form — into translation keys, EN + IT in lock-step. Also introduces a shared `weekdays.*` namespace for the training-days picker (used here in the academy form, will be reused in C2 Athletes for the same picker on the athlete form).

## Slice plan (per #279)

- **C1: Profile** — shipped in #337
- C2: Athletes — TBD
- **C3: Attendance** — PR #339
- **C4: Documents** — shipped in #338
- **C5: Academy (this PR)** — 65 keys, 3 components

## What ships in C5

- 65 new keys across two namespaces:
  - **`weekdays.*` (8 keys)** — top-level shared: `groupAria` + 7 day abbreviations (`mon`..`sun`). Used here by `TrainingDaysPickerComponent`, will be reused by C2 Athletes (athlete form's check-in schedule).
  - **`academy.detail.*` (~25 keys)** — eyebrow, edit button, logo card (alt, title, hint, upload/replace/remove labels), 5 row labels (name / permalink / phone / links / address), 2 aria labels, permalink hint, 10 toast strings (unsupported / too-large / upload success / upload error / remove success / remove error — summary + detail each), 3 confirm strings (message / accept / reject).
  - **`academy.form.*` (~32 keys)** — eyebrow, title, optional indicator, name + 2 errors, phone (label, code/national placeholders + arias, 4 errors), 3 URL fields (website / facebook / instagram with errorUrl + shared errorMaxlength), permalink (label + hint), address fieldset (legend + optional, required-when-filled tooltip/aria, 4 field labels + zip pattern error, province aria, 2 messages), monthly fee (label + min error + hint), training days (label + hint), Cancel/Save buttons, success toast summary, 2 error fallbacks.
- `en.json` + `it.json` updated in lock-step.
- `AcademyDetailComponent`, `AcademyFormComponent`, `TrainingDaysPickerComponent` now use `TranslatePipe` in templates; both academy components use `TranslateService.instant()` for toast / confirm / error strings.
- All 3 component specs updated to register `provideI18nTesting()`.

## Voice / register notes

- Italian uses "Modifica" / "Modifica academy" (verb form for the button + title) — consistent with the IT software register where action labels are imperative.
- "Logo" stays as a loanword (universally understood in IT software UX, matches the Profile page's similar usage).
- Address: "Via e numero civico" (literal) for line1, "Scala / piano / interno" (the canonical IT pattern) for line2. CAP for ZIP (the IT-specific term).
- Toast strings keep the noun-vs-verb distinction established in C4 (#338): noun-phrase loanwords stay only where they're a recognised IT noun (none in C5).
- Weekday abbreviations follow the IT 3-letter convention: Lun / Mar / Mer / Gio / Ven / Sab / Dom.
- `<innerHTML>` is used for the three URL `errorUrl` strings because they embed an `<code>` example URL — keeping it inline as HTML lets the example render in the muted code style. ngx-translate parameterised interpolation isn't a fit since the example URL is per-network.

## Out of scope

- The setup wizard (`/dashboard/setup`) is already translated in PR-B (#278) — not in this PR.
- `PROVINCE_OPTIONS` / `COUNTRY_OPTIONS` / `COUNTRY_CODE_OPTIONS` static lists keep their proper-noun labels (province codes + country names + country dialing codes) — these don't translate.
- `monthly_fee` `p-inputnumber` keeps `locale="it-IT"` for the EUR formatting — that's intentional, the comma-decimal is the canonical EUR format regardless of UI locale.
- Remaining C-slice (Athletes) — separate PR.

## Test plan

- [x] `./.claude/scripts/test-client.sh` — prettier + lint + vitest 420/420 green
- [x] `i18n-keys.spec.ts` parity check (en.json ↔ it.json) green
- [ ] Cypress green in CI
- [ ] Manual smoke: toggle language to Italian via sidebar → `/dashboard/academy` (eyebrow / Edit button / logo hint / row labels / permalink hint all IT) → click Edit → form labels, placeholders, error states, monthly fee hint, training-days picker (Lun/Mar/...) all IT. Submit invalid → IT errors. Submit valid → IT success toast. Toggle back to EN.

## References

- Tracking: #279 (PR-C umbrella)
- Predecessors: #337 (PR-C1 Profile), #338 (PR-C4 Documents), #339 (PR-C3 Attendance)
- Framework: ngx-translate, in place since PR #274 (closed #273)
