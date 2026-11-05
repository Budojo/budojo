/**
 * Closing Budojo sends what waits (#2194). The page pushes a write five seconds
 * after it (`PUSH_DELAY_MS`), and closing the window within those seconds used
 * to leave the write on this PC until its next opening, so the phone at the
 * mat never saw it.
 *
 * So the window's close is held while the page runs the sync once, with a
 * limit: a slow or absent network must never keep Budojo from closing. What
 * does not go now goes at the next opening, as before.
 */

/** How long a close waits for the page's last push. */
export const FLUSH_ON_CLOSE_MS = 10_000;

export type FlushOutcome = 'sent' | 'timeout' | 'failed';

/** Runs `ask` and settles at the first of its answer and the limit. */
export function flushWithin(ask: () => Promise<void>, limitMs: number = FLUSH_ON_CLOSE_MS): Promise<FlushOutcome> {
  return new Promise<FlushOutcome>((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), limitMs);
    ask().then(
      () => {
        clearTimeout(timer);
        resolve('sent');
      },
      () => {
        clearTimeout(timer);
        resolve('failed');
      },
    );
  });
}

/**
 * Whether a window's close waits for the page. Not once it already did, and
 * not when the app is quitting by another way (the updater's install, a second
 * pass of the quit): by then the server is stopping, and a push would meet no
 * one.
 */
export function holdsCloseForFlush(state: { alreadyFlushed: boolean; quitting: boolean }): boolean {
  return !state.alreadyFlushed && !state.quitting;
}
