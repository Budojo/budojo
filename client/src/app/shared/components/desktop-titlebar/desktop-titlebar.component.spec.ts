import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubBridge } from '../../../../test-utils/bridge-test';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { DesktopTitlebarComponent } from './desktop-titlebar.component';

/**
 * The version in the desktop title bar (#1401).
 *
 * The case worth pinning hardest is the quiet one: an *automatic* check must
 * not take over the bar. The six-hourly poll publishes exactly the same phases
 * a button press does, and a bar that announced "you're up to date" on its own
 * every few hours would be chatter nobody asked for.
 */

type BridgeWindow = Window & { __BUDOJO__?: ReturnType<typeof stubBridge> };
type StatusListener = (status: unknown) => void;

async function setup(): Promise<ComponentFixture<DesktopTitlebarComponent>> {
  await TestBed.configureTestingModule({
    imports: [DesktopTitlebarComponent],
    providers: [...provideI18nTesting()],
  }).compileComponents();

  const fixture = TestBed.createComponent(DesktopTitlebarComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return fixture;
}

const bar = (fixture: ComponentFixture<DesktopTitlebarComponent>): HTMLElement | null =>
  fixture.nativeElement.querySelector('[data-cy="desktop-titlebar"]');

describe('DesktopTitlebarComponent', () => {
  const bridgeWindow = window as BridgeWindow;

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // `afterEach` as well as `beforeEach`: `window` is shared with every other
  // spec in the worker, and leaving `__BUDOJO__` set would decide the "no
  // bridge on the web" cases elsewhere by test order.
  afterEach(() => {
    delete bridgeWindow.__BUDOJO__;
  });

  it('renders nothing on the web, where there is no bar to sit in', async () => {
    expect(bar(await setup())).toBeNull();
  });

  it('shows the running version at rest', async () => {
    bridgeWindow.__BUDOJO__ = stubBridge({ version: async () => '2.48.0' });

    expect(bar(await setup())?.textContent?.trim()).toBe('v2.48.0');
  });

  it('says it is checking, and then that there is nothing to get', async () => {
    let listener: StatusListener = () => undefined;
    bridgeWindow.__BUDOJO__ = stubBridge({
      version: async () => '2.48.0',
      update: {
        onStatus: (cb) => {
          listener = cb as StatusListener;
          return () => undefined;
        },
      },
    });

    const fixture = await setup();
    bar(fixture)!.click();

    listener({ phase: 'checking' });
    fixture.detectChanges();
    expect(bar(fixture)?.textContent).toContain('Checking');

    // The one piece of news the app never delivered — and the reason a button
    // was asked for in the first place.
    listener({ phase: 'up-to-date' });
    fixture.detectChanges();
    expect(bar(fixture)?.textContent).toContain('up to date');
  });

  it('stays quiet when the automatic check runs, and keeps showing the version', async () => {
    let listener: StatusListener = () => undefined;
    bridgeWindow.__BUDOJO__ = stubBridge({
      version: async () => '2.48.0',
      update: {
        onStatus: (cb) => {
          listener = cb as StatusListener;
          return () => undefined;
        },
      },
    });

    const fixture = await setup();

    // Nobody pressed anything: the six-hourly poll publishes the same phases.
    listener({ phase: 'checking' });
    fixture.detectChanges();
    expect(bar(fixture)?.textContent?.trim()).toBe('v2.48.0');

    listener({ phase: 'up-to-date' });
    fixture.detectChanges();
    expect(bar(fixture)?.textContent?.trim()).toBe('v2.48.0');
  });

  it('offers to install once an update is waiting, whoever found it', async () => {
    let listener: StatusListener = () => undefined;
    const installNow = vi.fn(async () => ({ ok: true }));
    bridgeWindow.__BUDOJO__ = stubBridge({
      version: async () => '2.48.0',
      update: {
        installNow,
        onStatus: (cb) => {
          listener = cb as StatusListener;
          return () => undefined;
        },
      },
    });

    const fixture = await setup();
    listener({ phase: 'ready', version: '2.49.0' });
    fixture.detectChanges();

    const button = bar(fixture)!;
    expect(button.textContent).toContain('v2.49.0');
    expect(button.textContent).toContain('Install');

    button.click();
    expect(installNow).toHaveBeenCalledTimes(1);
  });

  it('installs rather than re-checking once something is ready', async () => {
    let listener: StatusListener = () => undefined;
    const check = vi.fn(async () => ({ ok: true }));
    bridgeWindow.__BUDOJO__ = stubBridge({
      version: async () => '2.48.0',
      update: {
        check,
        onStatus: (cb) => {
          listener = cb as StatusListener;
          return () => undefined;
        },
      },
    });

    const fixture = await setup();
    listener({ phase: 'ready', version: '2.49.0' });
    fixture.detectChanges();
    bar(fixture)!.click();

    // Pressing a bar that says "install" must install, not start another poll.
    expect(check).not.toHaveBeenCalled();
  });

  it('gives up quietly on a build that cannot update itself', async () => {
    // A development run, an unpackaged build, version 0.0.0.
    bridgeWindow.__BUDOJO__ = stubBridge({
      version: async () => '2.48.0',
      update: { check: async () => ({ ok: false, reason: 'unavailable' as const }) },
    });

    const fixture = await setup();
    bar(fixture)!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Back to the version, and no longer offering — better than a button that
    // spins against nothing.
    expect(bar(fixture)?.textContent?.trim()).toBe('v2.48.0');
    expect((bar(fixture) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the download rather than the version while one is in flight', async () => {
    let listener: StatusListener = () => undefined;
    bridgeWindow.__BUDOJO__ = stubBridge({
      version: async () => '2.48.0',
      update: {
        onStatus: (cb) => {
          listener = cb as StatusListener;
          return () => undefined;
        },
      },
    });

    const fixture = await setup();
    listener({ phase: 'downloading', version: '2.49.0', percent: 40 });
    fixture.detectChanges();

    // Unlike `checking`, a download is worth showing unprompted: it is using
    // the owner's connection whether they asked for it or not.
    expect(bar(fixture)?.textContent).toContain('Downloading');
  });
});
