#!/usr/bin/env node
/**
 * Downloads and verifies the PHP runtime bundled with Budojo Desktop (#1222).
 *
 * The binary is deliberately NOT committed: it is 30 MB of third-party
 * artefact that changes on every security release. What IS committed is
 * runtime/php.manifest.json — version, URL and sha256 — so a checkout plus
 * this script always yields byte-identical bits, and a tampered or truncated
 * download is refused rather than shipped.
 *
 * Idempotent: a runtime that already matches the manifest is left alone.
 * Windows-only on purpose — the artefact is a Windows binary, so extraction
 * leans on Expand-Archive instead of adding a zip dependency for one script.
 *
 *   npm run fetch:php          # from desktop/
 *   npm run fetch:php -- --force
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:https';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, '..', 'runtime');
const manifestPath = path.join(runtimeDir, 'php.manifest.json');
const targetDir = path.join(runtimeDir, 'php');
const markerPath = path.join(targetDir, '.budojo-runtime.json');
const force = process.argv.includes('--force');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (!force && existsSync(markerPath)) {
  const marker = JSON.parse(await readFile(markerPath, 'utf8'));
  if (marker.sha256 === manifest.sha256 && existsSync(path.join(targetDir, 'php.exe'))) {
    console.log(`php ${manifest.version} already present and matches the manifest — nothing to do`);
    process.exit(0);
  }
}

if (process.platform !== 'win32') {
  console.error('fetch-php.mjs extracts with Expand-Archive and only runs on Windows.');
  process.exit(2);
}

/** Follows redirects; resolves with the final response stream. */
function download(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'budojo-desktop-fetch-php' } }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location && redirectsLeft > 0) {
        response.resume();
        resolve(download(new URL(response.headers.location, url).toString(), redirectsLeft - 1));
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`HTTP ${status} for ${url}`));
        return;
      }
      resolve(response);
    }).on('error', reject);
  });
}

await mkdir(runtimeDir, { recursive: true });
const zipPath = path.join(runtimeDir, `php-${manifest.version}.zip.partial`);

let response = null;
let lastError = null;
for (const url of manifest.urls) {
  try {
    console.log(`downloading ${url}`);
    response = await download(url);
    break;
  } catch (error) {
    lastError = error;
    console.log(`  not available here (${error.message}), trying next`);
  }
}
if (response === null) {
  console.error(`could not download php ${manifest.version}: ${lastError?.message}`);
  process.exit(1);
}

// Hash while streaming so a 30 MB file is never held in memory twice.
const hash = createHash('sha256');
await new Promise((resolve, reject) => {
  const out = createWriteStream(zipPath);
  response.on('data', (chunk) => hash.update(chunk));
  response.pipe(out);
  out.on('finish', resolve);
  out.on('error', reject);
  response.on('error', reject);
});

const actual = hash.digest('hex');
if (actual !== manifest.sha256) {
  await rm(zipPath, { force: true });
  console.error(`sha256 mismatch for php ${manifest.version}`);
  console.error(`  expected ${manifest.sha256}`);
  console.error(`  actual   ${actual}`);
  console.error('Refusing to install a runtime that does not match the manifest.');
  process.exit(1);
}
console.log(`sha256 verified: ${actual}`);

// Only a verified download earns the .zip name — Expand-Archive refuses any
// other extension, which doubles as a guard against extracting a stray partial.
const verifiedZip = zipPath.replace(/\.partial$/, '');
await rename(zipPath, verifiedZip);

// Extract into a staging dir, then swap — a failed extraction must never leave a
// half-populated runtime that looks installed. Verified afterwards because a
// zero exit code from an extractor has already proven not to mean "extracted".
const staging = `${targetDir}.staging`;
await rm(staging, { recursive: true, force: true });
const extract = spawnSync(
  'powershell',
  ['-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${verifiedZip}' -DestinationPath '${staging}' -Force`],
  { stdio: 'inherit' },
);
await rm(verifiedZip, { force: true });
if (extract.status !== 0 || !existsSync(path.join(staging, 'php.exe'))) {
  await rm(staging, { recursive: true, force: true });
  console.error('extraction failed or produced no php.exe');
  process.exit(1);
}

await rm(targetDir, { recursive: true, force: true });
await rename(staging, targetDir);
await writeFile(markerPath, JSON.stringify({ version: manifest.version, sha256: manifest.sha256 }, null, 2) + '\n');
console.log(`php ${manifest.version} installed at ${targetDir}`);
