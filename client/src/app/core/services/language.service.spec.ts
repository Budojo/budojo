import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNG } from 'primeng/config';
import { LanguageService } from './language.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

describe('LanguageService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...provideI18nTesting()],
    });
    localStorage.removeItem('budojoLang');
  });

  function setNavigatorLanguage(lang: string): void {
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      get: () => lang,
    });
  }

  describe('bootstrap()', () => {
    it('reads the persisted choice from localStorage when set to a supported value', () => {
      localStorage.setItem('budojoLang', 'it');
      const service = TestBed.inject(LanguageService);
      service.bootstrap();
      expect(service.currentLang()).toBe('it');
    });

    it('ignores localStorage when its value is not a supported language', () => {
      localStorage.setItem('budojoLang', 'fr');
      setNavigatorLanguage('en-GB');
      const service = TestBed.inject(LanguageService);
      service.bootstrap();
      // navigator.language → 'en' (supported); a stale unsupported
      // localStorage entry should not poison the detection.
      expect(service.currentLang()).toBe('en');
    });

    it('falls back to navigator.language when localStorage is empty (en-GB → en)', () => {
      setNavigatorLanguage('en-GB');
      const service = TestBed.inject(LanguageService);
      service.bootstrap();
      expect(service.currentLang()).toBe('en');
    });

    it('detects Italian from navigator.language (it-IT → it)', () => {
      setNavigatorLanguage('it-IT');
      const service = TestBed.inject(LanguageService);
      service.bootstrap();
      expect(service.currentLang()).toBe('it');
    });

    it('falls back to en when navigator.language is something we do not support yet', () => {
      // Spanish / German / French etc. are on the roadmap (#271) but not
      // shipped — the user gets English until those JSONs land.
      setNavigatorLanguage('es-ES');
      const service = TestBed.inject(LanguageService);
      service.bootstrap();
      expect(service.currentLang()).toBe('en');
    });

    it('writes the active language onto <html lang="…"> for screen readers + :lang() selectors', () => {
      localStorage.setItem('budojoLang', 'it');
      const service = TestBed.inject(LanguageService);
      service.bootstrap();
      expect(document.documentElement.lang).toBe('it');
    });

    it('does NOT write back to localStorage during auto-detection (only explicit setLanguage persists)', () => {
      // First load on a fresh device picks up navigator.language. We
      // intentionally don't persist that choice — if the user later changes
      // their device language without ever opening our toggle, the next
      // session re-evaluates from scratch instead of being locked to the
      // first detected value.
      setNavigatorLanguage('it-IT');
      const service = TestBed.inject(LanguageService);
      service.bootstrap();
      expect(localStorage.getItem('budojoLang')).toBeNull();
    });
  });

  describe('setLanguage()', () => {
    it('flips the signal, persists the choice, and tells ngx-translate to switch', () => {
      const service = TestBed.inject(LanguageService);
      const translate = TestBed.inject(TranslateService);
      const useSpy = vi.spyOn(translate, 'use');

      service.setLanguage('it');

      expect(service.currentLang()).toBe('it');
      expect(localStorage.getItem('budojoLang')).toBe('it');
      expect(useSpy).toHaveBeenCalledWith('it');
    });

    it('updates <html lang> on every switch', () => {
      const service = TestBed.inject(LanguageService);
      service.setLanguage('it');
      expect(document.documentElement.lang).toBe('it');
      service.setLanguage('en');
      expect(document.documentElement.lang).toBe('en');
    });

    it('ignores an unsupported language string (defensive against template typos)', () => {
      const service = TestBed.inject(LanguageService);
      service.setLanguage('en');
      // @ts-expect-error — narrow-typed at the public API; we exercise
      // the runtime guard against a downcast caller passing a stale
      // language code (e.g. an old `'fr'` from localStorage).
      service.setLanguage('fr');
      expect(service.currentLang()).toBe('en');
      expect(localStorage.getItem('budojoLang')).toBe('en');
    });

    it('pushes the matching PrimeNG translation on every switch (#280)', () => {
      const service = TestBed.inject(LanguageService);
      const primeng = TestBed.inject(PrimeNG);
      const setSpy = vi.spyOn(primeng, 'setTranslation');

      service.setLanguage('it');
      // Italian month names land in PrimeNG's translation map, so the
      // <p-datepicker> calendar popover renders "Gennaio / Maggio /
      // dicembre" instead of PrimeNG's English defaults.
      const itCall = setSpy.mock.calls.at(-1)?.[0];
      expect(itCall?.monthNames).toContain('Maggio');
      expect(itCall?.today).toBe('Oggi');

      service.setLanguage('en');
      const enCall = setSpy.mock.calls.at(-1)?.[0];
      expect(enCall?.monthNames).toContain('May');
      expect(enCall?.today).toBe('Today');
    });
  });
});
