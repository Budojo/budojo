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
  | { readonly kind: 'local-only' }
  | { readonly kind: 'ok'; readonly lastCopyAt: string | null };

/**
 * Three states, in this order: a copy that is failing, then no copy set up at
 * all, then copies landing. `lastError` is the current state; `lastErrorAt`
 * survives a later success on purpose and says nothing about now.
 *
 * `configured: false` is a build with no Drive client — the feature does not
 * exist, so it is neither a failure nor, on its own, evidence of anything:
 * the folder is the copy path every build has.
 */
export function backupHealth(
  folder: BackupFolderStateView,
  drive: DriveLinkStateView,
): BackupHealth {
  if (folder.folder !== null && folder.lastError !== null) {
    return { kind: 'failing', target: 'folder', where: folder.folder, code: folder.lastError };
  }

  const driveError = drive.lastError ?? null;
  if (drive.configured && drive.linked && driveError !== null) {
    return { kind: 'failing', target: 'drive', where: drive.account ?? '', code: driveError };
  }

  if (folder.folder === null && !(drive.configured && drive.linked)) {
    return { kind: 'local-only' };
  }

  const copies = [folder.lastCopyAt, drive.linked ? (drive.lastSyncAt ?? null) : null].filter(
    (at): at is string => at !== null,
  );

  return { kind: 'ok', lastCopyAt: copies.sort().at(-1) ?? null };
}
