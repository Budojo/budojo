import { VersionRef } from './layout';

/**
 * What a device does when it meets the sync folder (PRD § 5.2, #2029). Git's
 * four answers, plus one git does not need: a device that never synced, holding
 * an academy of its own, meeting a folder that already has one.
 */

export interface LocalState {
  /** The version the local database came from, or was published as. Null if it never synced. */
  base: VersionRef | null;
  /**
   * Writes the device made since `base`, in its journal. A device that never
   * synced but holds an academy has changes: all of it.
   */
  changes: boolean;
}

export type Decision =
  | { kind: 'nothing' }
  | { kind: 'push'; seq: number; parent: number | null }
  | { kind: 'fast-forward'; to: VersionRef }
  | { kind: 'rebase'; onto: VersionRef }
  | { kind: 'unrelated'; latest: VersionRef };

/**
 * The newest version. Two devices that pushed the same number at once both
 * wrote a file, because names differ by device. The lower device id wins, the
 * same answer on every device, and the other one rebases onto it.
 */
export function latestVersion(versions: readonly VersionRef[]): VersionRef | null {
  let latest: VersionRef | null = null;
  for (const version of versions) {
    if (
      latest === null ||
      version.seq > latest.seq ||
      (version.seq === latest.seq && version.device < latest.device)
    ) {
      latest = version;
    }
  }
  return latest;
}

function same(a: VersionRef, b: VersionRef): boolean {
  return a.seq === b.seq && a.device === b.device;
}

export function decide(local: LocalState, remote: readonly VersionRef[]): Decision {
  const latest = latestVersion(remote);
  const { base, changes } = local;

  if (base === null) {
    if (latest === null) {
      return changes ? { kind: 'push', seq: 1, parent: null } : { kind: 'nothing' };
    }
    // Pulling over an academy this device made on its own would lose it, and
    // pushing over the folder's would lose that one: the owner chooses (§ 6.4).
    return changes ? { kind: 'unrelated', latest } : { kind: 'fast-forward', to: latest };
  }

  if (latest === null || latest.seq < base.seq) {
    // The folder lost versions this device saw (emptied, or restored on Drive).
    // Publish again, above anything still there, so the data is back up.
    return { kind: 'push', seq: base.seq + 1, parent: base.seq };
  }

  if (same(latest, base)) {
    return changes ? { kind: 'push', seq: base.seq + 1, parent: base.seq } : { kind: 'nothing' };
  }

  // This device's version lost the race for its number, to a device whose id
  // sorts first: its writes are in no version on the winning line, so they are
  // replayed on top of the latest whatever `changes` says. That holds even
  // after others have pushed on top of the winner.
  // The same holds when another device's version carries this one's number
  // and this one is not there at all: its upload never landed.
  const lost =
    latest.seq === base.seq ||
    remote.some((version) => version.seq === base.seq && version.device < base.device);
  if (lost) {
    return { kind: 'rebase', onto: latest };
  }

  return changes ? { kind: 'rebase', onto: latest } : { kind: 'fast-forward', to: latest };
}
