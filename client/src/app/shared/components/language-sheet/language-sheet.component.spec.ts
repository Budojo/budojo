import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LanguageService, SupportedLanguage } from '../../../core/services/language.service';
import { LanguageSheetComponent } from './language-sheet.component';

@Component({
  standalone: true,
  imports: [LanguageSheetComponent],
  template: `<app-language-sheet />`,
})
class HostComponent {
  readonly sheet = viewChild.required(LanguageSheetComponent);
}

function setup(initial: SupportedLanguage = 'en') {
  const currentLang = signal<SupportedLanguage>(initial);
  const setLanguage = vi.fn((l: SupportedLanguage) => currentLang.set(l));
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      { provide: LanguageService, useValue: { currentLang, setLanguage } },
    ],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    host: fixture.componentInstance,
    setLanguage,
  };
}

describe('LanguageSheetComponent (#1109)', () => {
  it('is closed by default', () => {
    const { el } = setup();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('open() shows the English + Italian options, the active one marked aria-current', () => {
    const { fixture, el, host } = setup('en');
    host.sheet().open();
    fixture.detectChanges();

    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="lang-option-en"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="lang-option-it"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="lang-option-en"]')?.getAttribute('aria-current')).toBe(
      'true',
    );
    expect(el.querySelector('[data-cy="lang-option-it"]')?.getAttribute('aria-current')).toBeNull();
  });

  it('selecting a language sets it and closes the sheet', () => {
    const { fixture, el, host, setLanguage } = setup('en');
    host.sheet().open();
    fixture.detectChanges();

    (el.querySelector('[data-cy="lang-option-it"]') as HTMLElement).click();
    fixture.detectChanges();

    expect(setLanguage).toHaveBeenCalledWith('it');
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });
});
