import { EnvironmentProviders, Provider } from '@angular/core';
import { providePrimeNG } from 'primeng/config';
import Material from '@primeuix/themes/material';
import { provideTranslateService, TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

import EN_TRANSLATIONS from '../../../../public/assets/i18n/en.json';
import IT_TRANSLATIONS from '../../../../public/assets/i18n/it.json';

/*
 * The look and the language the app boots with, on the PC and on the phone
 * alike (#2034).
 */

/**
 * Synchronous translate loader (#273). The JSON files are imported
 * at build time and bundled into the app, so the first paint always
 * has translations available — no HTTP round-trip race that would
 * leave Cypress assertions reading raw `nav.athletes` keys before
 * the loader resolved.
 *
 * Trade-off vs the HTTP loader: ~10 kB inlined into the initial
 * bundle. Acceptable for an auth-walled dashboard where the user
 * sees the login screen translated immediately, and it removes the
 * whole class of "translation hadn't arrived yet" flakes from the
 * E2E suite.
 *
 * Adding a new locale (Spanish, German, etc.) means importing the
 * matching JSON above and adding the case below — same shape as
 * `client/src/test-utils/i18n-test.ts`.
 */
export class BundledJsonLoader implements TranslateLoader {
  private readonly bundles: Record<string, TranslationObject> = {
    en: EN_TRANSLATIONS as unknown as TranslationObject,
    it: IT_TRANSLATIONS as unknown as TranslationObject,
  };

  getTranslation(lang: string): Observable<TranslationObject> {
    return of(this.bundles[lang] ?? this.bundles['en']);
  }
}

/** PrimeNG's Material preset under the Budojo overrides. */
export function provideBudojoTheme(): EnvironmentProviders {
  return providePrimeNG({
    // Material preset adopts the Material Design 3 palette + component styling.
    // See client/CLAUDE.md § Design canon for the full rationale.
    theme: {
      preset: Material,
      options: {
        darkModeSelector: '.dark',
        // Wrap PrimeNG's theme in a CSS @layer so our own `:root`
        // overrides in `src/styles/budojo-theme.scss` win the cascade.
        //
        // Without this, PrimeNG injects its theme `<style>` tag AFTER
        // the bundled app styles, so both declarations land at `:root`
        // with identical specificity → source-order tiebreak → Material
        // defaults win and our tokens are silently ignored. The button
        // stays green (Material's primary) instead of turning indigo
        // (ours), etc.
        //
        // CSS layers invert the tiebreak: unlayered rules always beat
        // layered rules, regardless of source order. Our `:root` block
        // is unlayered SCSS — putting PrimeNG in a named layer lets it
        // be the baseline that our overrides then reliably override.
        //
        // See gotchas.md § Design system / PrimeNG precedence.
        cssLayer: { name: 'primeng' },
      },
    },
  });
}

/**
 * i18n (#273) — runtime locale switch with bundle-time JSON
 * resolution. `BundledJsonLoader` returns the imported JSON
 * synchronously, so a Cypress / Vitest assertion on translated
 * text never sees the raw `nav.athletes` key. Default + fallback
 * `en`; `LanguageService.bootstrap()` (called from `App.ngOnInit`)
 * picks the active locale from localStorage / navigator with the
 * `en` fallback.
 */
export function provideBudojoTranslations(): Provider[] {
  return provideTranslateService({
    loader: { provide: TranslateLoader, useClass: BundledJsonLoader },
    defaultLanguage: 'en',
    fallbackLang: 'en',
  });
}
