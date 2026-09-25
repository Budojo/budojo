import { BackupFolderStateView } from '../../core/services/backup-folder.service';
import { DriveLinkStateView } from '../../core/services/drive-sync.service';

/**
 * Is there a copy of this academy anywhere but this computer? (#1751)
 *
 * Not "is the backup old": the local archive runs a minute after launch and
 * every six hours after (`desktop/src/main.ts`), so its age is never the
 * problem. What loses an academy is a disk that dies with every copy on it —
 * because no folder and no Drive link was ever set up, or because the copy
 * has been failing quietly for weeks (a USB stick gone, a revoked token;
 * `drive-state.ts` explains why those failures raise no dialog).
 */
export type BackupHealth =
  | {
      readonly kind: 'failing';
      readonly target: 'folder' | 'drive';
      /** The folder path, or the Google account. */
      readonly where: string;
      readonly code: string;
    }
  | {
      readonly kind: 'local-only';
      /** Whether this build can link Google Drive at all, so the advice offers it only then. */
      readonly driveAvailable: boolean;
    }
  | {
      /** Copies used to land and stopped: no error recorded, just no success lately. */
      readonly kind: 'stale';
      readonly lastCopyAt: string;
    }
  | { readonly kind: 'ok'; readonly lastCopyAt: string | null };

/** Older than this, a last copy is news, not reassurance. */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Four states, in this order: a copy that is failing, no copy set up at all,
 * copies that stopped landing, and copies landing. `lastError` is the current
 * state; `lastErrorAt` survives a later success on purpose and says nothing
 * about now.
 *
 * "Stopped landing" exists because a failure can leave no error behind: when
 * the local backup throws, `desktop/src/main.ts` ends the tick before the
 * folder copy and the Drive sync, so neither records anything and a
 * weeks-old success would read as fine forever.
 *
 * `configured: false` is a build with no Drive client — the feature does not
 * exist, so it is neither a failure nor, on its own, evidence of anything:
 * the folder is the copy path every build has.
 */
export function backupHealth(
  folder: BackupFolderStateView,
  drive: DriveLinkStateView,
  now: Date,
): BackupHealth {
  if (folder.folder !== null && folder.lastError !== null) {
    return { kind: 'failing', target: 'folder', where: folder.folder, code: folder.lastError };
  }

  const driveError = drive.lastError ?? null;
  if (drive.configured && drive.linked && driveError !== null) {
    return { kind: 'failing', target: 'drive', where: drive.account ?? '', code: driveError };
  }

  if (folder.folder === null && !(drive.configured && drive.linked)) {
    return { kind: 'local-only', driveAvailable: drive.configured };
  }

  const copies = [folder.lastCopyAt, drive.linked ? (drive.lastSyncAt ?? null) : null].filter(
    (at): at is string => at !== null,
  );
  const newest = copies.sort((x, y) => Date.parse(x) - Date.parse(y)).at(-1) ?? null;

  if (newest !== null && now.getTime() - Date.parse(newest) > STALE_AFTER_MS) {
    return { kind: 'stale', lastCopyAt: newest };
  }

  return { kind: 'ok', lastCopyAt: newest };
}
