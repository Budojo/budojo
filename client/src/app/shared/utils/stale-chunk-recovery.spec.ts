// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupStaleChunkRecovery } from './stale-chunk-recovery';

describe('setupStaleChunkRecovery', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    sessionStorage.removeItem('budojo-stale-chunk-reload-attempted');
    // jsdom locks `window.location.reload` as non-configurable, so we
    // replace `window.location` wholesale with a stub object exposing
    // only the `reload` spy. This is the standard pattern for spying
    // on reload under jsdom.
    originalLocation = window.location;
    delete (window as unknown as { location?: Location }).location;
    reloadSpy = vi.fn();
    (window as unknown as { location: object }).location = { reload: reloadSpy };
    setupStaleChunkRecovery();
  });

  afterEach(() => {
    (window as unknown as { location: Location }).location = originalLocation;
    sessionStorage.removeItem('budojo-stale-chunk-reload-attempted');
  });

  it('reloads on a "Failed to fetch dynamically imported module" error event', () => {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Failed to fetch dynamically imported module: https://x.com/chunk-AAA.js',
      }),
    );
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it('reloads on an HTML-as-JS MIME-type error event', () => {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message:
          "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of 'text/html'.",
      }),
    );
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it('reloads on an unhandledrejection whose reason is a stale-chunk error', () => {
    const reason = new Error('Failed to fetch dynamically imported module');
    // Pre-handle the rejection so vitest's unhandled-rejection guard
    // doesn't fail the test on the synthetic rejected promise. The
    // listener under test only cares about the synthesised event.
    const promise = Promise.reject(reason);
    promise.catch(() => undefined);
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise, reason }));
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it('does NOT reload on an unrelated error', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'Something else broke entirely' }));
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('refuses to reload twice in the same session (anti-loop guard)', () => {
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'Failed to fetch dynamically imported module' }),
    );
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'Failed to fetch dynamically imported module' }),
    );
    expect(reloadSpy).toHaveBeenCalledOnce();
  });
});
