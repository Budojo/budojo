import { describe, expect, it } from 'vitest';

import { describeCopyError, planFolderCopy } from './folder-copy.js';

/**
 * Copying backups into a folder the owner picked (#1320).
 *
 * Two rules shape everything here, and both come from the same fact: **it is
 * their folder, not ours.**
 *
 *   1. Never touch a file we did not create. Anything that is not
 *      `budojo-backup-*.zip` is invisible to every decision.
 *   2. Never leave the folder with no backup in it.
 */

const local = (name: string, sizeBytes = 100) => ({
  name,
  path: `/backups/${name}`,
  createdAt: '2026-08-17T09:00:00.000Z',
  sizeBytes,
});

const there = (name: string, sizeBytes = 100) => ({ name, sizeBytes });

describe('planFolderCopy', () => {
  it('copies an archive the folder does not have', () => {
    const plan = planFolderCopy([local('budojo-backup-20260817-090000.zip')], [], 7);

    expect(plan.toCopy).toEqual(['budojo-backup-20260817-090000.zip']);
    expect(plan.toDelete).toEqual([]);
  });

  it('copies nothing when the folder is already up to date', () => {
    const name = 'budojo-backup-20260817-090000.zip';

    expect(planFolderCopy([local(name)], [there(name)], 7).toCopy).toEqual([]);
  });

  it('re-copies when the size differs — an interrupted copy is not a backup', () => {
    const name = 'budojo-backup-20260817-090000.zip';
    const plan = planFolderCopy([local(name, 5_000)], [there(name, 12)], 7);

    expect(plan.toCopy).toEqual([name]);
  });

  it('copies newest first, so the most valuable archive lands even if the drive fills', () => {
    const plan = planFolderCopy(
      [
        local('budojo-backup-20260815-090000.zip'),
        local('budojo-backup-20260817-090000.zip'),
        local('budojo-backup-20260816-090000.zip'),
      ],
      [],
      7,
    );

    expect(plan.toCopy[0]).toBe('budojo-backup-20260817-090000.zip');
  });

  // The folder is the owner's. A photo, a spreadsheet, another app's export —
  // none of it is ours to reason about, let alone delete.
  it('ignores every file it did not create', () => {
    const plan = planFolderCopy(
      [],
      [there('taxes-2025.pdf'), there('holiday.jpg'), there('budojo-notes.txt')],
      1,
    );

    expect(plan.toDelete).toEqual([]);
  });

  it('prunes only its own archives, once past the keep count', () => {
    const theirs = Array.from({ length: 9 }, (_, i) => there(`budojo-backup-2026080${i}-090000.zip`));
    const plan = planFolderCopy([], [...theirs, there('important.docx')], 7);

    expect(plan.toDelete).toEqual([
      'budojo-backup-20260800-090000.zip',
      'budojo-backup-20260801-090000.zip',
    ]);
    expect(plan.toDelete).not.toContain('important.docx');
  });

  it('never deletes the newest archive, even asked to keep none', () => {
    const plan = planFolderCopy(
      [],
      [there('budojo-backup-20260815-090000.zip'), there('budojo-backup-20260817-090000.zip')],
      0,
    );

    expect(plan.toDelete).toEqual(['budojo-backup-20260815-090000.zip']);
  });

  // Retention has to account for what is about to arrive, or the folder settles
  // one above the keep count forever — the off-by-one that #1301's review caught.
  it('counts the archives about to be copied', () => {
    const theirs = Array.from({ length: 7 }, (_, i) => there(`budojo-backup-2026080${i}-090000.zip`));
    const locals = theirs.map((f) => local(f.name)).concat(local('budojo-backup-20260817-090000.zip'));

    const plan = planFolderCopy(locals, theirs, 7);

    expect(plan.toCopy).toEqual(['budojo-backup-20260817-090000.zip']);
    expect(plan.toDelete).toEqual(['budojo-backup-20260800-090000.zip']);
  });
});

describe('describeCopyError', () => {
  // Each of these looks different to the owner and needs a different action.
  it.each([
    ['ENOENT', /folder/i],
    ['EACCES', /permission/i],
    ['EPERM', /permission/i],
    ['ENOSPC', /space/i],
    ['EROFS', /read-only/i],
  ])('turns %s into something actionable', (code, expected) => {
    expect(describeCopyError(code)).toMatch(expected);
  });

  it('keeps the raw code for anything unrecognised', () => {
    expect(describeCopyError('EWEIRD')).toContain('EWEIRD');
  });
});
