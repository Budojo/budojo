import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type SupportedLanguage = 'en' | 'it';

/** All languages currently shipped by the SPA. The order in this list is
 *  the order surfaced in the sidebar toggle (#273). New entries (Spanish,
 *  German per #271) get appended; the existing two stay first. */
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'it'] as const;

const STORAGE_KEY = 'budojoLang';

/**
 * Manages the SPA's active language at runtime (#273). Backed by
 * ngx-translate's `TranslateService` for the actual string lookups;
 * this service is the **policy** layer on top — what the default is,
 * how the first-load language is detected, where the choice persists.
 *
 * Detection precedence on first load:
 *   1. `localStorage.budojoLang` if it carries a supported value.
 *   2. `navigator.language` if its 2-letter prefix matches a supported lang.
 *   3. `'en'` fallback (matches the framework default + `fallbackLang`).
 *
 * Persistence is opt-in: only an explicit `setLanguage()` call writes to
 * localStorage. The boot-time auto-detection does NOT write back, so the
 * initial preference stays inferred (and re-evaluates on the next session
 * if the user installs the app on a new device with a different navigator
 * language).
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  readonly currentLang = signal<SupportedLanguage>('en');

  bootstrap(): void {
    const lang = this.detectInitialLanguage();
    this.applyLanguage(lang);
  }

  setLanguage(lang: SupportedLanguage): void {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // localStorage can throw (Safari private mode, quota). The user
      // experience degrades to "language reverts on next visit" — not
      // worth a toast or a dialog.
    }
    this.applyLanguage(lang);
  }

  private detectInitialLanguage(): SupportedLanguage {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && this.isSupported(stored)) {
        return stored;
      }
    } catch {
      // see setLanguage() — same swallow.
    }
    const navigatorLang = this.document.defaultView?.navigator?.language ?? '';
    const prefix = navigatorLang.slice(0, 2).toLowerCase();
    if (this.isSupported(prefix)) {
      return prefix;
    }
    return 'en';
  }

  private applyLanguage(lang: SupportedLanguage): void {
    this.currentLang.set(lang);
    this.translate.use(lang);
    // `<html lang="…">` keeps screen readers + CSS `:lang(it)` selectors
    // aligned with the active language.
    this.document.documentElement.lang = lang;
  }

  private isSupported(value: string): value is SupportedLanguage {
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
  }
}
