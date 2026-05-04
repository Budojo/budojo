import { describe, expect, it } from 'vitest';
import worker from './index.js';

/**
 * Unit tests for the SPA fallback worker (#382). Exercise the four
 * cases the worker docblock guarantees, with a stub `env.ASSETS`
 * that returns canned responses based on the requested path.
 */

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
    const response = await worker.fetch(new Request(`https://x.test${pathname}`), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(await response.text()).toContain('<!doctype html>');
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
});
