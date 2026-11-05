import { describe, expect, it, vi } from 'vitest';
import { flushWithin, holdsCloseForFlush } from './close-flush.js';

/** Closing Budojo sends what waits, within a limit (#2194). */
describe('flushWithin', () => {
  it('answers sent once the page has pushed', async () => {
    await expect(flushWithin(async () => undefined, 1_000)).resolves.toBe('sent');
  });

  it('gives up at the limit, so no network never keeps Budojo open', async () => {
    vi.useFakeTimers();
    const outcome = flushWithin(() => new Promise<void>(() => undefined), 10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(outcome).resolves.toBe('timeout');
    vi.useRealTimers();
  });

  it('answers failed when the page could not push, and still lets the close go', async () => {
    await expect(flushWithin(async () => Promise.reject(new Error('offline')), 1_000)).resolves.toBe(
      'failed',
    );
  });
});

describe('holdsCloseForFlush', () => {
  it('holds the first close of a running app', () => {
    expect(holdsCloseForFlush({ alreadyFlushed: false, quitting: false })).toBe(true);
  });

  it('lets the second close through, and any close once the app is quitting', () => {
    expect(holdsCloseForFlush({ alreadyFlushed: true, quitting: false })).toBe(false);
    expect(holdsCloseForFlush({ alreadyFlushed: false, quitting: true })).toBe(false);
  });
});
