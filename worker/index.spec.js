import { describe, expect, it } from 'vitest';
import worker from './index.js';

/**
 * Unit tests for the SPA fallback worker (#382). Exercise the four
 * cases the worker docblock guarantees, with a stub `env.ASSETS`
 * that returns canned responses based on the requested path.
 */

// Browser-style Accept header for a top-level navigation. Anything
// containing `text/html` triggers the SPA fallback per
// `isNavigationRequest` in worker/index.js.
const NAV_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function makeEnv(routes) {
  return {
    ASSETS: {
      fetch: async (req) => {
        const url = new URL(req.url);
        const handler = routes[url.pathname];
        if (typeof handler === 'function') return handler(req);
        return new Response('Not Found', { status: 404 });
      },
    },
  };
}

describe('SPA fallback worker', () => {
  it('passes through an existing chunk JS unchanged', async () => {
    const env = makeEnv({
      '/chunk-AAA.js': () =>
        new Response('export const x = 1;', {
          status: 200,
          headers: { 'content-type': 'text/javascript' },
        }),
    });
    const response = await worker.fetch(new Request('https://x.test/chunk-AAA.js'), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript');
  });

  it('returns 404 (NOT the SPA shell) for a missing chunk JS — fixes the v1.14.x blank-page', async () => {
    const env = makeEnv({
      '/index.html': () =>
        new Response('<!doctype html><html>shell</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    const response = await worker.fetch(
      new Request('https://x.test/chunk-DOES-NOT-EXIST.js'),
      env,
    );
    expect(response.status).toBe(404);
  });

  it.each([
    '/dashboard/stats',
    '/dashboard/athletes/42/documents',
    '/privacy',
    '/sub-processors',
    '/auth/login',
    '/some-deep-deep-link',
  ])('serves /index.html as SPA fallback for navigation route %s', async (pathname) => {
    const env = makeEnv({
      '/index.html': () =>
        new Response('<!doctype html><html>shell</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    const response = await worker.fetch(
      new Request(`https://x.test${pathname}`, { headers: NAV_HEADERS }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(await response.text()).toContain('<!doctype html>');
  });

  // Non-navigation requests must NOT get the SPA shell — they keep
  // their real 404. Otherwise a fetch() that asked for JSON could
  // receive HTML and corrupt the caller's parser; a POST could be
  // silently rerouted to the index doc; an OPTIONS preflight could
  // pollute CORS negotiation. Each shape below is a real bug class
  // we are explicitly NOT willing to reintroduce.

  it('returns 404 (not SPA fallback) for POST to extensionless path', async () => {
    const env = makeEnv({
      '/index.html': () =>
        new Response('<!doctype html><html>shell</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    const response = await worker.fetch(
      new Request('https://x.test/dashboard/stats', {
        method: 'POST',
        headers: NAV_HEADERS,
      }),
      env,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type') ?? '').not.toContain('text/html');
  });

  it('returns 404 (not SPA fallback) for OPTIONS preflight on extensionless path', async () => {
    const env = makeEnv({
      '/index.html': () =>
        new Response('<!doctype html><html>shell</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    const response = await worker.fetch(
      new Request('https://x.test/dashboard/stats', { method: 'OPTIONS' }),
      env,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type') ?? '').not.toContain('text/html');
  });

  it('returns 404 (not SPA fallback) for fetch with Accept: application/json', async () => {
    const env = makeEnv({
      '/index.html': () =>
        new Response('<!doctype html><html>shell</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    const response = await worker.fetch(
      new Request('https://x.test/dashboard/stats', {
        headers: { Accept: 'application/json' },
      }),
      env,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type') ?? '').not.toContain('text/html');
  });

  it('returns 404 (not SPA fallback) for default fetch() Accept */* (no text/html)', async () => {
    // Simulates `fetch('/some/path')` from JS without an explicit
    // Accept header — the spec default is `*/*`, which must not
    // be treated as a browser navigation.
    const env = makeEnv({
      '/index.html': () =>
        new Response('<!doctype html><html>shell</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    const response = await worker.fetch(
      new Request('https://x.test/dashboard/stats', {
        headers: { Accept: '*/*' },
      }),
      env,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type') ?? '').not.toContain('text/html');
  });

  it.each([
    '/chunk-XXX.js',
    '/main-XXX.js',
    '/styles-XXX.css',
    '/icons/icon-192.png',
    '/manifest.webmanifest',
    '/favicon.ico',
    '/some.map',
    '/assets/i18n/en.json',
  ])('returns 404 (not SPA fallback) for missing asset path %s', async (pathname) => {
    const env = makeEnv({
      '/index.html': () =>
        new Response('<!doctype html><html>shell</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    const response = await worker.fetch(new Request(`https://x.test${pathname}`), env);
    expect(response.status).toBe(404);
    // Critically, the body must NOT be HTML — that's the bug we're fixing.
    expect(response.headers.get('content-type') ?? '').not.toContain('text/html');
  });

  it('passes a non-404 error response through unchanged (e.g. 500 from the binding)', async () => {
    const env = makeEnv({
      '/some-path': () => new Response('Server error', { status: 500 }),
    });
    const response = await worker.fetch(new Request('https://x.test/some-path'), env);
    expect(response.status).toBe(500);
  });

  // SAFE_MODE recovery (#398). The Angular Service Worker reads
  // /ngsw.json + /ngsw-worker.js to detect new versions, and the SPA
  // shell starts from /index.html. ANY of these served from a stale
  // cache traps users on the old bundle. The worker must stamp
  // `Cache-Control: no-cache, no-store, must-revalidate` on every
  // response for these paths (existing or fallback).

  it.each([
    '/index.html',
    '/ngsw.json',
    '/ngsw-worker.js',
    '/safety-worker.js',
  ])('stamps no-cache headers on %s when the file exists', async (pathname) => {
    const env = makeEnv({
      [pathname]: () =>
        new Response('content', {
          status: 200,
          headers: { 'content-type': 'application/javascript' },
        }),
    });
    const response = await worker.fetch(new Request(`https://x.test${pathname}`), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    expect(response.headers.get('Pragma')).toBe('no-cache');
    expect(response.headers.get('Expires')).toBe('0');
    // Original headers must survive the rewrite.
    expect(response.headers.get('content-type')).toBe('application/javascript');
  });

  it('stamps no-cache headers on the /index.html SPA fallback for navigation requests', async () => {
    // A user pasting /dashboard/stats into a fresh tab gets the SPA
    // shell — that shell is /index.html in disguise and must bypass
    // any HTTP cache for the same reason as a direct /index.html hit.
    const env = makeEnv({
      '/index.html': () =>
        new Response('<!doctype html><html>shell</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    const response = await worker.fetch(
      new Request('https://x.test/dashboard/stats', { headers: NAV_HEADERS }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('preserves the original Cache-Control on hashed asset responses (immutable cacheability stays)', async () => {
    // chunk-XXX.js is hash-named, so its content is immutable — it
    // benefits from the existing default cacheability and MUST NOT
    // get the no-cache stamp. This pins that the worker only
    // overrides Cache-Control for the SW-critical paths above.
    const env = makeEnv({
      '/chunk-AAA.js': () =>
        new Response('export const x = 1;', {
          status: 200,
          headers: {
            'content-type': 'text/javascript',
            'cache-control': 'public, max-age=31536000, immutable',
          },
        }),
    });
    const response = await worker.fetch(new Request('https://x.test/chunk-AAA.js'), env);

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });
});
