/**
 * The #2044 spike's measurements: Budojo's own server on the phone, driven
 * from the WebView as the real SPA will drive it.
 *
 * The native half is `PhpServerPlugin` (mobile/android). It reaches the page
 * through Capacitor's global rather than the `@capacitor/core` package, which
 * keeps the client free of a dependency this spike alone would need. #2034
 * wires the real runtime properly. Requests go out through `fetch`, which
 * Capacitor's native HTTP (enabled in capacitor.config.json) carries to
 * 127.0.0.1.
 */

export interface PhpServerStart {
  port: number;
  totalMs: number;
  unpackMs: number;
  migrateMs: number;
  serverMs: number;
  /** The first request, which compiles the framework. */
  firstRequestMs?: number;
  extracted: boolean;
  seeded: boolean;
  alreadyRunning?: boolean;
  /** How PHP compiled the server: OPcache's file cache, or no cache at all. */
  opcache?: 'file-cache' | 'off';
  demoEmail: string;
  demoPassword: string;
}

export interface PhpServerPlugin {
  start(): Promise<PhpServerStart>;
}

export interface BenchmarkResult {
  healthMs: number;
  loginMs: number;
  roster: Timings;
  mark: Timings;
  athletes: number;
}

export interface Timings {
  p50: number;
  p95: number;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const ROSTER_RUNS = 20;
export const MARK_RUNS = 10;

/** The plugin when the page runs inside the Android app; null in a browser. */
export function phpServerPlugin(): PhpServerPlugin | null {
  const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (capacitor?.Plugins?.['PhpServer'] as PhpServerPlugin | undefined) ?? null;
}

/** Nearest-rank percentile of a list of samples, in whole milliseconds. */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return Math.round(sorted[rank - 1]);
}

function timings(samples: readonly number[]): Timings {
  return { p50: percentile(samples, 50), p95: percentile(samples, 95) };
}

/** Today in the phone's local time, as the check-in sends it. */
export function localDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function timed<T>(work: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const result = await work();
  return [result, performance.now() - started];
}

async function json(response: Response, what: string): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new Error(`${what}: HTTP ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Health, login, the roster twenty times and ten check-ins of ten different
 * athletes: the read and the write the mat does most, against the demo
 * academy. The check-ins are undone afterwards, untimed.
 */
export async function runBenchmark(
  start: PhpServerStart,
  fetcher: Fetcher = (input, init) => fetch(input, init),
): Promise<BenchmarkResult> {
  const base = `http://127.0.0.1:${start.port}/api/v1`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const [, healthMs] = await timed(async () =>
    json(await fetcher(`${base}/health`, { headers }), 'health'),
  );
  const [login, loginMs] = await timed(async () =>
    json(
      await fetcher(`${base}/auth/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: start.demoEmail, password: start.demoPassword }),
      }),
      'login',
    ),
  );
  const authorised = { ...headers, Authorization: `Bearer ${String(login['token'])}` };

  const rosterSamples: number[] = [];
  let rosterIds: number[] = [];
  let athletes = 0;
  for (let run = 0; run < ROSTER_RUNS; run++) {
    const [page, ms] = await timed(async () =>
      json(await fetcher(`${base}/athletes`, { headers: authorised }), 'athletes'),
    );
    rosterSamples.push(ms);
    const data = page['data'] as { id: number }[];
    const meta = page['meta'] as { total?: number } | undefined;
    rosterIds = data.map((athlete) => athlete.id);
    athletes = meta?.total ?? data.length;
  }

  // Every timed mark is a real insert (#2050 review): the Action is idempotent,
  // so marking someone already present would measure the short path. Take
  // athletes not yet in today's register, time the mark, then remove the row
  // untimed so a second run finds the same state.
  const date = localDate();
  const today = await json(
    await fetcher(`${base}/attendance?date=${date}`, { headers: authorised }),
    'attendance list',
  );
  const present = new Set((today['data'] as { athlete_id: number }[]).map((row) => row.athlete_id));
  const markSamples: number[] = [];
  for (const athleteId of rosterIds.filter((id) => !present.has(id)).slice(0, MARK_RUNS)) {
    const [marked, ms] = await timed(async () =>
      json(
        await fetcher(`${base}/attendance`, {
          method: 'POST',
          headers: authorised,
          body: JSON.stringify({ date, athlete_ids: [athleteId] }),
        }),
        'attendance',
      ),
    );
    markSamples.push(ms);
    const created = (marked['data'] as { id: number }[])[0];
    if (created !== undefined) {
      const undo = await fetcher(`${base}/attendance/${created.id}`, {
        method: 'DELETE',
        headers: authorised,
      });
      if (!undo.ok) {
        throw new Error(`undo attendance: HTTP ${undo.status}`);
      }
    }
  }

  return {
    healthMs: Math.round(healthMs),
    loginMs: Math.round(loginMs),
    roster: timings(rosterSamples),
    mark: timings(markSamples),
    athletes,
  };
}
