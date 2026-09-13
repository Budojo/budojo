#!/usr/bin/env node
/**
 * Design inventory wrapper — runs the screenshot spec inside a
 * Cypress-included docker container so the host doesn't need Chrome +
 * Xvfb + the full Cypress toolchain natively.
 *
 * Why not just `cypress run` directly?
 *   The dev client is served out of an Alpine `node:22-alpine` container
 *   that doesn't ship Xvfb. Installing X11 in that image bloats the
 *   dev stack for everyone to support a once-in-a-while screenshot run.
 *   The clean separation is: dev stack stays minimal, inventory rides
 *   on `cypress/included` (the image Cypress themselves publish for
 *   exactly this use case).
 *
 * Why `--network=container:budojo_client`?
 *   Shares the client container's network namespace. `localhost:4200`
 *   from inside the Cypress container then routes to the dev server
 *   directly, with Host header = `localhost` (the default Angular dev
 *   server allowlist entry). No cross-container routing, no
 *   host-gateway hop. Works on any docker host without Docker-Desktop-
 *   specific magic. Side benefit: if the user stops the dev client,
 *   this script fails fast with a clear docker error instead of
 *   hanging on a timeout.
 *
 * Prerequisite:
 *   `docker compose up -d client` is running. This script doesn't start
 *   the dev server — it expects one reachable on localhost:4200 inside
 *   the network of the `budojo_client` container.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CYPRESS_IMAGE = 'cypress/included:15.21.1';
const CLIENT_CONTAINER = 'budojo_client';

// Which spec under `cypress/inventory/` to run. The three-viewport inventory
// is the default; `desktop-audit` (#1614) is the same idea at the two widths
// the Electron window can have, in Italian, with the dialogs opened.
const SPEC = (process.argv[2] ?? 'design-inventory').replace(/\.cy\.ts$/, '');

// Optional slug prefixes, comma-separated: `npm run design:audit -- desktop-audit
// 22-athlete,40-stats` shoots only the screens whose slug starts with one. Read by the audit spec as
// `Cypress.env('ONLY')`; the inventory ignores it.
const ONLY = process.argv[3] ?? '';

// Config values passed to Cypress at runtime:
//   - baseUrl: local to the shared network namespace (dev server inside
//     budojo_client).
//   - screenshotsFolder: left at the Cypress default, which is
//     `client/cypress/screenshots/` and gitignored. The inventory used to
//     aim at `docs/design/screenshots/` so the library could be committed —
//     that never worked (the override was silently ignored and the folder
//     holds only its README), and it should not: one full set is 26 MB
//     against a 15 MB repo, every regeneration adds another set to history
//     for good, and a pull request with 150 changed PNGs is not reviewable
//     anyway. The inventory is for LOOKING at, freshly generated.
//   - trashAssetsBeforeRuns: keep prior screenshots — we want additive
//     regeneration, not wipe-on-each-run.
//   - specPattern: scoped to the inventory folder. Required to *enable*
//     discovery; the default Cypress glob is `cypress/e2e/**/*.cy.ts`
//     which deliberately excludes `cypress/inventory/`.
const cypressConfig = [
  'baseUrl=http://localhost:4200',
  'trashAssetsBeforeRuns=false',
  'specPattern=cypress/inventory/**/*.cy.ts',
  // The headless browser window is sized from these. Without them it opens
  // at 1280×720 and a `cy.viewport(1280, 860)` is scaled to fit rather than
  // given the room — and every 860-tall screenshot comes back 720 tall.
  'viewportWidth=1280',
  'viewportHeight=900',
].join(',');

// Run as the invoking user. Without this the container writes as root, and on
// a Linux bind mount that is the host's real filesystem — so every screenshot
// and every failure capture lands in the working tree owned by root, and the
// next run cannot overwrite its own output. `.claude/scripts/e2e.sh` has
// passed `--user` since it was written; this script was missed.
const uid = typeof process.getuid === 'function' ? process.getuid() : null;
const gid = typeof process.getgid === 'function' ? process.getgid() : null;
const userArgs = uid !== null && gid !== null ? ['--user', `${uid}:${gid}`] : [];

const dockerArgs = [
  'run',
  '--rm',
  ...userArgs,
  // A `CYPRESS_*` variable lands in `Cypress.env()` untouched — `--env` would
  // split the list on its commas and read every prefix after the first as
  // the name of another key.
  ...(ONLY === '' ? [] : ['-e', `CYPRESS_ONLY=${ONLY}`]),
  `--network=container:${CLIENT_CONTAINER}`,
  '-v',
  `${REPO_ROOT}:/repo`,
  '-w',
  '/repo/client',
  CYPRESS_IMAGE,
  'run',
  '--spec',
  `cypress/inventory/${SPEC}.cy.ts`,
  '--reporter',
  'min',
  '--config',
  cypressConfig,
];

console.log('→ regenerating design inventory screenshots');
console.log('  cypress image:     ', CYPRESS_IMAGE);
console.log('  shared network of: ', CLIENT_CONTAINER);
console.log('  repo mount:        ', REPO_ROOT, '→ /repo');
console.log('  spec:              ', `${SPEC}.cy.ts`);
console.log(
  '  output:            ',
  path.join(REPO_ROOT, 'client', 'cypress', 'screenshots', `${SPEC}.cy.ts`),
);
console.log('');

const result = spawnSync('docker', dockerArgs, { stdio: 'inherit' });

if (result.error) {
  console.error('docker not on PATH — install docker desktop (or equivalent) and retry.');
  process.exit(127);
}
process.exit(result.status ?? 1);
