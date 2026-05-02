## What

Closes the i18n debt accumulated through v1.12.0 — the original three findings called out in #344 plus a comprehensive sweep across components and templates the audit revealed were also untranslated. ~40 strings + 35 new translation keys across `en.json` / `it.json` (lock-step parity preserved).

## Why

The user explicitly demanded that **every visible string** be translated, after spotting `Academy` still rendering in English on the IT sidebar. The previous audit understated coverage; once we re-audited carefully we found 40+ hardcoded strings across landing, athletes, documents, payments, verify-error, privacy / sub-processors, and the shared paid/belt/unpaid widgets. This PR closes the easy half of that scope and unblocks the remaining athletes detail / form templates for follow-up PRs.

A new lock-step canon was added to agent memory (`feedback_i18n_lockstep_with_features.md`): every PR adding visible UI must ship EN+IT keys in the same diff, no "translate later" deferrals.

## How

### Banned-pattern fixes (#344 originals + the analogous payments case the audit caught)

- `landing.component.ts` — replaced `feature.key` / `step.key` shorthand with explicit `titleKey` / `bodyKey` paths so the JSON parity check sees them. Template now reads `{{ feature.titleKey | translate }}` instead of the dynamic concatenation `'landing.features.' + feature.key + '.title' | translate` (banned per `client/CLAUDE.md` § i18n).
- `athletes-list.component.ts:565` — toast `detail` was a template literal `${name} — ${month}/${year}`; now resolved via `translate.instant('athletes.list.toast.markedPaidDetail', { name, month, year })` against the new `markedPaidDetail` / `markedUnpaidDetail` keys.
- `payments-list.component.ts:154-156` — confirm message was a template literal; now uses `translate.instant('athletes.detail.payments.confirm.markPaidMessage', { name, month, year })`. The hardcoded English fallback `'this athlete'` moved to `athletes.detail.payments.fallbackName`.

### Hardcoded `aria-label` translations

Every `aria-label="..."` literal that ships to a screen reader now uses `[attr.aria-label]="'key' | translate"`:

- `landing.component.html` × 2 (brand link + primary nav)
- `privacy-policy.component.html`, `privacy-policy-it.component.html`, `sub-processors.component.html` (brand link)
- `athlete-detail.component.html` (contact links group)

### Hardcoded toast / confirm strings

- **payments-list** — `Marked paid` / `Marked unpaid` summaries, the missing-fee / generic / load-error details, the `Error` summary. Plus `MONTH_LABELS = ['January', ...]` flipped to `MONTH_KEYS = ['month.january', ...]` so the table row labels and the toast detail both flow through translations. Template now uses `{{ row.labelKey | translate }}`.
- **documents-list** (athletes/detail variant) — confirm message + accept/cancel labels, all 6 success/error toasts.
- **verify-error.component.ts** — throttled (429) and generic error toasts.

### Shared widgets

- **paid-badge** — `Paid` / `Unpaid` tag labels and `Mark paid` / `Mark unpaid` aria-labels now via `'shared.paidBadge.*' | translate`.
- **belt-badge** — `label()` was returning hardcoded `'Red & black'` / capitalized fallback; now returns the i18n key via a `BELT_KEYS` map and the template renders with `| translate`. The stripe aria-label (`'2 stripes'` / `'1 stripe'`) uses pluralised `shared.beltBadge.stripeOne` / `stripeMany` keys with `{{count}}` interpolation.
- **unpaid-this-month-widget** — eyebrow, error / all-paid / count copy, view-all CTA, view-list CTA. The `monthLabel` previously locked to `en-GB` via `toLocaleDateString` is now resolved via the new `month.*` namespace, so the IT user sees "maggio 2026" instead of "May 2026".

### Sidebar regression (the one that prompted this PR)

- `it.json` `nav.academy` was literally `"Academy"` (untranslated). Now `"Accademia"`.

### New translation namespaces

- `month.january` … `month.december` (12 keys)
- `legal.brandAriaLabel`
- `landing.nav.brandAriaLabel`, `landing.nav.primaryAriaLabel`
- `auth.verifyError.toast.{throttled,error}{Summary,Detail}`
- `athletes.detail.contactLinksAriaLabel`, plus the full `athletes.detail.payments.*` and `athletes.detail.documents.*` confirm / toast subtrees
- `athletes.list.toast.marked{Paid,Unpaid}Detail` (interpolated)
- `shared.paidBadge.*`, `shared.beltBadge.*`, `shared.unpaidWidget.*`

### Specs

- Added `provideI18nTesting()` to: `paid-badge`, `belt-badge`, `payments-list`, `documents-list`, `athlete-detail`, `unpaid-this-month-widget`, `privacy-policy`, `privacy-policy-it`, `sub-processors`. The existing `i18n-keys.spec.ts` parity check pins EN ↔ IT lock-step.
- `belt-badge.component.spec.ts` — old assertion was `componentInstance.label()).toBe('Blue')`; updated to assert on `labelKey()` plus the rendered DOM text via the EN test default locale.

## Out of scope (for follow-up PRs)

The audit found ~66 more strings still hardcoded in two areas this PR doesn't touch — they need their own dedicated work and would make this diff unreviewable:

- `payments-list.component.html` — column headers (Month / Status / Amount / Paid on / Actions), `<p-tag value="Paid|Unpaid">`, button aria/tooltip, page title `"Payments — {{year}}"`, no-fee hint
- `documents-list.component.html` — column headers, toggle label, add-doc label, status tags, empty states
- `attendance-history.component.html` + `.ts` — eyebrow, day counter format, prev/next-month buttons, weekday strip, day-cell aria
- `athlete-detail.component.html` — back link, loading text, joined-on label, tab labels (Documents / Attendance / Payments / Edit)
- `athlete-form.component.html` + `.ts` — every form label, validation message, button label, country-code select, belt/status options (the existing `belts.*` and `statuses.*` namespaces aren't wired through the form picker yet)

A second PR `fix/<new-issue>-athlete-detail-templates-i18n` and a third `fix/<new-issue>-athlete-form-i18n` will follow.

## References

- Closes #344
- Implements the new memory rule `feedback_i18n_lockstep_with_features.md` (every PR adding visible UI ships EN+IT keys lock-step)
- Establishes the `month.*` and `shared.*` namespaces for use by future i18n PRs

## Test plan

- [ ] CI green on the PR
- [ ] Vitest 420/420 pass (verified locally inside `budojo_client` container)
- [ ] ESLint clean (verified locally)
- [ ] `i18n-keys.spec.ts` parity check passes (key set in `en.json` ≡ key set in `it.json`)
- [ ] Smoke on `/dashboard/*` with IT locale: sidebar `Accademia` (was `Academy`); athlete-list mark-paid toast detail localised; payments tab confirm + month names localised; documents delete confirm + toasts localised
- [ ] Hard-refresh on `/privacy/it` and `/privacy` — brand link aria-label localised; sub-processors page aria-label localised
- [ ] Belt badges in IT show `Blu` / `Marrone` / `Rossa e nera (7°)`; stripe aria-label reads `2 strisce`
- [ ] Unpaid-this-month widget in IT shows `Non pagati · maggio 2026` with localised `atleti devono ancora pagare` / `atleta deve ancora pagare`
