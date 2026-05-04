import { DOCUMENT, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { OfflineComponent } from './offline.component';
import { OnlineStatusService } from '../../../core/services/online-status.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

describe('OfflineComponent', () => {
  function setup(initialOnline = false) {
    const reload = vi.fn();
    const isOnlineSignal = signal(initialOnline);
    const fakeService = {
      isOnline: isOnlineSignal,
      isOffline: () => !isOnlineSignal(),
    } as unknown as OnlineStatusService;
    TestBed.configureTestingModule({
      imports: [OfflineComponent],
      providers: [
        ...provideI18nTesting(),
        { provide: DOCUMENT, useValue: { location: { reload } } },
        { provide: OnlineStatusService, useValue: fakeService },
      ],
    });
    const fixture = TestBed.createComponent(OfflineComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, reload, isOnlineSignal };
  }

  it('renders the brand glyph + title + message', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('app-brand-glyph')).not.toBeNull();
    expect(root.querySelector('.offline__title')?.textContent?.trim()).toBe(
      "You're offline",
    );
    expect(root.querySelector('.offline__message')?.textContent).toContain(
      "can't reach the network",
    );
  });

  it('exposes a manual retry CTA', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('[data-cy="offline-retry"]')).not.toBeNull();
  });

  it('retry() reloads the page', () => {
    const { cmp, reload } = setup();

    cmp.retry();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('auto-reloads on the offline → online transition', async () => {
    const { fixture, reload, isOnlineSignal } = setup(false);

    // Initial run while still offline — no reload, gate set.
    await fixture.whenStable();
    expect(reload).not.toHaveBeenCalled();

    isOnlineSignal.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('does NOT auto-reload when the user is already online on first render (avoids loop)', async () => {
    // Edge case: a stale redirect that lands the user on /offline while
    // the browser still reports online. The wasOffline gate must keep us
    // on the page so the user can hit "Try again" themselves.
    const { fixture, reload } = setup(true);

    await fixture.whenStable();

    expect(reload).not.toHaveBeenCalled();
  });
});
