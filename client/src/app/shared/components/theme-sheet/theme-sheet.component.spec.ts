import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { ResolvedTheme, ThemePreference, ThemeService } from '../../../core/services/theme.service';
import { ThemeSheetComponent } from './theme-sheet.component';

@Component({
  standalone: true,
  imports: [ThemeSheetComponent],
  template: `<app-theme-sheet />`,
})
class HostComponent {
  readonly sheet = viewChild.required(ThemeSheetComponent);
}

/**
 * The real service is not used: it writes to localStorage and toggles a class
 * on the shared `<html>`, which would leak between specs in a suite that runs
 * files in one document. The twin (`language-sheet.component.spec.ts`) fakes
 * its service for the same reason, and `theme.service.spec.ts` is where the
 * real one is exercised.
 */
function setup(initial: ThemePreference = 'system', resolvedTo: ResolvedTheme = 'light') {
  const preference = signal<ThemePreference>(initial);
  const resolved = signal<ResolvedTheme>(resolvedTo);
  const setPreference = vi.fn((p: ThemePreference) => preference.set(p));

  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      { provide: ThemeService, useValue: { preference, resolved, setPreference } },
    ],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();

  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    host: fixture.componentInstance,
    setPreference,
    resolved,
  };
}

const option = (el: HTMLElement, value: string): HTMLElement | null =>
  el.querySelector(`[data-cy="theme-option-${value}"]`);

describe('ThemeSheetComponent (#1793)', () => {
  it('is closed by default', () => {
    const { el } = setup();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('open() offers all three preferences, the active one marked aria-current', () => {
    const { fixture, el, host } = setup('dark');
    host.sheet().open();
    fixture.detectChanges();

    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    // Three, not a switch: `system` is a real answer and a two-state toggle
    // cannot express "follow the phone".
    expect(option(el, 'system')).not.toBeNull();
    expect(option(el, 'light')).not.toBeNull();
    expect(option(el, 'dark')).not.toBeNull();

    expect(option(el, 'dark')?.getAttribute('aria-current')).toBe('true');
    expect(option(el, 'system')?.getAttribute('aria-current')).toBeNull();
    expect(option(el, 'light')?.getAttribute('aria-current')).toBeNull();
  });

  it('choosing a preference sets it and closes the sheet', () => {
    const { fixture, el, host, setPreference } = setup('system');
    host.sheet().open();
    fixture.detectChanges();

    (option(el, 'dark') as HTMLElement).click();
    fixture.detectChanges();

    expect(setPreference).toHaveBeenCalledWith('dark');
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  describe('the `system` sub-label', () => {
    it('says which way the promise currently lands', () => {
      // "Light" and "Dark" are self-evident; "System" is a promise about
      // somewhere else, so it has to say where that lands right now.
      const { fixture, el, host } = setup('system', 'dark');
      host.sheet().open();
      fixture.detectChanges();

      expect(option(el, 'system')?.textContent).toContain('currently dark');
    });

    it('follows the resolved theme rather than the preference', () => {
      const { fixture, el, host, resolved } = setup('system', 'dark');
      host.sheet().open();
      fixture.detectChanges();
      expect(option(el, 'system')?.textContent).toContain('currently dark');

      // The OS flips at sunrise while the sheet is open.
      resolved.set('light');
      fixture.detectChanges();

      expect(option(el, 'system')?.textContent).toContain('currently light');
      expect(option(el, 'system')?.textContent).not.toContain('currently dark');
    });

    it('is on `system` alone', () => {
      const { fixture, el, host } = setup('system', 'dark');
      host.sheet().open();
      fixture.detectChanges();

      // Putting it on all three would read as three competing claims about
      // what is painted, when only one option is making a claim at all.
      expect(option(el, 'light')?.textContent).not.toContain('currently');
      expect(option(el, 'dark')?.textContent).not.toContain('currently');
    });
  });
});
