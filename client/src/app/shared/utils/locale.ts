import { SupportedLanguage } from '../../core/services/language.service';

/**
 * Maps the `SupportedLanguage` code to a BCP-47 locale tag suitable
 * for `Intl.NumberFormat`, `Intl.DateTimeFormat`, native
 * `Date.prototype.toLocaleString` calls, and PrimeNG inputs that
 * accept a `locale` (e.g. `<p-inputnumber>`, `<p-datepicker>`).
 *
 * `en` resolves to `en-GB` rather than `en-US` because:
 *  - **Date order**: EU users (our default audience) read day-first
 *    ("3 May 2026", not "May 3, 2026"), even when the UI is in
 *    English.
 *  - **Number / currency formatting**: `en-GB` and `en-US` produce
 *    identical EUR output (`€50.00`), so picking `en-GB` costs us
 *    nothing on numbers but normalises the date format.
 *
 * **Exception — `month: 'short'` renderers must opt out:** `en-GB`
 * returns the 4-char `"Sept"` for September on modern Intl runtimes,
 * where `en-US` keeps the 3-char `"Sep"`. The athletes-list paid
 * column header (`currentMonthShort`) relies on a fixed 3-char token,
 * so it pins to `en-US` directly with a comment explaining why.
 * Don't propagate `en-GB` into a fixed-width slot without checking
 * the September case first.
 *
 * Single-source helper — `LanguageService.currentLang()` plus this
 * pure function is the only path callers should use to resolve a
 * runtime locale tag. Avoid hardcoded `'en-GB'` / `'it-IT'` strings
 * in components and services — they drift away from the SPA's
 * runtime language toggle silently.
 *
 * **Exhaustive switch + `never`-typed default**: `SupportedLanguage`
 * is expected to grow (Spanish + German per the multi-market
 * roadmap, #271). When that happens this function will fail to
 * compile until the new branch is added — surfacing the missing
 * locale mapping at TS check time instead of silently shipping the
 * wrong format under an EN fallback.
 */
export function localeFor(lang: SupportedLanguage): string {
  switch (lang) {
    case 'en':
      return 'en-GB';
    case 'it':
      return 'it-IT';
    default: {
      // Exhaustiveness check — TS narrows `lang` to `never` here when
      // every case is handled. Adding a new SupportedLanguage value
      // makes this assignment fail to compile until the matching
      // case is added above.
      const _exhaustive: never = lang;
      return _exhaustive;
    }
  }
}
