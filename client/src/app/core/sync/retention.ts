import { latestVersion, SeenVersion } from './decide';
import { sameVersion, VersionRef } from './layout';

/**
 * How many versions the folder keeps (PRD § 5.2, #2030). Each is the whole
 * database, so a folder that kept every one would fill the owner's Drive. A
 * version is a backup, and it is kept as the PC's backups are (#1228, #1330):
 * the newest densely, and one a day going back.
 */
export interface VersionRetention {
  /** The newest versions, every one. */
  keepRecent: number;
  /** The most recent days that hold a version, on Drive's clock, each keeping its newest. */
  keepDays: number;
}

export const VERSION_RETENTION: VersionRetention = { keepRecent: 10, keepDays: 14 };

/**
 * The versions to delete from the folder, given the bases the syncing
 * devices report (`devices/`).
 * - **Never the newest:** `keepRecent` is floored at 1. A device that is
 *   pulling reads the newest, and a deleted one is gone for good.
 * - **Never a first version:** a first version above a device's base is how
 *   that device tells another academy, however much of either line is
 *   pruned (`decide.ts`).
 * - **Two academies in the folder** (two first versions): nothing goes while
 *   a device is on a line other than the latest's, since the owner still has
 *   a question to answer there and the lines are what tell the academies
 *   apart. Once both report a base on the latest's line, the other lines are
 *   the academies the owner left, and go whole.
 */
export function versionsToPrune(
  versions: readonly SeenVersion[],
  bases: readonly (VersionRef | null)[],
  policy: VersionRetention = VERSION_RETENTION,
): SeenVersion[] {
  const latest = latestVersion(versions);
  if (latest === null) {
    return [];
  }
  let kept: readonly SeenVersion[] = versions;
  if (versions.filter((version) => version.parent === null).length > 1) {
    const line = lineOf(latest, versions);
    const allOnIt =
      line !== null &&
      bases.length > 1 &&
      bases.every((base) => base !== null && line.some((version) => sameVersion(version, base)));
    if (!allOnIt) {
      return [];
    }
    kept = line;
  }
  const left = versions.filter((version) => !kept.includes(version));
  return [...left, ...beyondPolicy(kept, policy)];
}

/** The newest and every version under it, down to its first; null when a link is not listed. */
function lineOf(newest: SeenVersion, versions: readonly SeenVersion[]): SeenVersion[] | null {
  const line: SeenVersion[] = [];
  let current: SeenVersion | undefined = newest;
  while (current !== undefined && line.length <= versions.length) {
    line.push(current);
    const parent: VersionRef | null = current.parent;
    if (parent === null) {
      return line;
    }
    current = versions.find((version) => sameVersion(version, parent));
  }
  return null;
}

/** One line's versions past the policy: never its first, never the newest. */
function beyondPolicy(versions: readonly SeenVersion[], policy: VersionRetention): SeenVersion[] {
  // Newest first, in `latestVersion`'s order: a twin Drive listed first leads.
  const newestFirst = [...versions].sort(
    (a, b) => b.seq - a.seq || a.created - b.created || a.device.localeCompare(b.device),
  );
  const keep = new Set(newestFirst.slice(0, Math.max(policy.keepRecent, 1)));
  const newestOfDay = new Map<string, SeenVersion>();
  for (const version of newestFirst) {
    const day = new Date(version.created).toISOString().slice(0, 10);
    if (!newestOfDay.has(day)) {
      newestOfDay.set(day, version);
    }
  }
  for (const version of [...newestOfDay.values()].slice(0, policy.keepDays)) {
    keep.add(version);
  }
  return newestFirst.filter((version) => !keep.has(version) && version.parent !== null);
}
