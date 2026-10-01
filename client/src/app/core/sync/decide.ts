import { ListedVersion, parseVersionPath, sameVersion, VersionRef } from './layout';
import { RemoteFile } from './remote';

/**
 * What a device does when it meets the sync folder (PRD § 5.2, #2029): git's
 * four answers, and «ask the owner» for the histories git would call unrelated.
 *
 * **The rule it serves: a device never drops a write of its own silently.**
 * Three kinds of write sit in a device's journal, and only the last may go:
 * - **unpushed:** made since its base, in no version yet;
 * - **pushed, unconfirmed:** in a version it pushed that has not yet settled on
 *   the line (`settled`). Two devices can push the same number at once;
 * - **confirmed:** in a version that has settled on the line, which every
 *   device will reach and none will build around.
 *
 * **The line** is the latest version and its ancestors, read from the names in
 * the folder, which carry each version's parent (`layout.ts`).
 */

/** A version as the folder lists it, with when Drive created the file. */
export interface SeenVersion extends ListedVersion {
  /** Drive's own clock, in milliseconds: the same answer on every device. */
  created: number;
}

/**
 * How long a version takes to settle. Drive's listing can lag behind a new
 * file by seconds, so a twin of a version, created just before it, can be
 * invisible for a moment. Ten minutes is far beyond that lag: a twin that
 * could win was created earlier, and is visible by then.
 */
export const SETTLE_MS = 10 * 60_000;

export interface LocalState {
  /** This device's id: its own versions carry it. */
  device: string;
  /** The version the local database came from or was published as. Null if it never synced. */
  base: VersionRef | null;
  /** The journal holds writes made since `base`, in no version yet. */
  unpushed: boolean;
  /**
   * The latest version this device pushed that has not settled on the line,
   * or null. Its writes stay in the journal until it has, however long the
   * device is away, so a race lost while it was offline can still be replayed
   * after the losing version is pruned.
   */
  unconfirmed: VersionRef | null;
}

export type Decision =
  | { kind: 'nothing' }
  | { kind: 'push'; seq: number; parent: VersionRef | null }
  | { kind: 'fast-forward'; to: VersionRef }
  | { kind: 'rebase'; onto: VersionRef }
  | { kind: 'ask'; latest: VersionRef };

/** The versions among a folder listing, with Drive's creation times. */
export function versionsIn(files: readonly RemoteFile[]): SeenVersion[] {
  return files.flatMap((file) => {
    const version = parseVersionPath(file.path);
    return version === null ? [] : [{ ...version, created: file.created }];
  });
}

/**
 * The newest version: the highest number, and between two of the same number,
 * **the one that reached Drive first**. A twin that lands later can never take
 * the number from a version already there; the device id only breaks a tie in
 * the same millisecond.
 */
export function latestVersion<T extends SeenVersion>(versions: readonly T[]): T | null {
  let latest: T | null = null;
  for (const version of versions) {
    if (
      latest === null ||
      version.seq > latest.seq ||
      (version.seq === latest.seq &&
        (version.created < latest.created ||
          (version.created === latest.created && version.device < latest.device)))
    ) {
      latest = version;
    }
  }
  return latest;
}

interface Walk {
  answer: 'yes' | 'no' | 'unknown';
  /** When yes: the creation time of `base`, or of the version naming it as parent if `base` is pruned. */
  createdBy: number | null;
}

function walk(base: VersionRef, versions: readonly SeenVersion[]): Walk {
  const byRef = new Map(versions.map((version) => [`${version.seq}-${version.device}`, version]));
  let current: SeenVersion | undefined = latestVersion(versions) ?? undefined;
  while (current !== undefined) {
    if (sameVersion(current, base)) {
      return { answer: 'yes', createdBy: current.created };
    }
    const parent: VersionRef | null = current.parent;
    if (parent === null || parent.seq < base.seq) {
      return { answer: 'no', createdBy: null };
    }
    if (sameVersion(parent, base)) {
      // The base itself may already be pruned: being named as a parent is
      // enough, and it is older than the version that names it.
      const listed = byRef.get(`${base.seq}-${base.device}`);
      return { answer: 'yes', createdBy: listed?.created ?? current.created };
    }
    current = byRef.get(`${parent.seq}-${parent.device}`);
  }
  return { answer: versions.length === 0 ? 'no' : 'unknown', createdBy: null };
}

/**
 * Whether `base` is on the line: the latest version or one of its ancestors.
 * `unknown` when the walk down the parents meets one the folder no longer holds
 * (retention prunes versions) before it passes `base`'s number.
 */
export function onLine(
  base: VersionRef,
  versions: readonly SeenVersion[],
): 'yes' | 'no' | 'unknown' {
  return walk(base, versions).answer;
}

/**
 * Whether a pushed version has settled: it is on the line, and Drive created it
 * at least `SETTLE_MS` before `now`, which is Drive's clock too (the listing's
 * `Date` header). Only then may its writes leave the journal.
 */
export function settled(
  version: VersionRef,
  versions: readonly SeenVersion[],
  now: number,
): boolean {
  const { answer, createdBy } = walk(version, versions);
  return answer === 'yes' && createdBy !== null && now - createdBy >= SETTLE_MS;
}

export function decide(local: LocalState, versions: readonly SeenVersion[]): Decision {
  const latest = latestVersion(versions);
  const { base, unpushed, unconfirmed } = local;
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

  if (head.seq < base.seq || (unconfirmed !== null && head.seq < unconfirmed.seq)) {
    // The folder is behind what this device has: versions deleted on Drive, or
    // another account's folder. Pushing would bury the folder's versions,
    // pulling would drop this device's: the owner chooses.
    return { kind: 'ask', latest: head };
  }

  if (unconfirmed !== null && onLine(unconfirmed, versions) !== 'yes') {
    // A push of its own is not on the line, or cannot be traced: its writes may
    // be in no version there. Replay them, never drop them. When the line is
    // unknown this may replay writes already there, which the replay finds
    // already true or the owner sees as a duplicate. A duplicate shows; a lost
    // write does not.
    return { kind: 'rebase', onto: head };
  }

  const line = onLine(base, versions);

  if (line === 'yes') {
    if (sameVersion(head, base)) {
      return unpushed ? { kind: 'push', seq: head.seq + 1, parent: head } : { kind: 'nothing' };
    }
    return unpushed ? { kind: 'rebase', onto: head } : { kind: 'fast-forward', to: head };
  }

  if (line === 'no' && base.device === local.device) {
    // A version of its own that had settled is now provably off the line. A
    // settled version never leaves the line, so this folder is not the one it
    // settled in: the owner chooses. (An `unknown` line is only a long absence
    // with versions pruned since, and the walk below is right for it.)
    return { kind: 'ask', latest: head };
  }

  // The base was another device's version that led nowhere, or is too old to
  // trace. Every write of this device's own is unpushed or confirmed.
  return unpushed ? { kind: 'rebase', onto: head } : { kind: 'fast-forward', to: head };
}
