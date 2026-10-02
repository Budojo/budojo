/**
 * Swapping in what the sync staged (#2030, #2032), before PHP starts: the
 * desktop's counterpart of the phone's `StagedSwap.java`.
 *
 * The server stages another device's database as `<database>.staged`
 * (`PUT /api/v1/sync/stage`) and, for a restore, the academy's files as
 * `storage/app.staged`. Only a start swaps them in, with PHP stopped:
 * - **The reconcile it needs is written down first,** as a marker file, so
 *   that it survives a start that dies after a rename. The bootstrap runs
 *   `budojo:sync-reconcile` after the migrations while the marker is there,
 *   and removes it only once the reconcile succeeded.
 * - **Staged files come in with it:** `storage/app` steps aside as
 *   `app.sync-previous`. Files staged with no database beside them are a
 *   restore cut short, and are removed: the staged database is what commits
 *   one.
 * - **The live database steps aside as `.sync-previous`,** with its WAL,
 *   which can hold writes the main file does not have yet. An older one goes
 *   only once there is a live database to take its place.
 * - **`.sync-previous`, not the phone's `.previous`:** on the PC `.previous`
 *   is the Restore's (`planRecovery`, #1909), the owner's data a Restore set
 *   aside, which is never deleted. The sync's own copy goes at its next swap.
 *
 * Each step is skipped when a start that died halfway already took it, so the
 * next start finishes the swap. `exists` is injected, so the plan is tested
 * against every combination of files; `bootstrap.ts` carries it out.
 */

export type SwapStep =
  | { kind: 'mark'; path: string }
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'remove'; path: string };

export interface SwapLayout {
  databasePath: string;
  /** `storage/app`: where the academy's files are. */
  filesDir: string;
}

/** While it is there, the next start reconciles the database it swapped in. */
export function reconcileMarker(databasePath: string): string {
  return `${databasePath}.reconcile`;
}

export function planStagedSwap(layout: SwapLayout, exists: (file: string) => boolean): SwapStep[] {
  const db = layout.databasePath;
  const staged = `${db}.staged`;
  const files = layout.filesDir;
  const stagedFiles = `${files}.staged`;

  if (!exists(staged)) {
    return exists(stagedFiles) ? [{ kind: 'remove', path: stagedFiles }] : [];
  }

  const steps: SwapStep[] = [{ kind: 'mark', path: reconcileMarker(db) }];

  if (exists(stagedFiles)) {
    const previousFiles = `${files}.sync-previous`;
    if (exists(files)) {
      if (exists(previousFiles)) {
        steps.push({ kind: 'remove', path: previousFiles });
      }
      steps.push({ kind: 'rename', from: files, to: previousFiles });
    }
    steps.push({ kind: 'rename', from: stagedFiles, to: files });
  }

  const previous = `${db}.sync-previous`;
  if (exists(db)) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      if (exists(previous + suffix)) {
        steps.push({ kind: 'remove', path: previous + suffix });
      }
    }
    steps.push({ kind: 'rename', from: db, to: previous });
  }
  for (const sidecar of ['-wal', '-journal']) {
    if (exists(db + sidecar)) {
      // Follows the database it belongs to: beside the database swapped in it
      // would be replayed into it. With no database beside it, the database
      // already stepped aside and a start died before this followed.
      steps.push({ kind: 'rename', from: db + sidecar, to: previous + sidecar });
    }
  }
  for (const shm of [`${db}-shm`, `${previous}-shm`]) {
    if (exists(shm) && !steps.some((step) => step.kind === 'remove' && step.path === shm)) {
      steps.push({ kind: 'remove', path: shm });
    }
  }
  steps.push({ kind: 'rename', from: staged, to: db });

  return steps;
}
