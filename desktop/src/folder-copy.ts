import type { BackupEntry } from './backup.js';
import { isBackupArchive, planRetention } from './backup.js';

/**
 * Copying backups into a folder the owner picked (#1320) — the decisions, none
 * of the I/O.
 *
 * This is the answer to "a backup on this disk does not survive this disk"
 * that needs no account, no API and no network: point at a folder that is
 * already synced — OneDrive, Dropbox, iCloud, the Google Drive client — or at a
 * NAS, or a USB stick, and every backup lands there too. The sync client the
 * owner already runs does the rest.
 *
 * Two rules shape everything below, and both come from one fact: **it is their
 * folder, not ours.**
 *
 *   1. Never touch a file we did not create. Anything that is not
 *      `budojo-backup-*.zip` is invisible to every decision here — their
 *      photos, their spreadsheets, another app's exports.
 *   2. Never leave the folder with no backup in it. Retention reuses
 *      `planRetention` (#1228), which already refuses to delete the newest.
 */

/** A file already in the destination folder, narrowed to what a decision needs. */
export interface FolderFile {
  name: string;
  sizeBytes: number;
}

export interface FolderPlan {
  /** Archive names to copy, newest first. */
  toCopy: string[];
  /** Archive names to delete from the folder. Only ever our own. */
  toDelete: string[];
}

/** Newest first — the name carries a sortable timestamp, by construction. */
function newestFirst(names: readonly string[]): string[] {
  return [...names].sort().reverse();
}

export function planFolderCopy(
  localArchives: readonly BackupEntry[],
  folderFiles: readonly FolderFile[],
  keep: number,
): FolderPlan {
  const ours = folderFiles.filter((file) => isBackupArchive(file.name));
  const byName = new Map(ours.map((file) => [file.name, file]));

  const toCopy: string[] = [];

  for (const entry of localArchives) {
    if (!isBackupArchive(entry.name)) {
      continue;
    }

    const existing = byName.get(entry.name);

    // Same name and same size means it is already there. A different size means
    // an interrupted copy, and an archive of the wrong size is not a backup.
    if (existing === undefined || existing.sizeBytes !== entry.sizeBytes) {
      toCopy.push(entry.name);
    }
  }

  // Retention plans against what the folder will hold once the copies land.
  // Leaving the pending ones out settles it one above the keep count forever,
  // because each pass prunes exactly the archive the previous pass added.
  const after = [...new Set([...byName.keys(), ...toCopy])];

  return { toCopy: newestFirst(toCopy), toDelete: planRetention(after, keep) };
}

/**
 * What the Backup page shows when a copy fails.
 *
 * Each of these looks completely different to the owner — a folder that is gone
 * is not a folder that is full — and the fix for each is different too, so a
 * single "copy failed" would be useless precisely when it matters.
 */
export function describeCopyError(code: string): string {
  switch (code) {
    case 'ENOENT':
      return 'The backup folder no longer exists. Choose it again, or pick a new one.';
    case 'EACCES':
    case 'EPERM':
      return 'No permission to write to the backup folder. Choose a different one.';
    case 'ENOSPC':
      return 'The backup folder is out of space. Free some up, or choose a different one.';
    case 'EROFS':
      return 'The backup folder is read-only. Choose a different one.';
    default:
      // Never swallow an unknown failure into a vague sentence: the raw code is
      // the only thread back to the cause.
      return `Could not copy to the backup folder (${code}). Backups are still being saved on this computer.`;
  }
}
