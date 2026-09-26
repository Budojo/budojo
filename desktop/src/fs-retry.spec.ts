import { describe, expect, it, vi } from 'vitest';

import { retryWhileBusy } from './fs-retry.js';

/**
 * #1909 — on Windows a rename fails with EPERM/EBUSY while anything holds a
 * handle in the way, and the usual holder is the antivirus scanning the files
 * a restore has just written. It lets go in milliseconds; a single attempt
 * turns that into a failed restore.
 */
const busy = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code });

describe('retryWhileBusy', () => {
  it('returns as soon as the step succeeds', async () => {
    const step = vi.fn(() => undefined);
    const sleep = vi.fn(async () => undefined);

    await retryWhileBusy(step, { attempts: 5, delayMs: 100, sleep });

    expect(step).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('tries again while the file is held, then succeeds', async () => {
    let calls = 0;
    const step = vi.fn(() => {
      calls++;
      if (calls < 3) throw busy(calls === 1 ? 'EPERM' : 'EBUSY');
    });
    const sleep = vi.fn(async () => undefined);

    await retryWhileBusy(step, { attempts: 5, delayMs: 100, sleep });

    expect(step).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it('gives up after the last attempt, with the last error', async () => {
    const step = vi.fn(() => {
      throw busy('EBUSY');
    });

    await expect(retryWhileBusy(step, { attempts: 3, delayMs: 1, sleep: async () => undefined })).rejects.toThrow('EBUSY');
    expect(step).toHaveBeenCalledTimes(3);
  });

  it('does not retry a failure waiting will not fix', async () => {
    const step = vi.fn(() => {
      throw busy('ENOSPC');
    });

    await expect(retryWhileBusy(step, { attempts: 5, delayMs: 1, sleep: async () => undefined })).rejects.toThrow('ENOSPC');
    expect(step).toHaveBeenCalledTimes(1);
  });
});
