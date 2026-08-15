/**
 * The desktop's cron (#1226, M11 #1218): calls `php artisan schedule:run`
 * every minute for as long as the app is open, plus once shortly after boot.
 *
 * What runs on each call is decided by the server — `routes/console-desktop.php`
 * replaces the web schedule's wall-clock anchors with tight cadences inside
 * time windows, so a reminder missed while the app was closed fires within
 * minutes of it opening. This module only has to tick reliably: never two
 * runs at once, never a hung run blocking forever, never a failure taking the
 * app down with it.
 *
 * The runner is injected so the tick is unit-tested with fake timers and the
 * real `schedule:run` is exercised separately against php.exe.
 */

export interface SchedulerRunResult {
  code: number | null;
  output: string;
  timedOut: boolean;
}

export type SchedulerEvent =
  | { type: 'ran'; code: number | null; durationMs: number; timedOut: boolean }
  | { type: 'skipped-overlap' }
  | { type: 'failed'; error: string }
  | { type: 'stopped' };

export interface SchedulerTickOptions {
  run: () => Promise<SchedulerRunResult>;
  log: (line: string) => void;
  onEvent?: (event: SchedulerEvent) => void;
  intervalMs?: number;
  initialDelayMs?: number;
  /** How long stop() waits for an in-flight run before giving up on it. */
  stopGraceMs?: number;
  now?: () => number;
}

const DEFAULTS = {
  intervalMs: 60_000,
  initialDelayMs: 5_000,
  stopGraceMs: 10_000,
} as const;

export class SchedulerTick {
  private timer: NodeJS.Timeout | null = null;
  private initial: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = false;
  private readonly now: () => number;

  constructor(private readonly options: SchedulerTickOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  get running(): boolean {
    return this.inFlight !== null;
  }

  start(): void {
    if (this.timer !== null || this.stopped) {
      return;
    }

    const interval = this.options.intervalMs ?? DEFAULTS.intervalMs;

    // One early run so a reminder missed while the app was closed does not
    // also wait a full minute after it opens.
    this.initial = setTimeout(() => {
      this.initial = null;
      void this.tick();
    }, this.options.initialDelayMs ?? DEFAULTS.initialDelayMs);
    this.initial.unref?.();

    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
  }

  /** Runs one tick unless one is already in flight. Exposed for the harness. */
  tick(): Promise<void> {
    if (this.stopped) {
      return Promise.resolve();
    }

    if (this.inFlight !== null) {
      // schedule:run can legitimately outlast a minute (a big purge on a
      // slow disk). Two overlapping runs would race each other on the same
      // rows; withoutOverlapping() guards each job, this guards the tick.
      this.options.onEvent?.({ type: 'skipped-overlap' });

      return this.inFlight;
    }

    const startedAt = this.now();
    this.inFlight = this.options
      .run()
      .then((result) => {
        const durationMs = this.now() - startedAt;
        this.options.log(
          `[scheduler] schedule:run exit ${result.code ?? 'null'} in ${durationMs}ms` +
            (result.timedOut ? ' (TIMED OUT)' : ''),
        );
        for (const line of result.output.split(/\r?\n/)) {
          if (line.trim().length > 0) {
            this.options.log(`[scheduler]   ${line}`);
          }
        }
        this.options.onEvent?.({ type: 'ran', code: result.code, durationMs, timedOut: result.timedOut });
      })
      .catch((error: unknown) => {
        // A failed tick is logged and the next one happens on time. It never
        // reaches the app: the scheduler is a convenience layer over jobs
        // that are all idempotent, so the worst case is "later".
        const message = error instanceof Error ? error.message : String(error);
        this.options.log(`[scheduler] tick failed: ${message}`);
        this.options.onEvent?.({ type: 'failed', error: message });
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  async stop(): Promise<void> {
    this.stopped = true;

    if (this.initial !== null) {
      clearTimeout(this.initial);
      this.initial = null;
    }
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.inFlight !== null) {
      const grace = this.options.stopGraceMs ?? DEFAULTS.stopGraceMs;
      await Promise.race([this.inFlight, new Promise<void>((resolve) => setTimeout(resolve, grace).unref?.())]);
    }

    this.options.onEvent?.({ type: 'stopped' });
  }
}
