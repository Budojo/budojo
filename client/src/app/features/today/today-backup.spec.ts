import { describe, expect, it } from 'vitest';
import { backupHealth } from './today-backup';

// Thursday 24 September 2026, 18:30 UTC.
const NOW = new Date('2026-09-24T18:30:00Z');

const FOLDER_OK = {
  folder: 'D:\\OneDrive\\Budojo',
  lastCopyAt: '2026-09-24T03:00:00Z',
  lastError: null,
  lastErrorAt: null,
};
const NO_FOLDER = { folder: null, lastCopyAt: null, lastError: null, lastErrorAt: null };
const NO_DRIVE = { configured: true, linked: false };

describe('backupHealth (#1751)', () => {
  it('a folder whose last copy failed is failing, and says where and why', () => {
    expect(
      backupHealth(
        { ...FOLDER_OK, lastError: 'ENOENT', lastErrorAt: '2026-09-23T03:00:00Z' },
        NO_DRIVE,
        NOW,
      ),
    ).toEqual({ kind: 'failing', target: 'folder', where: 'D:\\OneDrive\\Budojo', code: 'ENOENT' });
  });

  it('a linked Drive whose last sync failed is failing, naming the account', () => {
    expect(
      backupHealth(
        NO_FOLDER,
        { configured: true, linked: true, account: 'dojo@example.com', lastError: 'invalid_grant' },
        NOW,
      ),
    ).toEqual({
      kind: 'failing',
      target: 'drive',
      where: 'dojo@example.com',
      code: 'invalid_grant',
    });
  });

  it('with no folder and no Drive link, the backups exist only here', () => {
    expect(backupHealth(NO_FOLDER, NO_DRIVE, NOW)).toEqual({
      kind: 'local-only',
      driveAvailable: true,
    });
  });

  it('says whether Drive exists in this build, so the advice can leave it out', () => {
    // Every shipped build today: no OAuth client, and the Backup page hides the card.
    expect(backupHealth(NO_FOLDER, { configured: false, linked: false }, NOW)).toEqual({
      kind: 'local-only',
      driveAvailable: false,
    });
  });

  it('a Drive-only owner, linked and syncing, is healthy', () => {
    // No folder at all: the Drive half of the condition is what keeps this out of local-only.
    expect(
      backupHealth(
        NO_FOLDER,
        { configured: true, linked: true, lastSyncAt: '2026-09-24T09:00:00Z', lastError: null },
        NOW,
      ),
    ).toEqual({ kind: 'ok', lastCopyAt: '2026-09-24T09:00:00Z' });
  });

  it('a build with no Drive client is not a failure while a folder copies', () => {
    expect(backupHealth(FOLDER_OK, { configured: false, linked: false }, NOW)).toEqual({
      kind: 'ok',
      lastCopyAt: '2026-09-24T03:00:00Z',
    });
  });

  it('reads lastError, not lastErrorAt: a copy that recovered is healthy', () => {
    expect(
      backupHealth({ ...FOLDER_OK, lastErrorAt: '2026-09-17T03:00:00Z' }, NO_DRIVE, NOW).kind,
    ).toBe('ok');
  });

  it('the newest copy wins when both the folder and Drive are landing', () => {
    expect(
      backupHealth(
        FOLDER_OK,
        { configured: true, linked: true, lastSyncAt: '2026-09-24T09:00:00Z', lastError: null },
        NOW,
      ),
    ).toEqual({ kind: 'ok', lastCopyAt: '2026-09-24T09:00:00Z' });
  });

  it('a folder chosen but not yet copied to is healthy with no date yet', () => {
    expect(backupHealth({ ...FOLDER_OK, lastCopyAt: null }, NO_DRIVE, NOW)).toEqual({
      kind: 'ok',
      lastCopyAt: null,
    });
  });

  describe('a success that stopped coming is not a success', () => {
    // If the local backup throws, the tick stops before the copy and the sync,
    // so no `lastError` is ever written: only the age of the last copy tells.
    it('exactly seven days old is still fine', () => {
      expect(
        backupHealth({ ...FOLDER_OK, lastCopyAt: '2026-09-17T18:30:00Z' }, NO_DRIVE, NOW),
      ).toEqual({ kind: 'ok', lastCopyAt: '2026-09-17T18:30:00Z' });
    });

    it('a minute past seven days is stale', () => {
      expect(
        backupHealth({ ...FOLDER_OK, lastCopyAt: '2026-09-17T18:29:00Z' }, NO_DRIVE, NOW),
      ).toEqual({ kind: 'stale', lastCopyAt: '2026-09-17T18:29:00Z' });
    });

    it('the newest copy decides: a fresh Drive sync covers an old folder copy', () => {
      expect(
        backupHealth(
          { ...FOLDER_OK, lastCopyAt: '2026-08-01T03:00:00Z' },
          { configured: true, linked: true, lastSyncAt: '2026-09-24T09:00:00Z', lastError: null },
          NOW,
        ).kind,
      ).toBe('ok');
    });
  });
});
