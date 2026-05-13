#!/usr/bin/env node
/**
 * Play Store screenshot regen wrapper (#690).
 *
 * Runs the capture spec inside `cypress/included`. Adopts the design-
 * inventory runner's shared-network-namespace trick (`--network=container:budojo_client`)
 * so `localhost:4200` from inside Cypress reaches the dev server directly,
 * with Host header = `localhost` (Angular dev server's default allowlist).
 *
 * Prerequisite: `docker compose up -d client` is running. This script
 * doesn't start the dev server.
 *
 * ## Why Chrome instead of Electron
 *
 * cypress/included starts an internal Xvfb on display :99 sized to ~1024
 * tall by default. The Play Store tablet-10 slot REQUIRES min 1080 px on
 * each side, and the phone slot is "promotable" at min 1080 — Electron+Xvfb
 * silently clamps the viewport to the Xvfb screen size and the resulting
 * PNG comes out at e.g. 1080×720 instead of 1080×2400. Headless Chrome
 * has no Xvfb dependency; viewport dimensions land exactly as requested.
 *
 * ## Why the post-run move instead of `--config screenshotsFolder=...`
 *
 * On Cypress 15.14 the `--config screenshotsFolder=...` override is
 * silently ignored when passed via the comma-separated CLI shorthand —
 * screenshots land in the project-default `cypress/screenshots/` no
 * matter what we pass. The cleanest workaround is to let Cypress write
 * to its default, then move the success PNGs (skipping the auto-saved
 * `(failed).png` artefacts) under `docs/marketing/screenshots/play-store/`
 * where the rest of the marketing folder lives.
 *
 * ## Why wipe before run
 *
 * A previous failing run leaves auto-saved `(failed).png` files behind
 * that are confusing to look at and pollute git. The wipe + post-move
 * combination ensures the committed library always reflects the most
 * recent successful capture only.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CYPRESS_IMAGE = 'cypress/included:15.14.2';
const CLIENT_CONTAINER = 'budojo_client';
const SPEC = 'cypress/marketing/play-store-screenshots.cy.ts';

// Where Cypress writes its screenshots (project default; the
// screenshotsFolder override is broken on 15.14 — see file header).
const CYPRESS_OUTPUT_DIR = path.join(
  REPO_ROOT,
  'client',
  'cypress',
  'screenshots',
  'play-store-screenshots.cy.ts',
);
// Where we want them to end up, alongside the other marketing assets.
const TARGET_DIR = path.join(REPO_ROOT, 'docs', 'marketing', 'screenshots', 'play-store');

// 1) Wipe BOTH locations before run so stale artefacts (a previous
//    failure's auto-saved `(failed).png`, or a renamed screen leaving
//    its old slug behind) never sneak into the committed library.
//
//    Why busybox + docker for the cypress folder: previous runs of
//    cypress/included write the screenshots as root (the container's
//    default user) and the host node process (running as
//    `matteobonanno`) can't `rm` them — `EACCES` on the first wipe.
//    Letting the docker daemon do the delete sidesteps the ownership
//    mismatch without touching the cypress image config.
console.log('→ wiping previous artefacts');
spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${REPO_ROOT}:/repo`,
    'busybox',
    'rm',
    '-rf',
    '/repo/client/cypress/screenshots/play-store-screenshots.cy.ts',
    '/repo/docs/marketing/screenshots/play-store',
  ],
  { stdio: 'inherit' },
);

// 2) Run Cypress in `cypress/included`. Chrome headless (not Electron)
//    so the requested viewports (up to 1600×2560 tablet-10) actually
//    apply instead of being clamped to the default Xvfb 1280×1024.
const dockerArgs = [
  'run',
  '--rm',
  `--network=container:${CLIENT_CONTAINER}`,
  '-v',
  `${REPO_ROOT}:/repo`,
  '-w',
  '/repo/client',
  CYPRESS_IMAGE,
  'run',
  '--browser',
  'chrome',
  '--headless',
  '--spec',
  SPEC,
  '--reporter',
  'min',
  // Use the marketing-only config file. It carries the
  // `before:browser:launch` hook that sizes the Chrome window at
  // 1600×2700 (largest viewport + runner chrome headroom). Sourcing
  // it from a sibling config file keeps the main `cypress.config.ts`
  // simple — the launch hook would otherwise affect every E2E spec.
  '--config-file',
  'cypress.marketing.config.ts',
];

console.log('→ regenerating Play Store screenshots');
console.log('  cypress image:     ', CYPRESS_IMAGE);
console.log('  shared network of: ', CLIENT_CONTAINER);
console.log('  repo mount:        ', REPO_ROOT, '→ /repo');
console.log('  spec:              ', SPEC);
console.log('  browser:           ', 'chrome (headless)');
console.log('  final output:      ', TARGET_DIR);
console.log('');

const cypressResult = spawnSync('docker', dockerArgs, { stdio: 'inherit' });

if (cypressResult.error) {
  console.error('docker not on PATH — install docker desktop (or equivalent) and retry.');
  process.exit(127);
}

// 3) Chown the cypress output (written as root inside the container)
//    to the host user, so the subsequent rename — which runs as the
//    host user — doesn't trip on EACCES. Same docker-as-root trick the
//    wipe step uses, just narrower.
console.log('');
console.log('→ chowning cypress output to host user');
const { uid, gid } = require('node:os').userInfo();
spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${REPO_ROOT}:/repo`,
    'busybox',
    'chown',
    '-R',
    `${uid}:${gid}`,
    '/repo/client/cypress/screenshots',
  ],
  { stdio: 'inherit' },
);

// 4) Move the success screenshots into the marketing folder. Skip the
//    auto-saved `(failed).png` artefacts so a partial run still leaves
//    a clean library (only what actually succeeded).
console.log('→ moving success PNGs into the marketing folder');
fs.mkdirSync(TARGET_DIR, { recursive: true });

let moved = 0;
let skipped = 0;
if (fs.existsSync(CYPRESS_OUTPUT_DIR)) {
  // Walk the cypress output tree. We expect:
  //   <root>/<viewport>/<screen>.png
  for (const viewport of fs.readdirSync(CYPRESS_OUTPUT_DIR, { withFileTypes: true })) {
    if (!viewport.isDirectory()) {
      // The auto-saved `(failed).png` files sit at the root of the
      // cypress output dir, NOT inside a viewport subfolder. They
      // get skipped here by construction.
      skipped += 1;
      continue;
    }
    const viewportSrc = path.join(CYPRESS_OUTPUT_DIR, viewport.name);
    const viewportDst = path.join(TARGET_DIR, viewport.name);
    fs.mkdirSync(viewportDst, { recursive: true });
    for (const file of fs.readdirSync(viewportSrc)) {
      if (!file.endsWith('.png')) continue;
      fs.renameSync(path.join(viewportSrc, file), path.join(viewportDst, file));
      moved += 1;
    }
  }
}
console.log(`  moved:   ${moved} success PNGs`);
console.log(`  skipped: ${skipped} failure artefacts (left in cypress/screenshots/)`);

// Cypress's own exit code reflects pass/fail. We mirror it so CI / the
// caller sees a non-zero exit when any of the 15 captures failed —
// post-move runs unconditionally so the user can still inspect the
// partial library to diagnose.
process.exit(cypressResult.status ?? 1);
