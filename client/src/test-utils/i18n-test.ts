import { Provider } from '@angular/core';
import { provideTranslateService, TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

import EN_TRANSLATIONS from '../../public/assets/i18n/en.json';
import IT_TRANSLATIONS from '../../public/assets/i18n/it.json';

/**
 * Synchronous translate loader for vitest. Returns the bundled JSON
 * files directly via `of()` so component tests render translations
 * on the first change-detection cycle, with no async settle. Same
 * shape as the production loader (`BundledJsonLoader` in
 * `app.config.ts`, also synchronous since #273) — the test variant
 * exists only to keep the test bundle decoupled from the production
 * provider wiring.
 *
 * Both EN and IT are exposed so a test that needs to assert the IT
 * string can `inject(TranslateService).use('it')` after `setup()`.
 */
class SyncJsonLoader implements TranslateLoader {
  private readonly bundles: Record<string, TranslationObject> = {
    en: EN_TRANSLATIONS as unknown as TranslationObject,
    it: IT_TRANSLATIONS as unknown as TranslationObject,
  };

  getTranslation(lang: string): Observable<TranslationObject> {
    return of(this.bundles[lang] ?? this.bundles['en']);
  }
}

/**
 * Drop-in providers block for vitest setups that render templates with
 * `{{ '…' | translate }}` or call `TranslateService` directly. Wires
 * ngx-translate with a sync loader and English as the default + fallback.
 *
 * Usage:
 *   TestBed.configureTestingModule({
 *     imports: [MyComponent],
 *     providers: [...provideI18nTesting()],
 *   });
 */
export function provideI18nTesting(): Provider[] {
  return [
    provideTranslateService({
      loader: { provide: TranslateLoader, useClass: SyncJsonLoader },
      defaultLanguage: 'en',
      fallbackLang: 'en',
    }),
  ];
}
