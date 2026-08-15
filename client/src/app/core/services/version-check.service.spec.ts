import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { VERSION } from '../../../environments/version';
import { VersionCheckService } from './version-check.service';

/**
 * Build-bundle SHA used by every spec that wants the service to actually
 * run. The default `dev` sentinel skips the entire pipeline; tests pin
 * the writable `VERSION.sha` (TS const reassignment via `as`-cast) so
 * they can exercise the production path.
 */
const RUNNING_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

interface MockWindow extends EventTarget {
  location: { href: string; reload: ReturnType<typeof vi.fn> };
  navigator: { serviceWorker?: { getRegistrations: ReturnType<typeof vi.fn> } };
  caches?: { keys: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  history: { state: unknown; replaceState: ReturnType<typeof vi.fn> };
}

function makeWindow(initialHref: string): MockWindow {
  const target = new EventTarget() as MockWindow;
  target.location = { href: initialHref, reload: vi.fn() };
  target.navigator = {
    serviceWorker: {
      getRegistrations: vi
        .fn()
        .mockResolvedValue([{ unregister: vi.fn().mockResolvedValue(true) }]),
    },
  };
  target.caches = {
    keys: vi.fn().mockResolvedValue(['ngsw:db:v1', 'ngsw:db:v2']),
    delete: vi.fn().mockResolvedValue(true),
  };
  target.history = {
    state: null,
    replaceState: vi.fn((state: unknown, _: string, url?: string) => {
      target.history.state = state;
      if (url) target.location.href = url;
    }),
  };
  return target;
}

describe('VersionCheckService', () => {
  let win: MockWindow;
  let httpMock: HttpTestingController;
  let originalSha: string;

  function setup(href = 'https://x.test/'): VersionCheckService {
    win = makeWindow(href);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: DOCUMENT,
          useValue: {
            defaultView: win,
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(VersionCheckService);
  }

  beforeEach(() => {
    // VERSION is `as const`, but the runtime object's keys are still
    // mutable; tests bypass the readonly view to install a non-`dev`
    // SHA so the service exercises the production path.
    originalSha = VERSION.sha;
    (VERSION as { sha: string }).sha = RUNNING_SHA;
    vi.useFakeTimers();
  });

  afterEach(() => {
    (VERSION as { sha: string }).sha = originalSha;
    vi.clearAllTimers();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('is a no-op when VERSION.sha is the dev sentinel', () => {
    (VERSION as { sha: string }).sha = 'dev';
    const service = setup();

    service.start();

    httpMock.expectNone(() => true);
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('is a no-op on the desktop runtime (#1224) — no /version.json, no service worker', () => {
    // The Electron shell serves the bundle over app:// where a missing
    // /version.json is a real 404, and Electron owns updates. Guarded rather
    // than removed so the web build keeps the poll.
    const originalRuntime = environment.runtime;
    (environment as { runtime: string }).runtime = 'desktop';
    try {
      const service = setup();

      service.start();

      httpMock.expectNone(() => true);
      expect(win.location.reload).not.toHaveBeenCalled();
    } finally {
      (environment as { runtime: string }).runtime = originalRuntime;
    }
  });

  it('is a no-op when document.defaultView is null (SSR / non-browser bootstrap)', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: DOCUMENT,
          useValue: { defaultView: null },
        },
      ],
    });
    const ssrHttpMock = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(VersionCheckService);

    // Must not throw — previously fell back to a global `window`
    // reference which is undefined in SSR / Node test runners
    // without a DOM. Copilot caught this on PR #551.
    expect(() => service.start()).not.toThrow();
    ssrHttpMock.expectNone(() => true);
  });

  it('fetches /version.json on boot and stays silent on a SHA match', async () => {
    const service = setup();
    service.start();
    // Boot emission rides `timer(0, ...)` so we need to advance the
    // fake clock by a tick to let RxJS schedule the first tick.
    await vi.advanceTimersByTimeAsync(1);

    const req = httpMock.expectOne((r) => r.method === 'GET' && r.url === '/version.json');
    // Cache-bust query param defends against any aggressive proxy that
    // strips the no-cache headers — the URL itself becomes unique.
    expect(req.request.params.has('_')).toBe(true);
    req.flush({ tag: 'v1.0.0', sha: RUNNING_SHA, buildTime: '2026-01-01T00:00:00Z' });

    expect(win.location.reload).not.toHaveBeenCalled();
    expect(win.navigator.serviceWorker?.getRegistrations).not.toHaveBeenCalled();
    expect(win.caches?.keys).not.toHaveBeenCalled();
  });

  it('runs the nuclear cache-bust on a SHA mismatch', async () => {
    // Real timers for this case so we can wait the full nuke() promise
    // chain out without fighting a re-arming 20-min interval. The
    // boot emission still fires immediately because RxJS `timer(0,...)`
    // schedules a 0ms tick — the test still completes in <100ms.
    vi.useRealTimers();
    const service = setup();
    service.start();
    // Flush the boot tick so the HTTP request is in flight.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const req = httpMock.expectOne(() => true);
    req.flush({
      tag: 'v1.0.1',
      sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      buildTime: '2026-01-02T00:00:00Z',
    });

    // Settle the unregister + caches.delete + reload chain.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(win.navigator.serviceWorker?.getRegistrations).toHaveBeenCalledOnce();
    expect(win.caches?.keys).toHaveBeenCalledOnce();
    expect(win.caches?.delete).toHaveBeenCalledTimes(2); // two cache keys
    expect(win.location.reload).toHaveBeenCalledOnce();
  });

  it('swallows fetch errors silently — a network blip does not nuke the tab', async () => {
    const service = setup();
    service.start();
    await vi.advanceTimersByTimeAsync(1);

    const req = httpMock.expectOne(() => true);
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Network error' });

    expect(win.location.reload).not.toHaveBeenCalled();
    expect(win.navigator.serviceWorker?.getRegistrations).not.toHaveBeenCalled();
  });

  it('?force-update=1 triggers the nuke regardless of /version.json', async () => {
    const service = setup('https://x.test/dashboard?force-update=1');
    service.start();

    // No fetch should fire — the force path short-circuits before the
    // pipeline. The reload is enough.
    httpMock.expectNone(() => true);

    // Microtask flushes for the promise chain inside `nuke()`. The
    // chain is roughly: serviceWorker.getRegistrations() →
    // r.unregister() → outer Promise.allSettled → caches.keys() →
    // caches.delete() → outer Promise.allSettled([sw, caches])
    // .finally(() => location.reload()). Empirically settles in
    // under ~12 microtask ticks; we give it a generous buffer
    // because flake-on-microtask-count is the worst kind of flake.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    expect(win.history.replaceState).toHaveBeenCalledOnce();
    // The flag is stripped from the URL so the post-reload tab doesn't
    // re-fire the same handler in an infinite loop.
    expect(win.location.href).not.toContain('force-update');
    expect(win.location.reload).toHaveBeenCalledOnce();
  });

  it('start() is idempotent', async () => {
    const service = setup();
    service.start();
    service.start();
    service.start();
    await vi.advanceTimersByTimeAsync(1);

    // Three start() calls but only ONE outstanding boot fetch.
    httpMock.expectOne(() => true);
    httpMock.expectNone(() => true);
  });

  it('refetches on window focus and acts on the response', async () => {
    const service = setup();
    service.start();
    await vi.advanceTimersByTimeAsync(1);

    // Boot fetch — match, stay quiet.
    httpMock
      .expectOne(() => true)
      .flush({
        tag: 'v1.0.0',
        sha: RUNNING_SHA,
        buildTime: '2026-01-01T00:00:00Z',
      });

    // Tab gets backgrounded for hours, then user comes back —
    // dispatch focus, expect a fresh fetch.
    win.dispatchEvent(new Event('focus'));

    httpMock
      .expectOne(() => true)
      .flush({
        tag: 'v1.0.0',
        sha: RUNNING_SHA,
        buildTime: '2026-01-01T00:00:00Z',
      });

    expect(win.location.reload).not.toHaveBeenCalled();
  });
});
