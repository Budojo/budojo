#!/usr/bin/env node
/**
 * Empties the desktop build output — `dist/` (compiled main + preload +
 * renderer) and `release/` (electron-builder's installers).
 *
 * Both matter, for different reasons.
 *
 * `release/` because electron-builder writes the new artefacts ALONGSIDE the
 * previous version's rather than replacing them. After a few releases the
 * directory holds a pile of installers and the current one is whichever you
 * remember — which is how you end up testing Budojo-Setup-2.42.0.exe while
 * debugging 2.43. (Not a shipping risk: release.yml uploads explicitly named
 * files, not a glob, and CI runs on a fresh checkout.)
 *
 * `dist/` for a sharper reason than tidiness: electron-builder.yml packages
 * `files: [dist/**\/*]`, so a compiled file left behind by a renamed or
 * deleted source module keeps getting shipped inside the asar, invisibly,
 * until something empties the directory. `tsc` overwrites, it does not prune.
 *
 * Node rather than `rm -rf` in an npm script so it behaves the same on the
 * Windows packaging machine as it does on a Linux dev box. No dependency —
 * fs.rmSync is enough.
 *
 *   npm run clean          # from desktop/
 */
import { existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/** Bytes on disk, walked rather than shelled out to `du`. */
function sizeOf(target) {
  const stats = statSync(target, { throwIfNoEntry: false });
  if (stats === undefined) {
    return 0;
  }
  if (!stats.isDirectory()) {
    return stats.size;
  }

  return readdirSync(target).reduce((total, entry) => total + sizeOf(path.join(target, entry)), 0);
}

function human(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(1)} ${units[unit]}`;
}

let reclaimed = 0;
let removed = 0;

for (const name of ['dist', 'release']) {
  const target = path.join(root, name);
  if (!existsSync(target)) {
    continue;
  }
  const bytes = sizeOf(target);
  rmSync(target, { recursive: true, force: true });
  console.log(`removed desktop/${name} (${human(bytes)})`);
  reclaimed += bytes;
  removed += 1;
}

// Saying "nothing to remove" out loud matters: a clean command that prints
// nothing is indistinguishable from one that silently failed.
console.log(removed === 0 ? 'desktop: nothing to remove' : `desktop: reclaimed ${human(reclaimed)}`);
