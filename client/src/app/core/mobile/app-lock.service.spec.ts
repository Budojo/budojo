import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { AppLockAnswer, AppLockPlugin, appLockPlugin } from './app-lock';
import { AppLockService, AWAY_LIMIT_MS } from './app-lock.service';
import { APP_LOCK } from './shell-plugins';

/**
 * The fingerprint lock (#2159, PRD § 6.1): on opening, and on coming back after
 * five minutes in the background. The prompt itself is Android's; when to ask is
 * the page's rule, tested here.
 */
describe('the fingerprint lock (#2159)', () => {
  const OPENED = new Date('2026-10-25T18:00:00').getTime();
  let unlock: ReturnType<typeof vi.fn<AppLockPlugin['unlock']>>;
  let answer: (value: AppLockAnswer) => void;
  let fail: (error: unknown) => void;

  function lockWith(plugin: AppLockPlugin | null): AppLockService {
    TestBed.configureTestingModule({
      providers: [...provideI18nTesting(), { provide: APP_LOCK, useValue: plugin }],
    });
    return TestBed.inject(AppLockService);
  }

  function go(state: 'hidden' | 'visible', at: number): void {
    vi.setSystemTime(at);
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  /** Opened, the first prompt answered with the fingerprint. */
  async function opened(): Promise<AppLockService> {
    const lock = lockWith({ unlock });
    lock.start();
    answer({ unlocked: true, secure: true });
    await vi.waitFor(() => expect(lock.locked()).toBe(false));
    return lock;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(OPENED);
    unlock = vi.fn(
      () =>
        new Promise<AppLockAnswer>((resolve, reject) => {
          answer = resolve;
          fail = reject;
        }),
    );
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    vi.useRealTimers();
  });

  it('finds no plugin in a browser', () => {
    expect(appLockPlugin()).toBeNull();
  });

  it('never locks outside the Android app', () => {
    const lock = lockWith(null);
    lock.start();

    expect(lock.locked()).toBe(false);
  });

  it('is locked from the first frame, and asks at once on opening', async () => {
    const lock = lockWith({ unlock });
    // Before anything is asked: the gym never shows ahead of the prompt.
    expect(lock.locked()).toBe(true);

    lock.start();
    expect(unlock).toHaveBeenCalledExactlyOnceWith({ title: 'Unlock Budojo' });
    expect(lock.asking()).toBe(true);

    answer({ unlocked: true, secure: true });
    await vi.waitFor(() => expect(lock.locked()).toBe(false));
    expect(lock.asking()).toBe(false);
  });

  it('opens a phone with no screen lock, which the shell answers at once', async () => {
    const lock = lockWith({ unlock });
    lock.start();
    answer({ unlocked: true, secure: false });

    await vi.waitFor(() => expect(lock.locked()).toBe(false));
  });

  it('stays locked when the prompt is closed, and asks again only when asked', async () => {
    const lock = lockWith({ unlock });
    lock.start();
    answer({ unlocked: false, secure: true, code: 10, message: 'Cancelled' });
    await vi.waitFor(() => expect(lock.asking()).toBe(false));

    expect(lock.locked()).toBe(true);
    // Closing it is the owner's own choice: nothing to explain.
    expect(lock.problem()).toBeNull();
    expect(unlock).toHaveBeenCalledOnce();

    void lock.unlock();
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it("says why, in Android's words, when the phone refused for another reason", async () => {
    const lock = lockWith({ unlock });
    lock.start();
    answer({ unlocked: false, secure: true, code: 7, message: 'Too many attempts' });

    await vi.waitFor(() => expect(lock.problem()).toBe('Too many attempts'));
    expect(lock.locked()).toBe(true);
  });

  it('stays locked, and says why, when the shell itself fails', async () => {
    const lock = lockWith({ unlock });
    lock.start();
    fail(new Error('AppLock is not implemented on android'));

    await vi.waitFor(() => expect(lock.problem()).toBe('AppLock is not implemented on android'));
    expect(lock.locked()).toBe(true);
    expect(lock.asking()).toBe(false);
  });

  it('never puts two prompts up at once', () => {
    const lock = lockWith({ unlock });
    lock.start();
    void lock.unlock();

    expect(unlock).toHaveBeenCalledOnce();
  });

  it('stays open after less than five minutes away', async () => {
    const lock = await opened();

    go('hidden', OPENED + 1000);
    go('visible', OPENED + 1000 + AWAY_LIMIT_MS - 1);

    expect(lock.locked()).toBe(false);
    expect(unlock).toHaveBeenCalledOnce();
  });

  it('locks after five minutes away, and asks on the way back', async () => {
    const lock = await opened();

    go('hidden', OPENED + 1000);
    go('visible', OPENED + 1000 + AWAY_LIMIT_MS);

    expect(lock.locked()).toBe(true);
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it('counts each time away on its own, not the minutes added up', async () => {
    const lock = await opened();

    go('hidden', OPENED + 1000);
    go('visible', OPENED + 1000 + 3 * 60_000);
    go('hidden', OPENED + 1000 + 4 * 60_000);
    go('visible', OPENED + 1000 + 7 * 60_000);

    expect(lock.locked()).toBe(false);
  });

  it('asks again on the way back when the prompt went away with the app', async () => {
    const lock = lockWith({ unlock });
    lock.start();
    go('hidden', OPENED + 1000);
    // Android closes a prompt whose app leaves: ERROR_CANCELED.
    answer({ unlocked: false, secure: true, code: 5, message: 'Cancelled' });
    await vi.waitFor(() => expect(lock.asking()).toBe(false));

    go('visible', OPENED + 2000);

    expect(lock.locked()).toBe(true);
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it('does not count the PIN screen of its own prompt as time away', async () => {
    const lock = lockWith({ unlock });
    lock.start();
    // Before Android 11 the PIN is its own screen: the page goes away while
    // the prompt is up, and may come back only after its answer.
    go('hidden', OPENED + 1000);
    answer({ unlocked: true, secure: true });
    await vi.waitFor(() => expect(lock.locked()).toBe(false));
    go('visible', OPENED + 1000 + AWAY_LIMIT_MS + 1);

    expect(lock.locked()).toBe(false);
    expect(unlock).toHaveBeenCalledOnce();
  });

  it('stays open after the PIN that answered a return after five minutes', async () => {
    const lock = await opened();
    go('hidden', OPENED + 1000);
    go('visible', OPENED + 1000 + AWAY_LIMIT_MS);
    expect(lock.locked()).toBe(true);

    // The PIN's own screen, then the page back, after the answer.
    go('hidden', OPENED + 2000 + AWAY_LIMIT_MS);
    answer({ unlocked: true, secure: true });
    await vi.waitFor(() => expect(lock.locked()).toBe(false));
    go('visible', OPENED + 3000 + AWAY_LIMIT_MS);

    expect(lock.locked()).toBe(false);
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it('asks once when the app comes back while its prompt is still up', () => {
    const lock = lockWith({ unlock });
    lock.start();
    go('hidden', OPENED + 1000);
    go('visible', OPENED + 1000 + AWAY_LIMIT_MS + 1);

    expect(lock.locked()).toBe(true);
    expect(unlock).toHaveBeenCalledOnce();
  });
});
