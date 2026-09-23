import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The client's test fixtures of the four belt ladders (#1801) and their
 * training modes (#1803) must be what the server sends. The client suite runs in a container that mounts `./client`
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

  it.each(arts)('labels every %s age division the registry sends (#1807)', (art) => {
    // The client falls back to the bare code for a division it has no words
    // for, so a registry change would show `u21` on the chart without failing
    // anything. Both sides are only visible from here.
    const en = JSON.parse(
      readFileSync(path.join(repo, 'client', 'public', 'assets', 'i18n', 'en.json'), 'utf8'),
    ) as { stats: { athletes: { bands: Record<string, Record<string, string>> } } };
    const registry = JSON.parse(
      readFileSync(path.join(repo, 'server', 'database', 'seed-data', 'martial-arts', `${art}.json`), 'utf8'),
    ) as { age_divisions: { divisions: { code: string }[] } };

    expect(Object.keys(en.stats.athletes.bands[art] ?? {}).sort()).toEqual(
      registry.age_divisions.divisions.map((d) => d.code).sort(),
    );
  });

  it.each(arts)('sends the %s training modes the registry names (#1803)', (art) => {
    const modes = JSON.parse(
      readFileSync(path.join(repo, 'client', 'src', 'test-utils', 'training-modes.json'), 'utf8'),
    ) as Record<string, string[]>;
    const registry = JSON.parse(
      readFileSync(path.join(repo, 'server', 'database', 'seed-data', 'martial-arts', `${art}.json`), 'utf8'),
    ) as { training_modes: string[] };

    expect(Object.keys(modes).sort()).toEqual([...arts].sort());
    expect(modes[art]).toEqual(registry.training_modes);
  });
});
