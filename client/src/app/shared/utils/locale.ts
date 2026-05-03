import { SupportedLanguage } from '../../core/services/language.service';

/**
 * Maps the `SupportedLanguage` code (`'en'`, `'it'`) to a BCP-47
 * locale tag suitable for `Intl.NumberFormat`, `Intl.DateTimeFormat`,
 * native `Date.prototype.toLocaleString` calls, and PrimeNG inputs
 * that accept a `locale` (e.g. `<p-inputnumber>`, `<p-datepicker>`).
 *
 * `en` resolves to `en-GB` rather than `en-US` because:
 *  - **Date order**: EU users (our default audience) read day-first
 *    ("3 May 2026", not "May 3, 2026"), even when the UI is in
 *    English.
 *  - **Number / currency formatting**: `en-GB` and `en-US` produce
 *    identical EUR output (`€50.00`), so picking `en-GB` costs us
 *    nothing on numbers but normalises the date format.
 *
 * Single-source helper — `LanguageService.currentLang()` plus this
 * pure function is the only path callers should use to resolve a
 * runtime locale tag. Avoid hardcoded `'en-GB'` / `'it-IT'` strings
 * in components and services — they drift away from the SPA's
 * runtime language toggle silently.
 */
export function localeFor(lang: SupportedLanguage): string {
  return lang === 'it' ? 'it-IT' : 'en-GB';
}
