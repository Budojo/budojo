import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  SwUpdate,
  UnrecoverableStateEvent,
  VersionEvent,
  VersionReadyEvent,
} from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdateService } from './app-update.service';

describe('AppUpdateService', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let activateUpdate: ReturnType<typeof vi.fn>;
  let checkForUpdate: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;
  let getRegistrations: ReturnType<typeof vi.fn>;
  let unregisterSpies: ReturnType<typeof vi.fn>[];
  let isEnabled: boolean;

  function setup(): AppUpdateService {
    versionUpdates = new Subject<VersionEvent>();
    unrecoverable = new Subject<UnrecoverableStateEvent>();
    activateUpdate = vi.fn().mockResolvedValue(true);
    checkForUpdate = vi.fn().mockResolvedValue(true);
    reload = vi.fn();
    unregisterSpies = [vi.fn().mockResolvedValue(true), vi.fn().mockResolvedValue(true)];
    getRegistrations = vi
      .fn()
      .mockResolvedValue([{ unregister: unregisterSpies[0] }, { unregister: unregisterSpies[1] }]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            get isEnabled() {
              return isEnabled;
            },
            versionUpdates,
            unrecoverable,
            activateUpdate,
            checkForUpdate,
          },
        },
        // DOCUMENT is provided as a TestBed token (not a private-field
        // override) so the spec interacts only with public DI surfaces —
        // a subsequent refactor that renames the service's `document`
        // field doesn't break the spec. Copilot caught the previous
        // `Object.defineProperty(service, 'document', ...)` shape on #305.
        //
        // `defaultView.navigator.serviceWorker` is also exposed via this
        // token — the SAFE_MODE recovery path (#398) walks the document
        // to reach `navigator.serviceWorker.getRegistrations()`. Mocking
        // it through DOCUMENT keeps the same DI-only test surface.
        {
          provide: DOCUMENT,
          useValue: {
            location: { reload },
            defaultView: { navigator: { serviceWorker: { getRegistrations } } },
          },
        },
      ],
    });
    return TestBed.inject(AppUpdateService);
  }

  beforeEach(() => {
    isEnabled = true;
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Belt-and-suspenders cleanup: the service registers a long-lived
    // setInterval inside start(); without explicit timer + module
    // teardown a leak across tests can manifest as flakes when
    // checkForUpdate() observers see calls that "belong" to a prior
    // test's interval. Copilot caught the missing teardown on #305.
    vi.clearAllTimers();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('start() is a no-op when the service worker is disabled', async () => {
    isEnabled = false;
    const service = setup();
    service.start();

    versionUpdates.next({ type: 'VERSION_READY' } as VersionReadyEvent);
    vi.advanceTimersByTime(60 * 60 * 1000);
    await Promise.resolve();

    expect(activateUpdate).not.toHaveBeenCalled();
    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('on VERSION_READY: activates the new SW then reloads the page', async () => {
    const service = setup();
    service.start();

    versionUpdates.next({ type: 'VERSION_READY' } as VersionReadyEvent);
    // activateUpdate is async — flush microtasks so the .then() runs.
    await Promise.resolve();
    await Promise.resolve();

    expect(activateUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('ignores non-VERSION_READY events from the same stream', async () => {
    const service = setup();
    service.start();

    versionUpdates.next({ type: 'VERSION_DETECTED' } as VersionEvent);
    versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED' } as VersionEvent);
    versionUpdates.next({ type: 'VERSION_INSTALLATION_FAILED' } as VersionEvent);
    await Promise.resolve();

    // Only VERSION_READY is load-bearing for the reload. Detection /
    // failure events flow through the SwUpdate stream too but do NOT
    // mean a usable bundle is sitting in the cache yet.
    expect(activateUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('schedules a periodic checkForUpdate every hour after start()', () => {
    const service = setup();
    service.start();

    // Nothing fired immediately — the periodic check is a follow-up
    // safety net for long-lived sessions, not a boot-time burst.
    expect(checkForUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('start() is idempotent — a second call does not double-subscribe', async () => {
    const service = setup();
    service.start();
    service.start();

    versionUpdates.next({ type: 'VERSION_READY' } as VersionReadyEvent);
    await Promise.resolve();
    await Promise.resolve();

    // Two start() calls would double-register the subscription, firing
    // activateUpdate twice for one VERSION_READY emission.
    expect(activateUpdate).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(60 * 60 * 1000);
    // Same shape: one start() means one interval. A second start() would
    // queue a parallel setInterval and we'd see 2 calls per tick.
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('on unrecoverable: unregisters every SW registration, then reloads (#398 — SAFE_MODE recovery)', async () => {
    // Vitest 4's useFakeTimers takes over queueMicrotask by default,
    // which serialises Promise.then resolutions in a way that's hard
    // to drive deterministically through `await Promise.resolve()`.
    // The recovery chain is `getRegistrations().then(allSettled).catch(...).finally(reload)` —
    // three nested microtasks. Switching to real timers for THIS
    // test keeps the assertion simple; the other tests stay on fake
    // timers because they actively need `vi.advanceTimersByTime` for
    // the periodic-check assertion.
    vi.useRealTimers();

    const service = setup();
    service.start();

    unrecoverable.next({
      type: 'UNRECOVERABLE_STATE',
      reason: 'hash mismatch on app shell',
    } as UnrecoverableStateEvent);

    // Wait for the full microtask chain to drain on the real
    // microtask queue. setImmediate is the canonical "after all
    // current microtasks" sync point in Node.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getRegistrations).toHaveBeenCalledOnce();
    expect(unregisterSpies[0]).toHaveBeenCalledOnce();
    expect(unregisterSpies[1]).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('on unrecoverable with no navigator.serviceWorker (e.g. older browser): reloads anyway', async () => {
    // Override the document so navigator.serviceWorker is undefined.
    // Reload is still wired so the spy stays observable.
    TestBed.resetTestingModule();
    versionUpdates = new Subject<VersionEvent>();
    unrecoverable = new Subject<UnrecoverableStateEvent>();
    activateUpdate = vi.fn().mockResolvedValue(true);
    checkForUpdate = vi.fn().mockResolvedValue(true);
    reload = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            get isEnabled() {
              return true;
            },
            versionUpdates,
            unrecoverable,
            activateUpdate,
            checkForUpdate,
          },
        },
        {
          provide: DOCUMENT,
          useValue: {
            location: { reload },
            defaultView: { navigator: {} },
          },
        },
      ],
    });
    const service = TestBed.inject(AppUpdateService);
    service.start();

    unrecoverable.next({
      type: 'UNRECOVERABLE_STATE',
      reason: 'whatever',
    } as UnrecoverableStateEvent);
    await Promise.resolve();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('on unrecoverable when getRegistrations() rejects: still reloads', async () => {
    vi.useRealTimers();
    const service = setup();
    service.start();
    getRegistrations.mockRejectedValueOnce(new Error('SecurityError'));

    unrecoverable.next({
      type: 'UNRECOVERABLE_STATE',
      reason: 'whatever',
    } as UnrecoverableStateEvent);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reload).toHaveBeenCalledOnce();
  });

  it('swallows activateUpdate() failures silently — no reload, no throw', async () => {
    const service = setup();
    // setup() seeded `activateUpdate` with a resolves-true default; swap
    // it for a reject after setup so the SwUpdate stub the service
    // already injected returns the rejection on next call. (Mutating the
    // useValue object's field works because Angular DI hands the SAME
    // reference to the service via inject.)
    const failingActivate = vi.fn().mockRejectedValue(new Error('activation failed'));
    (
      TestBed.inject(SwUpdate) as unknown as { activateUpdate: typeof failingActivate }
    ).activateUpdate = failingActivate;

    service.start();
    versionUpdates.next({ type: 'VERSION_READY' } as VersionReadyEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(failingActivate).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });
});
