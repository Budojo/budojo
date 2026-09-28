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

  it('times ten real check-ins of athletes not yet present, and undoes each', async () => {
    const calls: string[] = [];
    const fetcher = async (input: string, init?: RequestInit): Promise<Response> => {
      const path = input.replace(/^http:\/\/127\.0\.0\.1:\d+\/api\/v1/, '');
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${path.replace(/\?.*$/, '')}`);
      if (method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      const ids = Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }));
      const body = path.endsWith('/auth/login')
        ? { token: 'demo-token' }
        : path === '/athletes'
          ? { data: ids, meta: { total: 40 } }
          : path.startsWith('/attendance?')
            ? { data: [{ athlete_id: 1 }, { athlete_id: 2 }] }
            : path === '/attendance'
              ? { data: [{ id: 900 + JSON.parse(String(init?.body)).athlete_ids[0] }] }
              : { status: 'ok' };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const start = {
      port: 41234,
      demoEmail: 'admin@example.it',
      demoPassword: 'x',
    } as PhpServerStart;

    const result = await runBenchmark(start, fetcher);

    expect(result.athletes).toBe(40);
    expect(calls.filter((c) => c === 'GET /athletes')).toHaveLength(ROSTER_RUNS);
    expect(calls.filter((c) => c === 'POST /attendance')).toHaveLength(MARK_RUNS);
    // Athletes 1 and 2 are already present: the marks start from 3, each undone.
    expect(calls).toContain('DELETE /attendance/903');
    expect(calls).not.toContain('DELETE /attendance/901');
    expect(calls.filter((c) => c.startsWith('DELETE'))).toHaveLength(MARK_RUNS);
    expect(calls.slice(0, 2)).toEqual(['GET /health', 'POST /auth/login']);
  });

  it('stops with the step that failed', async () => {
    const fetcher = async (): Promise<Response> => new Response('{}', { status: 500 });
    const start = { port: 1, demoEmail: 'a', demoPassword: 'b' } as PhpServerStart;

    await expect(runBenchmark(start, fetcher)).rejects.toThrow('health: HTTP 500');
  });
});
