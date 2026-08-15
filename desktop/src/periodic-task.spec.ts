import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PeriodicTask, type PeriodicTaskEvent, type PeriodicRunResult } from './periodic-task.js';

/**
 * The scheduler tick (#1226): a reliable minute pulse around an injected
 * runner. What each pulse executes is the server's business.
 */

function ok(): PeriodicRunResult {
  return { code: 0, output: 'No scheduled commands are ready to run.', timedOut: false };
}

describe('PeriodicTask', () => {
  const events: PeriodicTaskEvent[] = [];
  const logs: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    events.length = 0;
    logs.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function make(run: () => Promise<PeriodicRunResult>, overrides: Partial<ConstructorParameters<typeof PeriodicTask>[0]> = {}) {
    return new PeriodicTask({
      run,
      log: (line) => logs.push(line),
      onEvent: (event) => events.push(event),
      intervalMs: 60_000,
      initialDelayMs: 5_000,
      ...overrides,
    });
  }

  it('runs once shortly after start, then every interval', async () => {
    const run = vi.fn(async () => ok());
    const tick = make(run);

    tick.start();
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(4);

    await tick.stop();
  });

  it('never overlaps: a slow run makes the next tick a no-op', async () => {
    // A purge on a slow disk can outlast a minute. Two schedule:run processes
    // racing each other over the same rows is exactly what withoutOverlapping
    // guards per job; this guards the tick itself.
    let release: (() => void) | null = null;
    const run = vi.fn(
      () =>
        new Promise<PeriodicRunResult>((resolve) => {
          release = () => resolve(ok());
        }),
    );
    const tick = make(run);

    tick.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: 'skipped-overlap' });

    release!();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);

    // Let the second run finish too, or stop() would wait out its grace period.
    release!();
    await vi.advanceTimersByTimeAsync(0);
    await tick.stop();
  });

  it('logs the exit code, duration and output of each run', async () => {
    const tick = make(async () => ({ code: 0, output: 'Running [budojo:purge-expired-login-attempts]\n', timedOut: false }));

    tick.start();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(logs.some((line) => /run exit 0 in \d+ms/.test(line))).toBe(true);
    expect(logs.some((line) => line.includes('purge-expired-login-attempts'))).toBe(true);

    await tick.stop();
  });

  it('survives a failing runner and ticks again on time', async () => {
    // A failed tick is a log line, never a crash: every job is idempotent, so
    // the worst case is "later".
    const run = vi.fn().mockRejectedValueOnce(new Error('spawn ENOENT')).mockResolvedValue(ok());
    const tick = make(run);

    tick.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(events).toContainEqual({ type: 'failed', error: 'spawn ENOENT' });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.type === 'ran')).toHaveLength(1);

    await tick.stop();
  });

  it('flags a timed-out run in the log', async () => {
    const tick = make(async () => ({ code: null, output: '', timedOut: true }));

    tick.start();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(logs.some((line) => line.includes('TIMED OUT'))).toBe(true);
    await tick.stop();
  });

  it('stops cleanly: no further runs, and it waits for an in-flight one', async () => {
    let release: (() => void) | null = null;
    const run = vi.fn(
      () =>
        new Promise<PeriodicRunResult>((resolve) => {
          release = () => resolve(ok());
        }),
    );
    const tick = make(run, { stopGraceMs: 10_000 });

    tick.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tick.running).toBe(true);

    let stopped = false;
    const stopping = tick.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(stopped).toBe(false);

    release!();
    await stopping;
    expect(stopped).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'stopped' });

    await vi.advanceTimersByTimeAsync(300_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gives up waiting after the grace period', async () => {
    const tick = make(() => new Promise<PeriodicRunResult>(() => undefined), { stopGraceMs: 2_000 });

    tick.start();
    await vi.advanceTimersByTimeAsync(5_000);

    let stopped = false;
    void tick.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(stopped).toBe(true);
  });
});
