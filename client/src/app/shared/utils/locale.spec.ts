import { describe, expect, it } from 'vitest';
import { localeFor } from './locale';
import { SUPPORTED_LANGUAGES } from '../../core/services/language.service';

/**
 * Single-source helper that maps the SPA's `SupportedLanguage` codes
 * to BCP-47 tags consumed by `Intl.*` and PrimeNG. Tested explicitly
 * because every locale-aware screen depends on the mapping; a
 * regression here would manifest as silent drift across the app.
 */
describe('localeFor', () => {
  it('maps "en" to en-GB (EU-default day-first date order, identical EUR formatting)', () => {
    expect(localeFor('en')).toBe('en-GB');
  });

  it('maps "it" to it-IT', () => {
    expect(localeFor('it')).toBe('it-IT');
  });

  it('handles every entry in SUPPORTED_LANGUAGES (no missing cases as the list grows)', () => {
    // Trip-wire for #271 (multi-market expansion: ES + DE land later).
    // The exhaustive switch in `localeFor` is the compile-time guard;
    // this test is the runtime mirror — it walks the canonical
    // language list and asserts every code returns a non-empty
    // BCP-47 tag with a hyphen separator.
    for (const lang of SUPPORTED_LANGUAGES) {
      const tag = localeFor(lang);
      expect(tag, `localeFor("${lang}")`).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });
});
