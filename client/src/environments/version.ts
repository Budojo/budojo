/**
 * Build-time app version, surfaced quietly in the sidebar footer (#160)
 * and used as the embedded identity for the runtime cache-bust check
 * (#548 — `VersionCheckService` compares `VERSION.sha` against the
 * server-served `/version.json` to detect stuck-on-old-bundle tabs).
 *
 * Default committed values are sentinel `dev` strings so:
 *   - `ng serve` (no prebuild needed) renders "dev" — clear signal
 *     you're on a hot-reload bundle, not a versioned artifact.
 *   - A fresh clone passes typecheck without running the build script.
 *
 * The `prebuild` npm script (`scripts/write-version.cjs`) overwrites
 * this file with `git describe --tags --always` + `git rev-parse HEAD`
 * before every `ng build`. The CI pipeline regenerates it on each
 * deploy, so prod always shows the tag the bundle was cut from.
 */
export const VERSION = {
  /** Resolved from `git describe --tags --always` at build time. */
  tag: 'dev',
  /** Full 40-char commit SHA — used as the cache-bust identity. */
  sha: 'dev',
  /** ISO-8601 UTC build timestamp — diagnostic field, not used as identity. */
  buildTime: '1970-01-01T00:00:00.000Z',
} as const;
