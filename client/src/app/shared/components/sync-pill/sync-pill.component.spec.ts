import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { SyncService, SyncState } from '../../../core/sync/sync.service';
import { SyncPillComponent } from './sync-pill.component';

/** The sync state in the topbar (#2046, PRD § 6.2). */
describe('SyncPillComponent', () => {
  function setup(initial: SyncState, toDecideCount = 0) {
    const state = signal<SyncState>(initial);
    const toDecide = signal(toDecideCount);
    const sync = {
      state: state.asReadonly(),
      toDecide: toDecide.asReadonly(),
      syncNow: vi.fn(async () => undefined),
      reconnect: vi.fn(async () => undefined),
      resolve: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      imports: [SyncPillComponent],
      providers: [
        provideAnimationsAsync(),
        ...provideI18nTesting(),
        provideRouter([]),
        { provide: SyncService, useValue: sync },
      ],
    });
    const fixture = TestBed.createComponent(SyncPillComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const pill = () => el.querySelector<HTMLButtonElement>('[data-cy="sync-pill"]');
    return { fixture, state, toDecide, sync, el, pill };
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

    state.set({ kind: 'ask', latest: { seq: 1, device: 'pc4f2a' }, mine: false });
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

  it('counts what waits to be decided over a quiet state, and leads to the screen that answers it (#2038)', async () => {
    const at = new Date(2026, 9, 2, 21, 47).getTime();
    const { pill, fixture, state } = setup({ kind: 'synced', at }, 2);

    expect(pill()?.textContent?.trim()).toBe('2');
    expect(pill()?.getAttribute('aria-label')).toBe('2 to decide');
    expect(pill()?.classList).toContain('sync-pill--attention');

    pill()?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const decide = document.querySelector<HTMLElement>('[data-cy="sync-detail-decide"] button');
    expect(decide?.hasAttribute('autofocus')).toBe(true);
    decide?.click();
    expect(navigate).toHaveBeenCalledWith('/dashboard/sync/decide');

    // A lost link says more than what waits.
    state.set({ kind: 'reconnect' });
    fixture.detectChanges();
    expect(pill()?.getAttribute('aria-label')).not.toContain('to decide');
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

  describe('when the sync asks: two gyms, never merged (#2033)', () => {
    async function openDetail(fixture: ReturnType<typeof setup>['fixture']) {
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('[data-cy="sync-pill"]')
        ?.click();
      fixture.detectChanges();
      await fixture.whenStable();
    }
    const find = (cy: string) => document.querySelector<HTMLElement>(`[data-cy="${cy}"]`);
    const press = (cy: string) => {
      const el = find(cy);
      (el?.tagName === 'BUTTON' ? el : el?.querySelector('button'))?.click();
    };

    it('offers the PC’s gym or the one here, and says what a pick replaces before it is done', async () => {
      const { fixture, sync } = setup({
        kind: 'ask',
        latest: { seq: 1, device: 'pc4f2a' },
        mine: false,
      });
      await openDetail(fixture);

      expect(find('sync-ask-folder')?.textContent).toContain("Use the PC's gym");
      press('sync-ask-folder');
      fixture.detectChanges();

      expect(find('sync-ask-consequence')?.textContent).toContain('What it holds now is replaced');
      expect(sync.resolve).not.toHaveBeenCalled();

      press('sync-ask-confirm');
      await fixture.whenStable();
      expect(sync.resolve).toHaveBeenCalledWith('folder', { seq: 1, device: 'pc4f2a' });
    });

    it('says «the one on Drive» when the latest is this device’s own, as after a Restore', async () => {
      const { fixture } = setup({
        kind: 'ask',
        latest: { seq: 4, device: 'pc4f2a' },
        mine: true,
      });
      await openDetail(fixture);

      expect(find('sync-ask-folder')?.textContent).toContain('Use the one on Drive');
    });

    it('puts the focus on what a pick replaces, which describes «Confirm»', async () => {
      const { fixture } = setup({ kind: 'ask', latest: { seq: 1, device: 'pc4f2a' }, mine: false });
      await openDetail(fixture);

      press('sync-ask-device');
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));

      expect(document.activeElement).toBe(find('sync-ask-consequence'));
      expect(find('sync-ask-confirm')?.getAttribute('aria-describedby')).toBe(
        'sync-ask-consequence',
      );
    });

    it('confirms on the version the owner saw when picking, not one that came after', async () => {
      const { fixture, sync, state } = setup({
        kind: 'ask',
        latest: { seq: 1, device: 'pc4f2a' },
        mine: false,
      });
      await openDetail(fixture);
      press('sync-ask-folder');
      fixture.detectChanges();

      state.set({ kind: 'ask', latest: { seq: 2, device: 'pc4f2a' }, mine: false });
      fixture.detectChanges();
      press('sync-ask-confirm');
      await fixture.whenStable();

      expect(sync.resolve).toHaveBeenCalledWith('folder', { seq: 1, device: 'pc4f2a' });
    });

    it('names the phone when the phone published the gym on Drive', async () => {
      const { fixture } = setup({
        kind: 'ask',
        latest: { seq: 2, device: 'phone9c1e' },
        mine: false,
      });
      await openDetail(fixture);

      expect(find('sync-ask-folder')?.textContent).toContain("Use the phone's gym");
    });

    it('goes back without doing anything on «Cancel»', async () => {
      const { fixture, sync } = setup({
        kind: 'ask',
        latest: { seq: 1, device: 'pc4f2a' },
        mine: false,
      });
      await openDetail(fixture);

      press('sync-ask-device');
      fixture.detectChanges();
      expect(find('sync-ask-consequence')?.textContent).toContain('asks you which one to keep');
      press('sync-ask-cancel');
      fixture.detectChanges();

      expect(find('sync-ask-consequence')).toBeNull();
      expect(find('sync-ask-folder')).not.toBeNull();
      expect(sync.resolve).not.toHaveBeenCalled();
    });
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
