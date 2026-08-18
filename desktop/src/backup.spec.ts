import { describe, expect, it, vi } from 'vitest';

import {
  backupArchiveName,
  BackupService,
  buildManifest,
  checkRestore,
  isBackupArchive,
  planRetention,
  RETENTION,
  type BackupEntry,
  type BackupIO,
  type BackupManifest,
  type RetentionPolicy,
} from './backup.js';

/**
 * Backup & restore (#1228). The pure decisions are pinned here; the real
 * VACUUM INTO + zip + swap is exercised against php.exe in a harness.
 */

describe('backupArchiveName / isBackupArchive', () => {
  it('is sortable and recognisable', () => {
    const name = backupArchiveName(new Date(2026, 7, 15, 9, 5, 3));
    expect(name).toBe('budojo-backup-20260815-090503.zip');
    expect(isBackupArchive(name)).toBe(true);
    expect(isBackupArchive('random.zip')).toBe(false);
    expect(isBackupArchive('budojo-backup-x.txt')).toBe(false);
  });

  // The generator and the recogniser are two halves of one contract. If they
  // ever drift, every archive stops being recognised as one — and retention
  // silently has nothing to keep.
  it('recognises every name the generator can produce', () => {
    const moments = [
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 11, 31, 23, 59, 59),
      new Date(2026, 7, 15, 9, 5, 3),
    ];

    for (const moment of moments) {
      expect(isBackupArchive(backupArchiveName(moment))).toBe(true);
    }
  });

  // This is the load-bearing half (#1330). The backup folder belongs to the
  // owner, and `budojo-backup-keep-1.zip` is a name a person plausibly types.
  // Recognised by prefix and suffix alone it would be treated as ours — and
  // because a non-numeric third segment sorts AFTER every `YYYYMMDD`, a few of
  // them would occupy the whole recent tier and push the real archives out.
  it.each([
    'budojo-backup-keep-1.zip',
    'budojo-backup-before-upgrade.zip',
    'budojo-backup-.zip',
    'budojo-backup-2026081-090000.zip',
    'budojo-backup-20260815-09000.zip',
    'budojo-backup-20260815-090000.zip.bak',
    'my-budojo-backup-20260815-090000.zip',
  ])('does not claim %s as ours', (name) => {
    expect(isBackupArchive(name)).toBe(false);
  });
});

describe('planRetention', () => {
  // Six-hourly archives across four consecutive days — what the machine
  // actually produces, rather than one-per-day, because the whole point of the
  // policy is that those two look different.
  const dense = (day: string): string[] =>
    ['000000', '060000', '120000', '180000'].map((time) => `budojo-backup-${day}-${time}.zip`);

  const fourDays = [...dense('20260810'), ...dense('20260811'), ...dense('20260812'), ...dense('20260813')];

  const kept = (names: readonly string[], policy: RetentionPolicy): string[] => {
    const doomed = new Set(planRetention(names, policy));

    return names.filter((name) => !doomed.has(name)).sort();
  };

  describe('the recent tier', () => {
    it('keeps the newest N archives whatever day they fall on', () => {
      // 16 archives, keepRecent 6, no daily tier: the last 6 by time survive.
      expect(kept(fourDays, { keepRecent: 6, keepDays: 0 })).toEqual([
        'budojo-backup-20260812-120000.zip',
        'budojo-backup-20260812-180000.zip',
        'budojo-backup-20260813-000000.zip',
        'budojo-backup-20260813-060000.zip',
        'budojo-backup-20260813-120000.zip',
        'budojo-backup-20260813-180000.zip',
      ]);
    });

    it('deletes oldest first', () => {
      const doomed = planRetention(fourDays, { keepRecent: 6, keepDays: 0 });

      expect(doomed[0]).toBe('budojo-backup-20260810-000000.zip');
      expect([...doomed]).toEqual([...doomed].sort());
    });

    it('keeps everything when there is less than the policy asks for', () => {
      expect(planRetention(dense('20260810'), { keepRecent: 6, keepDays: 14 })).toEqual([]);
    });
  });

  describe('the daily tier', () => {
    // This is the whole reason #1330 exists: seven archives at six-hour spacing
    // is 42 hours of history, so a Friday mistake noticed on Monday had nothing
    // to roll back to. The daily tier buys depth without buying density.
    it('keeps the last archive of each recent day beyond the recent window', () => {
      const survivors = kept(fourDays, { keepRecent: 2, keepDays: 14 });

      expect(survivors).toContain('budojo-backup-20260810-180000.zip');
      expect(survivors).toContain('budojo-backup-20260811-180000.zip');
      expect(survivors).toContain('budojo-backup-20260812-180000.zip');
    });

    it('keeps only the LAST archive of a day, not the whole day', () => {
      const survivors = kept(fourDays, { keepRecent: 2, keepDays: 14 });

      expect(survivors).not.toContain('budojo-backup-20260810-000000.zip');
      expect(survivors).not.toContain('budojo-backup-20260810-060000.zip');
      expect(survivors).not.toContain('budojo-backup-20260810-120000.zip');
    });

    it('forgets days older than the window', () => {
      const old = [...dense('20260101'), ...dense('20260813')];

      expect(kept(old, { keepRecent: 1, keepDays: 1 })).toEqual(['budojo-backup-20260813-180000.zip']);
    });

    it('counts DAYS PRESENT, not calendar days — a machine that was off does not lose history', () => {
      // The app only backs up while it runs. Counting back over the calendar
      // would silently shorten the window to nothing after a fortnight away.
      const sparse = ['20260101', '20260601', '20260813'].flatMap((day) => dense(day));
      const survivors = kept(sparse, { keepRecent: 1, keepDays: 3 });

      expect(survivors).toContain('budojo-backup-20260101-180000.zip');
      expect(survivors).toContain('budojo-backup-20260601-180000.zip');
    });

    it('does not let the daily tier resurrect an archive the recent tier already keeps', () => {
      // Both tiers claim the newest archive of the newest day. Counting it
      // twice would quietly hold one fewer generation than the policy states.
      const survivors = kept(fourDays, { keepRecent: 6, keepDays: 4 });

      // 6 recent + 4 daily, of which 2 are the same archives: 8, not 10.
      expect(new Set(survivors).size).toBe(survivors.length);
      expect(survivors).toHaveLength(8);
    });
  });

  describe('the invariants a retention bug must never break', () => {
    // These are the tests that matter. Everything above is policy; this is the
    // line between a bug and unrecoverable data loss.
    it('never deletes the only backup, whatever the policy says', () => {
      expect(planRetention(['budojo-backup-20260810-090000.zip'], { keepRecent: 0, keepDays: 0 })).toEqual([]);
    });

    it('never deletes the newest archive, whatever the policy says', () => {
      const doomed = planRetention(fourDays, { keepRecent: 0, keepDays: 0 });

      expect(doomed).not.toContain('budojo-backup-20260813-180000.zip');
      expect(doomed).toHaveLength(fourDays.length - 1);
    });

    it('never touches a file that is not one of our archives', () => {
      const doomed = planRetention([...fourDays, 'notes.txt', 'budojo.sqlite', 'photo.jpg'], {
        keepRecent: 1,
        keepDays: 0,
      });

      expect(doomed).not.toContain('notes.txt');
      expect(doomed).not.toContain('budojo.sqlite');
      expect(doomed).not.toContain('photo.jpg');
    });

    // The reason `isBackupArchive` is strict. These are files the owner named
    // themselves in their own folder; the only correct behaviour is to be
    // completely blind to them — neither deleting them nor letting them
    // displace a real archive from the tier that guards against loss.
    it('is blind to a file the owner named to look like ours', () => {
      const theirs = Array.from({ length: 8 }, (_, i) => `budojo-backup-keep-${i}.zip`);
      const real = [...dense('20260810'), ...dense('20260811'), ...dense('20260812'), ...dense('20260813')];

      const doomed = planRetention([...real, ...theirs], RETENTION);
      const survivors = kept([...real, ...theirs], RETENTION);

      // Not one of theirs is proposed for deletion...
      expect(doomed.filter((name) => name.includes('keep-'))).toEqual([]);
      // ...and not one of them cost a real archive its place.
      expect(survivors.filter((name) => !name.includes('keep-'))).toEqual(kept(real, RETENTION));
    });

    it('survives an archive name with no parsable day rather than throwing', () => {
      expect(() =>
        planRetention(['budojo-backup-.zip', ...dense('20260813')], { keepRecent: 2, keepDays: 14 }),
      ).not.toThrow();
    });

    it('handles an empty directory', () => {
      expect(planRetention([], { keepRecent: 6, keepDays: 14 })).toEqual([]);
    });
  });

  describe('RETENTION — the shipped policy', () => {
    it('holds a fortnight of history instead of the 42 hours #1330 found', () => {
      // 6-hourly archives for 20 days: the oldest survivor must be ~14 days
      // back, not ~2. Asserting the outcome, not the constants.
      const days = Array.from({ length: 20 }, (_, i) => `202608${String(i + 1).padStart(2, '0')}`);
      const survivors = kept(days.flatMap(dense), RETENTION);

      expect(survivors[0]).toContain('20260807');
      expect(survivors.length).toBeGreaterThan(15);
      expect(survivors.length).toBeLessThan(25);
    });
  });
});

describe('checkRestore', () => {
  const manifest = (schema: string): BackupManifest => ({
    format: 1,
    appVersion: '1.2.3',
    schemaVersion: schema,
    createdAt: '2026-08-15T09:00:00.000Z',
  });

  it('allows an archive at the same schema', () => {
    expect(checkRestore(manifest('2026_05_28_100000'), '2026_05_28_100000')).toEqual({ ok: true });
  });

  it('allows an older archive — the boot migration brings it forward', () => {
    expect(checkRestore(manifest('2026_05_01_100000'), '2026_05_28_100000').ok).toBe(true);
  });

  it('refuses an archive from a newer app version', () => {
    // Its DB would be ahead of the installed code.
    const check = checkRestore(manifest('2026_09_01_100000'), '2026_05_28_100000');
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toMatch(/newer version/);
  });

  it('refuses a missing or malformed manifest', () => {
    expect(checkRestore(null, '2026_05_28_100000').ok).toBe(false);
    expect(checkRestore({ format: 2 } as unknown as BackupManifest, 'x').ok).toBe(false);
    expect(checkRestore({ format: 1 } as BackupManifest, 'x').ok).toBe(false);
  });
});

describe('buildManifest', () => {
  it('captures version, schema and timestamp', () => {
    expect(buildManifest({ appVersion: '2.0.0', schemaVersion: '2026_05_28_1', now: new Date('2026-08-15T09:00:00Z') })).toEqual({
      format: 1,
      appVersion: '2.0.0',
      schemaVersion: '2026_05_28_1',
      createdAt: '2026-08-15T09:00:00.000Z',
    });
  });
});

describe('BackupService', () => {
  function fakeIO(overrides: Partial<BackupIO> = {}): BackupIO {
    return {
      vacuumInto: vi.fn(async () => undefined),
      copyStorage: vi.fn(async () => undefined),
      writeManifest: vi.fn(async () => undefined),
      zipDir: vi.fn(async () => undefined),
      unzip: vi.fn(async () => undefined),
      readManifest: vi.fn(
        async (): Promise<Partial<BackupManifest> | null> => ({
          format: 1,
          appVersion: '1',
          schemaVersion: '2026_01_01_0',
          createdAt: 'x',
        }),
      ),
      currentSchemaVersion: vi.fn(async () => '2026_05_28_100000'),
      makeTempDir: vi.fn(async (kind) => `/tmp/${kind}`),
      removeDir: vi.fn(async () => undefined),
      listArchives: vi.fn(async () => [] as BackupEntry[]),
      removeArchive: vi.fn(async () => undefined),
      swapIn: vi.fn(async () => undefined),
      archivePathFor: (name) => `/backups/${name}`,
      ...overrides,
    };
  }

  function service(io: BackupIO, retention: RetentionPolicy = RETENTION) {
    return new BackupService({
      io,
      appVersion: '1.0.0',
      retention,
      log: () => undefined,
      now: () => new Date(2026, 7, 15, 9, 0, 0),
    });
  }

  it('vacuums, copies storage, writes the manifest, zips, then cleans up staging', async () => {
    const io = fakeIO();
    const path = await service(io).backup();

    expect(path).toBe('/backups/budojo-backup-20260815-090000.zip');
    expect(io.vacuumInto).toHaveBeenCalledWith('/tmp/backup/budojo.sqlite');
    expect(io.copyStorage).toHaveBeenCalledWith('/tmp/backup');
    expect(io.zipDir).toHaveBeenCalledWith('/tmp/backup', path);
    expect(io.removeDir).toHaveBeenCalledWith('/tmp/backup'); // finally, always
  });

  // A full disk is the failure this has to survive: the run dies at `zipDir`,
  // and if retention never runs the directory stays over the policy and every
  // later run dies the same way. Frees nothing at steady state — retention is
  // idempotent — but reclaims what a half-finished previous run left behind.
  it('still applies retention when the backup fails, so a full disk can recover', async () => {
    const archives: BackupEntry[] = Array.from({ length: 9 }, (_, i) => {
      const stamp = `2026080${i}-090000`;

      return { name: `budojo-backup-${stamp}.zip`, path: `/backups/x`, createdAt: 'x', sizeBytes: 1 };
    });
    const io = fakeIO({
      listArchives: vi.fn(async () => archives),
      zipDir: vi.fn(async () => {
        throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
      }),
    });

    await expect(service(io, { keepRecent: 7, keepDays: 7 }).backup()).rejects.toThrow('no space left');
    expect(io.removeArchive).toHaveBeenCalledWith('budojo-backup-20260800-090000.zip');
  });

  it('reports the original failure, not one raised while pruning after it', async () => {
    // Tidying up must never replace the error the caller has to act on.
    const io = fakeIO({
      zipDir: vi.fn(async () => {
        throw new Error('disk full');
      }),
      listArchives: vi.fn(async () => {
        throw new Error('directory unreadable');
      }),
    });

    await expect(service(io).backup()).rejects.toThrow('disk full');
  });

  it('cleans up staging even if the vacuum fails', async () => {
    const io = fakeIO({ vacuumInto: vi.fn(async () => { throw new Error('disk full'); }) });

    await expect(service(io).backup()).rejects.toThrow('disk full');
    expect(io.removeDir).toHaveBeenCalledWith('/tmp/backup');
    expect(io.zipDir).not.toHaveBeenCalled();
  });

  it('prunes to retention after a successful backup', async () => {
    const archives: BackupEntry[] = [
      '20260810-090000',
      '20260811-090000',
      '20260812-090000',
    ].map((s) => ({ name: `budojo-backup-${s}.zip`, path: `/backups/budojo-backup-${s}.zip`, createdAt: 'x', sizeBytes: 1 }));
    const io = fakeIO({ listArchives: vi.fn(async () => archives) });

    await service(io, { keepRecent: 2, keepDays: 2 }).backup();

    expect(io.removeArchive).toHaveBeenCalledWith('budojo-backup-20260810-090000.zip');
    expect(io.removeArchive).toHaveBeenCalledTimes(1);
  });

  it('restores a valid archive: extract, check, swap', async () => {
    const io = fakeIO();
    const check = await service(io).restore('budojo-backup-20260810-090000.zip');

    expect(check.ok).toBe(true);
    expect(io.unzip).toHaveBeenCalled();
    expect(io.swapIn).toHaveBeenCalledWith('/tmp/restore');
    expect(io.removeDir).toHaveBeenCalledWith('/tmp/restore');
  });

  it('refuses to swap in an archive from a newer app version', async () => {
    const io = fakeIO({
      readManifest: vi.fn(async () => ({ format: 1 as const, appVersion: '9', schemaVersion: '2027_01_01_0', createdAt: 'x' })),
    });

    const check = await service(io).restore('budojo-backup-newer.zip');

    expect(check.ok).toBe(false);
    expect(io.swapIn).not.toHaveBeenCalled();
    expect(io.removeDir).toHaveBeenCalledWith('/tmp/restore'); // still cleans up
  });

  it('lists archives newest first', async () => {
    const io = fakeIO({
      listArchives: vi.fn(async () => [
        { name: 'budojo-backup-20260810-090000.zip', path: 'a', createdAt: 'x', sizeBytes: 1 },
        { name: 'budojo-backup-20260812-090000.zip', path: 'b', createdAt: 'x', sizeBytes: 1 },
      ]),
    });

    expect((await service(io).list()).map((e) => e.name)).toEqual([
      'budojo-backup-20260812-090000.zip',
      'budojo-backup-20260810-090000.zip',
    ]);
  });
});
