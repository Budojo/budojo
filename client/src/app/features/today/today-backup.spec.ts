import { describe, expect, it } from 'vitest';
import { backupHealth } from './today-backup';

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
      ),
    ).toEqual({ kind: 'failing', target: 'folder', where: 'D:\\OneDrive\\Budojo', code: 'ENOENT' });
  });

  it('a linked Drive whose last sync failed is failing, naming the account', () => {
    expect(
      backupHealth(NO_FOLDER, {
        configured: true,
        linked: true,
        account: 'dojo@example.com',
        lastError: 'invalid_grant',
      }),
    ).toEqual({
      kind: 'failing',
      target: 'drive',
      where: 'dojo@example.com',
      code: 'invalid_grant',
    });
  });

  it('with no folder and no Drive link, the backups exist only here', () => {
    expect(backupHealth(NO_FOLDER, NO_DRIVE)).toEqual({ kind: 'local-only' });
  });

  it('a build with no Drive client is not a failure while a folder copies', () => {
    expect(backupHealth(FOLDER_OK, { configured: false, linked: false })).toEqual({
      kind: 'ok',
      lastCopyAt: '2026-09-24T03:00:00Z',
    });
  });

  it('reads lastError, not lastErrorAt: a copy that recovered is healthy', () => {
    expect(backupHealth({ ...FOLDER_OK, lastErrorAt: '2026-09-17T03:00:00Z' }, NO_DRIVE).kind).toBe(
      'ok',
    );
  });

  it('the newest copy wins when both the folder and Drive are landing', () => {
    expect(
      backupHealth(FOLDER_OK, {
        configured: true,
        linked: true,
        lastSyncAt: '2026-09-24T09:00:00Z',
        lastError: null,
      }),
    ).toEqual({ kind: 'ok', lastCopyAt: '2026-09-24T09:00:00Z' });
  });

  it('a folder chosen but not yet copied to is healthy with no date yet', () => {
    expect(backupHealth({ ...FOLDER_OK, lastCopyAt: null }, NO_DRIVE)).toEqual({
      kind: 'ok',
      lastCopyAt: null,
    });
  });
});
