#!/usr/bin/env node
/**
 * Pre-build hook: derive the current app version from git and emit two
 * artefacts that the SPA needs at runtime.
 *
 * 1. `src/environments/version.ts` — embedded via the bundler. The
 *    sidebar footer (#160) renders `VERSION.tag`; `VERSION.sha` is the
 *    identity the runtime cache-bust check (#548) compares against the
 *    server-served `version.json`.
 *
 * 2. `public/version.json` — copied verbatim into `dist/client/browser/`
 *    by the Angular builder, served at `/version.json` with no-cache
 *    headers (see `worker/index.js` § NO_CACHE_PATHS). The runtime
 *    `VersionCheckService` fetches this on focus + on a 20-minute
 *    interval; an SHA mismatch with the embedded `VERSION.sha` means
 *    the user's tab is on an old bundle and triggers the nuclear
 *    cache-bust sequence (unregister SWs + clear caches + reload).
 *
 * Both files share the same source-of-truth: `git describe --tags
 * --always` for the tag, `git rev-parse HEAD` for the full SHA.
 *
 * Run automatically by the `prebuild` npm script. Falls back to "dev" /
 * "0000000000000000000000000000000000000000" if git is unreachable
 * (no .git directory, shallow clone without tags, etc.) — doesn't fail
 * the build. Both files are committed with their `dev` defaults so a
 * fresh clone passes typecheck without running the build script and
 * `ng serve` works without a manual prebuild step.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TS_OUT_PATH = path.resolve(__dirname, '..', 'src', 'environments', 'version.ts');
const JSON_OUT_PATH = path.resolve(__dirname, '..', 'public', 'version.json');

// `git describe --tags --always` produces three shapes:
//   - "v1.2.0"             on a tagged commit (clean release)
//   - "v1.2.0-3-gabc1234"  N commits ahead of the tag, abbreviated SHA
//   - "abc1234"            no tags reachable — only the bare SHA
//
// We only need the network (a `git fetch`) to recover the first two
// shapes from the third — i.e. when the local clone has no tags. Local
// dev builds and tag-aware CI runners both produce the first two
// shapes on the FIRST describe call, so they pay zero network cost.
const SHA_ONLY = /^[0-9a-f]{7,40}$/;

function tryGit(cmd) {
  try {
    // `stdio: [ignore, pipe, ignore]` silences stderr without a shell
    // redirection, so the script works on Windows / cmd shells too where
    // `2>/dev/null` is meaningless. A missing .git or git binary throws
    // and the caller falls through to the `dev` default.
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function resolveTag() {
  // 1. First describe attempt — local dev builds and tag-aware CI hit
  //    this branch and exit immediately. No `git fetch`, no network,
  //    no extra latency on every `npm run build`.
  let raw = tryGit('git describe --tags --always');

  // 2. Bare-SHA result OR describe failed: best-effort `git fetch
  //    --tags` and re-describe. Cloudflare Pages (and most CI defaults)
  //    ship a shallow clone with no tags, which falls into this branch.
  //    Stdout is fully ignored — we only care that the fetch updates
  //    the local tag refs, not its output.
  if (!raw || SHA_ONLY.test(raw)) {
    try {
      execSync('git fetch --tags --quiet', {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      const refetched = tryGit('git describe --tags --always');
      if (refetched) {
        raw = refetched;
      }
    } catch {
      // No remote access (offline build, auth prompt, no remote at all)
      // — proceed with whatever the first describe produced.
    }
  }

  if (!raw) return 'dev';

  // Bare-SHA fallback (shallow clone with no remote / no tags ever
  // pushed). Prefix with `dev-` so the sidebar footer at least reads as
  // "untagged dev build at commit 42f69e" instead of an unexplained
  // hex string. The tagged + ahead-of-tag shapes already carry the
  // semantic version up front, so they pass through as-is.
  if (SHA_ONLY.test(raw)) {
    return `dev-${raw}`;
  }
  return raw;
}

function resolveSha() {
  // Full 40-char SHA — narrower mismatch window than the abbreviated
  // SHA inside `tag` so two builds at the same tag (rare, but possible
  // during a hotfix cycle on the same commit) still produce distinct
  // identities. Falls back to a sentinel of all zeroes when git is
  // unreachable; both outputs receive the same fallback, so the
  // runtime cache-bust check sees a "match" and stays quiet — the
  // sidebar footer's `tag: "dev"` is the surfaced signal that this
  // build was cut without git context (broken CI, unusual local
  // setup), not a forced reload loop.
  const sha = tryGit('git rev-parse HEAD');
  return sha || '0000000000000000000000000000000000000000';
}

function main() {
  const tag = resolveTag();
  const sha = resolveSha();
  const buildTime = new Date().toISOString();

  const tsContents = `/**
 * Build-time app version, surfaced quietly in the sidebar footer (#160)
 * and used as the embedded identity for the runtime cache-bust check
 * (#548 — \`VersionCheckService\` compares \`VERSION.sha\` against the
 * server-served \`/version.json\` to detect stuck-on-old-bundle tabs).
 *
 * AUTOGENERATED by scripts/write-version.cjs — do not commit changes
 * here. The committed default values are sentinel \`dev\` strings so
 * \`ng serve\` (no prebuild) and a fresh clone both work; this file is
 * regenerated on every \`ng build\` (CI runs the prebuild script before
 * each Pages deploy).
 *
 * **Typing: explicit \`AppVersion\` interface with \`string\` fields**
 * rather than \`as const\` literal narrowing. \`as const\` shipped on
 * v2.4.0 and broke the production build (TS2367) the moment the
 * prebuild wrote a real SHA — \`VERSION.sha === 'dev'\` had no literal-
 * type overlap. The interface is re-emitted into the generated file so
 * downstream code can \`import type { AppVersion } from './version'\`
 * without a round-trip via a separate types module. See #554 hotfix.
 */
export interface AppVersion {
  /** Resolved from \`git describe --tags --always\` at build time. */
  readonly tag: string;
  /** Full 40-char commit SHA — used as the cache-bust identity. */
  readonly sha: string;
  /** ISO-8601 UTC build timestamp — diagnostic field, not used as identity. */
  readonly buildTime: string;
}

export const VERSION: AppVersion = {
  tag: ${JSON.stringify(tag)},
  sha: ${JSON.stringify(sha)},
  buildTime: ${JSON.stringify(buildTime)},
};
`;
  fs.writeFileSync(TS_OUT_PATH, tsContents, 'utf8');

  const jsonContents = `${JSON.stringify({ tag, sha, buildTime }, null, 2)}\n`;
  fs.writeFileSync(JSON_OUT_PATH, jsonContents, 'utf8');

  // eslint-disable-next-line no-console
  console.log(
    `[write-version] ${tag} (${sha.slice(0, 7)}) → ${path.relative(path.resolve(__dirname, '..'), TS_OUT_PATH)} + ${path.relative(path.resolve(__dirname, '..'), JSON_OUT_PATH)}`,
  );
}

main();
