import { descends, latestVersion, SeenVersion } from './decide';
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
 * - **Never a first version:** with it, a device whose own line is pruned
 *   still tells another academy (`decide.ts`, `descends`).
 * - **Two academies in the folder** (two first versions): nothing goes until
 *   every device (at least two) reports a base on the latest's line, as far
 *   as the listing shows it: before that, the owner has a question to answer
 *   on the other line, and the lines are what tell the academies apart. Then
 *   the lines the latest does not descend from are the academies the owner
 *   left, and go whole, and the latest's line is pruned to the policy.
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
  const roots = versions.filter((version) => version.parent === null);
  if (roots.length <= 1) {
    return beyondPolicy(versions, policy);
  }
  const walk = walkDown(latest, versions);
  const allOnIt =
    bases.length > 1 &&
    bases.every((base) => base !== null && walk.some((version) => sameVersion(version, base)));
  if (!allOnIt) {
    return [];
  }
  const left = roots.filter((root) => descends(latest, root, versions) === false);
  if (roots.length - left.length !== 1) {
    // The latest's own first version is not told apart: nothing goes.
    return [];
  }
  const dead = versions.filter((version) =>
    left.some((root) => descends(version, root, versions) === true),
  );
  return [
    ...dead,
    ...beyondPolicy(
      versions.filter((version) => !dead.includes(version)),
      policy,
    ),
  ];
}

/** `newest` and the versions under it, as far as the listing names them. */
function walkDown(newest: SeenVersion, versions: readonly SeenVersion[]): SeenVersion[] {
  const walk: SeenVersion[] = [];
  let current: SeenVersion | undefined = newest;
  while (current !== undefined && walk.length <= versions.length) {
    walk.push(current);
    const parent: VersionRef | null = current.parent;
    current =
      parent === null ? undefined : versions.find((version) => sameVersion(version, parent));
  }
  return walk;
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
