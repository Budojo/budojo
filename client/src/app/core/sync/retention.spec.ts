import { describe, expect, it } from 'vitest';
import { SeenVersion } from './decide';
import { VersionRef } from './layout';
import { pruneBatch, versionsToPrune } from './retention';

/** The versions the folder keeps (#2030): the newest densely, one a day going back. */
describe('versionsToPrune', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const START = Date.parse('2026-09-01T09:00:00Z');
  const ref = (seq: number, device = 'pc4f2a'): VersionRef => ({ seq, device });
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
  /** Both devices on the newest. */
  const bases = (versions: SeenVersion[]) => [ref(versions.length), ref(versions.length)];

  it('keeps every version of a folder that holds no more than the newest ten', () => {
    expect(versionsToPrune(line(10, 10), bases(line(10, 10)))).toEqual([]);
  });

  it('keeps the newest ten of one day and the first version, and deletes the rest', () => {
    expect(seqs(versionsToPrune(line(13, 13), bases(line(13, 13))))).toEqual([2, 3]);
  });

  it('keeps the newest of each of the fourteen most recent days behind the newest ten', () => {
    // Twenty days, two versions a day: the newest ten are days 16-20, days
    // 7-15 keep their newest, and the first version stays.
    const all = line(40, 2);
    const gone = versionsToPrune(all, bases(all));
    const kept = all.filter((version) => !gone.includes(version));

    expect(seqs(kept)).toEqual([
      1, 14, 16, 18, 20, 22, 24, 26, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    ]);
  });

  it('never deletes the newest, whatever the policy says', () => {
    expect(
      seqs(versionsToPrune(line(3, 3), bases(line(3, 3)), { keepRecent: 0, keepDays: 0 })),
    ).toEqual([2]);
  });

  describe('with two academies in the folder', () => {
    // The PC's line, 1-13; the phone's own first version above it, and its line.
    const phoneLine: SeenVersion[] = Array.from({ length: 12 }, (_, i) => ({
      seq: 14 + i,
      device: 'phone9c1e',
      parent: i === 0 ? null : ref(13 + i, 'phone9c1e'),
      created: START + 40 * DAY + i * 60_000,
    }));
    const folder = [...line(13, 13), ...phoneLine];

    it('deletes nothing while a device is on the other line: the owner has a question to answer there', () => {
      expect(versionsToPrune(folder, [ref(25, 'phone9c1e'), ref(13)])).toEqual([]);
    });

    it('deletes nothing on one device’s word alone', () => {
      expect(versionsToPrune(folder, [ref(25, 'phone9c1e')])).toEqual([]);
    });

    it('deletes the other line even when the latest’s was pruned while it was alone (#2117 review)', () => {
      // The PC's line, 1 and 6-50 (2-5 pruned before the phone published its
      // own first version at 14), the phone's first version beside it, and
      // both devices back on the PC's 50.
      const pcLine = line(50, 50).filter((version) => version.seq === 1 || version.seq >= 6);
      const phoneFirst: SeenVersion = {
        seq: 14,
        device: 'phone9c1e',
        parent: null,
        created: START + 60_000 * 13 + 30_000,
      };
      const gone = versionsToPrune([...pcLine, phoneFirst], [ref(50), ref(50)]);

      expect(gone).toContain(phoneFirst);
      expect(seqs(gone.filter((version) => version.device === 'pc4f2a'))).toEqual(
        Array.from({ length: 35 }, (_, i) => i + 6),
      );
    });

    it('deletes the line the owner left once both devices are on the latest’s, and prunes that one', () => {
      const gone = versionsToPrune(folder, [ref(25, 'phone9c1e'), ref(25, 'phone9c1e')]);

      expect(gone.filter((version) => version.device === 'pc4f2a')).toHaveLength(13);
      expect(seqs(gone.filter((version) => version.device === 'phone9c1e'))).toEqual([15]);
    });
  });

  describe('a push at a time (#2117 review)', () => {
    // A left academy: 25 versions, one a day; the live one beside it, 40,
    // the newest ten days; both devices on the live one.
    const left: SeenVersion[] = Array.from({ length: 25 }, (_, i) => ({
      seq: i + 1,
      device: 'aaaa1111',
      parent: i === 0 ? null : { seq: i, device: 'aaaa1111' },
      created: START + i * DAY,
    }));
    const live: SeenVersion[] = Array.from({ length: 40 }, (_, i) => ({
      seq: 26 + i,
      device: 'bbbb2222',
      parent: i === 0 ? null : { seq: 25 + i, device: 'bbbb2222' },
      created: START + 30 * DAY + Math.floor(i / 4) * DAY + (i % 4) * 60_000,
    }));
    const onLive = [
      { seq: 65, device: 'bbbb2222' },
      { seq: 65, device: 'bbbb2222' },
    ];

    it('deletes a left academy’s first version only once nothing else of its line is listed', () => {
      let folder = [...left, ...live];
      const firstLeft = left[0];
      for (let push = 0; push < 10; push++) {
        const batch = pruneBatch(folder, onLive, 20);
        if (batch.length === 0) break;
        if (batch.includes(firstLeft)) {
          expect(
            seqs(
              folder.filter((version) => version.device === 'aaaa1111' && version !== firstLeft),
            ),
          ).toEqual(
            seqs(batch.filter((version) => version.device === 'aaaa1111' && version !== firstLeft)),
          );
        }
        folder = folder.filter((version) => !batch.includes(version));
      }

      expect(folder.some((version) => version.device === 'aaaa1111')).toBe(false);
      // The live line as the policy keeps it in one go: the newest ten, the
      // newest of each day, and its first version.
      expect(seqs(folder)).toEqual(
        seqs(live.filter((version) => !versionsToPrune(live, onLive).includes(version))),
      );
    });
  });
});
