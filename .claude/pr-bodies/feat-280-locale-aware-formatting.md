## What

Removes every hardcoded `'en-GB'` / `'en-US'` / `'it-IT'` locale string from the dashboard runtime and binds them to `LanguageService.currentLang()` via a single shared helper. After this PR the EUR currency formatting, every date label, and the academy form's monthly-fee input flip separators / number / month order live when the user toggles the SPA language.

First slice of #280 (PR-D). The `/sub-processors` IT translation lives in a follow-up PR.

## Why

After the i18n umbrella closed in v1.13.0 (#354 + #356 + #358), every visible STRING is translated — but several formatters still locked the locale to a constant:

- `<p-inputnumber locale="it-IT">` on the academy form — the EN user typing a fee saw `,`-decimal even when the rest of the form read in English
- `toLocaleDateString('en-GB', …)` in monthly-summary-widget, age-badge, monthly-summary — the IT user toggling to Italian saw "May 2026" / "15 May 1990" instead of "maggio 2026" / "15 maggio 1990"
- `toLocaleString('en-US', { style: 'currency', currency: 'EUR' })` in payments-list — `€50.00` for IT users instead of `50,00 €`

The `athletes-list` component already had reactive locale binding but with a different `'en-US'` constant — folded into the shared helper here for consistency.

## How

### New shared helper — `client/src/app/shared/utils/locale.ts`

```ts
export function localeFor(lang: SupportedLanguage): string {
  return lang === 'it' ? 'it-IT' : 'en-GB';
}
```

`'en'` resolves to `'en-GB'` (not `'en-US'`) — the EU-default day-first date order ("3 May 2026") is the right read for our user base, and `'en-GB'` produces identical EUR currency output to `'en-US'`. Single function, pure, no DI.

### Components rewired

Each component injects `LanguageService` and exposes a locale-bound `computed()` signal that re-evaluates when `currentLang()` changes:

| Component | Before | After |
| --- | --- | --- |
| `academy-form.component.html` | `locale="it-IT"` (hardcoded) | `[locale]="currentLocale()"` (signal) |
| `monthly-summary-widget.component.ts` `monthLabel` | `'en-GB'` | `localeFor(languageService.currentLang())` |
| `age-badge.component.ts` `dobLabel` | `'en-GB'` | same pattern |
| `monthly-summary.component.ts` `monthLabel` | `'en-GB'` | same pattern |
| `payments-list.component.ts` `formatAmount` | `'en-US'` | same pattern |
| `athletes-list.component.ts` `locale` | inline `=== 'it' ? 'it-IT' : 'en-US'` | `localeFor(...)` (unify with shared helper) |

### Spec

- `age-badge.component.spec.ts` was constructing the component with a bare `imports: [AgeBadgeComponent]` block; after the `LanguageService` injection it needs the i18n providers. Added `...provideI18nTesting()` (the same harness every other component spec uses).
- All other component specs already provided the i18n harness, so no further changes needed.

## Out of scope (still on #280 / PR-D)

- **`/sub-processors/it`** — the Italian translation of the public sub-processors page. Mirrors the `/privacy` IT/EN pair pattern; needs a new component + route + the markdown source-of-truth file. Separate PR.
- Replacing the duplicated `beltLabelKeys` map in `athletes-list.component.ts` with the shared `BELT_KEYS` from `i18n-enum-keys.ts` (introduced in #358). Boy-Scout-tempting but scope-creep — the map already works correctly here; consolidation can land independently.

## References

- Refs #280 (PR-D umbrella; stays open for the `/sub-processors/it` slice)
- Builds on the i18n framework finalised in #354 / #356 / #358 / v1.13.0

## Test plan

- [ ] CI green
- [x] Vitest 420/420 passes locally
- [x] ESLint clean locally
- [ ] On IT locale:
  - [ ] `/dashboard/academy/form` — monthly-fee input shows `€ 50,00` (comma decimal, IT separator)
  - [ ] `/dashboard/attendance` summary — month label reads "maggio 2026" (lowercase IT)
  - [ ] Athlete tooltip — "15 maggio 1990" instead of "15 May 1990"
  - [ ] `/dashboard/athletes/<id>/payments` — amount cell reads `50,00 €` not `€50.00`
- [ ] On EN locale:
  - [ ] Currency input reads `€ 50.00`, dates read "3 May 2026" (en-GB day-first), payment amounts read `€50.00`
- [ ] Toggle language at runtime while viewing academy form / payments — values reformat without page reload (the `computed()` dependency on `currentLang()` triggers a re-render)
