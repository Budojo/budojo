import { ListedVersion, sameVersion, VersionRef } from './layout';

/**
 * What a device does when it meets the sync folder (PRD § 5.2, #2029): git's
 * four answers, and «ask the owner» for the histories git would call unrelated.
 *
 * **The rule it serves: a device never drops a write of its own silently.**
 * Three kinds of write sit in a device's journal, and only the last may go:
 * - **unpushed:** made since its base, in no version yet;
 * - **pushed, unconfirmed:** in the version it pushed, which it has not yet
 *   seen on the line. Two devices can push the same number at once, and one of
 *   the two versions then leads nowhere;
 * - **confirmed:** seen in a version on the line, which every device will reach.
 *
 * **The line** is the latest version and its ancestors, read from the names in
 * the folder, which carry each version's parent (`layout.ts`).
 */

export interface LocalState {
  /** The version the local database came from or was published as. Null if it never synced. */
  base: VersionRef | null;
  /** The journal holds writes made since `base`, in no version yet. */
  unpushed: boolean;
  /**
   * `base` is this device's own push, and its writes are still in the journal
   * because the device has not yet seen it on the line (`onLine`). They stay
   * there until it has, however long the device is away, so that a race lost
   * while it was offline can still be replayed after the losing version is gone.
   */
  pushedUnconfirmed: boolean;
}

export type Decision =
  | { kind: 'nothing' }
  | { kind: 'push'; seq: number; parent: VersionRef | null }
  | { kind: 'fast-forward'; to: VersionRef }
  | { kind: 'rebase'; onto: VersionRef }
  | { kind: 'ask'; latest: VersionRef };

/**
 * The newest version: the highest number, and between two versions of the same
 * number, the lower device id, so every device reads the same answer.
 */
export function latestVersion<T extends VersionRef>(versions: readonly T[]): T | null {
  let latest: T | null = null;
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

/**
 * Whether `base` is on the line: the latest version or one of its ancestors.
 * `unknown` when the walk down the parents meets one the folder no longer holds
 * (retention prunes versions) before it passes `base`'s number.
 */
export function onLine(
  base: VersionRef,
  versions: readonly ListedVersion[],
): 'yes' | 'no' | 'unknown' {
  const byRef = new Map(versions.map((version) => [`${version.seq}-${version.device}`, version]));
  let current: ListedVersion | undefined = latestVersion(versions) ?? undefined;
  while (current !== undefined) {
    if (sameVersion(current, base)) {
      return 'yes';
    }
    const parent: VersionRef | null = current.parent;
    if (parent === null || parent.seq < base.seq) {
      return 'no';
    }
    if (sameVersion(parent, base)) {
      // The base itself may already be pruned: being named as a parent is enough.
      return 'yes';
    }
    current = byRef.get(`${parent.seq}-${parent.device}`);
  }
  return versions.length === 0 ? 'no' : 'unknown';
}

export function decide(local: LocalState, versions: readonly ListedVersion[]): Decision {
  const latest = latestVersion(versions);
  const { base, unpushed, pushedUnconfirmed } = local;
  const head: VersionRef | null =
    latest === null ? null : { seq: latest.seq, device: latest.device };

  if (base === null) {
    if (head === null) {
      return unpushed ? { kind: 'push', seq: 1, parent: null } : { kind: 'nothing' };
    }
    // Pulling over an academy this device made on its own would lose it, and
    // pushing over the folder's would lose that one: the owner chooses (§ 6.4).
    return unpushed ? { kind: 'ask', latest: head } : { kind: 'fast-forward', to: head };
  }

  if (head === null) {
    // An empty folder holds nothing to lose: publish again, so the data is backed up.
    return { kind: 'push', seq: base.seq + 1, parent: base };
  }

  const line = onLine(base, versions);

  if (line === 'yes') {
    if (sameVersion(head, base)) {
      return unpushed ? { kind: 'push', seq: head.seq + 1, parent: head } : { kind: 'nothing' };
    }
    return unpushed ? { kind: 'rebase', onto: head } : { kind: 'fast-forward', to: head };
  }

  if (head.seq < base.seq) {
    // The folder is behind what this device saw, and not on its line: versions
    // deleted on Drive, or another account's folder. Pushing would bury the
    // folder's versions, pulling would drop this device's: the owner chooses.
    return { kind: 'ask', latest: head };
  }

  if (pushedUnconfirmed) {
    // Its pushed writes may be in no version on the line: replay them, never
    // drop them. When the line is `unknown` this may replay writes already
    // there, which the replay finds already true or the owner sees as a
    // duplicate. A duplicate shows; a lost write does not.
    return { kind: 'rebase', onto: head };
  }

  // The base was someone else's version that led nowhere, or is too old to
  // trace. Every write of this device's own is unpushed or confirmed.
  return unpushed ? { kind: 'rebase', onto: head } : { kind: 'fast-forward', to: head };
}
