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

/**
 * The date format a `p-datepicker` should show, for a language (#1498).
 *
 * PrimeNG's own vocabulary, not `Intl`'s: `dd` is the day, `mm` the month and
 * `yy` a four-digit year, which is confusing enough on its own to be worth
 * saying out loud.
 *
 * There were **two** hardcoded formats before this — `dd/mm/yy` in six
 * pickers and `yy-mm-dd` in five — so an owner editing an athlete's joining
 * date saw `2024-09-01` and recording that athlete's belt on the next tab saw
 * `01/09/2024`. Same person, same session, one of the two a machine format no
 * instructor writes by hand.
 *
 * Both English and Italian read a date day-first; the difference is only the
 * separator, and both locales use `/`. So this returns one string today and
 * exists anyway — the moment Spanish or German land (#271) the switch is
 * where the answer goes, rather than in eleven templates.
 */
export function datePickerFormatFor(lang: SupportedLanguage): string {
  switch (lang) {
    case 'en':
    case 'it':
      return 'dd/mm/yy';
    default: {
      const _exhaustive: never = lang;
      return _exhaustive;
    }
  }
}

/**
 * A date a person reads, from an ISO `YYYY-MM-DD` (#1498).
 *
 * `Joined 2024-09-01` was rendered straight from the API on the athlete's
 * page. An ISO date is a wire format: unambiguous for a machine, and read by
 * nobody in the world as a date.
 *
 * Parsed field by field rather than through `new Date(iso)`, which reads a
 * bare `YYYY-MM-DD` as UTC midnight and can land on the previous day for
 * anyone west of Greenwich.
 */
export function formatIsoDate(iso: string, lang: SupportedLanguage): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;

  return new Date(y, m - 1, d).toLocaleDateString(localeFor(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * A month a person reads, from an ISO `YYYY-MM` (#1498).
 *
 * The leaderboard card rendered its API `meta.month` verbatim, so the period
 * above "Top of the mat — this month" read `2026-04`.
 */
export function formatIsoMonth(iso: string, lang: SupportedLanguage): string {
  const [y, m] = iso.split('-').map(Number);
  if (!y || !m) return iso;

  return new Date(y, m - 1, 1).toLocaleDateString(localeFor(lang), {
    month: 'long',
    year: 'numeric',
  });
}
