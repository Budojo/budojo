## What

Translates every visible string in the athletes detail sub-tab templates and the surrounding header — payments, documents, attendance-history, athlete-detail. ~50 strings, 53 new translation keys across `en.json` / `it.json` (lock-step parity preserved).

## Why

Follow-up to #354 closing the second half of the i18n debt the audit found. After #354, the IT user toggled to Italian and saw the sidebar `Accademia`, the landing page Italian copy, and the toasts in IT — but every dashboard sub-tab page (Documents / Attendance / Payments under an athlete) still rendered column headers, button labels, and aria-labels in English. This PR closes that.

The athlete form (~38 strings under `client/src/app/features/athletes/form/`) is still hardcoded and stays scoped for a follow-up because it's a much bigger surface (form labels, validation messages, country-code list, belt/status options) and would make this diff unreviewable.

## How

### `athlete-detail.component`

- Tab labels (`Documents` / `Attendance` / `Payments` / `Edit`) → `athletes.detail.tabs.*`
- Back link `Athletes` → `athletes.detail.backToList`
- Loading text `Loading athlete…` → `athletes.detail.loading`
- Joined date row `Joined {{a.joined_at}}` → `athletes.detail.joinedLabel` with `{{date}}` interpolation
- Status tag `statusLabel(a.status)` (was `'Active'`/`'Suspended'`/`'Inactive'`) → routes through the existing `statuses.*` namespace via a renamed `statusLabelKey()` returning `statuses.${status}` for the template's translate pipe
- Contact links — `Website` / `Facebook` / `Instagram` literals replaced with `athletes.detail.contactLinks.*` keys; `data-cy` builder switched to a stable `cyKey` (e.g. `'website'`) so test selectors don't depend on the localised label
- `error.set('Could not load this athlete.')` → `error.set(translate.instant('athletes.detail.loadError'))`

### `payments-list.component.html`

- Page title `Payments — {{year}}` → `athletes.detail.payments.title` with `{{year}}` interpolation
- No-fee hint copy → `athletes.detail.payments.noFeeHint`
- Column headers (Month / Status / Amount / Paid on / Actions) → `athletes.detail.payments.columns.*`
- Status tags `Paid` / `Unpaid` → reuse the existing `shared.paidBadge.*` namespace introduced in #354
- Mark / Unmark buttons → `athletes.detail.payments.button.{markPaid,unmarkPaid}` (used for both `ariaLabel` and `pTooltip`)

### `documents-list.component`

- `typeLabels` map removed from the component; replaced with a `labelKeyFor()` helper that returns the existing `documents.types.${type}` key path so the template renders via `| translate`
- Heading + counts (`Documents`, `{{count}} active`, `{{count}} cancelled`) → `athletes.detail.documents.{heading,activeCount,cancelledCount}`
- Toggle aria + label → `athletes.detail.documents.toggle.{aria,label}`
- Add button label → `athletes.detail.documents.button.add`
- Column headers (Type / File / Issued / Expires / Status) → `athletes.detail.documents.columns.*`
- Cancelled status tag value → `athletes.detail.documents.status.cancelledOn` with `{{date}}` interpolation
- Download / Delete tooltips + per-row aria-labels (with `{{name}}` interpolation) → `athletes.detail.documents.{tooltip.*,button.*Aria}`
- Empty-state copy (no docs / hint) → `athletes.detail.documents.empty.*` (the hint uses `[innerHTML]` so the `<strong>` markup translates correctly)

### `attendance-history.component`

- `monthLabel` was using `toLocaleDateString('en-GB')` which locked the locale; split into `monthLabelKey()` (returns `month.may` etc, reused from the `month.*` namespace introduced in #354) + a `visibleYear()` accessor. Template renders `{{ monthLabelKey() | translate }} {{ visibleYear() }}` so language toggles flow through reactively (avoids the bug Copilot caught in #354 on the unpaid widget)
- Eyebrow `Attendance` → `athletes.detail.attendance.eyebrow`
- Day counter — split formatted day-counter (`{{attended}} / {{scheduled}} days`) and the no-rate fallback (`{{count}} day(s) this month`) into separate keys with `{{count}}` interpolation and one/many variants
- Prev/next month aria → `athletes.detail.attendance.{prevMonth,nextMonth}`
- Weekday strip — replaced hardcoded `<span>Mon</span>` ... with `{{ 'weekdays.mon' | translate }}` reusing the existing `weekdays.*` namespace
- Day cell aria — `attended ? day + ' — present' : day + ' — not recorded'` (template-literal, banned pattern) → translation keys with `{{day}}` interpolation

## Out of scope

- Athlete form (`features/athletes/form/`) — separate PR (~38 strings: form labels, validation messages, country-code select, belt/status options, submit copy)
- Setup wizard, profile page (already i18n-clean per #354's audit)

## References

- Closes #355
- Builds on #354 (which introduced the `month.*`, `shared.paidBadge.*`, `shared.unpaidWidget.*`, `shared.beltBadge.*` namespaces and the `feedback_i18n_lockstep_with_features.md` memory rule)

## Test plan

- [ ] CI green on the PR (vitest 420/420 passes locally)
- [ ] ESLint clean (verified locally)
- [ ] `i18n-keys.spec.ts` parity check passes
- [ ] On IT locale:
  - [ ] `/dashboard/athletes/<id>` — back link `Atleti`, tabs `Documenti / Presenze / Pagamenti / Modifica`, joined-on `Iscritto il …`, status tag IT label
  - [ ] `/dashboard/athletes/<id>/payments` — title `Pagamenti — 2026`, columns IT, mark/unmark button labels IT
  - [ ] `/dashboard/athletes/<id>/documents` — heading IT, columns IT, type column shows `Certificato medico` / `Carta d'identità` / etc., empty-state hint `Usa <strong>Aggiungi documento</strong>…`
  - [ ] `/dashboard/athletes/<id>/attendance` — eyebrow `Presenze`, weekday strip IT abbreviations, prev/next month aria localised, day cell aria `15 — presente`
