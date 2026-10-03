import { describe, expect, it } from 'vitest';
import { SeenVersion } from './decide';
import { VersionRef } from './layout';
import { versionsToPrune } from './retention';

/** The versions the folder keeps (#2030): the newest densely, one a day going back. */
describe('versionsToPrune', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const START = Date.parse('2026-09-01T09:00:00Z');
  const ref = (seq: number): VersionRef => ({ seq, device: 'pc4f2a' });
  /** A line of `count` versions, `perDay` a day, from 1 September. */
  function line(count: number, perDay: number): SeenVersion[] {
    return Array.from({ length: count }, (_, i) => ({
      seq: i + 1,
      device: 'pc4f2a',
      parent: i === 0 ? null : ref(i),
      created: START + Math.floor(i / perDay) * DAY + (i % perDay) * 60_000,
    }));
  }
  const seqs = (versions: SeenVersion[]) =>
    versions.map((version) => version.seq).sort((a, b) => a - b);

  it('keeps every version of a folder that holds no more than the newest ten', () => {
    expect(versionsToPrune(line(10, 10))).toEqual([]);
  });

  it('keeps the newest ten of one day, and deletes the rest, the first version included', () => {
    expect(seqs(versionsToPrune(line(13, 13)))).toEqual([1, 2, 3]);
  });

  it('keeps the newest of each of the fourteen most recent days behind the newest ten', () => {
    // Twenty days, two versions a day: the newest ten are days 16-20, and
    // days 7-15 keep their newest; days 1-6 go whole, and so does the
    // older version of days 7-15.
    const kept = line(40, 2).filter(
      (version) => !versionsToPrune(line(40, 2)).some((gone) => gone.seq === version.seq),
    );

    expect(seqs(kept)).toEqual([
      14, 16, 18, 20, 22, 24, 26, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    ]);
  });

  it('never deletes the newest, whatever the policy says', () => {
    expect(seqs(versionsToPrune(line(3, 3), { keepRecent: 0, keepDays: 0 }))).toEqual([1, 2]);
  });

  it('deletes nothing while two academies’ first versions are in the folder: the owner has to choose', () => {
    const phone: SeenVersion = {
      seq: 14,
      device: 'phone9c1e',
      parent: null,
      created: START + 30 * DAY,
    };

    expect(versionsToPrune([...line(13, 13), phone])).toEqual([]);
  });
});
