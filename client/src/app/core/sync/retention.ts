import { descends, latestVersion, SeenVersion } from './decide';
import { parseFilePath, sameVersion, VersionRef } from './layout';
import { Listing } from './remote';

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
  const { left, beyond } = plan(versions, bases, policy);
  return [...left, ...beyond];
}

/** What goes: the left academies' lines, and the live line past the policy. */
function plan(
  versions: readonly SeenVersion[],
  bases: readonly (VersionRef | null)[],
  policy: VersionRetention,
): { left: SeenVersion[]; beyond: SeenVersion[] } {
  const nothing = { left: [], beyond: [] };
  const latest = latestVersion(versions);
  if (latest === null) {
    return nothing;
  }
  const roots = versions.filter((version) => version.parent === null);
  if (roots.length <= 1) {
    return { left: [], beyond: beyondPolicy(versions, policy) };
  }
  const walk = walkDown(latest, versions);
  const allOnIt =
    bases.length > 1 &&
    bases.every((base) => base !== null && walk.some((version) => sameVersion(version, base)));
  if (!allOnIt) {
    return nothing;
  }
  const leftRoots = roots.filter((root) => descends(latest, root, versions) === false);
  if (roots.length - leftRoots.length !== 1) {
    // The latest's own first version is not told apart: nothing goes.
    return nothing;
  }
  const left = versions.filter((version) =>
    leftRoots.some((root) => descends(version, root, versions) === true),
  );
  return {
    left,
    beyond: beyondPolicy(
      versions.filter((version) => !left.includes(version)),
      policy,
    ),
  };
}

/** How many versions one push deletes at most (#2117 review): each delete is a few calls to Drive. */
export const PRUNED_PER_PUSH = 20;

/**
 * What one push deletes: `versionsToPrune`, a few at a time, so a folder that
 * grew before the retention shipped is trimmed over the next pushes and
 * never in one round that keeps the owner waiting on Drive.
 *
 * **A left academy goes first, from its newest down to its first version:**
 * what remains of its line stays joined to its first version, so it is still
 * told apart at the next push, and the live line stays whole meanwhile,
 * since its walk down is what proves the other line left (#2117 review).
 * Only then is the live line pruned, the oldest first.
 */
export function pruneBatch(
  versions: readonly SeenVersion[],
  bases: readonly (VersionRef | null)[],
  limit = PRUNED_PER_PUSH,
): SeenVersion[] {
  const { left, beyond } = plan(versions, bases, VERSION_RETENTION);
  const ordered =
    left.length > 0
      ? [...left].sort((a, b) => b.seq - a.seq)
      : [...beyond].sort((a, b) => a.seq - b.seq);
  return ordered.slice(0, Math.max(limit, 1));
}

/**
 * How long a content stays in `files/` once sent, whatever names it (#2118):
 * a device sends a version's contents before the version, so one sent for a
 * version still on its way is named by none yet.
 */
export const CONTENT_GRACE_MS = 24 * 60 * 60 * 1000;

/** How many contents one run deletes at most: the rest go at the next. */
export const PRUNED_CONTENTS_PER_RUN = 50;

/**
 * How often a device prunes `files/` (#2118): knowing what the kept versions
 * name means reading each, a whole database, so it runs after a push at most
 * once a day.
 */
export const CONTENTS_PRUNED_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * The contents to delete from `files/` (#2118): those `named` does not hold,
 * sent at least `CONTENT_GRACE_MS` before the listing, on Drive's clock, the
 * oldest first. `named` is what must stay: every content a kept version names,
 * with what this device's own database names. The caller builds it only once
 * it read every kept version; when it cannot, it deletes nothing.
 * - **Never a file that is not a content's:** anything else in `files/` stays.
 * - **Drive gave no time:** nothing, as no content's age is known (a NaN age
 *   is never past the grace).
 */
export function contentsToPrune(
  named: ReadonlySet<string>,
  listing: Listing,
  limit = PRUNED_CONTENTS_PER_RUN,
): string[] {
  return listing.files
    .filter((file) => {
      const content = parseFilePath(file.path);
      return (
        content !== null && !named.has(content) && listing.now - file.created >= CONTENT_GRACE_MS
      );
    })
    .sort((a, b) => a.created - b.created)
    .slice(0, Math.max(limit, 1))
    .map((file) => file.path);
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
