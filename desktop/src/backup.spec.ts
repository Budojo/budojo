import { describe, expect, it, vi } from 'vitest';

import {
  backupArchiveName,
  BackupService,
  buildManifest,
  checkRestore,
  isBackupArchive,
  planRetention,
  type BackupEntry,
  type BackupIO,
  type BackupManifest,
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
});

describe('planRetention', () => {
  const names = [
    'budojo-backup-20260810-090000.zip',
    'budojo-backup-20260811-090000.zip',
    'budojo-backup-20260812-090000.zip',
    'budojo-backup-20260813-090000.zip',
  ];

  it('deletes the oldest beyond the keep count', () => {
    expect(planRetention(names, 2)).toEqual([
      'budojo-backup-20260810-090000.zip',
      'budojo-backup-20260811-090000.zip',
    ]);
  });

  it('keeps everything when under the cap', () => {
    expect(planRetention(names, 7)).toEqual([]);
  });

  it('never deletes the only backup, even with keep 0', () => {
    // A retention bug must not be able to wipe the last good archive.
    expect(planRetention(['budojo-backup-20260810-090000.zip'], 0)).toEqual([]);
  });

  it('ignores files that are not archives', () => {
    expect(planRetention([...names, 'notes.txt', 'budojo.sqlite'], 3)).toEqual([
      'budojo-backup-20260810-090000.zip',
    ]);
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
      readManifest: vi.fn(async () => ({ format: 1, appVersion: '1', schemaVersion: '2026_01_01_0', createdAt: 'x' })),
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

  function service(io: BackupIO, keep = 7) {
    return new BackupService({ io, appVersion: '1.0.0', retentionKeep: keep, log: () => undefined, now: () => new Date(2026, 7, 15, 9, 0, 0) });
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

    await service(io, 2).backup();

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
