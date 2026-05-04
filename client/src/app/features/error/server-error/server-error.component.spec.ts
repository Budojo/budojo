import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ServerErrorComponent } from './server-error.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

describe('ServerErrorComponent', () => {
  function setup() {
    const reload = vi.fn();
    TestBed.configureTestingModule({
      imports: [ServerErrorComponent],
      providers: [
        ...provideI18nTesting(),
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
        { provide: DOCUMENT, useValue: { location: { reload } } },
      ],
    });
    const fixture = TestBed.createComponent(ServerErrorComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, reload };
  }

  it('renders the brand glyph + (English-default) title + message', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('app-brand-glyph')).not.toBeNull();
    expect(root.querySelector('.server-error__title')?.textContent?.trim()).toBe(
      'Something went wrong',
    );
    expect(root.querySelector('.server-error__message')?.textContent).toContain(
      'unexpected error',
    );
  });

  it('exposes both a retry CTA and a back-home CTA', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('[data-cy="server-error-retry"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="server-error-home"]')).not.toBeNull();
  });

  it('retry() reloads the page so the failing route re-runs the failing request', () => {
    const { cmp, reload } = setup();

    cmp.retry();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('goHome() navigates to /dashboard/athletes — the dashboard guards do the rest', () => {
    const { cmp } = setup();
    const router = TestBed.inject(Router);

    cmp.goHome();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/athletes');
  });
});
