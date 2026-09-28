import {
  localDate,
  MARK_RUNS,
  percentile,
  PhpServerStart,
  ROSTER_RUNS,
  runBenchmark,
} from './php-spike';

describe('php-spike (#2044)', () => {
  it('takes the nearest-rank percentile', () => {
    const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(samples, 50)).toBe(50);
    expect(percentile(samples, 95)).toBe(100);
    expect(percentile([], 50)).toBe(0);
  });

  it('dates the check-in in local time, not UTC', () => {
    expect(localDate(new Date(2026, 8, 30, 23, 30))).toBe('2026-09-30');
  });

  it('logs in, reads the roster and marks a presence the planned number of times', async () => {
    const calls: string[] = [];
    const fetcher = async (input: string, init?: RequestInit): Promise<Response> => {
      calls.push(
        `${init?.method ?? 'GET'} ${input.replace(/^http:\/\/127\.0\.0\.1:\d+\/api\/v1/, '')}`,
      );
      const body = input.endsWith('/auth/login')
        ? { token: 'demo-token' }
        : input.endsWith('/athletes')
          ? { data: [{ id: 7 }], meta: { total: 40 } }
          : { status: 'ok', data: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const start: PhpServerStart = {
      port: 41234,
      totalMs: 0,
      unpackMs: 0,
      migrateMs: 0,
      serverMs: 0,
      extracted: false,
      seeded: false,
      demoEmail: 'admin@example.it',
      demoPassword: 'x',
    };

    const result = await runBenchmark(start, fetcher);

    expect(result.athletes).toBe(40);
    expect(calls.filter((c) => c === 'GET /athletes')).toHaveLength(ROSTER_RUNS);
    expect(calls.filter((c) => c === 'POST /attendance')).toHaveLength(MARK_RUNS);
    expect(calls[0]).toBe('GET /health');
    expect(calls[1]).toBe('POST /auth/login');
  });

  it('stops with the step that failed', async () => {
    const fetcher = async (): Promise<Response> => new Response('{}', { status: 500 });
    const start = { port: 1, demoEmail: 'a', demoPassword: 'b' } as PhpServerStart;

    await expect(runBenchmark(start, fetcher)).rejects.toThrow('health: HTTP 500');
  });
});
