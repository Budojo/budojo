import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { AppLockAnswer, AppLockPlugin, appLockPlugin, AppLockState } from './app-lock';
import { AppLockService, AWAY_LIMIT_MS } from './app-lock.service';
import { APP_LOCK } from './shell-plugins';

/**
 * The fingerprint lock (#2159, PRD § 6.1): on opening, and on coming back after
 * five minutes in the background. The prompt is Android's, and the shell keeps
 * the facts (unlocked since the screen opened, the longest time away since);
 * when to ask is the page's rule, tested here.
 */
describe('the fingerprint lock (#2159)', () => {
  const NEVER: AppLockState = { unlocked: false, away: 0, closed: false };
  const YES: AppLockAnswer = { unlocked: true, secure: true };
  let shell: AppLockState;
  let unlock: ReturnType<typeof vi.fn<AppLockPlugin['unlock']>>;
  let state: ReturnType<typeof vi.fn<AppLockPlugin['state']>>;
  let answer: (value: AppLockAnswer) => void;
  let fail: (error: unknown) => void;

  function lockWith(plugin: AppLockPlugin | null): AppLockService {
    TestBed.configureTestingModule({
      providers: [...provideI18nTesting(), { provide: APP_LOCK, useValue: plugin }],
    });
    return TestBed.inject(AppLockService);
  }

  function go(visibility: 'hidden' | 'visible'): void {
    Object.defineProperty(document, 'visibilityState', { value: visibility, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  /** Lets the shell's answers reach the page. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  }

  /** Opened, and the first prompt answered with the fingerprint. */
  async function opened(): Promise<AppLockService> {
    const lock = lockWith({ unlock, state });
    lock.start();
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    answer(YES);
    shell = { unlocked: true, away: 0, closed: false };
    await vi.waitFor(() => expect(lock.locked()).toBe(false));
    return lock;
  }

  beforeEach(() => {
    shell = NEVER;
    state = vi.fn(() => Promise.resolve(shell));
    unlock = vi.fn(
      () =>
        new Promise<AppLockAnswer>((resolve, reject) => {
          answer = resolve;
          fail = reject;
        }),
    );
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
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
    const lock = lockWith({ unlock, state });
    // Before anything is asked: the gym never shows ahead of the prompt.
    expect(lock.locked()).toBe(true);

    lock.start();
    await vi.waitFor(() =>
      expect(unlock).toHaveBeenCalledExactlyOnceWith({ title: 'Unlock Budojo' }),
    );
    expect(lock.asking()).toBe(true);

    answer(YES);
    await vi.waitFor(() => expect(lock.locked()).toBe(false));
    expect(lock.asking()).toBe(false);
  });

  it('opens a phone with no screen lock, which the shell answers at once', async () => {
    const lock = lockWith({ unlock, state });
    lock.start();
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    answer({ unlocked: true, secure: false });

    await vi.waitFor(() => expect(lock.locked()).toBe(false));
  });

  it('does not ask again after a reload, when the shell says it was unlocked', async () => {
    // A sync pull reloads the page: the shell outlives it.
    shell = { unlocked: true, away: 60_000, closed: false };
    const lock = lockWith({ unlock, state });
    lock.start();

    await vi.waitFor(() => expect(lock.locked()).toBe(false));
    expect(unlock).not.toHaveBeenCalled();
  });

  it('never asks while the app is in the background, and asks once it is back', async () => {
    // Reloaded in the background, by a pull or a first start the owner left.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const lock = lockWith({ unlock, state });
    lock.start();
    await settle();
    expect(state).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();

    go('visible');
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    expect(lock.locked()).toBe(true);
  });

  it('stays open after less than five minutes away', async () => {
    const lock = await opened();

    go('hidden');
    shell = { unlocked: true, away: AWAY_LIMIT_MS - 1, closed: false };
    go('visible');
    await settle();

    expect(lock.locked()).toBe(false);
    expect(unlock).toHaveBeenCalledOnce();
  });

  it('locks after five minutes away, and asks on the way back', async () => {
    const lock = await opened();

    go('hidden');
    shell = { unlocked: true, away: AWAY_LIMIT_MS, closed: false };
    go('visible');

    await vi.waitFor(() => expect(unlock).toHaveBeenCalledTimes(2));
    expect(lock.locked()).toBe(true);
  });

  it('stays locked after a reload that follows five minutes away', async () => {
    shell = { unlocked: true, away: AWAY_LIMIT_MS + 1, closed: false };
    const lock = lockWith({ unlock, state });
    lock.start();

    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    expect(lock.locked()).toBe(true);
  });

  it('leaves the cover when the owner closes the prompt, until they ask or leave', async () => {
    const lock = lockWith({ unlock, state });
    lock.start();
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    // Closed with the app on the screen: the shell records it as the owner's.
    shell = { unlocked: false, away: 0, closed: true };
    answer({ unlocked: false, secure: true, code: 10, message: 'Cancelled' });
    await vi.waitFor(() => expect(lock.asking()).toBe(false));
    // Before Android 11 the PIN is its own screen: the page comes back after.
    go('visible');
    await settle();

    expect(lock.locked()).toBe(true);
    // Closing it is the owner's own choice: nothing to explain, and no new prompt.
    expect(lock.problem()).toBeNull();
    expect(unlock).toHaveBeenCalledOnce();

    // Leaving clears it in the shell: coming back is opening again.
    shell = { unlocked: false, away: 0, closed: false };
    go('hidden');
    go('visible');
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledTimes(2));
    shell = { unlocked: false, away: 0, closed: true };
    answer({ unlocked: false, secure: true, code: 13, message: 'Cancelled' });
    await vi.waitFor(() => expect(lock.asking()).toBe(false));

    // And its button asks, always.
    void lock.unlock();
    expect(unlock).toHaveBeenCalledTimes(3);
  });

  it('keeps the cover, without a prompt, after a reload that follows a closed one', async () => {
    // A sync pull reloads the page just after the owner closed the prompt.
    shell = { unlocked: false, away: 0, closed: true };
    const lock = lockWith({ unlock, state });
    lock.start();
    await vi.waitFor(() => expect(state).toHaveBeenCalledOnce());
    await settle();

    expect(lock.locked()).toBe(true);
    expect(unlock).not.toHaveBeenCalled();
  });

  it('asks again on the way back when the prompt went away with the app', async () => {
    const lock = lockWith({ unlock, state });
    lock.start();
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    go('hidden');
    // The shell refuses a prompt asked in the background with ERROR_CANCELED.
    // A prompt that goes away with the app answers it before Android 10, and
    // USER_CANCELED since, which the shell does not count as the owner's.
    answer({ unlocked: false, secure: true, code: 5, message: 'Not on the screen' });
    await vi.waitFor(() => expect(lock.asking()).toBe(false));
    // Nothing the owner did: nothing to explain.
    expect(lock.problem()).toBeNull();

    go('visible');

    await vi.waitFor(() => expect(unlock).toHaveBeenCalledTimes(2));
  });

  it("says why, in Android's words, when the phone refused for another reason", async () => {
    const lock = lockWith({ unlock, state });
    lock.start();
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    answer({ unlocked: false, secure: true, code: 7, message: 'Too many attempts' });

    await vi.waitFor(() => expect(lock.problem()).toBe('Too many attempts'));
    expect(lock.locked()).toBe(true);
  });

  it('stays locked, and says why, when the shell itself fails', async () => {
    const lock = lockWith({ unlock, state });
    lock.start();
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    fail(new Error('AppLock is not implemented on android'));

    await vi.waitFor(() => expect(lock.problem()).toBe('AppLock is not implemented on android'));
    expect(lock.locked()).toBe(true);
    expect(lock.asking()).toBe(false);
  });

  it('never puts two prompts up at once', async () => {
    const lock = lockWith({ unlock, state });
    lock.start();
    await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce());

    void lock.unlock();
    go('hidden');
    go('visible');
    await settle();

    expect(unlock).toHaveBeenCalledOnce();
  });
});
