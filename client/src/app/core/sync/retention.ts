import { SeenVersion } from './decide';

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
 * The versions to delete from the folder.
 * - **Never the newest:** `keepRecent` is floored at 1. The device that is
 *   pulling reads the newest, and a deleted one is gone for good.
 * - **Nothing while the folder holds two academies' first versions:** the
 *   owner has a question to answer, and the lines are what tell the two
 *   apart (`decide.ts`). Once the owner chose, one first version is left.
 * - **A line's first version goes like any other:** `decide` tells another
 *   academy by a first version above its own base, whatever of its own line
 *   is still listed.
 */
export function versionsToPrune(
  versions: readonly SeenVersion[],
  policy: VersionRetention = VERSION_RETENTION,
): SeenVersion[] {
  if (versions.filter((version) => version.parent === null).length > 1) {
    return [];
  }
  const newestFirst = [...versions].sort((a, b) => b.seq - a.seq || a.created - b.created);
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
  return newestFirst.filter((version) => !keep.has(version));
}
