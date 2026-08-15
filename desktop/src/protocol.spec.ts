import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  contentTypeFor,
  isNavigationRequest,
  resolveAppRequest,
  resolveWithinRoot,
} from './protocol.js';

/**
 * The `app://` handler reimplements the routing rule the retired Cloudflare
 * Worker enforced for the hosted SPA (#382, removed in #1230), because the failure it prevents
 * is identical inside Electron: serving `index.html` for a missing
 * `chunk-*.js` hands HTML to the JS engine, and the dynamic import dies with
 * an opaque `TypeError` that blanks the dashboard.
 *
 * Cloudflare's binding made that mistake by default; `file://` and a naive
 * catch-all handler make it just as easily.
 */

// Resolved through node:path so the expectations hold on the Windows dev box
// and the Linux CI runner alike — path.resolve('/x') is 'C:\x' on Windows.
const ROOT = path.resolve('/app/dist/browser');

const inRoot = (...segments: string[]): string => path.join(ROOT, ...segments);

/** Pretends the listed paths exist on disk. */
function withFiles(...files: string[]) {
  return (absolutePath: string): boolean => files.includes(absolutePath);
}

const NAV = new Request('app://bundle/dashboard/athletes', {
  headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
});

describe('resolveWithinRoot', () => {
  it('resolves a plain asset path inside the root', () => {
    expect(resolveWithinRoot(ROOT, '/main-ABC123.js')).toBe(inRoot('main-ABC123.js'));
  });

  it('resolves nested paths', () => {
    expect(resolveWithinRoot(ROOT, '/assets/i18n/it.json')).toBe(
      inRoot('assets', 'i18n', 'it.json'),
    );
  });

  it('refuses traversal that climbs out of the root', () => {
    // The renderer is sandboxed, but the handler still runs with the main
    // process's filesystem access. A crafted path must not become a file read.
    expect(resolveWithinRoot(ROOT, '/../../../etc/passwd')).toBeNull();
    expect(resolveWithinRoot(ROOT, '/assets/../../../../secrets.env')).toBeNull();
  });

  it('refuses encoded traversal', () => {
    expect(resolveWithinRoot(ROOT, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
  });

  it('normalises a traversal that stays inside the root', () => {
    expect(resolveWithinRoot(ROOT, '/assets/../main.js')).toBe(inRoot('main.js'));
  });
});

describe('isNavigationRequest', () => {
  it('accepts a browser navigation', () => {
    expect(isNavigationRequest(NAV)).toBe(true);
  });

  it('rejects a programmatic fetch', () => {
    // `fetch()` from JS defaults to `Accept: */*`, which must surface the
    // real 404 rather than the SPA shell.
    const xhr = new Request('app://bundle/dashboard', { headers: { Accept: '*/*' } });
    expect(isNavigationRequest(xhr)).toBe(false);
  });

  it('rejects a non-GET method', () => {
    const post = new Request('app://bundle/dashboard', {
      method: 'POST',
      headers: { Accept: 'text/html' },
    });
    expect(isNavigationRequest(post)).toBe(false);
  });
});

describe('resolveAppRequest', () => {
  it('serves a file that exists', () => {
    const exists = withFiles(inRoot('main-ABC123.js'));

    expect(resolveAppRequest(ROOT, '/main-ABC123.js', NAV, exists)).toEqual({
      kind: 'file',
      path: inRoot('main-ABC123.js'),
    });
  });

  it('404s a missing chunk instead of falling back to the shell', () => {
    // The whole reason this module exists. HTML served here poisons the
    // dynamic import and blanks the dashboard.
    expect(resolveAppRequest(ROOT, '/chunk-DOES-NOT-EXIST.js', NAV, withFiles())).toEqual({
      kind: 'not-found',
      reason: 'missing-asset',
    });
  });

  it('404s a missing image, stylesheet or font the same way', () => {
    for (const path of ['/assets/logo.png', '/styles-X.css', '/fonts/inter.woff2']) {
      expect(resolveAppRequest(ROOT, path, NAV, withFiles())).toEqual({
        kind: 'not-found',
        reason: 'missing-asset',
      });
    }
  });

  it('falls back to index.html for a deep link', () => {
    const exists = withFiles(inRoot('index.html'));

    expect(resolveAppRequest(ROOT, '/dashboard/athletes', NAV, exists)).toEqual({
      kind: 'file',
      path: inRoot('index.html'),
    });
  });

  it('serves index.html at the root path', () => {
    const exists = withFiles(inRoot('index.html'));

    expect(resolveAppRequest(ROOT, '/', NAV, exists)).toEqual({
      kind: 'file',
      path: inRoot('index.html'),
    });
  });

  it('does not fall back for a programmatic request', () => {
    const xhr = new Request('app://bundle/dashboard', { headers: { Accept: '*/*' } });
    const exists = withFiles(inRoot('index.html'));

    expect(resolveAppRequest(ROOT, '/dashboard', xhr, exists)).toEqual({
      kind: 'not-found',
      reason: 'not-a-navigation',
    });
  });

  it('refuses a traversal attempt', () => {
    expect(resolveAppRequest(ROOT, '/../../../etc/passwd', NAV, () => true)).toEqual({
      kind: 'not-found',
      reason: 'outside-root',
    });
  });

  it('404s when even index.html is missing', () => {
    // A packaging bug, not a routing decision — but it must not throw.
    expect(resolveAppRequest(ROOT, '/dashboard', NAV, withFiles())).toEqual({
      kind: 'not-found',
      reason: 'missing-shell',
    });
  });
});

describe('contentTypeFor', () => {
  it('labels the SPA shell as HTML', () => {
    expect(contentTypeFor(inRoot('index.html'))).toBe('text/html; charset=utf-8');
  });

  it('labels JavaScript correctly', () => {
    // The one that matters: a wrong or missing type here is the same class of
    // failure the 404 rule exists to prevent — the module never executes.
    expect(contentTypeFor(inRoot('main-ABC.js'))).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor(inRoot('chunk.mjs'))).toBe('text/javascript; charset=utf-8');
  });

  it('labels the common static types', () => {
    expect(contentTypeFor('/x/styles.css')).toBe('text/css; charset=utf-8');
    expect(contentTypeFor('/x/data.json')).toBe('application/json; charset=utf-8');
    expect(contentTypeFor('/x/logo.svg')).toBe('image/svg+xml');
    expect(contentTypeFor('/x/photo.png')).toBe('image/png');
    expect(contentTypeFor('/x/inter.woff2')).toBe('font/woff2');
  });

  it('falls back to a byte stream for anything unknown', () => {
    expect(contentTypeFor('/x/mystery.bin')).toBe('application/octet-stream');
    expect(contentTypeFor('/x/no-extension')).toBe('application/octet-stream');
  });

  it('is case-insensitive about the extension', () => {
    expect(contentTypeFor('/x/LOGO.PNG')).toBe('image/png');
  });
});
