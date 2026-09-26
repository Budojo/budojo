/**
 * One filesystem step, tried again while the file is only held for a moment
 * (#1909).
 *
 * On Windows a rename fails with EPERM or EBUSY while any process has a handle
 * in the way — and right after a restore has written a few hundred files, the
 * usual holder is the antivirus scanning them. It lets go within milliseconds;
 * without a retry, that is a failed restore. Any other error is thrown at once:
 * a full disk or a missing file does not get better by waiting.
 */
export interface RetryOptions {
  attempts: number;
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);

export async function retryWhileBusy(step: () => void, options: RetryOptions): Promise<void> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 1; ; attempt++) {
    try {
      step();

      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (attempt >= options.attempts || code === undefined || !TRANSIENT.has(code)) {
        throw error;
      }
      await sleep(options.delayMs);
    }
  }
}
