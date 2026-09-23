import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The client's test fixture of the four belt ladders must be what the server
 * sends (#1801). The client suite runs in a container that mounts `./client`
 * alone and cannot see the server's registry; this suite runs on the host
 * with the whole repo, so it is the side that can compare the two — the same
 * reason the title-bar colour pin lives here.
 */
describe('client ladder fixtures match the server registry', () => {
  const repo = path.join(process.cwd(), '..');
  const fixture = JSON.parse(
    readFileSync(path.join(repo, 'client', 'src', 'test-utils', 'ladders.json'), 'utf8'),
  ) as Record<string, unknown[]>;
  const arts = ['bjj', 'judo', 'karate', 'taekwondo'];

  it('covers every martial art and nothing else', () => {
    expect(Object.keys(fixture).sort()).toEqual([...arts].sort());
  });

  it.each(arts)('sends %s exactly as the registry describes it', (art) => {
    const registry = JSON.parse(
      readFileSync(path.join(repo, 'server', 'database', 'seed-data', 'martial-arts', `${art}.json`), 'utf8'),
    ) as {
      grades: { belt: string; max_stripes: number; count?: string; first?: number; kids?: boolean }[];
    };

    // The wire shape: `Grade::toArray()` fills the defaults the file omits.
    const wire = registry.grades.map((g) => ({
      belt: g.belt,
      max_stripes: g.max_stripes,
      count: g.count ?? 'stripe',
      first: g.first ?? 0,
      kids: g.kids ?? false,
    }));

    expect(fixture[art]).toEqual(wire);
  });
});
