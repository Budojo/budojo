import { ListedVersion, parseVersionPath, sameVersion, VersionRef } from './layout';
import { RemoteFile } from './remote';

/**
 * What a device does when it meets the sync folder (PRD § 5.2, #2029).
 *
 * **The rule it serves: a device never drops a write of its own silently.**
 * Two facts make that cheap to keep:
 * - **A replay is idempotent.** Every database records the id of every journal
 *   entry it has dealt with, and a replay skips those (#2031). So when a device
 *   cannot tell whether its writes are in the latest version, it replays them,
 *   and nothing is applied twice.
 * - **A device keeps its writes until every other device holds them**
 *   (`devices.ts`). Until then it never fast-forwards.
 *
 * So there is no need to trace the history: the choice is only whether there is
 * anything to pull, and whether this device has writes the pull must carry.
 */

/** A version as the folder lists it, with when Drive created the file. */
export interface SeenVersion extends ListedVersion {
  /** Drive's own clock, in milliseconds: the same answer on every device. */
  created: number;
}

/**
 * How long a device waits for its own push to appear in the folder's listing,
 * which can lag behind a new file by seconds. Only liveness rides on it: after
 * it, the device rebases, which is safe either way.
 */
export const LISTING_LAG_MS = 10 * 60_000;

export interface LocalState {
  /** The version the local database came from or was published as. Null if it never synced. */
  base: VersionRef | null;
  /** The journal holds writes made since `base`, in no version yet. */
  unpushed: boolean;
  /**
   * This device's latest push while its journal still holds pushed writes (not
   * yet held by every other device), **or while the folder has not listed it
   * yet**, even with no write in it (a first version): the version, the one it
   * was pushed on, and when it landed, on Drive's clock. Null otherwise.
   */
  unconfirmed: { version: VersionRef; parent: VersionRef | null; pushedAt: number } | null;
}

export type Decision =
  | { kind: 'nothing' }
  | { kind: 'push'; seq: number; parent: VersionRef | null }
  /** Pull the latest and adopt it: this device has no writes to carry. */
  | { kind: 'fast-forward'; to: VersionRef }
  /** Pull the latest, replay into it every journal entry it lacks, then push if any were. */
  | { kind: 'rebase'; onto: VersionRef }
  /** This device's push is not listed yet: Drive's listing lags. Look again later. */
  | { kind: 'wait' }
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
 * **the one that reached Drive first**. A twin that lands later never takes the
 * number from a version already there; the device id only breaks a tie in the
 * same millisecond.
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

export function decide(local: LocalState, versions: readonly SeenVersion[], now: number): Decision {
  const latest = latestVersion(versions);
  const { base, unpushed, unconfirmed } = local;
  const head: VersionRef | null =
    latest === null ? null : { seq: latest.seq, device: latest.device };

  if (
    unconfirmed !== null &&
    !versions.some((version) => sameVersion(version, unconfirmed.version))
  ) {
    // Its own push is not in the listing.
    const { parent } = unconfirmed;
    if (head !== null && parent !== null && head.seq < parent.seq) {
      // The folder has lost the version the push was made on too: more than
      // this push is gone, and the owner chooses, as for any folder behind.
      return { kind: 'ask', latest: head };
    }
    if (now - unconfirmed.pushedAt < LISTING_LAG_MS) {
      // Within the lag, that is the listing being slow: look again.
      return { kind: 'wait' };
    }
    // After it, the push is gone. An empty folder has nothing to lose, so
    // publish again. A first version that never landed meets a folder another
    // device filled meanwhile: its academy against this one, so the owner
    // chooses, as with no base (§ 6.5). Otherwise a rebase carries its writes
    // onto what is there.
    if (head === null) {
      return { kind: 'push', seq: unconfirmed.version.seq + 1, parent: base };
    }
    return parent === null ? { kind: 'ask', latest: head } : { kind: 'rebase', onto: head };
  }

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

  if (head.seq < base.seq) {
    // The folder is behind what this device has: versions deleted on Drive.
    // Pushing would bury the folder's versions, pulling would drop this
    // device's: the owner chooses. (Another account's folder is caught before
    // this, by the folder id in `keys.bjs`.)
    return { kind: 'ask', latest: head };
  }

  if (sameVersion(head, base)) {
    return unpushed ? { kind: 'push', seq: base.seq + 1, parent: base } : { kind: 'nothing' };
  }

  // Something newer is there. Writes of its own still to carry, pushed or not,
  // are replayed into it; the replay skips those already in it.
  return unpushed || unconfirmed !== null
    ? { kind: 'rebase', onto: head }
    : { kind: 'fast-forward', to: head };
}
