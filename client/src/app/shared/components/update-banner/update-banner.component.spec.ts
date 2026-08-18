import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubBridge } from '../../../../test-utils/bridge-test';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { UpdateBannerComponent } from './update-banner.component';

/**
 * The update bar (#1339).
 *
 * What is worth pinning here is mostly about **absence**: this component sits
 * above every screen in the app, so the case that matters most is the one where
 * it renders nothing at all. Everything else is a sentence and a percentage.
 */

type BridgeWindow = Window & { __BUDOJO__?: ReturnType<typeof stubBridge> };

async function setup(): Promise<ComponentFixture<UpdateBannerComponent>> {
  await TestBed.configureTestingModule({
    imports: [UpdateBannerComponent],
    providers: [...provideI18nTesting()],
  }).compileComponents();

  const fixture = TestBed.createComponent(UpdateBannerComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return fixture;
}

const banner = (fixture: ComponentFixture<UpdateBannerComponent>): HTMLElement | null =>
  fixture.nativeElement.querySelector('[data-cy="update-banner"]');

describe('UpdateBannerComponent', () => {
  // Resolved inside the describe, not at module scope: the DOM environment is
  // not set up yet while the module body runs.
  const bridgeWindow = window as BridgeWindow;

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // `afterEach`, not only `beforeEach`. `window` is shared with every other
  // spec in the worker, so cleaning up on the way IN protects only this file —
  // the last test here would leave `__BUDOJO__` set, and
  // `desktop-bridge.service.spec.ts`'s "no bridge on the web" case would fail
  // depending on which order the two happened to run in.
  afterEach(() => {
    delete bridgeWindow.__BUDOJO__;
  });

  describe('when there is nothing to say', () => {
    // The reason this is acceptable at the top of every screen: in the normal
    // case it is not there, rather than there and empty.
    it('renders nothing while idle', async () => {
      bridgeWindow.__BUDOJO__ = stubBridge({
        update: { status: async () => ({ phase: 'idle' }) },
      });

      expect(banner(await setup())).toBeNull();
    });

    it('renders nothing outside Electron, where there is no bridge at all', async () => {
      expect(banner(await setup())).toBeNull();
    });

    it('renders nothing, rather than throwing, when the bridge rejects', async () => {
      // A bar that takes the whole app down with it would be a spectacularly bad
      // trade for a status line.
      bridgeWindow.__BUDOJO__ = stubBridge({
        update: {
          status: async () => {
            throw new Error('ipc gone');
          },
        },
      });

      expect(banner(await setup())).toBeNull();
    });
  });

  describe('while downloading', () => {
    beforeEach(() => {
      bridgeWindow.__BUDOJO__ = stubBridge({
        update: { status: async () => ({ phase: 'downloading', version: '2.44.1', percent: 47 }) },
      });
    });

    it('names the version and shows how far along it is', async () => {
      const fixture = await setup();
      const text = fixture.nativeElement.textContent ?? '';

      expect(banner(fixture)).not.toBeNull();
      expect(text).toContain('2.44.1');
      expect(text).toContain('47');
    });

    it('offers no install action while it is still downloading', async () => {
      // There is nothing on disk to install yet; a button here would quit the
      // app to run an installer that does not exist.
      const fixture = await setup();

      expect(fixture.nativeElement.querySelector('[data-cy="update-banner-install"]')).toBeNull();
    });

    it('exposes the progress to assistive technology, not only as a coloured width', async () => {
      const bar = (await setup()).nativeElement.querySelector('[role="progressbar"]');

      expect(bar?.getAttribute('aria-valuenow')).toBe('47');
      expect(bar?.getAttribute('aria-valuemax')).toBe('100');
    });

    it('announces politely — it must not interrupt what someone is doing', async () => {
      // `status`, never `alert`: an update downloading in the background is the
      // app doing its job, not something demanding attention.
      expect(banner(await setup())?.getAttribute('role')).toBe('status');
    });
  });

  describe('once ready', () => {
    beforeEach(() => {
      bridgeWindow.__BUDOJO__ = stubBridge({
        update: { status: async () => ({ phase: 'ready', version: '2.44.1' }) },
      });
    });

    it('says which version is waiting', async () => {
      const fixture = await setup();

      expect(fixture.nativeElement.querySelector('[data-cy="update-banner-ready"]')).not.toBeNull();
      expect(fixture.nativeElement.textContent).toContain('2.44.1');
    });

    // #1362 — closing the app installs silently, so someone who did that had no
    // idea whether anything was happening. This is the second path, not a
    // replacement for the first.
    it('offers to run the installer now', async () => {
      const fixture = await setup();

      expect(
        fixture.nativeElement.querySelector('[data-cy="update-banner-install"]'),
      ).not.toBeNull();
    });

    it('asks the main process to install, and disables the button on the way in', async () => {
      const installNow = vi.fn().mockResolvedValue({ ok: true });
      bridgeWindow.__BUDOJO__ = stubBridge({
        update: { status: async () => ({ phase: 'ready', version: '2.44.1' }), installNow },
      });
      const fixture = await setup();

      const button: HTMLButtonElement = fixture.nativeElement.querySelector(
        '[data-cy="update-banner-install"]',
      );
      button.click();
      fixture.detectChanges();

      expect(installNow).toHaveBeenCalled();
      // A success never comes back — the app is quitting — so the button has to
      // latch on the click rather than on a response.
      expect(button.disabled).toBe(true);
    });

    it('re-enables the button when the main process refuses', async () => {
      // The bar can outlive the download it describes. A refusal must not leave
      // a dead control behind.
      bridgeWindow.__BUDOJO__ = stubBridge({
        update: {
          status: async () => ({ phase: 'ready', version: '2.44.1' }),
          installNow: async () => ({ ok: false }),
        },
      });
      const fixture = await setup();

      const button: HTMLButtonElement = fixture.nativeElement.querySelector(
        '[data-cy="update-banner-install"]',
      );
      button.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(button.disabled).toBe(false);
    });

    it('drops the progress bar — there is no longer any progress to show', async () => {
      const fixture = await setup();

      expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    });
  });

  describe('changes arriving while the window is open', () => {
    // Without the push half, a download starting after the first paint would be
    // invisible until a reload — which is most of the point of the feature.
    it('repaints when the main process pushes a new status', async () => {
      // Collected in an array rather than a `let`: TypeScript cannot see an
      // assignment made inside the callback and narrows the variable to `never`
      // at the call site below.
      const pushes: ((status: UpdateStatus) => void)[] = [];

      bridgeWindow.__BUDOJO__ = stubBridge({
        update: {
          status: async () => ({ phase: 'idle' }),
          onStatus: (callback) => {
            pushes.push(callback);

            return () => undefined;
          },
        },
      });

      const fixture = await setup();
      expect(banner(fixture)).toBeNull();

      pushes[0]?.({ phase: 'downloading', version: '2.45.0', percent: 12 });
      fixture.detectChanges();

      expect(banner(fixture)).not.toBeNull();
      expect(fixture.nativeElement.textContent).toContain('2.45.0');
    });

    it('unsubscribes when destroyed, so a closed view stops being written to', async () => {
      const unsubscribe = vi.fn();
      bridgeWindow.__BUDOJO__ = stubBridge({
        update: { status: async () => ({ phase: 'idle' }), onStatus: () => unsubscribe },
      });

      (await setup()).destroy();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
