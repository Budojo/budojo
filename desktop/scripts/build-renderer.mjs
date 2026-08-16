#!/usr/bin/env node
/**
 * Builds the Angular desktop configuration and copies it to dist/renderer,
 * where main.ts serves it over app:// (#1224).
 *
 * Kept as a script rather than a shell one-liner so it is the same on the
 * Windows dev box and the CI runner, and so the copy is a clean replace — a
 * stale chunk left behind from a previous build is exactly the "HTML for a
 * missing module" class of failure the protocol handler exists to prevent.
 *
 * **Where the Angular build actually runs depends on where the toolchain is.**
 * On CI the runner does its own `npm ci` in client/, so `ng` is native and runs
 * on the host. On the Windows dev box `client/node_modules` is installed INSIDE
 * the Linux container through the `./client:/app` bind mount — there is no
 * `.bin/ng.cmd`, and invoking npx on the host dies with "could not determine
 * executable to run". So: detect which toolchain exists and use that one. The
 * container writes to the same mounted `client/dist`, so the copy below is
 * identical either way.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '..', '..', 'client');
const source = path.join(clientDir, 'dist', 'client', 'browser');
const target = path.resolve(here, '..', 'dist', 'renderer');
const skipBuild = process.argv.includes('--copy-only');

const CONTAINER = 'budojo_client';
const NG_ARGS = ['ng', 'build', '--configuration', 'desktop'];

/** A host toolchain is usable only if npm created a launcher for THIS platform. */
function hostToolchainUsable() {
  const bin = path.join(clientDir, 'node_modules', '.bin');
  return process.platform === 'win32'
    ? existsSync(path.join(bin, 'ng.cmd'))
    : existsSync(path.join(bin, 'ng'));
}

function containerRunning() {
  const probe = spawnSync('docker', ['exec', CONTAINER, 'true'], { stdio: 'ignore' });
  return probe.status === 0;
}

function buildOnHost() {
  console.log('building the renderer on the host');
  return spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', NG_ARGS, {
    cwd: clientDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function buildInContainer() {
  console.log(`building the renderer inside ${CONTAINER} (client/node_modules is the container's)`);
  return spawnSync('docker', ['exec', CONTAINER, 'sh', '-c', `cd /app && npx ${NG_ARGS.join(' ')}`], {
    stdio: 'inherit',
  });
}

if (!skipBuild) {
  let ng;

  if (hostToolchainUsable()) {
    ng = buildOnHost();
  } else if (containerRunning()) {
    ng = buildInContainer();
  } else {
    console.error(
      [
        'Cannot build the renderer: no usable Angular toolchain.',
        '',
        `  client/node_modules has no launcher for ${process.platform}, and the`,
        `  ${CONTAINER} container is not running.`,
        '',
        '  Start the dev environment and retry:   make up',
        '  ...or install the toolchain natively:  cd client && npm ci',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (ng.status !== 0) {
    console.error('ng build --configuration desktop failed');
    process.exit(ng.status ?? 1);
  }
}

if (!existsSync(path.join(source, 'index.html'))) {
  console.error(`no build at ${source} — run without --copy-only, or build the client first`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`renderer copied to ${target}`);
