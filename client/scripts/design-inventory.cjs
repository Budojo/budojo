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
const CYPRESS_IMAGE = 'cypress/included:13.17.0';
const CLIENT_CONTAINER = 'budojo_client';

// Config values passed to Cypress at runtime:
//   - baseUrl: local to the shared network namespace (dev server inside
//     budojo_client).
//   - screenshotsFolder: relative to the workdir (`client/`), so
//     `../docs/...` resolves to the repo root's docs folder.
//   - trashAssetsBeforeRuns: keep prior screenshots — we want additive
//     regeneration, not wipe-on-each-run.
//   - specPattern: scoped to the inventory folder. Required to *enable*
//     discovery; the default Cypress glob is `cypress/e2e/**/*.cy.ts`
//     which deliberately excludes `cypress/inventory/`.
const cypressConfig = [
  'baseUrl=http://localhost:4200',
  'screenshotsFolder=../docs/design/screenshots',
  'trashAssetsBeforeRuns=false',
  'specPattern=cypress/inventory/**/*.cy.ts',
].join(',');

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
  '--spec',
  'cypress/inventory/design-inventory.cy.ts',
  '--reporter',
  'min',
  '--config',
  cypressConfig,
];

console.log('→ regenerating design inventory screenshots');
console.log('  cypress image:     ', CYPRESS_IMAGE);
console.log('  shared network of: ', CLIENT_CONTAINER);
console.log('  repo mount:        ', REPO_ROOT, '→ /repo');
console.log('  output:            ', path.join(REPO_ROOT, 'docs', 'design', 'screenshots'));
console.log('');

const result = spawnSync('docker', dockerArgs, { stdio: 'inherit' });

if (result.error) {
  console.error('docker not on PATH — install docker desktop (or equivalent) and retry.');
  process.exit(127);
}
process.exit(result.status ?? 1);
