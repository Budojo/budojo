/**
 * The sentence for a backup copy's stored error code (#1320, #1301).
 *
 * Shared by the Backup page and Today (#1751), which say the same thing about
 * the same failure. Explicit maps, never `'backup.folder.errors.' + code`: a
 * key built from a value is invisible to the i18n parity check, and the
 * desktop side emits codes well past the translated ones (`EBUSY`, `http_403`,
 * `rateLimitExceeded`, anything Google passes through). Anything unmapped
 * falls back to `unknown`, whose sentence interpolates the raw code so the
 * thread back to the cause is never lost.
 */

const FOLDER_ERROR_KEYS: Readonly<Record<string, string>> = {
  ENOENT: 'backup.folder.errors.ENOENT',
  EACCES: 'backup.folder.errors.EACCES',
  EPERM: 'backup.folder.errors.EPERM',
  ENOSPC: 'backup.folder.errors.ENOSPC',
  EROFS: 'backup.folder.errors.EROFS',
};

const DRIVE_ERROR_KEYS: Readonly<Record<string, string>> = {
  invalid_grant: 'backup.drive.errors.invalid_grant',
  unauthorized: 'backup.drive.errors.unauthorized',
  storageQuotaExceeded: 'backup.drive.errors.storageQuotaExceeded',
  network: 'backup.drive.errors.network',
  access_denied: 'backup.drive.errors.access_denied',
  consent_timeout: 'backup.drive.errors.consent_timeout',
  no_refresh_token: 'backup.drive.errors.no_refresh_token',
  not_configured: 'backup.drive.errors.not_configured',
};

/** `Object.hasOwn`, so a code named `constructor` is unknown rather than a function. */
function lookup(map: Readonly<Record<string, string>>, code: string, fallback: string): string {
  return Object.hasOwn(map, code) ? map[code] : fallback;
}

export function folderErrorKey(code: string): string {
  return lookup(FOLDER_ERROR_KEYS, code, 'backup.folder.errors.unknown');
}

export function driveErrorKey(code: string): string {
  return lookup(DRIVE_ERROR_KEYS, code, 'backup.drive.errors.unknown');
}
