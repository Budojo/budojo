import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { SyncService, SyncState } from '../../../core/sync/sync.service';
import { SyncPillComponent } from './sync-pill.component';

/** The sync state in the topbar (#2046, PRD § 6.2). */
describe('SyncPillComponent', () => {
  function setup(initial: SyncState) {
    const state = signal<SyncState>(initial);
    const sync = {
      state: state.asReadonly(),
      syncNow: vi.fn(async () => undefined),
      reconnect: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      imports: [SyncPillComponent],
      providers: [
        provideAnimationsAsync(),
        ...provideI18nTesting(),
        { provide: SyncService, useValue: sync },
      ],
    });
    const fixture = TestBed.createComponent(SyncPillComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const pill = () => el.querySelector<HTMLButtonElement>('[data-cy="sync-pill"]');
    return { fixture, state, sync, el, pill };
  }

  it('shows nothing where there is no sync', () => {
    const { pill } = setup({ kind: 'off' });

    expect(pill()).toBeNull();
  });

  it('stays quiet while all is in sync: the time, and the full sentence for a screen reader', () => {
    const at = new Date(2026, 9, 2, 21, 47).getTime();
    const { pill } = setup({ kind: 'synced', at });

    expect(pill()?.textContent).toContain('21:47');
    expect(pill()?.getAttribute('aria-label')).toBe('In sync at 21:47');
    expect(pill()?.classList).not.toContain('sync-pill--attention');
  });

  it('counts what waits to be sent', () => {
    const { pill } = setup({ kind: 'pending', count: 3, offline: true });

    expect(pill()?.textContent?.trim()).toBe('3');
    expect(pill()?.getAttribute('aria-label')).toBe('3 to send');
  });

  it('turns orange when the owner has something to do', () => {
    const { pill, fixture, state } = setup({ kind: 'reconnect' });
    expect(pill()?.classList).toContain('sync-pill--attention');

    state.set({ kind: 'ask', latest: { seq: 1, device: 'pc4f2a' } });
    fixture.detectChanges();
    expect(pill()?.classList).toContain('sync-pill--attention');
    expect(pill()?.getAttribute('aria-label')).toBe(
      'To decide: Drive holds another copy of the gym',
    );
  });

  it('offers «Sync now» in the detail, and «Reconnect Google» when Google let go', async () => {
    const { fixture, sync, state } = setup({ kind: 'failed', reason: 'Drive said 500' });
    const pill = fixture.componentInstance;

    await pill.act();
    expect(sync.syncNow).toHaveBeenCalledTimes(1);

    state.set({ kind: 'reconnect' });
    fixture.detectChanges();
    await pill.act();
    expect(sync.reconnect).toHaveBeenCalledTimes(1);
  });

  it('opens the detail with the reason a sync failed, the one log a phone shows', async () => {
    const { pill, fixture } = setup({ kind: 'failed', reason: 'Drive said 500' });

    pill()?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const detail = document.querySelector('[data-cy="sync-detail"]');
    expect(detail?.textContent).toContain('The sync did not go through');
    expect(detail?.textContent).toContain('Drive said 500');
  });

  it('gives the focus back to the pill when the detail closes from inside, but not from another field', () => {
    const { fixture, pill } = setup({ kind: 'synced', at: Date.now() });
    const component = fixture.componentInstance as unknown as {
      returnFocus(pill: HTMLElement): void;
    };
    const search = document.createElement('input');
    document.body.append(search);

    // A tap on the athletes search closed it: the field keeps the focus.
    search.focus();
    component.returnFocus(pill() as HTMLElement);
    expect(document.activeElement).toBe(search);

    // Escape, or the pill's own toggle: the focus fell to the page.
    search.blur();
    component.returnFocus(pill() as HTMLElement);
    expect(document.activeElement).toBe(pill());
    search.remove();
  });
});
