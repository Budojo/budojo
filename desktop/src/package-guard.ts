/**
 * What must never end up inside the shipped app (#1315) — the decision, not the
 * walk.
 *
 * `electron-builder.yml` already excludes these, and that is the fix. This is
 * the belt to that braces, and it exists because of how the failure looks: the
 * exclusion is one line in a list of twenty, a typo in it changes nothing
 * visible, the build succeeds, and the app appears to work until someone opens
 * a page with an image on it. A build that refuses is a good outcome here; a
 * build that succeeds and lies is not.
 *
 * The dangerous file is `bootstrap/cache/config.php`. Its presence makes
 * Laravel ignore every file in `config/`, which on a server merely freezes
 * configuration and on this build freezes values that are **per-launch**:
 * `APP_URL` is `http://127.0.0.1:<ephemeral port>`, and
 * `Storage::disk('public')->url()` is built from it, so a stale one breaks
 * every avatar, academy logo and video thumbnail — with a symptom identical to
 * #1302 and a completely unrelated cause.
 *
 * Its neighbours `packages.php` and `services.php` are package discovery. They
 * are safe, they save real work at boot, and they are deliberately allowed —
 * which is why this is not a blanket `bootstrap/cache/**`.
 */

/**
 * Matched against a path relative to the server root, with `/` separators.
 *
 * Deliberately only Laravel's compiled caches, and not the other things
 * `electron-builder.yml` excludes. `.env`, `database/sqlite/` and the PEST
 * scratch under `storage/framework/testing/` are all **normal in a development
 * checkout** — `.env` is what configures the dev containers at all — so
 * refusing them would fail every local `npm run dist` and teach everyone to
 * skip the check. Their exclusions have also been exercised for real; these
 * three never have, because nothing writes them today.
 *
 * That is the whole point: this guards the case that is silent, latent, and
 * one `php artisan optimize` away.
 */
const FORBIDDEN = [
  /^bootstrap\/cache\/config\.php$/,
  /^bootstrap\/cache\/routes-.*\.php$/,
  /^bootstrap\/cache\/events\.php$/,
] as const;

export function isForbiddenInPackage(relativePath: string): boolean {
  // Callers hand us whatever the platform's `path` produced. Normalising here
  // rather than at each call site is the difference between a guard that works
  // on the Windows packaging machine and one that quietly passes everything.
  const normalised = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');

  return FORBIDDEN.some((pattern) => pattern.test(normalised));
}

/**
 * The ones that must not ship, given everything present under the server root.
 *
 * Returns them rather than throwing: the caller reports all of them at once,
 * because finding the second one only after fixing the first is the kind of
 * thing that makes people stop running the check.
 */
export function findForbiddenInPackage(relativePaths: readonly string[]): string[] {
  return relativePaths.filter(isForbiddenInPackage).sort();
}

/** What the packager prints before exiting non-zero. */
export function describeForbidden(found: readonly string[]): string {
  if (found.length === 0) {
    return 'server/: no compiled Laravel cache to worry about.';
  }

  const list = found.map((file) => `  - ${file}`).join('\n');

  return (
    `Refusing to package: ${found.length} compiled Laravel cache file(s) under server/ would ship inside the app.\n` +
    `${list}\n\n` +
    'A cached config makes Laravel ignore every file in config/, freezing the shipped\n' +
    'app at this machine\u2019s values \u2014 including APP_URL, which is a different ephemeral\n' +
    'port on every launch. Clear it and package again:\n\n' +
    '  docker compose exec api php artisan optimize:clear\n'
  );
}
