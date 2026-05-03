## What

Translates the athlete form (create + edit) end-to-end. Final wave of the i18n debt sweep that started in #354 / #356 — every visible string in `features/athletes/form/` now flows through translation keys, including the belt / status / country-code option lists and the validation messages.

~38 strings, ~85 new translation keys across `en.json` / `it.json` (lock-step parity preserved). After this PR there are no hardcoded user-visible strings left in the SPA.

## How

### `athlete-form.component.ts`

- **Belt picker** — was a 12-entry hardcoded array (`{ label: 'Grey (kids)', value: 'grey' }`...). Now a `computed<SelectOption<Belt>[]>()` that maps `BELT_ORDER` through the existing `belts.*` namespace via a `BELT_KEYS: Readonly<Record<Belt, string>>` allow-list (compiler enforces full enum coverage, satisfies the `client/CLAUDE.md` no-dynamic-keys rule).
- **Status picker** — same pattern as belt: `STATUS_KEYS` map + `STATUS_ORDER` array + `computed()` resolving against the existing `statuses.*` namespace.
- **Country code picker** — `COUNTRY_CODE_ENTRIES` array carries the E.164 prefix + `labelKey`; `computed()` builds the localised `+39 Italia` / `+39 Italy` strings via `translate.instant()`.
- All three computeds depend on `languageService.currentLang()` so they recompute on a runtime locale toggle (the explicit signal-dependency pattern Copilot caught in #354's unpaid-widget review).
- Toast strings (invalid-id, created, updated) → `athletes.form.toast.*` via `translate.instant()`.
- Error-state copy in `loadAthlete()` and `handleServerError()` → `athletes.form.{loadError, validationFailed, serverError}`.

### `athlete-form.component.html`

Every visible string replaced with a translation key:

- Title (create / edit) and subtitle → `athletes.form.{title,subtitle}.{create,edit}`
- Loading text → `athletes.form.loading`
- Field labels (first / last name, email, phone, website, facebook, instagram, date of birth, joined, belt, stripes, status, address legend + sub-fields) → `athletes.form.label.*`
- "(optional)" tag → `athletes.form.optional` (deduped across every optional field)
- Phone pair — placeholders + aria-labels → `athletes.form.{placeholder,aria}.phone*`
- Tooltip + aria for "required when any address field is filled" → `athletes.form.{tooltip,aria}.requiredWhenFilled` (deduped across the four required-when-filled markers)
- Validation messages (every `firstName.required`, `email.invalid`, phone-pair errors, URL errors, joined-required, postal-code pattern, address-incomplete) → `athletes.form.validation.*`
- Two shared validation keys: `maxLength100` / `maxLength255` — used by every field with that length cap so we don't duplicate the copy
- URL validation messages keep the `<code>` markup via `[innerHTML]` (the cleanest way to ship the inline example without escaping)
- Address hint → `athletes.form.hint.address`
- Cancel + submit buttons → `athletes.form.button.{cancel,submitCreate,submitEdit}`

### Spec

- `athlete-form.component.spec.ts` — added `provideI18nTesting()` to the providers block. Existing assertions on toast text and field copy continue to match because the test default locale is EN and the EN values mirror the previous hardcoded strings exactly.

### JSON

- New top-level subtree `athletes.form.*` (~85 leaf keys) added to both `en.json` and `it.json`. The existing `i18n-keys.spec.ts` parity check passes.

## Out of scope

Nothing — this closes the SPA i18n umbrella started in #271. After this PR, the IT user toggling to Italian sees the entire dashboard in Italian end-to-end, including option dropdowns and form validation.

## References

- Closes #357
- Final wave of: #354 (landing + athletes-list + shared widgets) → #356 (athletes detail sub-tab templates) → #357 (athlete form)
- Implements `feedback_i18n_lockstep_with_features.md` (memory rule established in #354): every visible string must ship in EN+IT lock-step.

## Test plan

- [ ] CI green (vitest 420/420 passes locally)
- [ ] ESLint clean (verified locally)
- [ ] `i18n-keys.spec.ts` parity check passes
- [ ] On IT locale, `/dashboard/athletes/new`:
  - [ ] Title `Aggiungi atleta`, subtitle IT
  - [ ] Every field label IT (`Nome` / `Cognome` / `Telefono` / `Cintura` / `Stato` / `Indirizzo` / etc.)
  - [ ] Belt dropdown shows `Bianca / Blu / Viola / Marrone / Nera / Rossa e nera (7°) / Rossa e bianca (8°) / Rossa (9°/10°)`
  - [ ] Status dropdown shows `Attivo / Sospeso / Inattivo`
  - [ ] Country code dropdown shows `+39 Italia / +33 Francia / +44 Regno Unito / etc.`
  - [ ] Validation errors fire in IT (e.g. submit empty form → `Il nome è obbligatorio.`, `Il cognome è obbligatorio.`)
  - [ ] Cancel / Crea atleta buttons IT
- [ ] On IT locale, `/dashboard/athletes/<id>/edit` (Edit sub-tab from #281):
  - [ ] Title `Modifica atleta`
  - [ ] Save button reads `Salva modifiche`
  - [ ] Successful save shows `Atleta aggiornato` toast
- [ ] Toggle language while the form is open — option labels update reactively (the `computed()` signal dependency on `currentLang()` triggers re-evaluation)
