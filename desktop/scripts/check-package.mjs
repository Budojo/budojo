#!/usr/bin/env node
/**
 * Refuses to package when `server/` contains a file that must never ship
 * (#1315).
 *
 * `electron-builder.yml` already excludes them, and that exclusion is the fix.
 * This is the belt to those braces, and it exists because of the shape of the
 * failure it guards: the exclusion is one line in a list of twenty, mistyping
 * it changes nothing visible, the build succeeds, the installer is uploaded,
 * and the app appears to work until someone opens a page with an image on it.
 *
 * The one that matters is `bootstrap/cache/config.php`. Laravel ignores every
 * file in `config/` when it exists, so the shipped app's configuration is
 * frozen at whatever the packaging machine had — including `APP_URL`, which on
 * this build is `http://127.0.0.1:<ephemeral port>` and different on every
 * single launch. `Storage::disk('public')->url()` is built from it.
 *
 * Runs before `electron-builder`, so it fails in seconds rather than after a
 * six-minute package. Which files are forbidden is decided by
 * `src/package-guard.ts` and unit-tested there; this walks the tree.
 *
 *   npm run check:package        # from desktop/
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeForbidden, findForbiddenInPackage } from '../dist/package-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..', '..', 'server');

// Never descended into. `vendor/` and `node_modules/` are tens of thousands of
// files and cannot contain the paths we look for, which are all anchored at the
// server root.
const SKIP = new Set(['vendor', 'node_modules', '.git']);

function walk(dir, prefix = '') {
  const found = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) {
        found.push(...walk(path.join(dir, entry.name), relative));
      }
    } else {
      found.push(relative);
    }
  }

  return found;
}

const forbidden = findForbiddenInPackage(walk(serverRoot));

console.log(describeForbidden(forbidden));

if (forbidden.length > 0) {
  process.exit(1);
}
