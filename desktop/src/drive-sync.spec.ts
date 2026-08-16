import { describe, expect, it } from 'vitest';

import { mergeArchiveViews, planSync, REMOTE_KEEP } from './drive-sync.js';

/**
 * What to upload and what to delete (#1301). Pure decisions — no network, no
 * disk. `drive-io.ts` carries them out.
 *
 * The invariant that matters throughout: **never leave the account with zero
 * archives**, and never delete a remote copy before its replacement exists. A
 * sync bug must degrade to "an old backup is still up there", never to "the
 * backup is gone".
 */

const local = (name: string, sizeBytes = 100) => ({
  name,
  path: `/backups/${name}`,
  createdAt: '2026-08-16T12:00:00.000Z',
  sizeBytes,
});
const remote = (name: string, id = `id-${name}`, size = 100) => ({ name, id, size });

describe('planSync', () => {
  it('uploads a local archive the account has never seen', () => {
    const plan = planSync([local('budojo-backup-20260816-120000.zip')], [], REMOTE_KEEP);

    expect(plan.toUpload).toEqual(['budojo-backup-20260816-120000.zip']);
    expect(plan.toDelete).toEqual([]);
  });

  it('uploads nothing when the newest archive is already up there', () => {
    const name = 'budojo-backup-20260816-120000.zip';

    expect(planSync([local(name)], [remote(name)], REMOTE_KEEP).toUpload).toEqual([]);
  });

  // Names carry a sortable timestamp, so "newest" is decidable without asking
  // Drive for mtimes — which would be a second source of truth that can skew.
  it('uploads the newest first when several are missing', () => {
    const plan = planSync(
      [
        local('budojo-backup-20260814-090000.zip'),
        local('budojo-backup-20260816-120000.zip'),
        local('budojo-backup-20260815-090000.zip'),
      ],
      [],
      REMOTE_KEEP,
    );

    expect(plan.toUpload[0]).toBe('budojo-backup-20260816-120000.zip');
  });

  it('re-uploads when the remote copy is a different size — a truncated upload is not a backup', () => {
    const name = 'budojo-backup-20260816-120000.zip';
    const plan = planSync([local(name, 5_000)], [remote(name, 'id-1', 12)], REMOTE_KEEP);

    expect(plan.toUpload).toEqual([name]);
    // The stunted copy goes, but only as part of replacing it.
    expect(plan.toDelete).toEqual(['id-1']);
  });

  it('prunes the oldest once the account holds more than the keep count', () => {
    const remotes = Array.from({ length: REMOTE_KEEP + 3 }, (_, i) =>
      remote(`budojo-backup-2026080${i}-090000.zip`, `id-${i}`),
    );

    const plan = planSync([], remotes, REMOTE_KEEP);

    expect(plan.toDelete).toEqual(['id-0', 'id-1', 'id-2']);
  });

  // The retention rule #1228 established for local archives, restated for the
  // remote copy: a pruning bug must never be able to empty the account.
  it('never deletes the newest, even asked to keep zero', () => {
    const remotes = [
      remote('budojo-backup-20260814-090000.zip', 'old'),
      remote('budojo-backup-20260816-120000.zip', 'newest'),
    ];

    const plan = planSync([], remotes, 0);

    expect(plan.toDelete).not.toContain('newest');
    expect(plan.toDelete).toEqual(['old']);
  });

  it('deletes nothing when the account is empty', () => {
    expect(planSync([], [], REMOTE_KEEP).toDelete).toEqual([]);
  });

  it('ignores remote files that are not backup archives', () => {
    // drive.file only sees files we created, but a stray one must not be
    // deleted just because it shares the folder.
    const plan = planSync([], [remote('notes.txt', 'keep-me'), remote('photo.jpg', 'keep-me-too')], 1);

    expect(plan.toDelete).toEqual([]);
  });
});

describe('mergeArchiveViews', () => {
  it('marks an archive held in both places', () => {
    const name = 'budojo-backup-20260816-120000.zip';
    const merged = mergeArchiveViews([local(name, 10)], [remote(name)]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name, sizeBytes: 10, local: true, remote: true, remoteId: `id-${name}` });
  });

  it('lists a remote-only archive so it can be restored onto a fresh machine', () => {
    // The whole point of the feature: the new laptop has no local archives.
    const merged = mergeArchiveViews([], [remote('budojo-backup-20260816-120000.zip')]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ local: false, remote: true });
  });

  it('lists a local-only archive as not yet synced', () => {
    const merged = mergeArchiveViews([local('budojo-backup-20260816-120000.zip', 10)], []);

    expect(merged[0]).toMatchObject({ local: true, remote: false, remoteId: null });
  });

  it('orders newest first', () => {
    const merged = mergeArchiveViews(
      [local('budojo-backup-20260814-090000.zip'), local('budojo-backup-20260816-120000.zip')],
      [remote('budojo-backup-20260815-090000.zip')],
    );

    expect(merged.map((m) => m.name)).toEqual([
      'budojo-backup-20260816-120000.zip',
      'budojo-backup-20260815-090000.zip',
      'budojo-backup-20260814-090000.zip',
    ]);
  });
});
