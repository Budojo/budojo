import { describe, expect, it } from 'vitest';
import EN from '../../../../public/assets/i18n/en.json';
import { driveErrorKey, folderErrorKey } from './backup-errors';

function resolves(key: string): boolean {
  let node: unknown = EN;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}

describe('backup error keys', () => {
  it('maps every translated folder errno to its own sentence', () => {
    for (const code of ['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EROFS']) {
      expect(folderErrorKey(code)).toBe(`backup.folder.errors.${code}`);
      expect(resolves(folderErrorKey(code)), code).toBe(true);
    }
  });

  it('falls back to the unknown sentence, never to a key built from the code', () => {
    expect(folderErrorKey('EBUSY')).toBe('backup.folder.errors.unknown');
    // A code that happens to name an Object.prototype member is still unknown.
    expect(folderErrorKey('constructor')).toBe('backup.folder.errors.unknown');
    expect(driveErrorKey('http_403')).toBe('backup.drive.errors.unknown');
    expect(driveErrorKey('toString')).toBe('backup.drive.errors.unknown');
  });

  it('maps the Drive codes the Backup page translates', () => {
    for (const code of [
      'invalid_grant',
      'unauthorized',
      'storageQuotaExceeded',
      'network',
      'access_denied',
      'consent_timeout',
      'no_refresh_token',
      'not_configured',
    ]) {
      expect(driveErrorKey(code)).toBe(`backup.drive.errors.${code}`);
      expect(resolves(driveErrorKey(code)), code).toBe(true);
    }
  });
});
