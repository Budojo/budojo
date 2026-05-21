import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LanguageService, SupportedLanguage } from '../../../core/services/language.service';
import { SidebarFooterMetaComponent } from './sidebar-footer-meta.component';

interface LanguageServiceStub {
  currentLang: ReturnType<typeof signal<SupportedLanguage>>;
  setLanguage: ReturnType<typeof vi.fn>;
}

function setup(initialLang: SupportedLanguage = 'en'): {
  fixture: ComponentFixture<SidebarFooterMetaComponent>;
  langSvc: LanguageServiceStub;
} {
  const langSvc: LanguageServiceStub = {
    currentLang: signal<SupportedLanguage>(initialLang),
    setLanguage: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [SidebarFooterMetaComponent],
    providers: [
      provideRouter([]),
      ...provideI18nTesting(),
      { provide: LanguageService, useValue: langSvc },
    ],
  });
  const fixture = TestBed.createComponent(SidebarFooterMetaComponent);
  fixture.detectChanges();
  return { fixture, langSvc };
}

describe('SidebarFooterMetaComponent (#902)', () => {
  it('renders both language pills with the active one disabled + aria-current', () => {
    const { fixture } = setup('en');
    const en: HTMLButtonElement = fixture.nativeElement.querySelector('[data-cy="lang-toggle-en"]');
    const it: HTMLButtonElement = fixture.nativeElement.querySelector('[data-cy="lang-toggle-it"]');
    expect(en).not.toBeNull();
    expect(it).not.toBeNull();
    expect(en.disabled).toBe(true);
    expect(it.disabled).toBe(false);
    expect(en.getAttribute('aria-current')).toBe('true');
    expect(it.getAttribute('aria-current')).toBeNull();
  });

  it('flips active state when the active lang is IT', () => {
    const { fixture } = setup('it');
    const en: HTMLButtonElement = fixture.nativeElement.querySelector('[data-cy="lang-toggle-en"]');
    const it: HTMLButtonElement = fixture.nativeElement.querySelector('[data-cy="lang-toggle-it"]');
    expect(en.disabled).toBe(false);
    expect(it.disabled).toBe(true);
    expect(it.getAttribute('aria-current')).toBe('true');
  });

  it('clicking the inactive pill calls LanguageService.setLanguage with that code', () => {
    const { fixture, langSvc } = setup('en');
    const it: HTMLButtonElement = fixture.nativeElement.querySelector('[data-cy="lang-toggle-it"]');
    it.click();
    expect(langSvc.setLanguage).toHaveBeenCalledWith('it');
  });

  it('points the Privacy link at /privacy on EN and /privacy/it on IT', () => {
    const { fixture, langSvc } = setup('en');
    const link = (): HTMLAnchorElement =>
      fixture.nativeElement.querySelector('[data-cy="sidebar-privacy-link"]');
    expect(link().getAttribute('href')).toBe('/privacy');
    langSvc.currentLang.set('it');
    fixture.detectChanges();
    expect(link().getAttribute('href')).toBe('/privacy/it');
  });

  it('renders Help and version inside the version line', () => {
    const { fixture } = setup();
    const help: HTMLAnchorElement = fixture.nativeElement.querySelector(
      '[data-cy="sidebar-help-link"]',
    );
    const version: HTMLElement = fixture.nativeElement.querySelector('[data-cy="sidebar-version"]');
    expect(help.getAttribute('href')).toBe('/help');
    // VERSION.tag from the build-time stub — sentinel `dev` outside CI.
    expect(version.textContent?.trim().length).toBeGreaterThan(0);
  });
});
