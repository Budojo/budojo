import type { BackupEntry } from './backup.js';
import { isBackupArchive, planRetention } from './backup.js';

/**
 * What to upload and what to delete on the Drive side (#1301). Pure decisions —
 * no network, no disk, no clock. `drive-io.ts` carries them out.
 *
 * Local backup and restore already ship (#1228), and cross-machine key recovery
 * with them (#1254). What was missing is getting the archive OFF the disk that
 * might die: `docs/desktop/backup-restore.md` told the owner to copy it into a
 * synced folder "on a schedule you'll actually keep", which is not a plan.
 *
 * One invariant governs everything here: **the account must never end up with
 * zero archives.** A bug in this file should degrade to "an old backup is still
 * up there", never to "the backup is gone". That is why the retention decision
 * is not reimplemented — it reuses `planRetention` from #1228, which already
 * refuses to delete the newest whatever it is asked.
 */

/** Remote copies to keep. Matches the local retention #1228 settled on. */
export const REMOTE_KEEP = 7;

/** A file as Drive reports it, narrowed to what a decision needs. */
export interface RemoteArchive {
  name: string;
  id: string;
  size: number;
}

export interface SyncPlan {
  /** Archive names to upload, newest first. */
  toUpload: string[];
  /** Drive file ids to delete. */
  toDelete: string[];
}

/** One row of the UI list: an archive, and where it currently exists. */
export interface ArchiveView {
  name: string;
  sizeBytes: number;
  createdAt: string | null;
  local: boolean;
  remote: boolean;
  remoteId: string | null;
}

/**
 * Newest first. Archive names embed a sortable `YYYYMMDD-HHMMSS`, so ordering
 * by name is ordering by time — no second source of truth that could disagree
 * with Drive's own mtimes.
 */
function newestFirst(names: readonly string[]): string[] {
  return [...names].sort().reverse();
}

export function planSync(
  localArchives: readonly BackupEntry[],
  remoteArchives: readonly RemoteArchive[],
  keep: number = REMOTE_KEEP,
): SyncPlan {
  // drive.file only exposes files this app created, but the folder is the
  // user's and they may have put something in it. Anything that is not one of
  // our archives is invisible to every decision below.
  const remotes = remoteArchives.filter((file) => isBackupArchive(file.name));
  const byName = new Map(remotes.map((file) => [file.name, file]));

  const toUpload: string[] = [];
  const toDelete: string[] = [];

  for (const entry of localArchives) {
    if (!isBackupArchive(entry.name)) {
      continue;
    }

    const existing = byName.get(entry.name);
    if (existing === undefined) {
      toUpload.push(entry.name);
      continue;
    }

    // Same name, different size: the remote copy is a truncated or interrupted
    // upload. A backup that is the wrong size is not a backup, so replace it —
    // and only then drop the stunted one.
    if (existing.size !== entry.sizeBytes) {
      toUpload.push(entry.name);
      toDelete.push(existing.id);
      byName.delete(entry.name);
    }
  }

  // Retention runs over what will be up there once the uploads land, so a fresh
  // upload cannot be pruned in the same pass that created it.
  const survivingNames = [...byName.keys()];
  for (const name of planRetention(survivingNames, keep)) {
    const file = byName.get(name);
    if (file !== undefined) {
      toDelete.push(file.id);
    }
  }

  return { toUpload: newestFirst(toUpload), toDelete };
}

/**
 * One list for the UI, so a fresh machine — no local archives at all — can
 * still see and restore what is in the account. That case is the entire reason
 * the feature exists.
 */
export function mergeArchiveViews(
  localArchives: readonly BackupEntry[],
  remoteArchives: readonly RemoteArchive[],
): ArchiveView[] {
  const views = new Map<string, ArchiveView>();

  for (const entry of localArchives) {
    if (!isBackupArchive(entry.name)) {
      continue;
    }

    views.set(entry.name, {
      name: entry.name,
      sizeBytes: entry.sizeBytes,
      createdAt: entry.createdAt,
      local: true,
      remote: false,
      remoteId: null,
    });
  }

  for (const file of remoteArchives) {
    if (!isBackupArchive(file.name)) {
      continue;
    }

    const existing = views.get(file.name);
    if (existing === undefined) {
      views.set(file.name, {
        name: file.name,
        sizeBytes: file.size,
        createdAt: null,
        local: false,
        remote: true,
        remoteId: file.id,
      });
      continue;
    }

    existing.remote = true;
    existing.remoteId = file.id;
  }

  return newestFirst([...views.keys()]).map((name) => views.get(name) as ArchiveView);
}
