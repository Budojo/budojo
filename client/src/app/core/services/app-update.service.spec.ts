import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdateService } from './app-update.service';

describe('AppUpdateService', () => {
  let versionUpdates: Subject<VersionEvent>;
  let activateUpdate: ReturnType<typeof vi.fn>;
  let checkForUpdate: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;
  let isEnabled: boolean;

  function setup(): AppUpdateService {
    versionUpdates = new Subject<VersionEvent>();
    activateUpdate = vi.fn().mockResolvedValue(true);
    checkForUpdate = vi.fn().mockResolvedValue(true);
    reload = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            get isEnabled() {
              return isEnabled;
            },
            versionUpdates,
            activateUpdate,
            checkForUpdate,
          },
        },
        // DOCUMENT is provided as a TestBed token (not a private-field
        // override) so the spec interacts only with public DI surfaces —
        // a subsequent refactor that renames the service's `document`
        // field doesn't break the spec. Copilot caught the previous
        // `Object.defineProperty(service, 'document', ...)` shape on #305.
        {
          provide: DOCUMENT,
          useValue: { location: { reload } },
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
