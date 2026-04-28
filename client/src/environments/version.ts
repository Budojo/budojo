/**
 * Build-time app version, surfaced quietly in the sidebar footer (#160).
 *
 * Default committed value is `dev` so:
 *   - `ng serve` (no prebuild needed) renders "dev" — clear signal you're on
 *     a hot-reload bundle, not a versioned artifact.
 *   - The first dev clone passes typecheck without running the build script.
 *
 * The `prebuild` npm script (`scripts/write-version.cjs`) overwrites this
 * file with `git describe --tags --always` output before every `ng build`.
 * The CI pipeline regenerates it on each deploy, so prod always shows the
 * tag the bundle was cut from.
 */
export const VERSION = {
  /** Resolved from `git describe --tags --always` at build time. */
  tag: 'dev',
} as const;
