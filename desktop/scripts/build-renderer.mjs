#!/usr/bin/env node
/**
 * Builds the Angular desktop configuration and copies it to dist/renderer,
 * where main.ts serves it over app:// (#1224).
 *
 * Kept as a script rather than a shell one-liner so it is the same on the
 * Windows dev box and the CI runner, and so the copy is a clean replace — a
 * stale chunk left behind from a previous build is exactly the "HTML for a
 * missing module" class of failure the protocol handler exists to prevent.
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

if (!skipBuild) {
  const ng = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['ng', 'build', '--configuration', 'desktop'], {
    cwd: clientDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
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
